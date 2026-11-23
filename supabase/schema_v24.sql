-- =====================================================================
-- Kaderno · schema_v24.sql  (versión 25 de la app: potenciar el modo Trabajo)
--
-- Requiere schema_v12 (proyectos), schema_v14 (avisos) y schema_v23 (planes
-- y registro de horas). Es idempotente: se puede correr dos veces. Crece por
-- fases (ver PLAN_v25.md).
--
-- Fase 1 · Cobrar con lo que ya registras
--   · billing_profile: tus datos para cobrar (documento, ciudad, cuenta
--     bancaria) y el consecutivo. Solo los ves tú.
--   · clients: tus clientes, con su tarifa y los proyectos y áreas que cubren.
--   · invoices: las cuentas de cobro, con número consecutivo que no se repite
--     (invoice_create). Con Gratis, 2 al mes.
--   · Presupuesto de horas por proyecto (project_set_budget) y aviso al 80 %
--     y al 100 % al dueño del proyecto y a quien anota.
--
-- Fase 2 · Cronómetro y hoja semanal
--   · focus_sessions acepta source 'timer' (cronómetro libre, hasta 12 horas)
--     y project_task_id (la tarea del proyecto).
--   · timesheet_weeks: la semana de horas que cada integrante manda al dueño
--     del proyecto (plan Equipo); aprobada, ya no se puede cambiar.
--
-- Fase 3 · Proyectos de trabajo (requiere schema_v20 para las repeticiones)
--   · project_tasks gana priority, labels, blocked_by, repeat_rule y
--     repeat_parent_id. Al terminar una tarea que se repite, nace la siguiente;
--     al terminar la última que bloqueaba otra, avisa a quien la tiene.
--   · project_rules: reglas simples por proyecto ("cuando pase a Revisión,
--     asignar a Ana", "cuando se venza, avisar al dueño"...). Con Gratis 2 por
--     proyecto, con Pro 20. project_rules_tick() revisa las vencidas cada hora.
--   · project_updates: el estado semanal del proyecto (en curso, en riesgo,
--     atrasado) con una nota; avisa al equipo.
-- =====================================================================


-- =====================================================================
--  FASE 1 · Cobrar
-- =====================================================================
create table if not exists public.billing_profile (
  user_id        uuid primary key references auth.users on delete cascade,
  full_name      text check (char_length(full_name) <= 120),
  doc_type       text check (doc_type in ('CC', 'CE', 'NIT', 'PP')),
  doc_number     text check (char_length(doc_number) <= 30),
  city           text check (char_length(city) <= 60),
  phone          text check (char_length(phone) <= 40),
  email          text check (char_length(email) <= 200),
  address        text check (char_length(address) <= 200),
  bank_name      text check (char_length(bank_name) <= 60),
  account_type   text check (account_type in ('ahorros', 'corriente', 'nequi', 'daviplata')),
  account_number text check (char_length(account_number) <= 40),
  note           text check (char_length(note) <= 300),
  prefix         text not null default 'CC' check (prefix ~ '^[A-Z0-9-]{0,10}$'),
  next_number    integer not null default 1 check (next_number between 1 and 999999),
  updated_at     timestamptz not null default now()
);
alter table public.billing_profile enable row level security;
drop policy if exists "own billing profile" on public.billing_profile;
create policy "own billing profile" on public.billing_profile for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- El consecutivo lo sube invoice_create; la persona puede fijar desde cuál
-- empieza (si ya hacía cuentas de cobro). El número nunca se repite (unique).

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  tax_id      text check (char_length(tax_id) <= 30),
  email       text check (char_length(email) <= 200),
  phone       text check (char_length(phone) <= 40),
  address     text check (char_length(address) <= 200),
  rate        bigint check (rate is null or rate between 0 and 100000000),
  project_ids uuid[] not null default '{}',
  subject_ids uuid[] not null default '{}',
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists clients_user_idx on public.clients (user_id, archived, name);
alter table public.clients enable row level security;
drop policy if exists "own clients" on public.clients;
create policy "own clients" on public.clients for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public._clients_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from clients where user_id = new.user_id) >= 300 then
    raise exception 'Máximo 300 clientes.' using errcode = 'P0001';
  end if;
  if cardinality(new.project_ids) > 100 or cardinality(new.subject_ids) > 100 then
    raise exception 'Demasiados proyectos o áreas para un cliente.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists clients_cap_trg on public.clients;
