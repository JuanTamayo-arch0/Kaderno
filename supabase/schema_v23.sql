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
--
-- Fase 2 · Cobro con Wompi
--   · billing_payments: cada pago (referencia, plan, monto, estado). Cada
--     quien ve los suyos; solo el servidor los escribe.
--   · billing_events: los eventos que manda Wompi (solo el servidor).
--   · billing_price(): los precios (los mismos de _shared/plans.ts).
--   · billing_new_payment(), billing_settle(), billing_due(),
--     billing_set_source(), billing_reminders(): las usan las funciones
--     "billing", "billing-webhook" y "billing-charge" con la llave de servicio.
--   · billing_cancel() y billing_resume(): apagar o prender la renovación.
--   · team_seat_add() y team_seat_remove(): los puestos de Equipo.
--   · plan_of(): con la renovación fallida se conserva el plan 7 días más
--     mientras se reintenta el cobro.
--
-- Fase 5 · Registro de horas (requiere schema_v12 y schema_v14)
--   · focus_sessions gana project_id, note y source ('focus' o 'manual'):
--     el enfoque cuenta por proyecto, y se pueden anotar horas a mano.
--   · Solo se puede anotar tiempo en proyectos donde uno está; a mano, de 1
--     minuto a 12 horas, y nunca en el futuro.
--   · project_hours(): las horas de todo el equipo en un proyecto (plan Equipo).
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


-- =====================================================================
--  FASE 2 · Cobro con Wompi
-- =====================================================================
create table if not exists public.billing_payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  reference       text not null unique check (char_length(reference) between 8 and 60),
  -- checkout: pago de un periodo por el checkout web · first: primer cobro con renovación
  -- renewal: renovación automática · seats: puestos de Equipo agregados a mitad de periodo
  kind            text not null check (kind in ('checkout', 'first', 'renewal', 'seats')),
  plan            text not null check (plan in ('pro', 'team')),
  period          text not null check (period in ('month', 'year')),
  seats           integer not null default 1 check (seats between 1 and 200),
  amount_in_cents bigint not null check (amount_in_cents > 0),
  currency        text not null default 'COP',
  status          text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR')),
  wompi_tx_id     text,
  method          text,
  error           text,
  created_at      timestamptz not null default now(),
  settled_at      timestamptz
);
create index if not exists billing_payments_user_idx on public.billing_payments (user_id, created_at desc);
create index if not exists billing_payments_tx_idx on public.billing_payments (wompi_tx_id);
alter table public.billing_payments enable row level security;
drop policy if exists "own payments read" on public.billing_payments;
create policy "own payments read" on public.billing_payments for select using (user_id = auth.uid());
revoke insert, update, delete on public.billing_payments from anon, authenticated;
grant select on public.billing_payments to authenticated;

