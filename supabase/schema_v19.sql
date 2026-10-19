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
-- Fase 2 · Días de estudio, rachas y "¿Cuándo lo haces?"
--   · study_days: un día de estudio por persona (enfoque, tareas, tarjetas,
--     pruebas), llenado por disparadores y rellenado hacia atrás.
--   · study_shields, study_streaks() y study_buy_shield(): racha diaria,
--     racha semanal, escudos (ganar, usar, comprar) y reparar.
--   · El premio de racha de la mascota usa los días de estudio.
--   · assignments.plan_at y plan_place, y el aviso "plan" a esa hora.
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


-- =====================================================================
--  FASE 2 · Días de estudio, rachas amables y "¿Cuándo lo haces?"
-- =====================================================================

-- Un día de estudio por persona y fecha (en su zona horaria). Lo llenan
-- disparadores sobre lo que la app ya guarda; el navegador solo lee.
create table if not exists public.study_days (
  user_id    uuid not null references auth.users on delete cascade,
  day        date not null,
  focus_min  integer not null default 0,
  tasks_done integer not null default 0,
  cards      integer not null default 0,
  tests      integer not null default 0,
  protected  boolean not null default false,
  primary key (user_id, day)
);
alter table public.study_days enable row level security;
drop policy if exists "own study days" on public.study_days;
create policy "own study days" on public.study_days for select using (user_id = auth.uid());
grant select on public.study_days to authenticated;
revoke insert, update, delete on public.study_days from anon, authenticated;

-- Escudos guardados (máximo 2). earned_on evita ganar dos veces el mismo día.
create table if not exists public.study_shields (
  user_id    uuid primary key references auth.users on delete cascade,
  count      integer not null default 0 check (count between 0 and 2),
  earned_on  date,
  updated_at timestamptz not null default now()
);
alter table public.study_shields enable row level security;
drop policy if exists "own shields" on public.study_shields;
create policy "own shields" on public.study_shields for select using (user_id = auth.uid());
grant select on public.study_shields to authenticated;
revoke insert, update, delete on public.study_shields from anon, authenticated;

-- Un día cuenta con 10 min de enfoque, 1 tarea, 10 tarjetas o 1 prueba
-- (las mismas reglas que lib/streaks.ts).
create or replace function public._study_ok(p_focus int, p_tasks int, p_cards int, p_tests int)
returns boolean language sql immutable as $$
  select coalesce(p_focus, 0) >= 10 or coalesce(p_tasks, 0) >= 1 or coalesce(p_cards, 0) >= 10 or coalesce(p_tests, 0) >= 1;
$$;

-- ¿El día cuenta para la racha? (estudiado o protegido)
create or replace function public._study_day_ok(p_user uuid, p_day date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from study_days s
     where s.user_id = p_user and s.day = p_day
       and (s.protected or public._study_ok(s.focus_min, s.tasks_done, s.cards, s.tests))
  );
$$;

-- Días seguidos que cuentan, terminando en p_day.
create or replace function public._study_streak_at(p_user uuid, p_day date)
returns integer language plpgsql stable security definer set search_path = public as $$
declare n integer := 0;
begin
  while n < 1000 and public._study_day_ok(p_user, p_day - n) loop n := n + 1; end loop;
  return n;
end $$;

-- Días seguidos sin estudio justo antes de p_day (hasta 3).
create or replace function public._study_gap(p_user uuid, p_day date)
returns integer language plpgsql stable security definer set search_path = public as $$
declare k integer := 0;
begin
  while k < 3 and not public._study_day_ok(p_user, p_day - k - 1) loop k := k + 1; end loop;
  return k;
end $$;

-- Protege los k días anteriores a p_day.
create or replace function public._study_protect(p_user uuid, p_day date, k integer)
returns void language plpgsql security definer set search_path = public as $$
declare i integer;
begin
  for i in 1..k loop
    insert into study_days (user_id, day, protected) values (p_user, p_day - i, true)
      on conflict (user_id, day) do update set protected = true;
  end loop;
end $$;

-- Un día acaba de empezar a contar: usa escudos para tapar el hueco de
-- ayer (si alcanzan) y gana uno cada 7 días seguidos.
create or replace function public._study_new_day(p_user uuid, p_day date)
returns void language plpgsql security definer set search_path = public as $$
declare k integer; s integer; st integer;
begin
  insert into study_shields (user_id) values (p_user) on conflict do nothing;
  k := public._study_gap(p_user, p_day);
  if k between 1 and 2 and public._study_day_ok(p_user, p_day - k - 1) then
    select count into s from study_shields where user_id = p_user for update;
    if s >= k then
      perform public._study_protect(p_user, p_day, k);
      update study_shields set count = count - k, updated_at = now() where user_id = p_user;
    end if;
  end if;
  st := public._study_streak_at(p_user, p_day);
  if st > 0 and st % 7 = 0 then
    update study_shields set count = least(2, count + 1), earned_on = p_day, updated_at = now()
     where user_id = p_user and earned_on is distinct from p_day;
  end if;
