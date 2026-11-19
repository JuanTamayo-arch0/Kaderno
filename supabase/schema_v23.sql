-- =====================================================================
-- Kaderno · schema_v23.sql  (versión 24 de la app: planes, pagos con Wompi y modo Trabajo)
--
-- Requiere schema_v14 (bandeja de avisos), schema_v19 (tope de la IA) y
-- schema_v20 (calendarios externos). Es idempotente: se puede correr dos
-- veces. Crece por fases (ver PLAN_v24.md).
--
-- Fase 1 · Planes y topes
--   · subscriptions: el plan de cada persona (Gratis, Pro o Equipo), hasta
--     cuándo, y la prueba gratis de 7 días. Solo la escribe el servidor.
--   · team_seats: los puestos de un plan Equipo (por correo).
--   · plan_of(): el plan que vale hoy (el propio o el de un equipo).
--   · my_plan(): lo que muestra la pantalla "Tu plan".
--   · start_trial(): 7 días de Pro, una vez por cuenta, sin tarjeta.
--   · Calendarios externos: 2 con Gratis, 10 con Pro (antes 5 para todos;
--     a quien ya tenga más no se le quita ninguno).
--   · Los topes diarios de la IA dependen del plan (los decide la función
--     "ai" con supabase/functions/_shared/plans.ts).
-- =====================================================================


-- =====================================================================
--  FASE 1 · Planes y topes
-- =====================================================================
create table if not exists public.subscriptions (
  user_id              uuid primary key references auth.users on delete cascade,
  plan                 text not null default 'free' check (plan in ('free', 'pro', 'team')),
  period               text check (period in ('month', 'year')),
  -- none: nunca ha pagado · trial: prueba · active: pagado y se renueva
  -- past_due: falló la renovación (se reintenta) · canceled: pagado hasta el fin, sin renovar
  status               text not null default 'none' check (status in ('none', 'trial', 'active', 'past_due', 'canceled')),
  current_period_end   timestamptz,
  trial_used           boolean not null default false,
  auto_renew           boolean not null default false,
  seats                integer not null default 1 check (seats between 1 and 200),
  provider             text check (provider in ('wompi')),
  payment_source_id    bigint,
  payment_source_kind  text check (payment_source_kind in ('CARD', 'NEQUI')),
  payment_source_label text check (char_length(payment_source_label) <= 60),
  retries              integer not null default 0,
  next_charge_at       timestamptz,
  last_error           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists subscriptions_charge_idx on public.subscriptions (next_charge_at) where auto_renew;
alter table public.subscriptions enable row level security;
drop policy if exists "own subscription read" on public.subscriptions;
create policy "own subscription read" on public.subscriptions for select using (user_id = auth.uid());
revoke insert, update, delete on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- Puestos de un plan Equipo: quien paga agrega correos; cada correo tiene Pro
-- mientras el plan esté vigente. Quien paga cuenta como un puesto.
create table if not exists public.team_seats (
  owner_id uuid not null references auth.users on delete cascade,
  email    text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  added_at timestamptz not null default now(),
  primary key (owner_id, email)
);
create index if not exists team_seats_email_idx on public.team_seats (lower(email));
alter table public.team_seats enable row level security;
drop policy if exists "owner reads seats" on public.team_seats;
create policy "owner reads seats" on public.team_seats for select using (owner_id = auth.uid());
revoke insert, update, delete on public.team_seats from anon, authenticated;
grant select on public.team_seats to authenticated;

-- El plan que vale hoy: el propio si está vigente; si no, el de un equipo
-- que tenga su correo; si no, Gratis.
create or replace function public.plan_of(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text; mail text;
begin
  if p_user is null then return 'free'; end if;
  select plan into v from subscriptions
   where user_id = p_user and plan in ('pro', 'team') and current_period_end > now();
  if v is not null then return v; end if;
  select lower(email) into mail from auth.users where id = p_user;
  if mail is not null and exists (
    select 1 from team_seats ts join subscriptions o on o.user_id = ts.owner_id
     where lower(ts.email) = mail and o.plan = 'team' and o.current_period_end > now()) then
    return 'team';
  end if;
  return 'free';
end $$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;

-- Lo que muestra "Tu plan".
create or replace function public.my_plan() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); s subscriptions; eff text; via jsonb := null; mail text; n int := 0;
begin
  if me is null then return jsonb_build_object('plan', 'free'); end if;
  select * into s from subscriptions where user_id = me;
  eff := plan_of(me);
  if eff = 'team' and not (coalesce(s.plan, '') = 'team' and s.current_period_end > now()) then
    select lower(email) into mail from auth.users where id = me;
    select jsonb_build_object('owner', coalesce(pr.display_name, split_part(u.email, '@', 1)), 'until', o.current_period_end)
      into via
      from team_seats ts join subscriptions o on o.user_id = ts.owner_id
      join auth.users u on u.id = ts.owner_id
      left join profiles pr on pr.id = ts.owner_id
     where lower(ts.email) = mail and o.plan = 'team' and o.current_period_end > now()
     order by o.current_period_end desc limit 1;
  end if;
  if s.plan = 'team' then select count(*) into n from team_seats where owner_id = me; end if;
  return jsonb_build_object(
    'plan', eff,
    'own_plan', coalesce(s.plan, 'free'),
    'status', coalesce(s.status, 'none'),
    'period', s.period,
    'period_end', s.current_period_end,
    'auto_renew', coalesce(s.auto_renew, false),
    'trial_available', not coalesce(s.trial_used, false) and eff = 'free',
    'seats', coalesce(s.seats, 1),
    'seats_used', n + 1,
    'source_label', s.payment_source_label,
    'source_kind', s.payment_source_kind,
    'next_charge_at', case when s.auto_renew then s.next_charge_at end,
    'retries', coalesce(s.retries, 0),
    'via_team', via);
end $$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- Prueba gratis: 7 días de Pro, una vez por cuenta, sin tarjeta.
create or replace function public.start_trial() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s subscriptions;
begin
  if me is null then raise exception 'Inicia sesión.' using errcode = 'P0001'; end if;
  select * into s from subscriptions where user_id = me for update;
  if coalesce(s.trial_used, false) then raise exception 'Ya usaste la prueba gratis.' using errcode = 'P0001'; end if;
  if plan_of(me) <> 'free' then raise exception 'Ya tienes Pro.' using errcode = 'P0001'; end if;
  insert into subscriptions (user_id, plan, status, current_period_end, trial_used, updated_at)
  values (me, 'pro', 'trial', now() + interval '7 days', true, now())
  on conflict (user_id) do update set plan = 'pro', status = 'trial', period = null,
    current_period_end = now() + interval '7 days', trial_used = true, auto_renew = false, updated_at = now();
  return my_plan();
end $$;
revoke all on function public.start_trial() from public, anon;
grant execute on function public.start_trial() to authenticated;

-- Calendarios externos según el plan (antes: 5 para todos).
create or replace function public._external_calendars_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap int := case when plan_of(new.user_id) = 'free' then 2 else 10 end;
begin
  if (select count(*) from external_calendars where user_id = new.user_id) >= cap then
    if cap = 2 then
      raise exception 'Con el plan Gratis puedes conectar 2 calendarios. Con Kaderno Pro, hasta 10.' using errcode = 'P0001';
    end if;
    raise exception 'Máximo 10 calendarios.' using errcode = 'P0001';
  end if;
  return new;
end $$;
