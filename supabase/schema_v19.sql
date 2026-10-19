-- =====================================================================
-- Kaderno · schema_v19.sql  (versión 20 de la app: estudiar mejor y crear el hábito)
--
-- Requiere schema.sql, schema_v2, schema_v12 y schema_v14. Es idempotente: se
-- puede correr dos veces. El archivo crece por fases (ver PLAN_v20.md); cada
-- fase se puede correr sobre la anterior.
--
-- Fase 1 · Repaso nuevo (al final del archivo)
--   · flashcards: tipo (pregunta o completar), estado FSRS, estabilidad,
--     dificultad, vencimiento con hora, suspendida y de dónde salió.
--   · flashcard_reviews: cada respuesta (para estadísticas y monedas).
--   · Las tarjetas existentes se migran sin perder avance.
--   · ai_usage y ai_take(): tope diario de usos de la IA por persona.
--
-- Fase 5 · Enfocar juntos (salas de estudio)
--   · study_rooms: una sala por proyecto (entran sus miembros) o una sala
--     con código de 6 letras para amigos.
--   · study_room_members: quién está en cada sala.
--   · focus_sessions.room_id: los pomodoros hechos en una sala cuentan para
--     la meta del grupo ("Juntos hoy: 6 de 8").
--   · Todo lo que crea, une o cambia salas pasa por funciones
--     `security definer`; el cliente solo puede leer lo de sus salas.
--   · Presencia y "Empezar juntos" van por Supabase Realtime en canales
--     privados "sala:<id>": solo los miembros pueden escuchar o enviar.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Tablas
-- ---------------------------------------------------------------------
create table if not exists public.study_rooms (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  project_id uuid unique references public.projects(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  -- Sin I, O, 0 ni 1 para que no se confundan al dictarlo.
  code       text unique check (code is null or code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  goal       int not null default 8 check (goal between 1 and 50),
  created_at timestamptz not null default now(),
  -- Sala de proyecto: sin código. Sala de amigos: con código.
  constraint study_rooms_kind check ((project_id is null) <> (code is null))
);

create table if not exists public.study_room_members (
  room_id   uuid not null references public.study_rooms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists study_room_members_user_idx on public.study_room_members(user_id);

-- Intentos fallidos de unirse con código (frena a quien prueba códigos al azar).
create table if not exists public.study_room_join_tries (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  fails        int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.study_rooms           enable row level security;
alter table public.study_room_members    enable row level security;
alter table public.study_room_join_tries enable row level security;

alter table public.focus_sessions add column if not exists room_id uuid references public.study_rooms(id) on delete set null;
create index if not exists focus_sessions_room_idx on public.focus_sessions (room_id, created_at) where room_id is not null;

-- ---------------------------------------------------------------------
--  ¿Estoy en esta sala? En una sala de proyecto basta con ser del proyecto.
-- ---------------------------------------------------------------------
create or replace function public.is_room_member(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.study_room_members m where m.room_id = r and m.user_id = auth.uid())
      or exists (select 1 from public.study_rooms s where s.id = r and s.project_id is not null and public.is_project_member(s.project_id));
$$;

-- Canal de Realtime "sala:<uuid>": ¿puedo escuchar o enviar en él?
create or replace function public.room_topic_ok(t text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if t is null or t !~ '^sala:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.is_room_member(substr(t, 6)::uuid);
end;
$$;

-- ---------------------------------------------------------------------
--  Políticas: se lee lo de tus salas; nada se escribe directo.
-- ---------------------------------------------------------------------
drop policy if exists "rooms read" on public.study_rooms;
create policy "rooms read" on public.study_rooms for select using (public.is_room_member(id));

drop policy if exists "room members read" on public.study_room_members;
create policy "room members read" on public.study_room_members for select using (public.is_room_member(room_id));

revoke insert, update, delete on public.study_rooms, public.study_room_members from anon, authenticated;
revoke all on public.study_room_join_tries from anon, authenticated;

-- Un pomodoro solo puede quedar en una sala tuya (si no, se guarda sin sala).
create or replace function public._focus_room_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.room_id is not null and not public.is_room_member(new.room_id) then
    new.room_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists focus_sessions_room_trg on public.focus_sessions;
create trigger focus_sessions_room_trg before insert or update of room_id on public.focus_sessions
  for each row execute function public._focus_room_check();

-- ---------------------------------------------------------------------
--  Funciones
-- ---------------------------------------------------------------------
create or replace function public._room_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  b bytea;
begin
  loop
    -- gen_random_uuid() viene con Postgres (no depende de pgcrypto ni del search_path).
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    c := '';
    for i in 0..5 loop
      c := c || substr(abc, 1 + (get_byte(b, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.study_rooms where code = c);
  end loop;
  return c;
end;
$$;

-- Crear una sala para amigos. Devuelve la sala con su código.
create or replace function public.study_room_create(p_name text)
returns public.study_rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.study_rooms;
begin
  if me is null then raise exception 'Inicia sesión para crear una sala'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Ponle un nombre a la sala (máximo 60 letras)'; end if;
  if (select count(*) from public.study_rooms where owner_id = me and project_id is null) >= 10 then
    raise exception 'Ya tienes 10 salas. Sal de alguna para crear otra.';
  end if;
  perform public.ensure_profile(me);
  insert into public.study_rooms (owner_id, name, code) values (me, btrim(p_name), public._room_code()) returning * into r;
  insert into public.study_room_members (room_id, user_id) values (r.id, me);
  return r;
end;
$$;

-- La sala del proyecto (la crea la primera vez). Solo para miembros del proyecto.
create or replace function public.study_room_for_project(p uuid)
returns public.study_rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.study_rooms;
begin
  if me is null or not public.is_project_member(p) then raise exception 'No eres parte de este proyecto'; end if;
  perform public.ensure_profile(me);
  insert into public.study_rooms (owner_id, project_id, name)
  select me, pr.id, left(pr.name, 60) from public.projects pr where pr.id = p
  on conflict (project_id) do nothing;
  select * into r from public.study_rooms where project_id = p;
  insert into public.study_room_members (room_id, user_id) values (r.id, me) on conflict do nothing;
  return r;
end;
$$;

-- Unirse con el código. Devuelve null si no existe. Máximo 30 personas por sala
-- y 20 códigos fallidos por hora.
create or replace function public.study_room_join(p_code text)
returns public.study_rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.study_rooms; c text; t public.study_room_join_tries;
begin
  if me is null then raise exception 'Inicia sesión para unirte'; end if;
  perform public.ensure_profile(me);
  select * into t from public.study_room_join_tries where user_id = me;
  if found and t.window_start > now() - interval '1 hour' and t.fails >= 20 then
    raise exception 'Demasiados códigos equivocados. Intenta de nuevo en un rato.';
  end if;
  c := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into r from public.study_rooms where code = c;
  if not found then
    insert into public.study_room_join_tries (user_id, fails, window_start) values (me, 1, now())
    on conflict (user_id) do update set
      fails = case when public.study_room_join_tries.window_start > now() - interval '1 hour' then public.study_room_join_tries.fails + 1 else 1 end,
      window_start = case when public.study_room_join_tries.window_start > now() - interval '1 hour' then public.study_room_join_tries.window_start else now() end;
    -- Sin excepción: así el intento fallido queda contado (una excepción lo desharía).
    -- La app muestra "No encontramos una sala con ese código".
    return null;
  end if;
  if not exists (select 1 from public.study_room_members where room_id = r.id and user_id = me)
     and (select count(*) from public.study_room_members where room_id = r.id) >= 30 then
    raise exception 'La sala está llena (30 personas)';
  end if;
  insert into public.study_room_members (room_id, user_id) values (r.id, me) on conflict do nothing;
  return r;
end;
$$;

-- Salir. Si el dueño de una sala de amigos sale, pasa a quien llegó primero;
-- si no queda nadie, la sala se borra.
create or replace function public.study_room_leave(r uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.study_rooms; heir uuid;
begin
  select * into s from public.study_rooms where id = r;
  if not found then return; end if;
  delete from public.study_room_members where room_id = r and user_id = me;
  if s.owner_id = me and s.project_id is null then
    select user_id into heir from public.study_room_members where room_id = r order by joined_at limit 1;
    if heir is null then delete from public.study_rooms where id = r;
    else update public.study_rooms set owner_id = heir where id = r; end if;
  end if;
end;
$$;

-- Cambiar nombre y meta (solo quien la creó o, en salas de proyecto, el dueño del proyecto).
create or replace function public.study_room_update(r uuid, p_name text, p_goal int)
returns public.study_rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.study_rooms;
begin
  select * into s from public.study_rooms where id = r;
  if not found or not (s.owner_id = me or (s.project_id is not null and public.project_role(s.project_id) = 'owner')) then
    raise exception 'Solo quien creó la sala puede cambiarla';
  end if;
  update public.study_rooms set
    name = coalesce(nullif(btrim(p_name), ''), name),
    goal = coalesce(p_goal, goal)
  where id = r returning * into s;
  return s;
end;
$$;

-- Código nuevo (si el anterior se compartió de más). Solo el dueño.
create or replace function public.study_room_new_code(r uuid)
returns public.study_rooms language plpgsql security definer set search_path = public as $$
declare s public.study_rooms;
begin
  update public.study_rooms set code = public._room_code()
  where id = r and owner_id = auth.uid() and project_id is null returning * into s;
  if not found then raise exception 'Solo quien creó la sala puede cambiar el código'; end if;
  return s;
end;
$$;

-- Personas de la sala con sus pomodoros de hoy. Un pomodoro cuenta si duró
-- 10 min o más; máximo 24 por persona al día. Nunca dice en qué tarea fueron.
create or replace function public.study_room_people(r uuid, tz text default 'America/Bogota')
returns table (user_id uuid, name text, avatar text, joined_at timestamptz, is_owner boolean, pomodoros int, minutes int)
language plpgsql stable security definer set search_path = public as $$
declare z text := coalesce(nullif(tz, ''), 'America/Bogota');
begin
  if not public.is_room_member(r) then raise exception 'No estás en esta sala'; end if;
  begin perform now() at time zone z; exception when others then z := 'America/Bogota'; end;
  return query
    select m.user_id,
           coalesce(nullif(btrim(p.display_name), ''), split_part(coalesce(p.email, ''), '@', 1), 'Estudiante')::text,
           p.avatar_emoji::text,
           m.joined_at,
           (s.owner_id = m.user_id),
           least(24, count(f.id) filter (where f.minutes >= 10))::int,
           coalesce(sum(least(f.minutes, 180)) filter (where f.minutes >= 10), 0)::int
    from public.study_room_members m
    join public.study_rooms s on s.id = m.room_id
    left join public.profiles p on p.id = m.user_id
    left join public.focus_sessions f
      on f.room_id = m.room_id and f.user_id = m.user_id
     and (f.created_at at time zone z)::date = (now() at time zone z)::date
    where m.room_id = r
    group by m.user_id, p.display_name, p.email, p.avatar_emoji, m.joined_at, s.owner_id
    order by m.joined_at;
end;
$$;

revoke all on function public.study_room_create(text), public.study_room_for_project(uuid), public.study_room_join(text),
  public.study_room_leave(uuid), public.study_room_update(uuid, text, int), public.study_room_new_code(uuid),
  public.study_room_people(uuid, text), public._room_code(), public.room_topic_ok(text), public.is_room_member(uuid) from public, anon;
grant execute on function public.study_room_create(text), public.study_room_for_project(uuid), public.study_room_join(text),
  public.study_room_leave(uuid), public.study_room_update(uuid, text, int), public.study_room_new_code(uuid),
  public.study_room_people(uuid, text), public.room_topic_ok(text), public.is_room_member(uuid) to authenticated;

-- ---------------------------------------------------------------------
--  Realtime: canales privados "sala:<id>" (presencia y "Empezar juntos").
--  La app usa canales privados: no hace falta ningún ajuste en Realtime.
-- ---------------------------------------------------------------------
do $$ begin
  if to_regclass('realtime.messages') is not null then
    -- Supabase ya trae RLS activado en realtime.messages y la tabla no es del
    -- usuario del SQL Editor, así que no se toca; solo se agregan las políticas.
    execute 'drop policy if exists "salas leer" on realtime.messages';
    execute $p$create policy "salas leer" on realtime.messages for select to authenticated
             using (realtime.messages.extension in ('presence', 'broadcast') and public.room_topic_ok(realtime.topic()))$p$;
    execute 'drop policy if exists "salas enviar" on realtime.messages';
    execute $p$create policy "salas enviar" on realtime.messages for insert to authenticated
             with check (realtime.messages.extension in ('presence', 'broadcast') and public.room_topic_ok(realtime.topic()))$p$;
  else
    raise notice 'No hay realtime.messages: las políticas de los canales se crean al correr esto en Supabase.';
  end if;
end $$;


-- =====================================================================
--  FASE 1 · Repaso nuevo (FSRS)
-- =====================================================================
alter table public.flashcards add column if not exists kind text not null default 'basic';
alter table public.flashcards add column if not exists fsrs_state smallint;
alter table public.flashcards add column if not exists stability real;
alter table public.flashcards add column if not exists difficulty real;
alter table public.flashcards add column if not exists due_at timestamptz;
alter table public.flashcards add column if not exists suspended boolean not null default false;
alter table public.flashcards add column if not exists source_heading text;
alter table public.flashcards add column if not exists created_from text not null default 'manual';
alter table public.flashcards add column if not exists learning_steps smallint not null default 0;
alter table public.flashcards add column if not exists scheduled_days real;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'flashcards_kind_chk') then
    alter table public.flashcards add constraint flashcards_kind_chk check (kind in ('basic', 'cloze'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flashcards_state_chk') then
    alter table public.flashcards add constraint flashcards_state_chk check (fsrs_state is null or fsrs_state between 0 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flashcards_from_chk') then
    alter table public.flashcards add constraint flashcards_from_chk check (created_from in ('ai', 'selection', 'manual', 'quiz', 'recall'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flashcards_len_chk') then
    alter table public.flashcards add constraint flashcards_len_chk check (char_length(front) <= 2000 and char_length(back) <= 2000);
  end if;
end $$;

-- Migración (solo las que aún no tienen estado): sin repasos → nuevas; con
-- repasos → "repaso" con su intervalo como estabilidad y su fecha de siempre.
update public.flashcards set fsrs_state = 0
 where fsrs_state is null and coalesce(reps, 0) = 0 and last_reviewed_at is null;
update public.flashcards set
  fsrs_state = 2,
  stability = greatest(coalesce(interval_days, 1), 1),
  difficulty = least(10, greatest(1, 5 + (2.5 - coalesce(ease, 2.5)) * 4)),
  scheduled_days = greatest(coalesce(interval_days, 1), 1),
  due_at = coalesce(due_at, (due_date::timestamp + time '04:00') at time zone public._kaderno_tz(user_id))
 where fsrs_state is null;
alter table public.flashcards alter column fsrs_state set default 0;
alter table public.flashcards alter column fsrs_state set not null;

create index if not exists flashcards_queue_idx on public.flashcards (user_id, suspended, fsrs_state, due_at);

-- La versión vieja de la app (SM-2) solo cambia due_date: se refleja en due_at
-- para que las dos versiones no se contradigan.
create or replace function public._flashcard_sync_due()
returns trigger language plpgsql as $$
begin
  if new.due_date is distinct from old.due_date and new.due_at is not distinct from old.due_at then
    new.due_at := (new.due_date::timestamp + time '04:00') at time zone public._kaderno_tz(new.user_id);
    if new.fsrs_state = 0 then
      new.fsrs_state := 2;
      new.stability := greatest(coalesce(new.interval_days, 1), 1);
      new.difficulty := least(10, greatest(1, 5 + (2.5 - coalesce(new.ease, 2.5)) * 4));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists flashcards_sync_due_trg on public.flashcards;
create trigger flashcards_sync_due_trg before update on public.flashcards
  for each row execute function public._flashcard_sync_due();

-- Cada respuesta de repaso.
create table if not exists public.flashcard_reviews (
  id             bigserial primary key,
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  card_id        uuid not null references public.flashcards on delete cascade,
  reviewed_at    timestamptz not null default now(),
  rating         smallint not null check (rating between 1 and 4),
  state_before   smallint check (state_before between 0 and 3),
  elapsed_days   real,
  scheduled_days real,
  duration_ms    integer check (duration_ms is null or duration_ms between 0 and 3600000)
);
alter table public.flashcard_reviews enable row level security;
create index if not exists flashcard_reviews_user_idx on public.flashcard_reviews (user_id, reviewed_at);
drop policy if exists "own reviews" on public.flashcard_reviews;
create policy "own reviews" on public.flashcard_reviews for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.flashcards f where f.id = card_id and f.user_id = auth.uid()));
grant select, insert, delete on public.flashcard_reviews to authenticated;
grant usage on sequence public.flashcard_reviews_id_seq to authenticated;

-- Monedas de la mascota: ahora cuenta cada respuesta (una por tarjeta y día,
-- igual que antes). El disparador viejo sigue para la versión anterior; la
-- tabla pet_reviews evita contar dos veces.
do $$ begin
  if to_regclass('public.pet_reviews') is not null and to_regproc('public._pet_award') is not null then
    execute $f$
      create or replace function public._pet_on_card_review() returns trigger
      language plpgsql security definer set search_path = public as $b$
      declare v_day date; v_n integer;
      begin
        begin
          v_day := (now() at time zone public._kaderno_tz(new.user_id))::date;
          insert into pet_reviews (user_id, card_id, day) values (new.user_id, new.card_id, v_day) on conflict do nothing;
          if found then
            insert into pet_daily (user_id, day) values (new.user_id, v_day) on conflict do nothing;
            update pet_daily set reviews = reviews + 1 where user_id = new.user_id and day = v_day returning reviews into v_n;
            if v_n % 10 = 0 then
              perform public._pet_award(new.user_id, 'repaso', v_day::text || ':' || (v_n / 10)::text, 3);
            end if;
          end if;
        exception when others then
          raise warning 'mascota: no se pudo contar el repaso %: %', new.card_id, sqlerrm;
        end;
        return new;
      end $b$;
    $f$;
    execute 'drop trigger if exists flashcard_reviews_pet_trg on public.flashcard_reviews';
    execute 'create trigger flashcard_reviews_pet_trg after insert on public.flashcard_reviews for each row execute function public._pet_on_card_review()';
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Tope diario de la IA (lo usa la función "ai" con el token de quien llama).
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null,
  task    text not null,
  n       integer not null default 0,
  primary key (user_id, day, task)
);
alter table public.ai_usage enable row level security;
drop policy if exists "own ai usage read" on public.ai_usage;
create policy "own ai usage read" on public.ai_usage for select using (user_id = auth.uid());
revoke insert, update, delete on public.ai_usage from anon, authenticated;

-- Suma un uso si queda cupo hoy. Devuelve cuántos quedan (o -1 si ya no hay).
create or replace function public.ai_take(p_task text, p_limit int)
returns int language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_day date; v_n int;
begin
  if me is null then return -1; end if;
  if p_task !~ '^[a-z_]{1,20}$' or p_limit not between 1 and 500 then raise exception 'Uso de IA inválido'; end if;
  v_day := (now() at time zone public._kaderno_tz(me))::date;
  insert into public.ai_usage (user_id, day, task, n) values (me, v_day, p_task, 0) on conflict do nothing;
  update public.ai_usage set n = n + 1 where user_id = me and day = v_day and task = p_task and n < p_limit returning n into v_n;
  if v_n is null then return -1; end if;
  return p_limit - v_n;
end;
$$;
revoke all on function public.ai_take(text, int) from public, anon;
grant execute on function public.ai_take(text, int) to authenticated;