end $$;

-- Reparar: hoy hiciste el doble (50 min o 30 tarjetas) y la racha se rompió
-- hace 1 o 2 días sin escudo: el hueco queda protegido.
create or replace function public._study_repair(p_user uuid, p_day date)
returns void language plpgsql security definer set search_path = public as $$
declare k integer;
begin
  k := public._study_gap(p_user, p_day);
  if k between 1 and 2 and public._study_day_ok(p_user, p_day - k - 1) then
    perform public._study_protect(p_user, p_day, k);
  end if;
end $$;

-- Suma (o resta) al día de p_at. Lo llaman los disparadores.
create or replace function public._study_touch(p_user uuid, p_at timestamptz, p_focus int, p_tasks int, p_cards int, p_tests int)
returns void language plpgsql security definer set search_path = public as $$
declare v_tz text; v_day date; v_today date; o record; n record;
begin
  if p_user is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('study:' || p_user::text));
  v_tz := public._kaderno_tz(p_user);
  v_day := (coalesce(p_at, now()) at time zone v_tz)::date;
  v_today := (now() at time zone v_tz)::date;
  insert into study_days (user_id, day) values (p_user, v_day) on conflict do nothing;
  select * into o from study_days where user_id = p_user and day = v_day;
  update study_days set
    focus_min = greatest(0, focus_min + coalesce(p_focus, 0)),
    tasks_done = greatest(0, tasks_done + coalesce(p_tasks, 0)),
    cards = greatest(0, cards + coalesce(p_cards, 0)),
    tests = greatest(0, tests + coalesce(p_tests, 0))
   where user_id = p_user and day = v_day
   returning * into n;
  if not public._study_ok(o.focus_min, o.tasks_done, o.cards, o.tests)
     and public._study_ok(n.focus_min, n.tasks_done, n.cards, n.tests) then
    perform public._study_new_day(p_user, v_day);
  end if;
  if v_day = v_today and (n.focus_min >= 50 or n.cards >= 30) then
    perform public._study_repair(p_user, v_day);
  end if;
end $$;

-- Disparadores. Si algo falla, lo del usuario se guarda igual.
create or replace function public._study_on_focus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._study_touch(new.user_id, coalesce(new.created_at, now()), greatest(coalesce(new.minutes, 0), 0), 0, 0, 0);
  exception when others then raise warning 'día de estudio (enfoque %): %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists focus_sessions_study_trg on public.focus_sessions;
create trigger focus_sessions_study_trg after insert on public.focus_sessions
  for each row execute function public._study_on_focus();

create or replace function public._study_on_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status = 'done' and old.status is distinct from 'done' and new.deleted_at is null then
      perform public._study_touch(new.user_id, coalesce(new.completed_at, now()), 0, 1, 0, 0);
    elsif old.status = 'done' and new.status is distinct from 'done' then
      perform public._study_touch(new.user_id, coalesce(old.completed_at, now()), 0, -1, 0, 0);
    end if;
  exception when others then raise warning 'día de estudio (tarea %): %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists assignments_study_trg on public.assignments;
create trigger assignments_study_trg after update of status on public.assignments
  for each row execute function public._study_on_task();

create or replace function public._study_on_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform public._study_touch(new.user_id, new.reviewed_at, 0, 0, 1, 0);
    else
      perform public._study_touch(old.user_id, old.reviewed_at, 0, 0, -1, 0);
    end if;
  exception when others then raise warning 'día de estudio (repaso): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists flashcard_reviews_study_trg on public.flashcard_reviews;
create trigger flashcard_reviews_study_trg after insert or delete on public.flashcard_reviews
  for each row execute function public._study_on_review();

-- Relleno hacia atrás (idempotente: se queda con el mayor).
insert into public.study_days (user_id, day, focus_min)
select f.user_id, (f.created_at at time zone public._kaderno_tz(f.user_id))::date, sum(greatest(coalesce(f.minutes, 0), 0))::int
  from public.focus_sessions f where f.created_at is not null group by 1, 2
