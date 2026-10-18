-- =====================================================================
-- Kaderno · schema_v19.sql  (versión 20 de la app: estudiar mejor y crear el hábito)
--
-- Requiere schema.sql, schema_v2, schema_v12 y schema_v14. Es idempotente: se
-- puede correr dos veces. El archivo crece por fases (ver PLAN_v20.md); cada
-- fase se puede correr sobre la anterior.
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
--  Requiere que los canales privados estén permitidos (Realtime → Settings).
-- ---------------------------------------------------------------------
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'alter table realtime.messages enable row level security';
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
