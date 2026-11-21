-- Pruebas de supabase/schema_v24.sql, fase 1 (cobrar). Corren sobre la base k16, después de las de schema_v23.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values
  ('97000000-0000-4000-8000-000000000001', 'free@lance.co'),
  ('97000000-0000-4000-8000-000000000002', 'otra@lance.co')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('97000000-0000-4000-8000-000000000001', 'Freelance'), ('97000000-0000-4000-8000-000000000002', 'Otra')
on conflict do nothing;
grant select, insert, update, delete on public.billing_profile, public.clients to authenticated;
grant select on public.notification_queue to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', false);
do $$ declare c uuid; r public.invoices; begin
  insert into public.clients (user_id, name, tax_id, rate) values (auth.uid(), 'Acme S.A.S.', '900123456-7', 40000) returning id into c;
  perform set_config('k.cliente', c::text, false);
  begin perform public.invoice_create(jsonb_build_object('client_id', c, 'items', jsonb_build_array(jsonb_build_object('concept', 'x', 'amount', 1000))));
    raise exception 'cobró sin datos';
  exception when raise_exception then if sqlerrm not like 'Primero llena tus datos%' then raise; end if; end;
  insert into public.billing_profile (user_id, full_name, doc_type, doc_number, city, bank_name, account_type, account_number, prefix, next_number)
  values (auth.uid(), 'Juan Tamayo', 'CC', '1000000000', 'Medellín', 'Bancolombia', 'ahorros', '123-456789-00', 'CC', 7);
  r := public.invoice_create(jsonb_build_object('client_id', c, 'period_from', '2026-11-01', 'period_to', '2026-11-30', 'total', 1,
    'items', jsonb_build_array(jsonb_build_object('concept', 'Desarrollo web', 'hours', 2.5, 'rate', 40000, 'amount', 999),
                               jsonb_build_object('concept', 'Hosting', 'amount', 50000))));
  if r.number <> 7 or r.prefix <> 'CC' or r.total <> 150000 or (r.items -> 0 ->> 'amount')::bigint <> 100000 then raise exception 'cuenta: %', r; end if;
  if r.issuer ->> 'account_number' <> '123-456789-00' or r.client ->> 'tax_id' <> '900123456-7' then raise exception 'copia de datos: %', r; end if;
  if (select next_number from public.billing_profile) <> 8 then raise exception 'no subió el consecutivo'; end if;
  begin insert into public.invoices (user_id, prefix, number, issued_on, issuer, client, items, total) values (auth.uid(), 'CC', 99, now(), '{}', '{}', '[{}]', 1); raise exception 'insertó una cuenta a mano';
  exception when insufficient_privilege then null; end;
  begin perform public.invoice_create(jsonb_build_object('client_id', c, 'items', jsonb_build_array(jsonb_build_object('concept', 'Nada', 'amount', 0)))); raise exception 'total cero';
  exception when raise_exception then if sqlerrm not like 'El total%' then raise; end if; end;
  raise notice 'ok 1 cuenta de cobro: pide tus datos, calcula el total en el servidor, guarda copia de los datos y sube el consecutivo';
end $$;

do $$ declare c uuid := current_setting('k.cliente')::uuid; r public.invoices; first uuid; begin
  r := public.invoice_create(jsonb_build_object('client_id', c, 'items', jsonb_build_array(jsonb_build_object('concept', 'Soporte', 'amount', 80000))));
  if r.number <> 8 then raise exception 'segunda: %', r.number; end if;
  begin perform public.invoice_create(jsonb_build_object('client_id', c, 'items', jsonb_build_array(jsonb_build_object('concept', 'Otra', 'amount', 1000)))); raise exception 'Gratis hizo 3';
  exception when raise_exception then if sqlerrm not like 'Con el plan Gratis puedes hacer 2%' then raise; end if; end;
  select id into first from public.invoices where number = 7;
  r := public.invoice_set_status(first, 'pagada');
  if r.paid_on is null then raise exception 'pagada sin fecha'; end if;
  r := public.invoice_set_status(first, 'anulada');
  begin perform public.invoice_set_status(first, 'pagada'); raise exception 'revivió una anulada';
  exception when raise_exception then if sqlerrm not like 'No se encontró%' then raise; end if; end;
  r := public.invoice_create(jsonb_build_object('client_id', c, 'items', jsonb_build_array(jsonb_build_object('concept', 'Otra', 'amount', 1000))));
  if r.number <> 9 then raise exception 'después de anular: %', r.number; end if;
  raise notice 'ok 2 Gratis: 2 al mes (las anuladas no cuentan); pagada con fecha; anulada no vuelve; el número no se reusa';
