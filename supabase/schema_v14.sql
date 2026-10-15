-- =====================================================================
-- Kaderno · schema_v14.sql  (versión 12 de la app)
--
-- Requiere schema.sql a schema_v13.sql aplicados.
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Qué agrega:
--   1. Tareas personales con hora (due_at), recordatorio exacto (remind_at),
--      tiempo estimado, fecha de completado y papelera (deleted_at).
--   2. Papelera también para notas y fecha de archivo para materias.
--   3. Sesiones de enfoque ligadas a una tarea.
--   4. Flashcards con repetición espaciada (SM-2).
--   5. Avisos: bandeja dentro de la app (notification_queue), suscripciones
--      push del navegador y funciones que llenan la bandeja (recordatorios,
--      resumen diario, resumen semanal, tareas de proyecto asignadas).
--   6. Enlace privado de calendario (.ics).
--   7. Limpieza automática de la papelera (30 días).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tareas personales
-- ---------------------------------------------------------------------
alter table public.assignments
  add column if not exists due_at       timestamptz,
  add column if not exists remind_at    timestamptz,
  add column if not exists reminded_at  timestamptz,
  add column if not exists estimate_min integer,
  add column if not exists completed_at timestamptz,
  add column if not exists deleted_at   timestamptz;

do $$ begin
  alter table public.assignments add constraint assignments_estimate_chk
    check (estimate_min is null or estimate_min between 1 and 10000);
exception when duplicate_object then null; end $$;

create index if not exists assignments_user_live_idx on public.assignments (user_id) where deleted_at is null;
create index if not exists assignments_remind_idx on public.assignments (remind_at) where reminded_at is null and deleted_at is null;

-- completed_at se llena solo al marcar como hecha (y se borra al desmarcar).
create or replace function public._kaderno_assignment_done() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status is distinct from 'done' then
    new.completed_at := null;
  end if;
  -- Si cambian la fecha o el recordatorio, el aviso vuelve a quedar pendiente.
  if tg_op = 'UPDATE' and new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  return new;
end $$;
drop trigger if exists assignments_done_trg on public.assignments;
create trigger assignments_done_trg before insert or update on public.assignments
  for each row execute function public._kaderno_assignment_done();


-- ---------------------------------------------------------------------
-- 2. Papelera de notas y archivo de materias
-- ---------------------------------------------------------------------
alter table public.notes    add column if not exists deleted_at  timestamptz;
alter table public.subjects add column if not exists archived_at timestamptz;
create index if not exists notes_user_live_idx on public.notes (user_id) where deleted_at is null;


-- ---------------------------------------------------------------------
-- 3. Enfoque ligado a una tarea
-- ---------------------------------------------------------------------
alter table public.focus_sessions
  add column if not exists assignment_id uuid references public.assignments on delete set null;
create index if not exists focus_sessions_assignment_idx on public.focus_sessions (assignment_id);


-- ---------------------------------------------------------------------
-- 4. Flashcards con SM-2
-- ---------------------------------------------------------------------
alter table public.flashcards
  add column if not exists ease             real    not null default 2.5,
  add column if not exists interval_days    integer not null default 0,
  add column if not exists reps             integer not null default 0,
  add column if not exists lapses           integer not null default 0,
  add column if not exists last_reviewed_at timestamptz;


-- ---------------------------------------------------------------------
-- 5. Avisos
-- ---------------------------------------------------------------------

-- 5.1 Bandeja. Todo aviso pasa por aquí; la función "notify" lo envía como
-- notificación push y la app lo muestra en la campana.
create table if not exists public.notification_queue (
  id         bigserial primary key,
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null,          -- reminder | daily | weekly | assigned | project_due
  ref        text not null,          -- evita duplicados (id + fecha)
  title      text not null,
  body       text,
  url        text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  read_at    timestamptz,
  unique (user_id, kind, ref)
);
create index if not exists notification_queue_unsent_idx on public.notification_queue (created_at) where sent_at is null;
create index if not exists notification_queue_user_idx on public.notification_queue (user_id, created_at desc);

alter table public.notification_queue enable row level security;
drop policy if exists "own notifications read" on public.notification_queue;
create policy "own notifications read" on public.notification_queue for select using (auth.uid() = user_id);
drop policy if exists "own notifications mark" on public.notification_queue;
create policy "own notifications mark" on public.notification_queue for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own notifications delete" on public.notification_queue;
create policy "own notifications delete" on public.notification_queue for delete using (auth.uid() = user_id);

