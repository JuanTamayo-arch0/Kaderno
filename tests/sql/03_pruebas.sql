\set ON_ERROR_STOP on
\set QUIET on
-- Pruebas de schema_v13 con cuatro usuarios: A dueña, B editor, C viewer, D externo.
-- Cada bloque falla con un mensaje si algo no da lo esperado.

create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'SE ESPERABA ERROR %, pero no falló: %', p_code, p_sql;
exception when others then
  if sqlerrm not like '%' || p_code || '%' then
    raise exception 'Error distinto al esperado (%): %', p_code, sqlerrm;
  end if;
end $$;

-- 0. La migración copió due_date a due_at a las 23:59 de Bogotá.
do $$ begin
  assert (select due_at from project_tasks where id = 'e0000000-0000-4000-8000-000000000001')
         = '2026-10-15 23:59:00-05'::timestamptz, 'backfill de due_at';
end $$;
\echo '✓ 0. due_date existente copiado a due_at (23:59 Bogotá)'

-- La app vieja cambia due_date: due_at se sincroniza. Y al revés.
update project_tasks set due_date = '2026-10-16' where id = 'e0000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select due_at from project_tasks where id = 'e0000000-0000-4000-8000-000000000001')
         = '2026-10-16 23:59:00-05'::timestamptz, 'sync due_date→due_at';
end $$;
update project_tasks set due_at = '2026-10-15 23:59:00-05' where id = 'e0000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select due_date from project_tasks where id = 'e0000000-0000-4000-8000-000000000001') = '2026-10-15', 'sync due_at→due_date';
end $$;
\echo '✓ 0b. due_date y due_at se mantienen sincronizadas'

-- ===================================================================
-- 1. Importar como editor (B)
-- ===================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);

create temp table r1 as
select import_project_tasks('11111111-0000-4000-8000-000000000001', '[
  {"title":"Diseño del circuito","status":"todo","assignee_id":"aaaaaaaa-0000-4000-8000-000000000001",
   "start_at":"2026-10-12T05:00:00Z","due_at":"2026-10-18T19:00:00Z",
   "checklist":[{"title":"Simular","done":true},{"title":"Montar protoboard","done":false}]},
  {"title":"Informe","status":"doing","assignee_id":"dddddddd-0000-4000-8000-000000000004","due_at":"2026-10-25T23:00:00Z"},
  {"title":"MARCO TEORICO","due_at":"2026-10-16T04:59:00Z"}
]'::jsonb, 'omitir') as res;

do $$ declare r jsonb := (select res from r1); begin
  assert (r->>'created')::int = 2, 'creadas: ' || r::text;
  assert (r->>'skipped')::int = 1, 'duplicado omitido: ' || r::text;
  assert (r->>'unassigned')::int = 1, 'responsable externo sin asignar: ' || r::text;
  assert (r->>'steps')::int = 2, 'ítems: ' || r::text;
  assert (select assignee_id from project_tasks where title = 'Informe') is null, 'Informe sin asignar';
  assert (select due_date from project_tasks where title = 'Diseño del circuito') = '2026-10-18', 'due_date sincronizada en tareas nuevas';
  assert (select count(*) from project_task_steps s join project_tasks t on t.id = s.task_id
           where t.title = 'Diseño del circuito' and s.done) = 1, 'checklist con estado';
  assert (select position from project_tasks where title = 'Diseño del circuito') > 1024, 'posición al final';
end $$;
\echo '✓ 1. Importar: 2 creadas, 1 duplicada omitida, responsable externo queda sin asignar, checklist con estado'