on conflict (user_id, day) do update set focus_min = greatest(public.study_days.focus_min, excluded.focus_min);
insert into public.study_days (user_id, day, tasks_done)
select a.user_id, (a.completed_at at time zone public._kaderno_tz(a.user_id))::date, count(*)::int
  from public.assignments a where a.status = 'done' and a.completed_at is not null and a.deleted_at is null group by 1, 2
on conflict (user_id, day) do update set tasks_done = greatest(public.study_days.tasks_done, excluded.tasks_done);
insert into public.study_days (user_id, day, cards)
select r.user_id, (r.reviewed_at at time zone public._kaderno_tz(r.user_id))::date, count(*)::int
  from public.flashcard_reviews r group by 1, 2
on conflict (user_id, day) do update set cards = greatest(public.study_days.cards, excluded.cards);
do $$ begin
  if to_regclass('public.pet_daily') is not null then
    execute $q$
      insert into public.study_days (user_id, day, cards)
      select d.user_id, d.day, d.reviews from public.pet_daily d where d.reviews > 0
      on conflict (user_id, day) do update set cards = greatest(public.study_days.cards, excluded.cards)
    $q$;
  end if;
end $$;

-- Rachas de quien llama: diaria, semanal (semanas seguidas cumpliendo la
-- meta, de lunes a domingo), meta y escudos.
create or replace function public.study_streaks()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid(); v_tz text; v_today date; v_goal int := 4; g text; d date; wk date;
  v_daily int; v_weekly int := 0; n int; i int; v_shields int;
begin
  if me is null then return null; end if;
  v_tz := public._kaderno_tz(me);
  v_today := (now() at time zone v_tz)::date;
  select settings -> 'study' ->> 'weeklyGoal' into g from user_prefs where user_id = me;
  if g ~ '^[0-9]{1,2}$' then v_goal := least(7, greatest(2, g::int)); end if;
  d := v_today;
  if not public._study_day_ok(me, d) then d := d - 1; end if;
  v_daily := public._study_streak_at(me, d);
  wk := date_trunc('week', v_today)::date;
  for i in 0..104 loop
    select count(*) into n from generate_series(wk, wk + 6, interval '1 day') x where public._study_day_ok(me, x::date);
    if n >= v_goal then v_weekly := v_weekly + 1;
    elsif i > 0 then exit;
    end if;
    wk := wk - 7;
  end loop;
  select count into v_shields from study_shields where user_id = me;
  return jsonb_build_object('daily', v_daily, 'weekly', v_weekly, 'goal', v_goal, 'shields', coalesce(v_shields, 0));
end $$;

-- Comprar un escudo con 80 monedas de la mascota activa (máximo 2 guardados).
create or replace function public.study_buy_shield()
returns integer language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_pet record; s integer;
begin
  if me is null then raise exception 'Inicia sesión.' using errcode = '42501'; end if;
  if to_regclass('public.pets') is null then raise exception 'Necesitas una mascota para comprar escudos.' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('study:' || me::text));
  select id, coins into v_pet from pets where user_id = me and active for update;
  if v_pet.id is null then raise exception 'Primero elige una mascota.' using errcode = 'P0001'; end if;
  insert into study_shields (user_id) values (me) on conflict do nothing;
  select count into s from study_shields where user_id = me for update;
  if s >= 2 then raise exception 'Ya tienes 2 escudos, el máximo.' using errcode = 'P0001'; end if;
  if v_pet.coins < 80 then raise exception 'Te faltan % monedas.', 80 - v_pet.coins using errcode = 'P0001'; end if;
  update pets set coins = coins - 80 where id = v_pet.id;
  insert into pet_ledger (user_id, pet_id, delta, reason, ref)
    values (me, v_pet.id, -80, 'escudo', (extract(epoch from clock_timestamp()) * 1000)::bigint::text);
  update study_shields set count = count + 1, updated_at = now() where user_id = me;
  return s + 1;
end $$;