end $$;

select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', false);
do $$ begin
  if exists (select 1 from public.invoices) or exists (select 1 from public.clients) or exists (select 1 from public.billing_profile) then raise exception 've datos ajenos'; end if;
  insert into public.billing_profile (user_id, full_name, doc_number) values (auth.uid(), 'Otra', '1');
  begin perform public.invoice_create(jsonb_build_object('client_id', current_setting('k.cliente'), 'items', jsonb_build_array(jsonb_build_object('concept', 'x', 'amount', 1000)))); raise exception 'usó un cliente ajeno';
  exception when raise_exception then if sqlerrm not like 'Escoge un cliente%' then raise; end if; end;
  raise notice 'ok 3 nadie ve ni usa los datos, clientes o cuentas de otro';
end $$;

-- Presupuesto: Juan (dueño de Zenit, plan Equipo) y Ana (editora) anotan horas.
reset role;
select set_config('k.zenit', (select id::text from public.projects where name = 'Zenit' limit 1), false);
insert into public.projects (id, owner_id, name) values
  ('97a00000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001', 'Uno'),
  ('97a00000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001', 'Dos')
on conflict do nothing;
insert into public.project_members (project_id, user_id, role) values
  ('97a00000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001', 'owner'),
  ('97a00000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001', 'owner')
on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', false);
do $$ begin
  perform public.project_set_budget('97a00000-0000-4000-8000-000000000001', 600);
  begin perform public.project_set_budget('97a00000-0000-4000-8000-000000000002', 600); raise exception 'Gratis puso dos presupuestos';
  exception when raise_exception then if sqlerrm not like 'Con el plan Gratis puedes poner presupuesto a 1%' then raise; end if; end;
  begin perform public.project_set_budget(current_setting('k.zenit')::uuid, 600); raise exception 'presupuesto en proyecto ajeno';
  exception when raise_exception then if sqlerrm not like 'Solo quien edita%' then raise; end if; end;
  raise notice 'ok 4 presupuesto: solo quien edita; con Gratis en 1 proyecto';
end $$;
do $$ declare p uuid := '97a00000-0000-4000-8000-000000000001'; b jsonb; begin
  insert into public.focus_sessions (user_id, minutes, project_id, source, created_at) values (auth.uid(), 400, p, 'manual', now() - interval '1 day');
  if exists (select 1 from public.notification_queue where kind = 'budget') then raise exception 'avisó antes del 80'; end if;
  insert into public.focus_sessions (user_id, minutes, project_id, source, created_at) values (auth.uid(), 100, p, 'manual', now() - interval '1 day');
  if (select count(*) from public.notification_queue where kind = 'budget' and title like '%80 %%') <> 1 then raise exception 'aviso del 80'; end if;
  insert into public.focus_sessions (user_id, minutes, project_id, source, created_at) values (auth.uid(), 30, p, 'manual', now() - interval '1 day');
  insert into public.focus_sessions (user_id, minutes, project_id, source, created_at) values (auth.uid(), 200, p, 'manual', now() - interval '1 day');
  insert into public.focus_sessions (user_id, minutes, project_id, source, created_at) values (auth.uid(), 60, p, 'manual', now() - interval '1 day');
  if (select count(*) from public.notification_queue where kind = 'budget') <> 2 then raise exception 'avisos: %', (select count(*) from public.notification_queue where kind = 'budget'); end if;
  b := public.project_budget(p);
  if (b ->> 'used_minutes')::int <> 790 or (b ->> 'budget_minutes')::int <> 600 then raise exception 'estado: %', b; end if;
  raise notice 'ok 5 avisa una vez al 80 %% y una al 100 %%; el estado suma las horas de todos';
end $$;
reset role;