-- ===================================================================
-- 2. Permisos
-- ===================================================================
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000003', false);
select pg_temp.expect_error($q$select import_project_tasks('11111111-0000-4000-8000-000000000001', '[{"title":"x"}]', 'crear')$q$, 'KADERNO_FORBIDDEN');
select pg_temp.expect_error($q$select bulk_update_project_tasks('11111111-0000-4000-8000-000000000001', array['e0000000-0000-4000-8000-000000000001']::uuid[], '{"delete":true}')$q$, 'KADERNO_FORBIDDEN');
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-000000000004', false);
select pg_temp.expect_error($q$select apply_project_file('11111111-0000-4000-8000-000000000001', '[{"title":"x"}]')$q$, 'KADERNO_FORBIDDEN');
select pg_temp.expect_error($q$select undo_project_batch((select res->>'batch_id' from r1)::uuid)$q$, 'KADERNO');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
select pg_temp.expect_error($q$select _kaderno_insert_task('11111111-0000-4000-8000-000000000001', '{"title":"atajo"}', 1, null)$q$, 'permission denied');
select pg_temp.expect_error($q$insert into project_batches (project_id, user_id, kind) values ('11111111-0000-4000-8000-000000000001', auth.uid(), 'import')$q$, 'permission denied');
reset role;
set role anon;
select pg_temp.expect_error($q$select import_project_tasks('11111111-0000-4000-8000-000000000001', '[]', 'crear')$q$, 'permission denied');
reset role;
\echo '✓ 2. Permisos: viewer y externo rechazados, funciones internas y tabla de lotes cerradas, anon sin acceso'

-- ===================================================================
-- 3. Deshacer la importación (la dueña A)
-- ===================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select undo_project_batch((select res->>'batch_id' from r1)::uuid);
do $$ begin
  assert (select count(*) from project_tasks where project_id = '11111111-0000-4000-8000-000000000001') = 1, 'solo queda la original';
  assert (select count(*) from project_task_steps) = 2, 'solo quedan los ítems originales';
end $$;
select pg_temp.expect_error($q$select undo_project_batch((select res->>'batch_id' from r1)::uuid)$q$, 'KADERNO_UNDO_DONE');
\echo '✓ 3. Deshacer importación: no queda nada; deshacer dos veces da error claro'

-- ===================================================================
-- 4. Correr fechas en masa
-- ===================================================================
create temp table r2 as
select import_project_tasks('11111111-0000-4000-8000-000000000001', '[
  {"title":"T1","start_at":"2026-10-12T13:00:00Z","due_at":"2026-10-14T23:00:00Z","checklist":[{"title":"a","done":false}]},
  {"title":"T2","due_at":"2026-10-20T23:00:00Z"},
  {"title":"T3"}
]'::jsonb, 'crear') as res;

create temp table r3 as
select bulk_update_project_tasks('11111111-0000-4000-8000-000000000001',
  array(select id from project_tasks where title in ('T1','T2','T3'))
    || 'e0000000-0000-4000-8000-000000000099'::uuid,   -- id de otro proyecto
  '{"shift_minutes":10080,"shift_target":"ambas"}'::jsonb) as res;

do $$ declare r jsonb := (select res from r3); begin
  assert (r->>'updated')::int = 3, 'actualizadas: ' || r::text;
  assert (r->>'ignored_ids')::int = 1, 'id ajeno ignorado: ' || r::text;
  assert (select start_at from project_tasks where title = 'T1') = '2026-10-19T13:00:00Z'::timestamptz, 'inicio +7 días';
  assert (select due_at from project_tasks where title = 'T1') = '2026-10-21T23:00:00Z'::timestamptz, 'entrega +7 días';
  assert (select due_at from project_tasks where title = 'T3') is null, 'sin fecha sigue sin fecha';
end $$;
reset role;
do $$ begin
  assert (select due_date from project_tasks where id = 'e0000000-0000-4000-8000-000000000099') is null
     and (select title from project_tasks where id = 'e0000000-0000-4000-8000-000000000099') = 'Tarea de otro proyecto', 'otro proyecto intacto';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);

-- Solo entrega, -30 días: T1 quedaría con inicio después de la entrega → todo se revierte.
select pg_temp.expect_error($q$select bulk_update_project_tasks('11111111-0000-4000-8000-000000000001',
  array(select id from project_tasks where title in ('T1','T2')), '{"shift_minutes":-43200,"shift_target":"entrega"}')$q$, 'KADERNO_BAD_DATES');
do $$ begin
  assert (select due_at from project_tasks where title = 'T2') = '2026-10-27T23:00:00Z'::timestamptz, 'nada cambió tras el error';
end $$;
select pg_temp.expect_error($q$select bulk_update_project_tasks('11111111-0000-4000-8000-000000000001',
  array(select id from project_tasks where title = 'T2'), '{"assignee_id":"dddddddd-0000-4000-8000-000000000004"}')$q$, 'KADERNO_NOT_MEMBER');
