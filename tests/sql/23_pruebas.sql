-- Pruebas de supabase/schema_v23.sql, fase 1 (planes y topes). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values
  ('96000000-0000-4000-8000-000000000001', 'gratis@upb.edu.co'),
  ('96000000-0000-4000-8000-000000000002', 'jefa@empresa.co'),
  ('96000000-0000-4000-8000-000000000003', 'Socio@Empresa.co')
on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000001', false);
do $$ declare p jsonb; begin
  p := public.my_plan();
  if p ->> 'plan' <> 'free' or not (p ->> 'trial_available')::boolean then raise exception 'cuenta nueva: %', p; end if;
  begin insert into public.subscriptions (user_id, plan, current_period_end) values (auth.uid(), 'pro', now() + interval '1 year'); raise exception 'se regaló Pro';
  exception when insufficient_privilege then null; end;
  p := public.start_trial();
  if p ->> 'plan' <> 'pro' or p ->> 'status' <> 'trial' or (p ->> 'trial_available')::boolean then raise exception 'prueba: %', p; end if;
  if (p ->> 'period_end')::timestamptz < now() + interval '6 days 23 hours' then raise exception 'la prueba no dura 7 días'; end if;
  begin perform public.start_trial(); raise exception 'segunda prueba';
  exception when raise_exception then if sqlerrm not like 'Ya %' then raise; end if; end;
  raise notice 'ok 1 cuenta nueva, prueba de 7 días una sola vez, nadie se regala Pro';
end $$;

-- Calendarios: con Pro (prueba) hasta 10; al volver a Gratis, 2.
do $$ declare i int; begin
  for i in 1..3 loop insert into public.external_calendars (name, url) values ('C' || i, 'https://cal.example.com/' || i || '.ics'); end loop;
  raise notice 'ok 2 con Pro conecta 3 calendarios';
end $$;
reset role;
update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id = '96000000-0000-4000-8000-000000000001';
set role authenticated;
do $$ declare p jsonb; begin
  p := public.my_plan();
  if p ->> 'plan' <> 'free' or (p ->> 'trial_available')::boolean then raise exception 'después de la prueba: %', p; end if;
  begin insert into public.external_calendars (name, url) values ('C4', 'https://cal.example.com/4.ics'); raise exception 'Gratis conectó un 4.º calendario';
  exception when raise_exception then if sqlerrm not like 'Con el plan Gratis%' then raise; end if; end;
  if (select count(*) from public.external_calendars) <> 3 then raise exception 'se perdieron calendarios'; end if;
  raise notice 'ok 3 la prueba termina sola; Gratis no agrega más de 2 calendarios y no pierde los que tenía';
end $$;

-- Equipo: la jefa paga 3 puestos; el correo del socio (sin importar mayúsculas) tiene Equipo.
reset role;
insert into public.subscriptions (user_id, plan, period, status, current_period_end, seats)
values ('96000000-0000-4000-8000-000000000002', 'team', 'month', 'active', now() + interval '20 days', 3)
on conflict (user_id) do update set plan = 'team', status = 'active', current_period_end = now() + interval '20 days', seats = 3;
insert into public.team_seats (owner_id, email) values ('96000000-0000-4000-8000-000000000002', 'socio@empresa.co') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000003', false);
do $$ declare p jsonb; begin
  p := public.my_plan();
  if p ->> 'plan' <> 'team' or p -> 'via_team' ->> 'owner' is null then raise exception 'socio: %', p; end if;
  if (p ->> 'trial_available')::boolean then raise exception 'con Equipo no ofrece prueba'; end if;
  if exists (select 1 from public.team_seats) then raise exception 'el socio ve los puestos de la jefa'; end if;
  raise notice 'ok 4 un puesto de Equipo da el plan, sin ver los demás puestos';
end $$;
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000002', false);
do $$ declare p jsonb; begin
  p := public.my_plan();
  if p ->> 'plan' <> 'team' or (p ->> 'seats_used')::int <> 2 or p -> 'via_team' <> 'null'::jsonb then raise exception 'jefa: %', p; end if;
  raise notice 'ok 5 quien paga ve cuántos puestos usa';
end $$;
reset role;
update public.subscriptions set current_period_end = now() - interval '1 second' where user_id = '96000000-0000-4000-8000-000000000002';
do $$ begin
  if public.plan_of('96000000-0000-4000-8000-000000000003') <> 'free' then raise exception 'el puesto sigue sin plan vigente'; end if;
  raise notice 'ok 6 si el Equipo vence, los puestos vuelven a Gratis';
end $$;