create trigger clients_cap_trg before insert on public.clients for each row execute function public._clients_cap();

create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  client_id   uuid references public.clients on delete set null,
  prefix      text not null default '',
  number      integer not null,
  issued_on   date not null,
  period_from date,
  period_to   date,
  issuer      jsonb not null,
  client      jsonb not null,
  items       jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 60),
  total       bigint not null check (total between 0 and 100000000000),
  note        text check (char_length(note) <= 500),
  status      text not null default 'emitida' check (status in ('emitida', 'pagada', 'anulada')),
  paid_on     date,
  created_at  timestamptz not null default now(),
  unique (user_id, prefix, number)
);
create index if not exists invoices_user_idx on public.invoices (user_id, issued_on desc);
alter table public.invoices enable row level security;
drop policy if exists "own invoices read" on public.invoices;
create policy "own invoices read" on public.invoices for select using (user_id = auth.uid());
revoke insert, update, delete on public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;

-- Crea una cuenta de cobro con el siguiente consecutivo. El total se calcula
-- aquí con las líneas (no se confía en el de la app).
create or replace function public.invoice_create(p jsonb) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prof billing_profile; c clients; r invoices; it jsonb; items jsonb := '[]'::jsonb;
        total bigint := 0; amt bigint; n int; tz text;
begin
  if me is null then raise exception 'Inicia sesión.' using errcode = 'P0001'; end if;
  select * into prof from billing_profile where user_id = me for update;
  if prof.user_id is null or coalesce(btrim(prof.full_name), '') = '' or coalesce(btrim(prof.doc_number), '') = '' then
    raise exception 'Primero llena tus datos para cobrar (nombre y documento).' using errcode = 'P0001';
  end if;
  select * into c from clients where id = (p ->> 'client_id')::uuid and user_id = me;
  if c.id is null then raise exception 'Escoge un cliente.' using errcode = 'P0001'; end if;
  tz := coalesce(_kaderno_tz(me), 'America/Bogota');
  if plan_of(me) = 'free' and (select count(*) from invoices where user_id = me and status <> 'anulada'
      and date_trunc('month', created_at at time zone tz) = date_trunc('month', now() at time zone tz)) >= 2 then
    raise exception 'Con el plan Gratis puedes hacer 2 cuentas de cobro al mes. Con Kaderno Pro, sin límite.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'La cuenta de cobro necesita al menos una línea.' using errcode = 'P0001';
  end if;
  for it in select * from jsonb_array_elements(p -> 'items') loop
    if coalesce(btrim(it ->> 'concept'), '') = '' then raise exception 'Cada línea necesita un concepto.' using errcode = 'P0001'; end if;
    amt := case when it ? 'hours' and it ? 'rate' and (it ->> 'hours') is not null and (it ->> 'rate') is not null
                then round((it ->> 'hours')::numeric * (it ->> 'rate')::numeric)
                else round(coalesce((it ->> 'amount')::numeric, 0)) end;
    if amt < 0 then raise exception 'Una línea quedó negativa.' using errcode = 'P0001'; end if;
    items := items || jsonb_build_object('concept', left(btrim(it ->> 'concept'), 200),
      'hours', case when it ? 'hours' then round((it ->> 'hours')::numeric, 2) end,
      'rate', case when it ? 'rate' then round((it ->> 'rate')::numeric) end, 'amount', amt);
    total := total + amt;
  end loop;
  if total <= 0 then raise exception 'El total debe ser mayor que cero.' using errcode = 'P0001'; end if;
  n := prof.next_number;
  insert into invoices (user_id, client_id, prefix, number, issued_on, period_from, period_to, issuer, client, items, total, note)
  values (me, c.id, prof.prefix, n, coalesce((p ->> 'issued_on')::date, (now() at time zone tz)::date),
    (p ->> 'period_from')::date, (p ->> 'period_to')::date,
    jsonb_build_object('full_name', prof.full_name, 'doc_type', prof.doc_type, 'doc_number', prof.doc_number, 'city', prof.city,
      'phone', prof.phone, 'email', prof.email, 'address', prof.address, 'bank_name', prof.bank_name,
      'account_type', prof.account_type, 'account_number', prof.account_number, 'note', prof.note),
    jsonb_build_object('name', c.name, 'tax_id', c.tax_id, 'email', c.email, 'phone', c.phone, 'address', c.address),
    items, total, left(p ->> 'note', 500))
  returning * into r;
  update billing_profile set next_number = n + 1, updated_at = now() where user_id = me;
  return r;