create table if not exists public.billing_events (
  id          bigserial primary key,
  received_at timestamptz not null default now(),
  event       text,
  reference   text,
  tx_id       text,
  status      text,
  ok          boolean not null default false,
  result      text,
  body        jsonb
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

-- Precios en centavos (los mismos de supabase/functions/_shared/plans.ts).
create or replace function public.billing_price(p_plan text, p_period text, p_seats int default 1) returns bigint
language sql immutable as $$
  select (case p_plan || '/' || p_period
    when 'pro/month' then 9900 when 'pro/year' then 89000
    when 'team/month' then 14900 when 'team/year' then 149000 end)::bigint * 100
    * (case when p_plan = 'team' then greatest(2, least(200, coalesce(p_seats, 2))) else 1 end);
$$;

-- Con la renovación fallida, el plan sigue 7 días más mientras se reintenta.
create or replace function public.plan_of(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text; mail text;
begin
  if p_user is null then return 'free'; end if;
  select plan into v from subscriptions
   where user_id = p_user and plan in ('pro', 'team')
     and (current_period_end > now() or (status = 'past_due' and current_period_end > now() - interval '7 days'));
  if v is not null then return v; end if;
  select lower(email) into mail from auth.users where id = p_user;
  if mail is not null and exists (
    select 1 from team_seats ts join subscriptions o on o.user_id = ts.owner_id
     where lower(ts.email) = mail and o.plan = 'team'
       and (o.current_period_end > now() or (o.status = 'past_due' and o.current_period_end > now() - interval '7 days'))) then
    return 'team';
  end if;
  return 'free';
end $$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;

-- Un pago nuevo (pendiente). Solo el servidor.
create or replace function public.billing_new_payment(p_user uuid, p_plan text, p_period text, p_seats int, p_kind text, p_reference text)
returns public.billing_payments
language plpgsql security definer set search_path = public as $$
declare s subscriptions; amount bigint; seats int := 1; r billing_payments; frac numeric; len interval;
begin
  if p_plan not in ('pro', 'team') or p_period not in ('month', 'year') or p_kind not in ('checkout', 'first', 'renewal', 'seats') then
    raise exception 'Plan inválido.' using errcode = 'P0001';
  end if;
  select * into s from subscriptions where user_id = p_user;
  if p_plan = 'team' then seats := greatest(2, least(200, coalesce(p_seats, 2))); end if;
  -- No se cambia de plan con uno vigente y pagado (la prueba sí se puede cambiar).
  if p_kind in ('checkout', 'first') and s.status in ('active', 'past_due') and s.current_period_end > now() and s.plan <> p_plan then
    raise exception 'Ya tienes %. Podrás cambiar de plan cuando termine el periodo pagado.', case s.plan when 'team' then 'Equipo' else 'Pro' end using errcode = 'P0001';
  end if;
  if p_plan = 'team' and p_kind in ('checkout', 'first') and s.plan = 'team' and s.current_period_end > now()
     and seats < (select count(*) + 1 from team_seats where owner_id = p_user) then
    raise exception 'Tienes más personas en el equipo que esos puestos.' using errcode = 'P0001';
  end if;
  if p_kind = 'seats' then
    -- Puestos extra hasta el final del periodo: la parte proporcional de lo que falta.
    if s.plan <> 'team' or s.current_period_end <= now() then raise exception 'Primero paga el plan Equipo.' using errcode = 'P0001'; end if;
    seats := greatest(1, least(200 - s.seats, coalesce(p_seats, 1)));
    if seats < 1 then raise exception 'Llegaste a 200 puestos.' using errcode = 'P0001'; end if;
    len := case s.period when 'year' then interval '1 year' else interval '1 month' end;
    frac := least(1, extract(epoch from (s.current_period_end - now())) / extract(epoch from len));
    amount := greatest(2000, round(billing_price('team', coalesce(s.period, 'month'), 2) / 2 / 100 * frac / 100) * 100) * 100 * seats;
    p_period := coalesce(s.period, 'month');
  elsif p_kind = 'renewal' then
    seats := case when p_plan = 'team' then greatest(2, coalesce(s.seats, 2)) else 1 end;
    amount := billing_price(p_plan, p_period, seats);
  else
    amount := billing_price(p_plan, p_period, seats);
  end if;
  insert into billing_payments (user_id, reference, kind, plan, period, seats, amount_in_cents)
  values (p_user, p_reference, p_kind, p_plan, p_period, seats, amount) returning * into r;
  return r;
end $$;

create or replace function public.billing_attach_tx(p_reference text, p_tx_id text, p_method text default null)
returns void language sql security definer set search_path = public as $$
  update billing_payments set wompi_tx_id = coalesce(p_tx_id, wompi_tx_id), method = coalesce(p_method, method) where reference = p_reference;
$$;

create or replace function public._billing_notify(p_user uuid, p_ref text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notification_queue (user_id, kind, ref, title, body, url)
  values (p_user, 'billing', p_ref, p_title, p_body, '/plan') on conflict do nothing;
exception when undefined_table then null;
end $$;

-- Aplica el resultado de un pago (del webhook, de la consulta o del cobro).
-- Es idempotente: un pago ya resuelto no se vuelve a aplicar.
create or replace function public.billing_settle(p_reference text, p_status text, p_tx_id text default null, p_amount bigint default null, p_method text default null, p_error text default null)
returns text language plpgsql security definer set search_path = public as $$
declare r billing_payments; s subscriptions; base timestamptz; new_end timestamptz; len interval; n int;
begin
  select * into r from billing_payments where reference = p_reference for update;
  if not found then return 'unknown'; end if;
  if r.status <> 'PENDING' then return 'already'; end if;
  if p_status not in ('APPROVED', 'DECLINED', 'VOIDED', 'ERROR') then
    update billing_payments set wompi_tx_id = coalesce(p_tx_id, wompi_tx_id), method = coalesce(p_method, method) where id = r.id;
    return 'pending';
  end if;
  if p_status = 'APPROVED' and p_amount is not null and p_amount <> r.amount_in_cents then
    update billing_payments set status = 'ERROR', error = 'El monto no coincide (' || p_amount || ')', wompi_tx_id = coalesce(p_tx_id, wompi_tx_id), settled_at = now() where id = r.id;
    return 'mismatch';
  end if;
  update billing_payments set status = p_status, wompi_tx_id = coalesce(p_tx_id, wompi_tx_id), method = coalesce(p_method, method),
    error = p_error, settled_at = now() where id = r.id;

  insert into subscriptions (user_id) values (r.user_id) on conflict do nothing;
  select * into s from subscriptions where user_id = r.user_id for update;
  len := case r.period when 'year' then interval '1 year' else interval '1 month' end;

  if p_status = 'APPROVED' then
    if r.kind = 'seats' then
      update subscriptions set seats = least(200, seats + r.seats), updated_at = now() where user_id = r.user_id;
      perform _billing_notify(r.user_id, 'pay-' || r.reference, 'Puestos agregados', 'Tu equipo ahora tiene ' || least(200, s.seats + r.seats) || ' puestos.');
      return 'approved';
    end if;
    base := case when s.plan = r.plan and s.current_period_end > now() then s.current_period_end else now() end;
    new_end := base + len;
    update subscriptions set plan = r.plan, period = r.period, seats = r.seats, status = 'active',
      current_period_end = new_end, provider = 'wompi',
      auto_renew = case when r.kind in ('first', 'renewal') then true else auto_renew and payment_source_id is not null end,
      next_charge_at = case when r.kind in ('first', 'renewal') or (auto_renew and payment_source_id is not null) then new_end - interval '1 day' end,
      retries = 0, last_error = null, updated_at = now()
     where user_id = r.user_id;
    perform _billing_notify(r.user_id, 'pay-' || r.reference, 'Pago recibido',
      'Tienes ' || case r.plan when 'team' then 'Equipo' else 'Pro' end || ' hasta el ' || to_char(new_end at time zone _kaderno_tz(r.user_id), 'DD/MM/YYYY') || '. ¡Gracias por apoyar Kaderno!');
    return 'approved';
  end if;

  -- Rechazado o con error.
  if r.kind = 'renewal' then
    n := s.retries + 1;
    if n <= 3 then
      update subscriptions set status = 'past_due', retries = n, last_error = coalesce(p_error, p_status),
        next_charge_at = now() + make_interval(days => (array[1, 2, 4])[n]), updated_at = now() where user_id = r.user_id;
      perform _billing_notify(r.user_id, 'fail-' || r.reference, 'No pudimos renovar tu plan',
        'Lo intentamos de nuevo en ' || (array[1, 2, 4])[n] || case when n = 1 then ' día' else ' días' end || '. Revisa tu medio de pago en Tu plan.');
    else
      update subscriptions set status = 'active', auto_renew = false, next_charge_at = null, retries = 0,
        last_error = coalesce(p_error, p_status), updated_at = now() where user_id = r.user_id;
      perform _billing_notify(r.user_id, 'stop-' || r.reference, 'Se apagó la renovación',
        'No pudimos cobrar después de 3 intentos. Puedes pagar otra vez cuando quieras; no se borra nada tuyo.');
    end if;
  elsif r.kind = 'first' then
    update subscriptions set auto_renew = false, next_charge_at = null, payment_source_id = null,
      payment_source_kind = null, payment_source_label = null, last_error = coalesce(p_error, p_status), updated_at = now()
     where user_id = r.user_id;
  end if;
  return lower(p_status);
end $$;

-- La fuente de pago guardada en Wompi (tarjeta o Nequi) para renovar.
create or replace function public.billing_set_source(p_user uuid, p_source_id bigint, p_kind text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('CARD', 'NEQUI') then raise exception 'Medio inválido.' using errcode = 'P0001'; end if;
  insert into subscriptions (user_id) values (p_user) on conflict do nothing;
  update subscriptions set provider = 'wompi', payment_source_id = p_source_id, payment_source_kind = p_kind,
    payment_source_label = left(p_label, 60), updated_at = now(),
    next_charge_at = case when auto_renew and current_period_end > now() then current_period_end - interval '1 day' else next_charge_at end
   where user_id = p_user;
end $$;

-- Renovaciones que toca cobrar ahora (sin otra pendiente reciente).
create or replace function public.billing_due(p_limit int default 50)
returns table (user_id uuid, plan text, period text, seats int, payment_source_id bigint, email text)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.plan, coalesce(s.period, 'month'), s.seats, s.payment_source_id, u.email
    from subscriptions s join auth.users u on u.id = s.user_id
   where s.auto_renew and s.payment_source_id is not null and s.next_charge_at <= now() and s.plan in ('pro', 'team')
     and not exists (select 1 from billing_payments p where p.user_id = s.user_id and p.kind = 'renewal'
                      and p.status = 'PENDING' and p.created_at > now() - interval '6 hours')
   order by s.next_charge_at limit greatest(1, least(500, p_limit));
$$;

-- Avisos: la prueba termina mañana, o el plan sin renovación termina en 3 días.
create or replace function public.billing_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select user_id, status, current_period_end from subscriptions
            where plan in ('pro', 'team') and not auto_renew
              and current_period_end > now()
              and current_period_end <= now() + case when status = 'trial' then interval '1 day' else interval '3 days' end loop
    perform _billing_notify(r.user_id, 'end-' || to_char(r.current_period_end, 'YYYYMMDD'),
      case when r.status = 'trial' then 'Tu prueba de Pro termina mañana' else 'Tu plan termina pronto' end,
      case when r.status = 'trial' then 'Si te sirvió, puedes seguir con Pro desde $9.900 al mes. Si no, vuelves a Gratis solo y no se borra nada.'
           else 'Termina el ' || to_char(r.current_period_end at time zone _kaderno_tz(r.user_id), 'DD/MM') || '. Si quieres seguir, paga otro periodo en Tu plan.' end);
    n := n + 1;
  end loop;
  return n;
end $$;

do $$ declare f text; begin
  foreach f in array array['billing_new_payment(uuid, text, text, int, text, text)', 'billing_attach_tx(text, text, text)',
    'billing_settle(text, text, text, bigint, text, text)', 'billing_set_source(uuid, bigint, text, text)', 'billing_due(int)',
    'billing_reminders()', '_billing_notify(uuid, text, text, text)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant execute on function public.' || f || ' to service_role'; end if;
  end loop;
end $$;

-- Apagar la renovación: el plan sigue hasta el final de lo pagado. Se olvida el medio de pago.
create or replace function public.billing_cancel() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Inicia sesión.' using errcode = 'P0001'; end if;
  update subscriptions set auto_renew = false, next_charge_at = null, payment_source_id = null, payment_source_kind = null,
    payment_source_label = null, status = case when status = 'past_due' then 'active' else status end, retries = 0, updated_at = now()
   where user_id = me;
  return my_plan();
end $$;
revoke all on function public.billing_cancel() from public, anon;
grant execute on function public.billing_cancel() to authenticated;

-- Volver a prender la renovación con el medio guardado (si lo hay y el plan sigue).
create or replace function public.billing_resume() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s subscriptions;
begin
  select * into s from subscriptions where user_id = me for update;
  if s.payment_source_id is null then raise exception 'Agrega una tarjeta o Nequi para renovar solo.' using errcode = 'P0001'; end if;
  if s.status = 'trial' or s.current_period_end is null or s.current_period_end <= now() then raise exception 'Tu plan ya terminó: paga otra vez para seguir.' using errcode = 'P0001'; end if;
  update subscriptions set auto_renew = true, next_charge_at = current_period_end - interval '1 day', updated_at = now() where user_id = me;
  return my_plan();
end $$;
revoke all on function public.billing_resume() from public, anon;
grant execute on function public.billing_resume() to authenticated;

-- Puestos de Equipo (quien paga).
create or replace function public.team_seat_add(p_email text) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s subscriptions; mail text := lower(btrim(p_email)); mine text;
begin
  select * into s from subscriptions where user_id = me;
  if s.plan <> 'team' or s.current_period_end <= now() then raise exception 'Primero paga el plan Equipo.' using errcode = 'P0001'; end if;
  select lower(email) into mine from auth.users where id = me;
  if mail = mine then raise exception 'Tú ya tienes un puesto.' using errcode = 'P0001'; end if;
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ese correo no es válido.' using errcode = 'P0001'; end if;
  if exists (select 1 from team_seats where owner_id = me and lower(email) = mail) then return s.seats - 1 - (select count(*) from team_seats where owner_id = me); end if;
  if (select count(*) + 1 from team_seats where owner_id = me) >= s.seats then
    raise exception 'Ya usaste los % puestos. Agrega más en Tu plan.', s.seats using errcode = 'P0001';
  end if;
  insert into team_seats (owner_id, email) values (me, mail);
  return s.seats - 1 - (select count(*) from team_seats where owner_id = me);
end $$;
create or replace function public.team_seat_remove(p_email text) returns void
language sql security definer set search_path = public as $$
  delete from team_seats where owner_id = auth.uid() and lower(email) = lower(btrim(p_email));
$$;
revoke all on function public.team_seat_add(text) from public, anon;
revoke all on function public.team_seat_remove(text) from public, anon;
grant execute on function public.team_seat_add(text) to authenticated;
grant execute on function public.team_seat_remove(text) to authenticated;


-- =====================================================================
--  FASE 5 · Registro de horas
-- =====================================================================
alter table public.focus_sessions add column if not exists project_id uuid references public.projects on delete set null;
alter table public.focus_sessions add column if not exists note text;
alter table public.focus_sessions add column if not exists source text not null default 'focus';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'focus_sessions_note_len') then
    alter table public.focus_sessions add constraint focus_sessions_note_len check (note is null or char_length(note) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'focus_sessions_source_ok') then
    alter table public.focus_sessions add constraint focus_sessions_source_ok check (source in ('focus', 'manual'));
  end if;
end $$;
create index if not exists focus_sessions_project_idx on public.focus_sessions (project_id, created_at) where project_id is not null;
create index if not exists focus_sessions_user_day_idx on public.focus_sessions (user_id, created_at);

create or replace function public._focus_sessions_hours() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is not null and not exists (select 1 from project_members m where m.project_id = new.project_id and m.user_id = new.user_id) then
    raise exception 'No eres parte de ese proyecto.' using errcode = 'P0001';
  end if;
  if new.source = 'manual' then
    if new.minutes is null or new.minutes < 1 or new.minutes > 720 then
      raise exception 'Las horas a mano van de 1 minuto a 12 horas.' using errcode = 'P0001';
    end if;
    if new.created_at > now() + interval '1 day' then
      raise exception 'No se pueden anotar horas en el futuro.' using errcode = 'P0001';
    end if;
  elsif tg_op = 'INSERT' then
    new.created_at := now(); -- el enfoque se anota al terminar
  end if;
  return new;
end $$;
drop trigger if exists focus_sessions_hours_trg on public.focus_sessions;
create trigger focus_sessions_hours_trg before insert or update on public.focus_sessions
  for each row execute function public._focus_sessions_hours();

-- Horas de todo el equipo en un proyecto (para quien está en el proyecto y tiene plan Equipo).
create or replace function public.project_hours(p_project uuid, p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, name text, minutes bigint, sessions bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_project_member(p_project) then raise exception 'No eres parte de ese proyecto.' using errcode = 'P0001'; end if;
  if plan_of(auth.uid()) <> 'team' then raise exception 'Las horas de todo el equipo son del plan Equipo.' using errcode = 'P0001'; end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then raise exception 'Rango inválido.' using errcode = 'P0001'; end if;
  return query
    select f.user_id, coalesce(nullif(btrim(pr.display_name), ''), split_part(u.email, '@', 1))::text, sum(f.minutes)::bigint, count(*)::bigint
      from focus_sessions f
      join project_members m on m.project_id = f.project_id and m.user_id = f.user_id
      join auth.users u on u.id = f.user_id
      left join profiles pr on pr.id = f.user_id
     where f.project_id = p_project and f.created_at >= p_from and f.created_at < p_to
     group by f.user_id, pr.display_name, u.email
     order by 3 desc;
end $$;
revoke all on function public.project_hours(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.project_hours(uuid, timestamptz, timestamptz) to authenticated;