-- El premio de racha de la mascota ahora cuenta días de estudio (antes:
-- días ganando monedas). Solo si ya existen las tablas de la mascota.
do $$ begin
  if to_regclass('public.pet_daily') is not null and to_regproc('public._pet_award') is not null then
    execute $f$
      create or replace function public._pet_award(p_user uuid, p_reason text, p_ref text, p_amount integer)
      returns integer
      language plpgsql security definer set search_path = public as $b$
      declare
        v_pet uuid; v_day date; v_earned integer; v_amt integer; v_first boolean; v_streak integer := 1; i integer;
      begin
        if p_user is null or p_amount is null or p_amount < 0 then return 0; end if;
        select id into v_pet from pets where user_id = p_user and active;
        if v_pet is null then return 0; end if;
        v_day := (now() at time zone public._kaderno_tz(p_user))::date;
        insert into pet_daily (user_id, day) values (p_user, v_day) on conflict do nothing;
        select earned into v_earned from pet_daily where user_id = p_user and day = v_day for update;
        v_first := v_earned = 0;
        v_amt := greatest(0, least(p_amount, 300 - v_earned));
        insert into pet_ledger (user_id, pet_id, delta, reason, ref) values (p_user, v_pet, v_amt, p_reason, p_ref)
          on conflict (user_id, reason, ref) do nothing;
        if not found then return 0; end if;
        if v_amt > 0 then
          update pets set coins = coins + v_amt, xp = xp + v_amt where id = v_pet;
          update pet_daily set earned = earned + v_amt where user_id = p_user and day = v_day;
          if v_first and p_reason <> 'racha' then
            for i in 1..6 loop
              exit when not public._study_day_ok(p_user, v_day - i);
              v_streak := v_streak + 1;
            end loop;
            perform public._pet_award(p_user, 'racha', v_day::text, 5 * v_streak);
          end if;
        end if;
        return v_amt;
      end $b$;
    $f$;
    execute 'revoke all on function public._pet_award(uuid, text, text, integer) from public, anon, authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
--  "¿Cuándo lo haces?": hora y lugar planeados para empezar una tarea.
-- ---------------------------------------------------------------------
alter table public.assignments add column if not exists plan_at timestamptz;
alter table public.assignments add column if not exists plan_place text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_plan_place_chk') then
    alter table public.assignments add constraint assignments_plan_place_chk check (plan_place is null or char_length(plan_place) <= 40);
  end if;
end $$;
create index if not exists assignments_plan_idx on public.assignments (plan_at) where plan_at is not null and deleted_at is null;

-- Aviso a la hora del plan (la función "notify" corre cada 10 minutos).
create or replace function public.enqueue_plans(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.notification_queue (user_id, kind, ref, title, body, url)
  select a.user_id, 'plan', a.id::text || ':' || extract(epoch from a.plan_at)::bigint::text,
         'Son las ' || ltrim(to_char(a.plan_at at time zone public._kaderno_tz(a.user_id), 'HH12:MI am'), '0') || ': toca ' || left(a.title, 80),
         case
           when a.plan_place is null or btrim(a.plan_place) = '' then 'Toca para empezar el enfoque.'
           when lower(a.plan_place) = 'casa' then 'En casa. Toca para empezar el enfoque.'
           when lower(a.plan_place) in ('biblioteca', 'universidad', 'oficina', 'cafetería') then 'En la ' || lower(a.plan_place) || '. Toca para empezar el enfoque.'
           else 'En ' || a.plan_place || '. Toca para empezar el enfoque.'
         end,
         '/enfoque?tarea=' || a.id::text
    from public.assignments a
   where a.plan_at <= p_now and a.plan_at > p_now - interval '20 minutes'
     and a.deleted_at is null and coalesce(a.status, 'pending') <> 'done'
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.enqueue_all(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'reminders', public.enqueue_reminders(p_now),
    'project_due', public.enqueue_project_due(p_now),
    'plans', public.enqueue_plans(p_now),
    'digests', public.enqueue_digests(p_now),
    'purged', public.purge_trash(p_now)
  );
end $$;

-- ---------- Permisos de la fase 2 ----------
revoke all on function public._study_ok(int, int, int, int) from public, anon;
revoke all on function public._study_day_ok(uuid, date) from public, anon, authenticated;
revoke all on function public._study_streak_at(uuid, date) from public, anon, authenticated;
revoke all on function public._study_gap(uuid, date) from public, anon, authenticated;
revoke all on function public._study_protect(uuid, date, integer) from public, anon, authenticated;
revoke all on function public._study_new_day(uuid, date) from public, anon, authenticated;
revoke all on function public._study_repair(uuid, date) from public, anon, authenticated;
revoke all on function public._study_touch(uuid, timestamptz, int, int, int, int) from public, anon, authenticated;
revoke all on function public._study_on_focus() from public, anon, authenticated;
revoke all on function public._study_on_task() from public, anon, authenticated;
revoke all on function public._study_on_review() from public, anon, authenticated;
revoke all on function public.enqueue_plans(timestamptz) from public, anon, authenticated;
revoke all on function public.enqueue_all(timestamptz) from public, anon, authenticated;
revoke all on function public.study_streaks() from public, anon;
revoke all on function public.study_buy_shield() from public, anon;
grant execute on function public.study_streaks() to authenticated;
grant execute on function public.study_buy_shield() to authenticated;