end $$;
revoke all on function public.invoice_create(jsonb) from public, anon;
grant execute on function public.invoice_create(jsonb) to authenticated;

create or replace function public.invoice_set_status(p_id uuid, p_status text) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare r invoices;
begin
  if p_status not in ('emitida', 'pagada', 'anulada') then raise exception 'Estado inválido.' using errcode = 'P0001'; end if;
  update invoices set status = p_status,
    paid_on = case when p_status = 'pagada' then coalesce(paid_on, (now() at time zone coalesce(_kaderno_tz(auth.uid()), 'America/Bogota'))::date) end
   where id = p_id and user_id = auth.uid() and status <> 'anulada'
  returning * into r;
  if r.id is null then raise exception 'No se encontró la cuenta de cobro, o ya está anulada.' using errcode = 'P0001'; end if;
  return r;
end $$;
revoke all on function public.invoice_set_status(uuid, text) from public, anon;
grant execute on function public.invoice_set_status(uuid, text) to authenticated;

-- Presupuesto de horas por proyecto.
alter table public.projects add column if not exists budget_minutes integer check (budget_minutes is null or budget_minutes between 60 and 600000);

create or replace function public.project_set_budget(p_project uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not coalesce(can_edit_project(p_project), false) then raise exception 'Solo quien edita el proyecto pone el presupuesto.' using errcode = 'P0001'; end if;
  if p_minutes is not null and plan_of(me) = 'free' and exists (
      select 1 from projects where owner_id = me and budget_minutes is not null and id <> p_project) then
    raise exception 'Con el plan Gratis puedes poner presupuesto a 1 proyecto. Con Kaderno Pro, a todos.' using errcode = 'P0001';
  end if;
  update projects set budget_minutes = p_minutes where id = p_project;
end $$;
revoke all on function public.project_set_budget(uuid, int) from public, anon;
grant execute on function public.project_set_budget(uuid, int) to authenticated;

-- Cuánto lleva el proyecto (todos sus integrantes) frente al presupuesto.
create or replace function public.project_budget(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b int; used bigint;
begin
  if not coalesce(is_project_member(p_project), false) then raise exception 'No eres parte de ese proyecto.' using errcode = 'P0001'; end if;
  select budget_minutes into b from projects where id = p_project;
  select coalesce(sum(minutes), 0) into used from focus_sessions where project_id = p_project;
  return jsonb_build_object('budget_minutes', b, 'used_minutes', used);
end $$;
revoke all on function public.project_budget(uuid) from public, anon;
grant execute on function public.project_budget(uuid) to authenticated;

-- Aviso al cruzar el 80 % y el 100 % (al dueño del proyecto y a quien anotó).
create or replace function public._project_budget_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare pr projects; used bigint; before bigint; lvl int; who uuid;
begin
  if new.project_id is null then return new; end if;
  select * into pr from projects where id = new.project_id;
  if pr.budget_minutes is null then return new; end if;
  select coalesce(sum(minutes), 0) into used from focus_sessions where project_id = new.project_id;
  before := used - new.minutes;
  foreach lvl in array array[100, 80] loop
    if before * 100 < pr.budget_minutes * lvl and used * 100 >= pr.budget_minutes * lvl then
      foreach who in array array[pr.owner_id, new.user_id] loop
        begin
          insert into notification_queue (user_id, kind, ref, title, body, url)
          values (who, 'budget', pr.id || '-' || pr.budget_minutes || '-' || lvl,
            case when lvl = 100 then 'Se acabó el presupuesto de ' || pr.name else pr.name || ' va en el 80 % del presupuesto' end,
            'Van ' || round(used / 60.0, 1) || ' de ' || round(pr.budget_minutes / 60.0, 1) || ' horas.', '/proyectos/' || pr.id)
          on conflict do nothing;
        exception when undefined_table then null;
        end;
      end loop;
      exit;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists focus_sessions_budget_trg on public.focus_sessions;
create trigger focus_sessions_budget_trg after insert on public.focus_sessions
  for each row execute function public._project_budget_alert();


-- =====================================================================
--  FASE 2 · Cronómetro y hoja semanal
-- =====================================================================
alter table public.focus_sessions add column if not exists project_task_id uuid references public.project_tasks on delete set null;
alter table public.focus_sessions drop constraint if exists focus_sessions_source_ok;
alter table public.focus_sessions add constraint focus_sessions_source_ok check (source in ('focus', 'manual', 'timer'));

create table if not exists public.timesheet_weeks (
  project_id   uuid not null references public.projects on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  week_start   date not null check (extract(isodow from week_start) = 1),
  status       text not null default 'enviada' check (status in ('enviada', 'aprobada', 'devuelta')),
  minutes      integer not null default 0,
  note         text check (char_length(note) <= 300),
  submitted_at timestamptz not null default now(),
  decided_by   uuid references auth.users on delete set null,
  decided_at   timestamptz,
  primary key (project_id, user_id, week_start)
);
alter table public.timesheet_weeks enable row level security;
drop policy if exists "timesheet read" on public.timesheet_weeks;
create policy "timesheet read" on public.timesheet_weeks for select
  using (user_id = auth.uid() or coalesce(can_edit_project(project_id), false));
revoke insert, update, delete on public.timesheet_weeks from anon, authenticated;
grant select on public.timesheet_weeks to authenticated;

-- ¿Esa sesión cae en una semana ya aprobada? (lunes local de su fecha)
create or replace function public._week_locked(p_user uuid, p_project uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select p_project is not null and exists (
    select 1 from timesheet_weeks w where w.project_id = p_project and w.user_id = p_user and w.status = 'aprobada'
       and w.week_start = date_trunc('week', p_at at time zone coalesce(_kaderno_tz(p_user), 'America/Bogota'))::date);
$$;

-- Reemplaza el de schema_v23: suma el cronómetro, la tarea del proyecto y el candado de la semana aprobada.
create or replace function public._focus_sessions_hours() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and _week_locked(old.user_id, old.project_id, old.created_at) then
    raise exception 'Esa semana ya fue aprobada: pídele al dueño del proyecto que la devuelva para cambiarla.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.project_id is not null and not exists (select 1 from project_members m where m.project_id = new.project_id and m.user_id = new.user_id) then
    raise exception 'No eres parte de ese proyecto.' using errcode = 'P0001';
  end if;
  if new.project_task_id is not null then
    if new.project_id is null then
      select project_id into new.project_id from project_tasks where id = new.project_task_id;
    end if;
    if not exists (select 1 from project_tasks t where t.id = new.project_task_id and t.project_id = new.project_id) then
      raise exception 'Esa tarea no es de ese proyecto.' using errcode = 'P0001';
    end if;
  end if;
  if new.source in ('manual', 'timer') and (new.minutes is null or new.minutes < 1 or new.minutes > 720) then
    raise exception 'Un registro va de 1 minuto a 12 horas.' using errcode = 'P0001';
  end if;
  if new.source = 'manual' then
    if new.created_at > now() + interval '1 day' then
      raise exception 'No se pueden anotar horas en el futuro.' using errcode = 'P0001';
    end if;
  elsif tg_op = 'INSERT' then
    new.created_at := now(); -- el enfoque y el cronómetro se anotan al terminar
  end if;
  if _week_locked(new.user_id, new.project_id, new.created_at) then
    raise exception 'Esa semana ya fue aprobada: pídele al dueño del proyecto que la devuelva para cambiarla.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists focus_sessions_hours_trg on public.focus_sessions;
create trigger focus_sessions_hours_trg before insert or update or delete on public.focus_sessions
  for each row execute function public._focus_sessions_hours();

-- Mandar la semana (lunes) de un proyecto al dueño.
create or replace function public.timesheet_submit(p_project uuid, p_week date, p_note text default null) returns public.timesheet_weeks
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tz text := coalesce(_kaderno_tz(auth.uid()), 'America/Bogota'); mins int; r timesheet_weeks; pr projects;
begin
  if not coalesce(is_project_member(p_project), false) then raise exception 'No eres parte de ese proyecto.' using errcode = 'P0001'; end if;
  if extract(isodow from p_week) <> 1 then raise exception 'La semana empieza el lunes.' using errcode = 'P0001'; end if;
  select * into pr from projects where id = p_project;
  if plan_of(pr.owner_id) <> 'team' and plan_of(me) <> 'team' then
    raise exception 'Mandar las horas para aprobar es del plan Equipo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from timesheet_weeks where project_id = p_project and user_id = me and week_start = p_week and status = 'aprobada') then
    raise exception 'Esa semana ya está aprobada.' using errcode = 'P0001';
  end if;
  select coalesce(sum(minutes), 0) into mins from focus_sessions
   where user_id = me and project_id = p_project
     and (created_at at time zone tz)::date between p_week and p_week + 6;
  insert into timesheet_weeks (project_id, user_id, week_start, status, minutes, note, submitted_at, decided_by, decided_at)
  values (p_project, me, p_week, 'enviada', mins, left(p_note, 300), now(), null, null)
  on conflict (project_id, user_id, week_start) do update set status = 'enviada', minutes = excluded.minutes, note = excluded.note,
    submitted_at = now(), decided_by = null, decided_at = null
  returning * into r;
  if pr.owner_id <> me then
    insert into notification_queue (user_id, kind, ref, title, body, url)
    values (pr.owner_id, 'timesheet', p_project || '-' || me || '-' || p_week || '-' || extract(epoch from now())::bigint,
      'Horas para aprobar en ' || pr.name,
      coalesce((select display_name from profiles where id = me), 'Alguien') || ' mandó ' || round(mins / 60.0, 1) || ' h de la semana del ' || to_char(p_week, 'DD/MM') || '.',
      '/horas') on conflict do nothing;
  end if;
  return r;
end $$;

-- Aprobar o devolver (quien edita el proyecto).
create or replace function public.timesheet_decide(p_project uuid, p_user uuid, p_week date, p_status text, p_note text default null) returns public.timesheet_weeks
language plpgsql security definer set search_path = public as $$
declare r timesheet_weeks; pr projects;
begin
  if p_status not in ('aprobada', 'devuelta') then raise exception 'Estado inválido.' using errcode = 'P0001'; end if;
  if not coalesce(can_edit_project(p_project), false) then raise exception 'Solo quien edita el proyecto aprueba las horas.' using errcode = 'P0001'; end if;
  if p_user = auth.uid() and coalesce(project_role(p_project), '') <> 'owner' then
    raise exception 'Tus propias horas las aprueba el dueño del proyecto.' using errcode = 'P0001';
  end if;
  update timesheet_weeks set status = p_status, decided_by = auth.uid(), decided_at = now(), note = coalesce(left(p_note, 300), note)
   where project_id = p_project and user_id = p_user and week_start = p_week
  returning * into r;
  if r.project_id is null then raise exception 'Esa semana no se ha mandado.' using errcode = 'P0001'; end if;
  select * into pr from projects where id = p_project;
  if p_user <> auth.uid() then
    insert into notification_queue (user_id, kind, ref, title, body, url)
    values (p_user, 'timesheet', p_project || '-' || p_week || '-' || p_status || '-' || extract(epoch from now())::bigint,
      case when p_status = 'aprobada' then 'Aprobaron tus horas en ' || pr.name else 'Te devolvieron las horas de ' || pr.name end,
      'Semana del ' || to_char(p_week, 'DD/MM') || coalesce(': ' || nullif(btrim(p_note), ''), '.'), '/horas') on conflict do nothing;
  end if;
  return r;
end $$;
revoke all on function public.timesheet_submit(uuid, date, text) from public, anon;
revoke all on function public.timesheet_decide(uuid, uuid, date, text, text) from public, anon;
grant execute on function public.timesheet_submit(uuid, date, text) to authenticated;
grant execute on function public.timesheet_decide(uuid, uuid, date, text, text) to authenticated;


-- =====================================================================
--  FASE 3 · Proyectos de trabajo
-- =====================================================================
alter table public.project_tasks add column if not exists priority text;
alter table public.project_tasks add column if not exists labels text[] not null default '{}';
alter table public.project_tasks add column if not exists blocked_by uuid[] not null default '{}';
alter table public.project_tasks add column if not exists repeat_rule jsonb;
alter table public.project_tasks add column if not exists repeat_parent_id uuid references public.project_tasks on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_priority_ok') then
    alter table public.project_tasks add constraint project_tasks_priority_ok check (priority is null or priority in ('urgente', 'alta', 'normal', 'baja'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_labels_ok') then
    alter table public.project_tasks add constraint project_tasks_labels_ok check (cardinality(labels) <= 8 and cardinality(blocked_by) <= 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_repeat_ok') then
    alter table public.project_tasks add constraint project_tasks_repeat_ok
      check (repeat_rule is null or (jsonb_typeof(repeat_rule) = 'object' and repeat_rule ->> 'freq' in ('day', 'week', 'month')));
  end if;
end $$;
create index if not exists project_tasks_blocked_idx on public.project_tasks using gin (blocked_by);

-- Limpia etiquetas y bloqueos (mismo proyecto, sin bloquearse a sí misma ni en círculo directo).
create or replace function public._ptask_clean() returns trigger
language plpgsql security definer set search_path = public as $$
declare l text; clean text[] := '{}'; b uuid; ok uuid[] := '{}';
begin
  foreach l in array coalesce(new.labels, '{}') loop
    l := left(lower(btrim(l)), 30);
    if l <> '' and not l = any(clean) then clean := clean || l; end if;
  end loop;
  new.labels := clean[1:8];
  foreach b in array coalesce(new.blocked_by, '{}') loop
    if b <> new.id and not b = any(ok) and exists (select 1 from project_tasks t where t.id = b and t.project_id = new.project_id and not (new.id = any(t.blocked_by))) then
      ok := ok || b;
    end if;
  end loop;
  new.blocked_by := ok[1:10];
  return new;
end $$;
drop trigger if exists project_tasks_clean_trg on public.project_tasks;
create trigger project_tasks_clean_trg before insert or update of labels, blocked_by on public.project_tasks
  for each row execute function public._ptask_clean();

-- Reglas simples por proyecto.
create table if not exists public.project_rules (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  -- moved: la tarea pasa a la columna `column_key` · created: se crea una tarea · overdue: se vence
  trigger    text not null check (trigger in ('moved', 'created', 'overdue')),
  column_key text check (char_length(column_key) <= 40),
  -- assign: asignar a `user_id` · notify: avisar a `user_id` (o al dueño si es null) · notify_assignee: avisar a quien la tiene
  action     text not null check (action in ('assign', 'notify', 'notify_assignee')),
  user_id    uuid references auth.users on delete cascade,
  enabled    boolean not null default true,
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (trigger <> 'moved' or column_key is not null),
  check (action <> 'assign' or user_id is not null),
  check (not (trigger = 'overdue' and action = 'assign'))
);
create index if not exists project_rules_project_idx on public.project_rules (project_id) where enabled;
alter table public.project_rules enable row level security;
drop policy if exists "rules read" on public.project_rules;
create policy "rules read" on public.project_rules for select using (coalesce(is_project_member(project_id), false));
drop policy if exists "rules write" on public.project_rules;
create policy "rules write" on public.project_rules for all using (coalesce(can_edit_project(project_id), false)) with check (coalesce(can_edit_project(project_id), false));

create or replace function public._project_rules_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; cap int;
begin
  select owner_id into owner from projects where id = new.project_id;
  cap := case when plan_of(owner) = 'free' then 2 else 20 end;
  if (select count(*) from project_rules where project_id = new.project_id) >= cap then
    if cap = 2 then raise exception 'Con el plan Gratis cada proyecto tiene hasta 2 reglas. Con Kaderno Pro, 20.' using errcode = 'P0001'; end if;
    raise exception 'Máximo 20 reglas por proyecto.' using errcode = 'P0001';
  end if;
  if new.user_id is not null and not exists (select 1 from project_members where project_id = new.project_id and user_id = new.user_id) then
    raise exception 'Esa persona no está en el proyecto.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists project_rules_cap_trg on public.project_rules;
create trigger project_rules_cap_trg before insert on public.project_rules for each row execute function public._project_rules_cap();

create or replace function public._rule_notify(p_user uuid, p_ref text, p_title text, p_body text, p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into notification_queue (user_id, kind, ref, title, body, url)
  values (p_user, 'project_rule', p_ref, left(p_title, 200), left(p_body, 300), '/proyectos/' || p_project) on conflict do nothing;
exception when undefined_table then null;
end $$;

-- Antes de guardar: reglas que asignan.
create or replace function public._ptask_rules_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare r project_rules;
begin
  for r in select * from project_rules where project_id = new.project_id and enabled and action = 'assign'
             and ((trigger = 'created' and tg_op = 'INSERT' and new.assignee_id is null)
               or (trigger = 'moved' and column_key = new.status and (tg_op = 'INSERT' or old.status is distinct from new.status)))
           order by created_at loop
    if exists (select 1 from project_members where project_id = new.project_id and user_id = r.user_id) then
      new.assignee_id := r.user_id;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists project_tasks_rules_before_trg on public.project_tasks;
create trigger project_tasks_rules_before_trg before insert or update of status on public.project_tasks
  for each row execute function public._ptask_rules_before();

-- Después de guardar: reglas que avisan, la siguiente repetición y los desbloqueos.
create or replace function public._ptask_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare r project_rules; pr projects; col text; tz text; today date; due date; nd date; nid uuid; t record;
begin
  select * into pr from projects where id = new.project_id;
  -- Avisos de reglas al mover o crear.
  for r in select * from project_rules where project_id = new.project_id and enabled and action in ('notify', 'notify_assignee')
             and ((trigger = 'created' and tg_op = 'INSERT')
               or (trigger = 'moved' and column_key = new.status and (tg_op = 'INSERT' or old.status is distinct from new.status))) loop
    select coalesce(c ->> 'label', new.status) into col from jsonb_array_elements(pr.board_columns) c where c ->> 'key' = new.status limit 1;
    perform _rule_notify(case when r.action = 'notify_assignee' then new.assignee_id else coalesce(r.user_id, pr.owner_id) end,
      'rule-' || r.id || '-' || new.id || '-' || extract(epoch from now())::bigint,
      case when r.trigger = 'created' then 'Tarea nueva en ' || pr.name else '"' || new.title || '" pasó a ' || coalesce(col, new.status) end,
      new.title, new.project_id);
  end loop;

  if tg_op = 'UPDATE' and new.done and not coalesce(old.done, false) then
    -- La siguiente repetición (una sola vez por tarea).
    if new.repeat_rule is not null and not exists (select 1 from project_tasks where repeat_parent_id = new.id) then
      tz := coalesce(_kaderno_tz(coalesce(new.assignee_id, pr.owner_id)), 'America/Bogota');
      today := (now() at time zone tz)::date;
      due := coalesce((new.due_at at time zone tz)::date, new.due_date);
      nd := _repeat_next(new.repeat_rule, due, today, today);
      if nd is not null then
        insert into project_tasks (project_id, title, description, status, assignee_id, due_date, due_at, priority, labels, repeat_rule, repeat_parent_id, created_by, position)
        values (new.project_id, new.title, new.description,
          coalesce((select c ->> 'key' from jsonb_array_elements(pr.board_columns) c where not coalesce((c ->> 'done')::boolean, false) limit 1), 'todo'),
          new.assignee_id, nd, case when new.due_at is not null then new.due_at + make_interval(days => nd - coalesce(due, today)) end,
          new.priority, new.labels, new.repeat_rule, new.id, new.created_by, new.position)
        returning id into nid;
      end if;
    end if;
    -- Desbloqueos: tareas que esperaban a esta y ya no esperan a ninguna.
    for t in select pt.id, pt.title, pt.assignee_id from project_tasks pt
              where pt.project_id = new.project_id and new.id = any(pt.blocked_by) and not pt.done
                and not exists (select 1 from project_tasks b where b.id = any(pt.blocked_by) and not b.done) loop
      perform _rule_notify(coalesce(t.assignee_id, pr.owner_id), 'unblock-' || t.id || '-' || new.id,
        'Ya puedes seguir con "' || t.title || '"', 'Se terminó "' || new.title || '", que la bloqueaba.', new.project_id);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists project_tasks_after_trg on public.project_tasks;
create trigger project_tasks_after_trg after insert or update on public.project_tasks
  for each row execute function public._ptask_after();

-- Cada hora (desde billing-charge): avisos de las reglas "cuando se venza".
create or replace function public.project_rules_tick() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select pr.id as rule_id, pr.action, pr.user_id, p.owner_id, p.name, p.id as project_id, t.id as task_id, t.title, t.assignee_id
             from project_rules pr join projects p on p.id = pr.project_id
             join project_tasks t on t.project_id = pr.project_id and not t.done
            where pr.enabled and pr.trigger = 'overdue'
              and coalesce(t.due_at, (t.due_date + 1)::timestamp at time zone coalesce(_kaderno_tz(p.owner_id), 'America/Bogota')) < now()
              and coalesce(t.due_at, (t.due_date + 1)::timestamp at time zone coalesce(_kaderno_tz(p.owner_id), 'America/Bogota')) > now() - interval '3 days' loop
    perform _rule_notify(case when r.action = 'notify_assignee' then r.assignee_id else coalesce(r.user_id, r.owner_id) end,
      'overdue-' || r.rule_id || '-' || r.task_id, 'Se venció "' || r.title || '"', 'En ' || r.name || '.', r.project_id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.project_rules_tick() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.project_rules_tick() to service_role; end if;
end $$;

-- Estado semanal del proyecto.
create table if not exists public.project_updates (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  author_id  uuid not null references auth.users on delete cascade default auth.uid(),
  health     text not null check (health in ('en_curso', 'en_riesgo', 'atrasado')),
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists project_updates_project_idx on public.project_updates (project_id, created_at desc);
alter table public.project_updates enable row level security;
drop policy if exists "updates read" on public.project_updates;
create policy "updates read" on public.project_updates for select using (coalesce(is_project_member(project_id), false));
drop policy if exists "updates write" on public.project_updates;
create policy "updates write" on public.project_updates for insert with check (author_id = auth.uid() and coalesce(can_edit_project(project_id), false));
drop policy if exists "updates delete" on public.project_updates;
create policy "updates delete" on public.project_updates for delete using (author_id = auth.uid());

create or replace function public._project_update_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record; pr projects;
begin
  select * into pr from projects where id = new.project_id;
  for m in select user_id from project_members where project_id = new.project_id and user_id <> new.author_id loop
    perform _rule_notify(m.user_id, 'update-' || new.id,
      pr.name || ': ' || case new.health when 'en_curso' then 'en curso' when 'en_riesgo' then 'en riesgo' else 'atrasado' end,
      left(new.body, 200), new.project_id);
  end loop;
  return null;
end $$;
drop trigger if exists project_updates_notify_trg on public.project_updates;
create trigger project_updates_notify_trg after insert on public.project_updates for each row execute function public._project_update_notify();
