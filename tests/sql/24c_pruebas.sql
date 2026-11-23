-- Pruebas de supabase/schema_v24.sql, fase 3 (proyectos de trabajo). Corren sobre la base k16, después de 24b_pruebas.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
grant select, insert, update, delete on public.project_rules, public.project_updates to authenticated;
select set_config('k.zenit', (select id::text from public.projects where name = 'Zenit' limit 1), false);
select set_config('k.ajena', (select id::text from public.project_tasks where project_id = (select id from public.projects where name = 'Ajeno' limit 1) limit 1), false);
delete from public.notification_queue where kind in ('project_rule');

set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
do $$ declare z uuid := current_setting('k.zenit')::uuid; a uuid; b uuid; t public.project_tasks; begin
  insert into public.project_tasks (project_id, title, status, labels, priority) values (z, 'Diseño', 'todo', array[' Cliente ', 'cliente', 'URGENTE', ''], 'alta') returning * into t;
  if t.labels <> array['cliente', 'urgente'] or t.priority <> 'alta' then raise exception 'etiquetas: %', t.labels; end if;
  a := t.id;
  begin insert into public.project_tasks (project_id, title, priority) values (z, 'x', 'máxima'); raise exception 'prioridad rara';
  exception when check_violation then null; end;
  insert into public.project_tasks (project_id, title, status, blocked_by) values (z, 'Desarrollo', 'todo', array[a, current_setting('k.ajena')::uuid]) returning * into t;
  b := t.id;
  if t.blocked_by <> array[a] then raise exception 'bloqueos: %', t.blocked_by; end if;
  update public.project_tasks set blocked_by = array[b, a] where id = a returning * into t;
  if t.blocked_by <> '{}' then raise exception 'se bloqueó a sí misma o en círculo: %', t.blocked_by; end if;
  perform set_config('k.a', a::text, false); perform set_config('k.b', b::text, false);
  raise notice 'ok 1 etiquetas limpias, prioridad válida, bloqueos solo del mismo proyecto y sin círculos';
end $$;

-- Al terminar "Diseño", Ana (asignada a "Desarrollo") recibe el aviso de que ya puede seguir.
do $$ begin
  update public.project_tasks set assignee_id = '92000000-0000-4000-8000-000000000002' where id = current_setting('k.b')::uuid;
  update public.project_tasks set status = 'done' where id = current_setting('k.a')::uuid;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.notification_queue where user_id = '92000000-0000-4000-8000-000000000002' and kind = 'project_rule' and title like 'Ya puedes seguir con "Desarrollo"%') then raise exception 'sin aviso de desbloqueo'; end if;
  raise notice 'ok 2 al terminar lo que bloqueaba, avisa a quien tiene la tarea';
end $$;

-- Repetición semanal.
set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
do $$ declare z uuid := current_setting('k.zenit')::uuid; t public.project_tasks; n public.project_tasks; begin
  insert into public.project_tasks (project_id, title, status, due_date, repeat_rule, priority, labels)
  values (z, 'Informe del lunes', 'doing', (now() at time zone 'America/Bogota')::date, '{"freq":"week","interval":1}', 'normal', array['informe']) returning * into t;
  update public.project_tasks set status = 'done' where id = t.id;
  select * into n from public.project_tasks where repeat_parent_id = t.id;
  if n.id is null or n.due_date <> t.due_date + 7 or n.status <> 'todo' or n.done or n.labels <> array['informe'] then raise exception 'repetición: %', n; end if;
  update public.project_tasks set status = 'doing' where id = t.id;
  update public.project_tasks set status = 'done' where id = t.id;
  if (select count(*) from public.project_tasks where repeat_parent_id = t.id) <> 1 then raise exception 'repitió dos veces'; end if;
  raise notice 'ok 3 al terminar una tarea que se repite nace la siguiente, una sola vez, en la primera columna';
end $$;

-- Reglas.
do $$ declare z uuid := current_setting('k.zenit')::uuid; t public.project_tasks; begin
  insert into public.project_rules (project_id, trigger, column_key, action, user_id) values (z, 'moved', 'review', 'assign', '91000000-0000-4000-8000-000000000001');
  insert into public.project_rules (project_id, trigger, action, user_id) values (z, 'created', 'notify', '92000000-0000-4000-8000-000000000002');
  insert into public.project_rules (project_id, trigger, action) values (z, 'overdue', 'notify');
  begin insert into public.project_rules (project_id, trigger, action, user_id) values (z, 'created', 'assign', '97000000-0000-4000-8000-000000000001'); raise exception 'asignó a alguien de afuera';
  exception when raise_exception then if sqlerrm not like 'Esa persona no está%' then raise; end if; end;
  insert into public.project_tasks (project_id, title, status, assignee_id) values (z, 'Pruebas', 'doing', '92000000-0000-4000-8000-000000000002') returning * into t;
  update public.project_tasks set status = 'review' where id = t.id returning * into t;
  if t.assignee_id <> '91000000-0000-4000-8000-000000000001' then raise exception 'la regla no asignó: %', t.assignee_id; end if;
  insert into public.project_tasks (project_id, title, status, due_date) values (z, 'Vencida', 'todo', (now() at time zone 'America/Bogota')::date - 1);
  raise notice 'ok 4 reglas: al pasar a Revisión se asigna; no se asigna a gente de afuera';
end $$;
reset role;
do $$ declare n int; begin
  if not exists (select 1 from public.notification_queue where user_id = '92000000-0000-4000-8000-000000000002' and kind = 'project_rule' and title like 'Tarea nueva en Zenit%') then raise exception 'sin aviso de tarea nueva'; end if;
  n := public.project_rules_tick(); perform public.project_rules_tick();
  if (select count(*) from public.notification_queue where user_id = '91000000-0000-4000-8000-000000000001' and title = 'Se venció "Vencida"') <> 1 then raise exception 'aviso de vencida'; end if;
  raise notice 'ok 5 avisos de tarea nueva y de vencida (una sola vez)';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', false);
do $$ begin
  insert into public.project_rules (project_id, trigger, action) values ('97a00000-0000-4000-8000-000000000001', 'overdue', 'notify'), ('97a00000-0000-4000-8000-000000000001', 'created', 'notify');
  begin insert into public.project_rules (project_id, trigger, action) values ('97a00000-0000-4000-8000-000000000001', 'created', 'notify'); raise exception 'Gratis hizo 3 reglas';
  exception when raise_exception then if sqlerrm not like 'Con el plan Gratis cada proyecto tiene hasta 2%' then raise; end if; end;
  begin insert into public.project_rules (project_id, trigger, action) values (current_setting('k.zenit')::uuid, 'created', 'notify'); raise exception 'regla en proyecto ajeno';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 6 Gratis: 2 reglas por proyecto; nadie pone reglas en proyectos ajenos';
end $$;

-- Estado del proyecto.
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', false);
insert into public.project_updates (project_id, health, body) values (current_setting('k.zenit')::uuid, 'en_riesgo', 'Falta el tablero de alertas.');
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', false);
do $$ begin
  if (select count(*) from public.project_updates) <> 1 then raise exception 'Luis no ve el estado'; end if;
  begin insert into public.project_updates (project_id, health, body) values (current_setting('k.zenit')::uuid, 'en_curso', 'yo'); raise exception 'quien solo ve escribió el estado';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 7 estado del proyecto: lo escribe quien edita y lo ve todo el equipo';
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.notification_queue where user_id = '93000000-0000-4000-8000-000000000003' and title = 'Zenit: en riesgo') then raise exception 'sin aviso de estado'; end if;
end $$;
