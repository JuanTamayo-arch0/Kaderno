-- Usuarios: A dueña, B editor, C viewer, D no es integrante.
-- (El trigger de schema_v12 les crea el perfil al insertarlos.)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'ana@upb.edu.co'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'juan@upb.edu.co'),
  ('cccccccc-0000-4000-8000-000000000003', 'profe@upb.edu.co'),
  ('dddddddd-0000-4000-8000-000000000004', 'otro@upb.edu.co');

-- Al crear el proyecto, el trigger mete a la dueña como owner.
insert into public.projects (id, owner_id, name) values
  ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Proyecto final'),
  ('22222222-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'Otro proyecto');

insert into public.project_members (project_id, user_id, role) values
  ('11111111-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'editor'),
  ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003', 'viewer');

-- Tarea creada con la app de la Entrega B (solo due_date).
insert into public.project_tasks (id, project_id, title, status, due_date, position) values
  ('e0000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Marco teórico', 'doing', '2026-10-15', 1024),
  ('e0000000-0000-4000-8000-000000000099', '22222222-0000-4000-8000-000000000002', 'Tarea de otro proyecto', 'todo', null, 1024);
insert into public.project_task_steps (project_id, task_id, title, done, position) values
  ('11111111-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Buscar fuentes', true, 1),
  ('11111111-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Resumir', false, 2);