-- 5.2 Suscripciones push (una por navegador o dispositivo).
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subs" on public.push_subscriptions;
create policy "own push subs" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5.3 Preferencias. Viven en user_prefs.settings -> 'notif':
--   { "daily": true, "daily_hour": 7, "weekly": true, "tz": "America/Bogota" }
create or replace function public._kaderno_notif(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select settings -> 'notif' from public.user_prefs where user_id = p_user), '{}'::jsonb);
$$;

create or replace function public._kaderno_tz(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare tz text := public._kaderno_notif(p_user) ->> 'tz';
begin
  if tz is null or not exists (select 1 from pg_timezone_names where name = tz) then tz := 'America/Bogota'; end if;
  return tz;
end $$;

-- 5.4 Recordatorios de tareas personales cuyo remind_at ya llegó.
create or replace function public.enqueue_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with due as (
    update public.assignments a
       set reminded_at = p_now
     where a.remind_at <= p_now
       and a.reminded_at is null
       and a.deleted_at is null
       and coalesce(a.status, 'pending') <> 'done'
    returning a.id, a.user_id, a.title, a.due_at, a.due_date, a.remind_at
  ), ins as (
    insert into public.notification_queue (user_id, kind, ref, title, body, url)
    select d.user_id, 'reminder', d.id::text || ':' || extract(epoch from d.remind_at)::bigint::text,
           d.title,
           case
             when d.due_at is not null then 'Entrega: ' || to_char(d.due_at at time zone public._kaderno_tz(d.user_id), 'DD/MM HH12:MI am')
             when d.due_date is not null then 'Entrega: ' || to_char(d.due_date, 'DD/MM')
             else 'Recordatorio'
           end,
           '/'
      from due d
    on conflict (user_id, kind, ref) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

-- 5.5 Tareas de proyecto asignadas a alguien que vencen en las próximas 24 h.
create or replace function public.enqueue_project_due(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.notification_queue (user_id, kind, ref, title, body, url)
  select t.assignee_id, 'project_due', t.id::text || ':' || (t.due_at at time zone 'UTC')::date::text,
         t.title, p.name || ' · vence ' || to_char(t.due_at at time zone public._kaderno_tz(t.assignee_id), 'DD/MM HH12:MI am'),
         '/proyectos/' || p.id::text
    from public.project_tasks t
    join public.projects p on p.id = t.project_id
   where t.assignee_id is not null
     and not t.done
     and t.due_at is not null
     and t.due_at > p_now
     and t.due_at <= p_now + interval '24 hours'
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- 5.6 Resumen diario (a la hora elegida, 7 am por defecto) y semanal
-- (domingo 7 pm). Solo para quien tiene la opción activa (por defecto sí).
create or replace function public.enqueue_digests(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record; tz text; loc timestamp; hr int; n int := 0; cnt int; overdue int; done_wk int; mins int; nxt int;
begin
  for r in
    select distinct u.id as user_id from auth.users u
     where exists (select 1 from public.assignments a where a.user_id = u.id and a.deleted_at is null)
        or exists (select 1 from public.push_subscriptions s where s.user_id = u.id)
  loop
    tz := public._kaderno_tz(r.user_id);
    loc := p_now at time zone tz;
    hr := coalesce((public._kaderno_notif(r.user_id) ->> 'daily_hour')::int, 7);

    if coalesce((public._kaderno_notif(r.user_id) ->> 'daily')::boolean, true) and extract(hour from loc) = hr then
      select count(*) filter (where coalesce(a.due_at at time zone tz, a.due_date::timestamp)::date = loc::date),
             count(*) filter (where coalesce(a.due_at at time zone tz, a.due_date::timestamp + interval '23 hours 59 minutes') < loc)
        into cnt, overdue
        from public.assignments a
       where a.user_id = r.user_id and a.deleted_at is null and coalesce(a.status, 'pending') <> 'done'
         and (a.due_at is not null or a.due_date is not null);
      if cnt + overdue > 0 then
        insert into public.notification_queue (user_id, kind, ref, title, body, url)
        values (r.user_id, 'daily', loc::date::text,
                case when cnt = 1 then 'Hoy tienes 1 entrega' when cnt > 1 then 'Hoy tienes ' || cnt || ' entregas' else 'Tienes tareas vencidas' end,
                case when overdue > 0 then overdue || ' vencida' || case when overdue = 1 then '' else 's' end || '. ' else '' end || 'Abre Kaderno para ver tu día.',
                '/')
        on conflict (user_id, kind, ref) do nothing;
        if found then n := n + 1; end if;
      end if;
    end if;

    if coalesce((public._kaderno_notif(r.user_id) ->> 'weekly')::boolean, true)
       and extract(isodow from loc) = 7 and extract(hour from loc) = 19 then
      select count(*) into done_wk from public.assignments a
       where a.user_id = r.user_id and a.deleted_at is null and a.completed_at >= p_now - interval '7 days';
      select coalesce(sum(minutes), 0) into mins from public.focus_sessions f
       where f.user_id = r.user_id and f.created_at >= p_now - interval '7 days';
      select count(*) into nxt from public.assignments a
       where a.user_id = r.user_id and a.deleted_at is null and coalesce(a.status, 'pending') <> 'done'
         and coalesce(a.due_at at time zone tz, a.due_date::timestamp)::date between loc::date + 1 and loc::date + 7;
      insert into public.notification_queue (user_id, kind, ref, title, body, url)
      values (r.user_id, 'weekly', to_char(loc, 'IYYY-IW'),
              'Tu semana en Kaderno',
              done_wk || ' tarea' || case when done_wk = 1 then '' else 's' end || ' hechas, '
                || (mins / 60) || ' h ' || (mins % 60) || ' min de enfoque. Esta semana vienen ' || nxt || '.',
              '/estudiar')
      on conflict (user_id, kind, ref) do nothing;
      if found then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $$;

-- 5.7 Aviso cuando te asignan una tarea de proyecto (si no te la asignaste tú).
create or replace function public._kaderno_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and new.assignee_id is distinct from auth.uid() then
    select name into pname from public.projects where id = new.project_id;
    insert into public.notification_queue (user_id, kind, ref, title, body, url)
    values (new.assignee_id, 'assigned', new.id::text || ':' || new.assignee_id::text,
            'Te asignaron una tarea', coalesce(pname, 'Proyecto') || ': ' || new.title, '/proyectos/' || new.project_id::text)
    on conflict (user_id, kind, ref) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists project_tasks_assigned_trg on public.project_tasks;
create trigger project_tasks_assigned_trg after insert or update of assignee_id on public.project_tasks
  for each row execute function public._kaderno_task_assigned();

-- 5.8 Todo junto (lo llama la función "notify" cada 10 minutos).
create or replace function public.enqueue_all(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'reminders', public.enqueue_reminders(p_now),
    'project_due', public.enqueue_project_due(p_now),
    'digests', public.enqueue_digests(p_now),
    'purged', public.purge_trash(p_now)
  );
end $$;


-- ---------------------------------------------------------------------
-- 6. Calendario (.ics) con enlace privado
-- ---------------------------------------------------------------------
create table if not exists public.calendar_tokens (
  user_id    uuid primary key references auth.users on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);
alter table public.calendar_tokens enable row level security;
drop policy if exists "own calendar token" on public.calendar_tokens;
create policy "own calendar token" on public.calendar_tokens for select using (auth.uid() = user_id);

create or replace function public.my_calendar_token(p_regen boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare t text; u uuid := auth.uid();
begin
  if u is null then raise exception 'KADERNO_FORBIDDEN'; end if;
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  if p_regen then
    insert into public.calendar_tokens (user_id, token) values (u, t)
    on conflict (user_id) do update set token = excluded.token, created_at = now();
    return t;
  end if;
  insert into public.calendar_tokens (user_id, token) values (u, t) on conflict (user_id) do nothing;
  select token into t from public.calendar_tokens where user_id = u;
  return t;
end $$;


-- ---------------------------------------------------------------------
-- 7. Papelera: se vacía sola a los 30 días
-- ---------------------------------------------------------------------
create or replace function public.purge_trash(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare a int; b int; c int;
begin
  delete from public.assignments where deleted_at < p_now - interval '30 days';
  get diagnostics a = row_count;
  delete from public.notes where deleted_at < p_now - interval '30 days';
  get diagnostics b = row_count;
  -- Avisos leídos o enviados de hace más de 60 días
  delete from public.notification_queue where created_at < p_now - interval '60 days';
  get diagnostics c = row_count;
  return a + b;
end $$;


-- ---------------------------------------------------------------------
-- 8. Permisos: las funciones de la bandeja solo las usa el servidor.
-- ---------------------------------------------------------------------
revoke all on function public.enqueue_reminders(timestamptz)   from public, anon, authenticated;
revoke all on function public.enqueue_project_due(timestamptz) from public, anon, authenticated;
revoke all on function public.enqueue_digests(timestamptz)     from public, anon, authenticated;
revoke all on function public.enqueue_all(timestamptz)         from public, anon, authenticated;
revoke all on function public.purge_trash(timestamptz)         from public, anon, authenticated;
revoke all on function public._kaderno_notif(uuid)             from public, anon, authenticated;
revoke all on function public._kaderno_tz(uuid)                from public, anon, authenticated;
grant execute on function public.my_calendar_token(boolean) to authenticated;
