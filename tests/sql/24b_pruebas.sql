-- Pruebas de supabase/schema_v24.sql, fase 2 (cronómetro y hoja semanal). Corren sobre la base k16, después de 24_pruebas.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
grant select on public.timesheet_weeks to authenticated;
select set_config('k.zenit', (select id::text from public.projects where name = 'Zenit' limit 1), false);
select set_config('k.ajeno', (select id::text from public.projects where name = 'Ajeno' limit 1), false);
insert into public.project_tasks (project_id, title) select current_setting('k.zenit')::uuid, 'Tablero de Grafana'
  where not exists (select 1 from public.project_tasks where project_id = current_setting('k.zenit')::uuid);
select set_config('k.tarea', (select id::text from public.project_tasks where project_id = current_setting('k.zenit')::uuid limit 1), false);
insert into public.project_tasks (project_id, title) select current_setting('k.ajeno')::uuid, 'Tarea ajena'
  where not exists (select 1 from public.project_tasks where project_id = current_setting('k.ajeno')::uuid);
select set_config('k.tarea_ajena', (select id::text from public.project_tasks where project_id = current_setting('k.ajeno')::uuid limit 1), false);
select set_config('k.lunes', (date_trunc('week', now() at time zone 'America/Bogota')::date - 14)::text, false);

set role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', false);
do $$ declare r public.focus_sessions; begin
  insert into public.focus_sessions (user_id, minutes, project_task_id, source, created_at) values (auth.uid(), 95, current_setting('k.tarea')::uuid, 'timer', now() - interval '5 days') returning * into r;
  if r.project_id <> current_setting('k.zenit')::uuid or r.created_at < now() - interval '1 minute' then raise exception 'cronómetro: %', r; end if;
  begin insert into public.focus_sessions (user_id, minutes, source) values (auth.uid(), 800, 'timer'); raise exception 'cronómetro de 13 horas';
  exception when raise_exception then if sqlerrm not like 'Un registro va%' then raise; end if; end;
  begin insert into public.focus_sessions (user_id, minutes, project_id, project_task_id, source) values (auth.uid(), 10, current_setting('k.zenit')::uuid, current_setting('k.tarea_ajena')::uuid, 'timer'); raise exception 'tarea de otro proyecto';
  exception when raise_exception then if sqlerrm not like 'Esa tarea no es%' and sqlerrm not like 'No eres parte%' then raise; end if; end;
  raise notice 'ok 1 cronómetro: se fecha al parar, máximo 12 horas, toma el proyecto de su tarea y no mezcla proyectos';
end $$;

-- La semana antepasada de Ana en Zenit (la pasada puede tener el cronómetro de arriba si hoy es lunes temprano): 2 registros a mano.
do $$ declare w date := current_setting('k.lunes')::date; t public.timesheet_weeks; begin
  insert into public.focus_sessions (user_id, minutes, project_id, source, created_at) values
    (auth.uid(), 120, current_setting('k.zenit')::uuid, 'manual', (w + 1)::timestamp + interval '15 hours'),
    (auth.uid(), 60, current_setting('k.zenit')::uuid, 'manual', (w + 3)::timestamp + interval '15 hours');
  t := public.timesheet_submit(current_setting('k.zenit')::uuid, w, 'Semana del informe');
  if t.status <> 'enviada' or t.minutes <> 180 then raise exception 'enviar: %', t; end if;
  begin perform public.timesheet_decide(current_setting('k.zenit')::uuid, auth.uid(), w, 'aprobada'); raise exception 'Ana se aprobó a sí misma';
  exception when raise_exception then if sqlerrm not like 'Tus propias horas%' then raise; end if; end;
  begin perform public.timesheet_submit(current_setting('k.zenit')::uuid, w + 1); raise exception 'semana que no empieza el lunes';
  exception when raise_exception then if sqlerrm not like 'La semana empieza%' then raise; end if; end;
  raise notice 'ok 2 se manda la semana con sus horas; quien la manda no se la aprueba';
end $$;

reset role;
do $$ begin
  if not exists (select 1 from public.notification_queue where user_id = '91000000-0000-4000-8000-000000000001' and kind = 'timesheet') then raise exception 'el dueño no recibió aviso'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
do $$ declare w date := current_setting('k.lunes')::date; t public.timesheet_weeks; begin
  if (select count(*) from public.timesheet_weeks where project_id = current_setting('k.zenit')::uuid) <> 1 then raise exception 'el dueño no ve la semana'; end if;
  t := public.timesheet_decide(current_setting('k.zenit')::uuid, '92000000-0000-4000-8000-000000000002', w, 'aprobada');
  if t.status <> 'aprobada' or t.decided_by <> auth.uid() then raise exception 'aprobar: %', t; end if;
  raise notice 'ok 3 el dueño ve y aprueba la semana';
end $$;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', false);
do $$ declare w date := current_setting('k.lunes')::date; begin
  begin insert into public.focus_sessions (user_id, minutes, project_id, source, created_at) values (auth.uid(), 30, current_setting('k.zenit')::uuid, 'manual', (w + 2)::timestamp + interval '15 hours'); raise exception 'anotó en semana aprobada';
  exception when raise_exception then if sqlerrm not like 'Esa semana ya fue aprobada%' then raise; end if; end;
  begin delete from public.focus_sessions where user_id = auth.uid() and source = 'manual' and minutes = 120; raise exception 'borró en semana aprobada';
  exception when raise_exception then if sqlerrm not like 'Esa semana ya fue aprobada%' then raise; end if; end;
  insert into public.focus_sessions (user_id, minutes, project_id, source, created_at) values (auth.uid(), 30, null, 'manual', (w + 2)::timestamp + interval '15 hours');
  begin perform public.timesheet_submit(current_setting('k.zenit')::uuid, w); raise exception 'reenvió una aprobada';
  exception when raise_exception then if sqlerrm not like 'Esa semana ya está aprobada%' then raise; end if; end;
  raise notice 'ok 4 semana aprobada: no se anota ni se borra en ese proyecto (sí en otros)';
end $$;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
select public.timesheet_decide(current_setting('k.zenit')::uuid, '92000000-0000-4000-8000-000000000002', current_setting('k.lunes')::date, 'devuelta', 'Falta el martes');
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', false);
do $$ declare w date := current_setting('k.lunes')::date; begin
  delete from public.focus_sessions where user_id = auth.uid() and source = 'manual' and minutes = 60 and project_id = current_setting('k.zenit')::uuid;
  raise notice 'ok 5 devuelta: se puede corregir otra vez';
end $$;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', false);
do $$ begin
  begin perform public.timesheet_submit('97a00000-0000-4000-8000-000000000001', current_setting('k.lunes')::date); raise exception 'Gratis mandó horas';
  exception when raise_exception then if sqlerrm not like '%plan Equipo%' then raise; end if; end;
  raise notice 'ok 6 mandar horas para aprobar es del plan Equipo';
end $$;
reset role;