\echo '✓ 4. Correr fechas: inicio y entrega +7 días, id ajeno ignorado; si alguna queda inválida no se aplica nada'

-- Estado y responsable en masa, luego deshacer.
create temp table r4 as
select bulk_update_project_tasks('11111111-0000-4000-8000-000000000001',
  array(select id from project_tasks where title in ('T2','T3')),
  '{"status":"review","assignee_id":"bbbbbbbb-0000-4000-8000-000000000002"}'::jsonb) as res;
do $$ begin
  assert (select count(*) from project_tasks where status = 'review' and assignee_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 2, 'estado y responsable';
end $$;
select undo_project_batch((select res->>'batch_id' from r4)::uuid);
do $$ begin
  assert (select count(*) from project_tasks where status = 'review') = 0, 'deshacer estado';
  assert (select count(*) from project_tasks where assignee_id is not null and title in ('T2','T3')) = 0, 'deshacer responsable';
end $$;
\echo '✓ 4b. Estado y responsable en masa, y deshacer los devuelve'

-- ===================================================================
-- 5. Borrar en masa y deshacer (vuelve con su checklist)
-- ===================================================================
create temp table r5 as
select bulk_update_project_tasks('11111111-0000-4000-8000-000000000001',
  array(select id from project_tasks where title = 'T1'), '{"delete":true}'::jsonb) as res;
do $$ begin
  assert (select count(*) from project_tasks where title = 'T1') = 0, 'T1 borrada';
end $$;
select undo_project_batch((select res->>'batch_id' from r5)::uuid);
do $$ begin
  assert (select count(*) from project_tasks where title = 'T1') = 1, 'T1 vuelve';
  assert (select count(*) from project_task_steps s join project_tasks t on t.id = s.task_id where t.title = 'T1') = 1, 'con su checklist';
  assert (select due_at from project_tasks where title = 'T1') = '2026-10-21T23:00:00Z'::timestamptz, 'con sus fechas';
end $$;
\echo '✓ 5. Borrar en masa y deshacer: la tarea vuelve con fechas y checklist'

-- ===================================================================
-- 6. Solo se deshace el último lote
-- ===================================================================
create temp table r6a as select bulk_update_project_tasks('11111111-0000-4000-8000-000000000001',
  array(select id from project_tasks where title = 'T2'), '{"status":"doing"}'::jsonb) as res;
create temp table r6b as select bulk_update_project_tasks('11111111-0000-4000-8000-000000000001',
  array(select id from project_tasks where title = 'T3'), '{"status":"doing"}'::jsonb) as res;
select pg_temp.expect_error($q$select undo_project_batch((select res->>'batch_id' from r6a)::uuid)$q$, 'KADERNO_UNDO_NOT_LATEST');
select undo_project_batch((select res->>'batch_id' from r6b)::uuid);
select undo_project_batch((select res->>'batch_id' from r6a)::uuid);
\echo '✓ 6. Solo se puede deshacer el último lote; después el anterior queda habilitado'

-- ===================================================================
-- 7. Actualizar por archivo
-- ===================================================================
create temp table r7 as
select apply_project_file('11111111-0000-4000-8000-000000000001', (
  select jsonb_build_array(
    jsonb_build_object('id', (select id from project_tasks where title = 'Marco teórico'),
      'fields', '["title","status","checklist"]'::jsonb,
      'title', 'Marco teórico v2', 'status', 'done',
      'checklist', '[{"title":"buscar fuentes","done":null},{"title":"Resumir","done":true},{"title":"Citar","done":null}]'::jsonb),
    jsonb_build_object('id', (select id from project_tasks where title = 'T3'), 'delete', true),
    jsonb_build_object('title', 'Nueva desde archivo', 'status', 'todo', 'due_at', '2026-10-28T23:00:00Z'),
    jsonb_build_object('id', 'e0000000-0000-4000-8000-000000000099', 'fields', '["title"]'::jsonb, 'title', 'Hackeada')
  ))) as res;

do $$ declare r jsonb := (select res from r7); begin
  assert (r->>'updated')::int = 1 and (r->>'created')::int = 1 and (r->>'deleted')::int = 1 and (r->>'ignored_ids')::int = 1, r::text;
  assert (select status from project_tasks where title = 'Marco teórico v2') = 'done', 'estado';
  assert (select due_at from project_tasks where title = 'Marco teórico v2') = '2026-10-15 23:59:00-05'::timestamptz, 'la entrega no venía: no se tocó';
  assert (select string_agg(s.title || ':' || s.done, ',' order by s.position) from project_task_steps s
           join project_tasks t on t.id = s.task_id where t.title = 'Marco teórico v2') = 'buscar fuentes:true,Resumir:true,Citar:false',
         'checklist unido conservando lo hecho';
  assert (select count(*) from project_tasks where title = 'T2') = 1, 'T2 no estaba en el archivo y sigue';
end $$;
reset role;
do $$ begin
  assert (select title from project_tasks where id = 'e0000000-0000-4000-8000-000000000099') = 'Tarea de otro proyecto', 'tarea ajena intacta';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);

