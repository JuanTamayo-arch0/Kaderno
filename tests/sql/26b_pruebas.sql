-- Pruebas de supabase/schema_v26.sql, fase 2 (la rana y la lista para mañana). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values ('96000000-0000-4000-8000-000000000006', 'rana@prueba.co'), ('97000000-0000-4000-8000-000000000007', 'otra@prueba.co') on conflict do nothing;
delete from public.assignments where user_id = '96000000-0000-4000-8000-000000000006';
insert into public.assignments (id, user_id, title, due_date, status) values
  ('96200000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000006', 'Informe', current_date, 'pending'),
  ('96200000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000006', 'Taller', current_date + 1, 'pending'),
  ('96200000-0000-4000-8000-000000000003', '96000000-0000-4000-8000-000000000006', 'Leer', current_date + 3, 'pending'),
  ('96200000-0000-4000-8000-000000000004', '96000000-0000-4000-8000-000000000006', 'Hecha', current_date, 'done');
set role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000006', false);
do $$ declare d date := current_date + 1; begin
  perform public.day_set_frog('96200000-0000-4000-8000-000000000001', d);
  perform public.day_set_frog('96200000-0000-4000-8000-000000000002', d);
  if (select count(*) from public.assignments where frog and plan_day = d) <> 1 then raise exception 'quedaron dos ranas'; end if;
  if not (select frog from public.assignments where id = '96200000-0000-4000-8000-000000000002') then raise exception 'no cambió la rana'; end if;
  begin perform public.day_set_frog('96200000-0000-4000-8000-000000000004', d); raise exception 'la rana fue una tarea hecha';
  exception when raise_exception then if sqlerrm not like 'No encontré esa tarea pendiente%' then raise; end if; end;
  perform public.day_set_frog(null, d);
  if exists (select 1 from public.assignments where frog) then raise exception 'no se quitó la rana'; end if;
  raise notice 'ok 1 la rana: una por día, se cambia, se quita y nunca una tarea hecha';
end $$;
do $$ declare d date := current_date + 1; begin
  perform public.day_plan_list(array['96200000-0000-4000-8000-000000000003', '96200000-0000-4000-8000-000000000001']::uuid[], d);
  if (select plan_order from public.assignments where id = '96200000-0000-4000-8000-000000000003') <> 1
     or (select plan_order from public.assignments where id = '96200000-0000-4000-8000-000000000001') <> 2 then raise exception 'orden mal'; end if;
  if not (select frog from public.assignments where id = '96200000-0000-4000-8000-000000000003') then raise exception 'la primera no quedó como rana'; end if;
  -- Otra lista para el mismo día reemplaza el orden anterior.
  perform public.day_plan_list(array['96200000-0000-4000-8000-000000000001']::uuid[], d);
  if (select plan_order from public.assignments where id = '96200000-0000-4000-8000-000000000003') is not null then raise exception 'quedó el orden viejo'; end if;
  if not (select frog from public.assignments where id = '96200000-0000-4000-8000-000000000001') then raise exception 'rana de la nueva lista'; end if;
  begin perform public.day_plan_list(array['96200000-0000-4000-8000-000000000001', '96200000-0000-4000-8000-000000000001']::uuid[], d); raise exception 'aceptó repetidas';
  exception when raise_exception then if sqlerrm not like 'Hay tareas repetidas%' then raise; end if; end;
  begin perform public.day_plan_list(array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()], d); raise exception 'aceptó 7';
  exception when raise_exception then if sqlerrm not like 'Máximo 6%' then raise; end if; end;
  raise notice 'ok 2 la lista para mañana: en orden, la primera es la rana, se reemplaza y máximo 6';
end $$;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000007', false);
do $$ begin
  begin perform public.day_plan_list(array['96200000-0000-4000-8000-000000000002']::uuid[], current_date + 1); raise exception 'planeó una tarea ajena';
  exception when raise_exception then if sqlerrm not like 'Alguna tarea no existe%' then raise; end if; end;
  begin perform public.day_set_frog('96200000-0000-4000-8000-000000000002', current_date + 1); raise exception 'rana ajena';
  exception when raise_exception then if sqlerrm not like 'No encontré%' then raise; end if; end;
  raise notice 'ok 3 nadie más planea ni pone la rana en tareas ajenas';
end $$;
reset role;
