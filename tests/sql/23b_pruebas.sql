-- Pruebas de supabase/schema_v23.sql, fase 2 (cobro con Wompi). Corren sobre la base k16, después de 23_pruebas.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values
  ('96000000-0000-4000-8000-000000000011', 'paga@upb.edu.co'),
  ('96000000-0000-4000-8000-000000000012', 'equipo@empresa.co'),
  ('96000000-0000-4000-8000-000000000013', 'prueba@upb.edu.co')
on conflict do nothing;

do $$ declare r public.billing_payments; s public.subscriptions; res text; begin
  if public.billing_price('pro', 'month') <> 990000 or public.billing_price('team', 'year', 3) <> 44700000 or public.billing_price('team', 'month', 1) <> 2980000 then
    raise exception 'precios mal';
  end if;
  -- Pago único de Pro mensual por el checkout.
  r := public.billing_new_payment('96000000-0000-4000-8000-000000000011', 'pro', 'month', 1, 'checkout', 'KD-C-T1-AAAA');
  if r.amount_in_cents <> 990000 or r.status <> 'PENDING' then raise exception 'pago nuevo: %', r; end if;
  res := public.billing_settle('KD-C-T1-AAAA', 'APPROVED', '123-1', 100, 'NEQUI');
  if res <> 'mismatch' then raise exception 'aceptó otro monto: %', res; end if;
  if public.plan_of('96000000-0000-4000-8000-000000000011') <> 'free' then raise exception 'un monto distinto dio Pro'; end if;
  r := public.billing_new_payment('96000000-0000-4000-8000-000000000011', 'pro', 'month', 1, 'checkout', 'KD-C-T1-BBBB');
  perform public.billing_settle('KD-C-T1-BBBB', 'PENDING', '123-2', null, 'PSE');
  if (select wompi_tx_id from public.billing_payments where reference = 'KD-C-T1-BBBB') <> '123-2' then raise exception 'no guardó la transacción'; end if;
  res := public.billing_settle('KD-C-T1-BBBB', 'APPROVED', '123-2', 990000, 'PSE');
  select * into s from public.subscriptions where user_id = '96000000-0000-4000-8000-000000000011';
  if res <> 'approved' or s.plan <> 'pro' or s.status <> 'active' or s.auto_renew or s.current_period_end < now() + interval '27 days' then raise exception 'aprobado: % %', res, s; end if;
  if public.billing_settle('KD-C-T1-BBBB', 'APPROVED', '123-2', 990000) <> 'already' then raise exception 'se aplicó dos veces'; end if;
  if (select current_period_end from public.subscriptions where user_id = s.user_id) <> s.current_period_end then raise exception 'el segundo aviso alargó el plan'; end if;
  if not exists (select 1 from public.notification_queue where user_id = s.user_id and kind = 'billing' and title = 'Pago recibido') then raise exception 'sin aviso de pago'; end if;
  -- Pagar otro mes antes de que termine: se suma al final.
  r := public.billing_new_payment(s.user_id, 'pro', 'year', 1, 'checkout', 'KD-C-T1-CCCC');
  perform public.billing_settle('KD-C-T1-CCCC', 'APPROVED', '123-3', 8900000);
  if (select current_period_end from public.subscriptions where user_id = s.user_id) < s.current_period_end + interval '364 days' then raise exception 'no sumó el año al final'; end if;
  begin perform public.billing_new_payment(s.user_id, 'team', 'month', 3, 'checkout', 'KD-C-T1-DDDD'); raise exception 'cambió de plan con uno vigente';
  exception when raise_exception then if sqlerrm not like 'Ya tienes Pro%' then raise; end if; end;
  raise notice 'ok 1 pago único: monto exacto, una sola vez, se suma al final y no cambia de plan a mitad';
end $$;

-- Renovación automática con tarjeta: primer cobro, renovaciones y reintentos.
do $$ declare r public.billing_payments; s public.subscriptions; u uuid := '96000000-0000-4000-8000-000000000013'; i int; begin
  perform public.billing_set_source(u, 3891, 'CARD', 'Visa •••• 4242');
  r := public.billing_new_payment(u, 'pro', 'month', 1, 'first', 'KD-F-T2-AAAA');
  perform public.billing_settle('KD-F-T2-AAAA', 'APPROVED', '200-1', 990000, 'CARD');
  select * into s from public.subscriptions where user_id = u;
  if not s.auto_renew or abs(extract(epoch from (s.current_period_end - interval '1 day' - s.next_charge_at))) > 1 then raise exception 'primer cobro: %', s; end if;
  if exists (select 1 from public.billing_due() where user_id = u) then raise exception 'cobra antes de tiempo'; end if;
  update public.subscriptions set next_charge_at = now() - interval '1 minute', current_period_end = now() + interval '23 hours' where user_id = u;
  if not exists (select 1 from public.billing_due() where user_id = u and payment_source_id = 3891) then raise exception 'no aparece para cobrar'; end if;
  r := public.billing_new_payment(u, 'pro', 'month', 1, 'renewal', 'KD-R-T2-0001');
  if exists (select 1 from public.billing_due() where user_id = u) then raise exception 'cobraría dos veces'; end if;
  perform public.billing_settle('KD-R-T2-0001', 'APPROVED', '200-2', 990000, 'CARD');
  select * into s from public.subscriptions where user_id = u;
  if s.current_period_end < now() + interval '29 days' or s.retries <> 0 then raise exception 'renovación: %', s; end if;
  -- Tres rechazos: se reintenta 1, 2 y 4 días después; el cuarto apaga la renovación.
  update public.subscriptions set current_period_end = now() - interval '2 days' where user_id = u;
  for i in 1..4 loop
    r := public.billing_new_payment(u, 'pro', 'month', 1, 'renewal', 'KD-R-T2-F00' || i);
    perform public.billing_settle(r.reference, 'DECLINED', '300-' || i, null, 'CARD', 'Fondos insuficientes');
    select * into s from public.subscriptions where user_id = u;
    if i <= 3 and (s.status <> 'past_due' or s.retries <> i or not s.auto_renew
       or abs(extract(epoch from (s.next_charge_at - now())) - (array[1, 2, 4])[i] * 86400) > 5) then raise exception 'reintento %: %', i, s; end if;
    if i <= 3 and public.plan_of(u) <> 'pro' then raise exception 'perdió el plan mientras se reintenta (%)', i; end if;
  end loop;
  if s.auto_renew or s.next_charge_at is not null or s.status <> 'active' then raise exception 'después de 3 reintentos: %', s; end if;
  if public.plan_of(u) <> 'free' then raise exception 'sigue con Pro después de los reintentos'; end if;
  if (select count(*) from public.notification_queue where user_id = u and kind = 'billing' and title like 'No pudimos renovar%') <> 3 then raise exception 'avisos de reintento'; end if;
  raise notice 'ok 2 renovación: cobra un día antes, una sola vez, reintenta 1, 2 y 4 días conservando el plan y luego se apaga';
