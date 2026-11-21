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