select undo_project_batch((select res->>'batch_id' from r7)::uuid);
do $$ begin
  assert (select count(*) from project_tasks where title = 'Marco teórico') = 1, 'título restaurado';
  assert (select status from project_tasks where title = 'Marco teórico') = 'doing', 'estado restaurado';
  assert (select string_agg(s.title || ':' || s.done, ',' order by s.position) from project_task_steps s
           join project_tasks t on t.id = s.task_id where t.title = 'Marco teórico') = 'Buscar fuentes:true,Resumir:false', 'checklist restaurado';
  assert (select count(*) from project_tasks where title = 'T3') = 1, 'T3 recreada';
  assert (select count(*) from project_tasks where title = 'Nueva desde archivo') = 0, 'la nueva se quitó';
end $$;
\echo '✓ 7. Actualizar por archivo: cambia solo lo que viene, une el checklist, crea, borra, ignora ids ajenos; deshacer lo revierte todo'

-- ===================================================================
-- 8. Duplicados con "actualizar"
-- ===================================================================
create temp table r8 as
select import_project_tasks('11111111-0000-4000-8000-000000000001', '[
  {"title":"t2","status":"review","due_at":"2026-10-27T23:00:00Z","checklist":[{"title":"Nuevo ítem","done":false}]}
]'::jsonb, 'actualizar') as res;
do $$ declare r jsonb := (select res from r8); begin
  assert (r->>'updated')::int = 1 and (r->>'created')::int = 0, r::text;
  assert (select status from project_tasks where title = 'T2') = 'review', 'duplicado actualizado';
end $$;
select undo_project_batch((select res->>'batch_id' from r8)::uuid);
do $$ begin
  assert (select status from project_tasks where title = 'T2') = 'todo', 'deshacer actualización de duplicado';
  assert (select count(*) from project_task_steps s join project_tasks t on t.id = s.task_id where t.title = 'T2') = 0, 'checklist vacío restaurado';
end $$;
\echo '✓ 8. Duplicados en modo actualizar, y deshacer'

-- ===================================================================
-- 9. Límite y carga inválida
-- ===================================================================
select pg_temp.expect_error($q$select import_project_tasks('11111111-0000-4000-8000-000000000001',
  (select jsonb_agg(jsonb_build_object('title', 'x' || g)) from generate_series(1, 501) g), 'crear')$q$, 'KADERNO_TOO_MANY');
select pg_temp.expect_error($q$select import_project_tasks('11111111-0000-4000-8000-000000000001', '[{"title":"  "}]', 'crear')$q$, 'KADERNO_NO_TITLE');
select pg_temp.expect_error($q$select import_project_tasks('11111111-0000-4000-8000-000000000001',
  '[{"title":"mal","start_at":"2026-10-20T00:00:00Z","due_at":"2026-10-10T00:00:00Z"}]', 'crear')$q$, 'KADERNO_BAD_DATES');
do $$ begin
  assert (select count(*) from project_tasks where title = 'mal') = 0, 'nada a medias';
end $$;
\echo '✓ 9. Más de 500, título vacío o fechas invertidas: se rechaza todo el lote, nada queda a medias'
reset role;
\echo ''
\echo 'TODAS LAS PRUEBAS SQL PASARON'