end $$;

-- Equipo: puestos por correo, puestos extra a mitad de periodo.
do $$ declare r public.billing_payments; u uuid := '96000000-0000-4000-8000-000000000012'; left_ int; begin
  r := public.billing_new_payment(u, 'team', 'month', 1, 'checkout', 'KD-C-T3-AAAA');
  if r.seats <> 2 or r.amount_in_cents <> 2980000 then raise exception 'equipo mínimo 2: %', r; end if;
  perform public.billing_settle('KD-C-T3-AAAA', 'APPROVED', '400-1', 2980000);
  r := public.billing_new_payment(u, 'team', 'month', 1, 'seats', 'KD-S-T3-AAAA');
  if r.amount_in_cents < 200000 or r.amount_in_cents > 1490000 or r.seats <> 1 then raise exception 'puesto extra proporcional: %', r; end if;
  raise notice 'ok 3 Equipo cobra mínimo 2 puestos; un puesto extra cuesta la parte que falta del mes';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000012', false);
do $$ declare left_ int; begin
  begin perform public.billing_settle('KD-S-T3-AAAA', 'APPROVED', 'x', 0); raise exception 'un usuario aprobó su pago';
  exception when insufficient_privilege then null; end;
  begin perform public.billing_new_payment(auth.uid(), 'pro', 'month', 1, 'checkout', 'KD-C-HACK-0001'); raise exception 'un usuario creó un pago';
  exception when insufficient_privilege then null; end;
  begin perform public.team_seat_add('equipo@empresa.co'); raise exception 'se agregó a sí misma';
  exception when raise_exception then null; end;
  left_ := public.team_seat_add('Uno@Empresa.co');
  if left_ <> 0 then raise exception 'quedan %', left_; end if;
  begin perform public.team_seat_add('dos@empresa.co'); raise exception 'pasó los puestos';
  exception when raise_exception then if sqlerrm not like 'Ya usaste los 2 puestos%' then raise; end if; end;
  raise notice 'ok 4 nadie aprueba ni crea pagos desde la app; los puestos tienen tope';
end $$;
reset role;
select public.billing_settle('KD-S-T3-AAAA', 'APPROVED', '400-2', (select amount_in_cents from public.billing_payments where reference = 'KD-S-T3-AAAA'));
set role authenticated;
do $$ declare p jsonb; begin
  perform public.team_seat_add('dos@empresa.co');
  p := public.my_plan();
  if (p ->> 'seats')::int <> 3 or (p ->> 'seats_used')::int <> 3 then raise exception 'puestos: %', p; end if;
  perform public.team_seat_remove('UNO@empresa.co');
  if (public.my_plan() ->> 'seats_used')::int <> 2 then raise exception 'no quitó el puesto'; end if;
  raise notice 'ok 5 al pagar el puesto extra se puede agregar otra persona; quitar libera el puesto';
end $$;

-- Cancelar y reanudar, y avisos de fin.
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000011', false);
do $$ declare p jsonb; begin
  begin perform public.billing_resume(); raise exception 'renovó sin medio de pago';
  exception when raise_exception then if sqlerrm not like 'Agrega una tarjeta%' then raise; end if; end;
  p := public.billing_cancel();
  if (p ->> 'auto_renew')::boolean or p ->> 'plan' <> 'pro' then raise exception 'cancelar: %', p; end if;
  raise notice 'ok 6 cancelar conserva el plan hasta el final; reanudar pide medio de pago';
end $$;
reset role;
insert into public.subscriptions (user_id, plan, status, current_period_end, trial_used)
values ('96000000-0000-4000-8000-000000000001', 'pro', 'trial', now() + interval '20 hours', true)
on conflict (user_id) do update set plan = 'pro', status = 'trial', current_period_end = now() + interval '20 hours';
do $$ declare n int; begin
  n := public.billing_reminders();
  perform public.billing_reminders();
  if (select count(*) from public.notification_queue where user_id = '96000000-0000-4000-8000-000000000001' and title like 'Tu prueba de Pro termina%') <> 1 then raise exception 'aviso de prueba'; end if;
  raise notice 'ok 7 aviso de fin de prueba, una sola vez';
end $$;
