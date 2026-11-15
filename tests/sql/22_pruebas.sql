-- Pruebas de supabase/schema_v22.sql, fase 2 (comentarios y menciones). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
grant select, insert, update, delete on public.projects, public.project_members, public.project_tasks, public.profiles to authenticated;  -- en Supabase ya viene así
insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'dueno@upb.edu.co'),
  ('92000000-0000-4000-8000-000000000002', 'ana@upb.edu.co'),
  ('93000000-0000-4000-8000-000000000003', 'luis@upb.edu.co'),
  ('94000000-0000-4000-8000-000000000004', 'fuera@upb.edu.co')
on conflict do nothing;
insert into public.profiles (id, display_name, email) values
  ('91000000-0000-4000-8000-000000000001', 'Juan', 'dueno@upb.edu.co'),
  ('92000000-0000-4000-8000-000000000002', 'Ana María', 'ana@upb.edu.co'),
  ('93000000-0000-4000-8000-000000000003', null, 'luis@upb.edu.co'),
  ('94000000-0000-4000-8000-000000000004', 'Fuera', 'fuera@upb.edu.co')
on conflict (id) do update set display_name = excluded.display_name;
do $$ declare p uuid; p2 uuid; t uuid; t2 uuid; begin
  insert into public.projects (owner_id, name) values ('91000000-0000-4000-8000-000000000001', 'Zenit') returning id into p;
  insert into public.projects (owner_id, name) values ('94000000-0000-4000-8000-000000000004', 'Ajeno') returning id into p2;
  insert into public.project_members (project_id, user_id, role) values
    (p, '91000000-0000-4000-8000-000000000001', 'owner'), (p, '92000000-0000-4000-8000-000000000002', 'editor'),
    (p, '93000000-0000-4000-8000-000000000003', 'viewer'), (p2, '94000000-0000-4000-8000-000000000004', 'owner')
  on conflict do nothing;
  insert into public.project_tasks (project_id, title, status, assignee_id) values (p, 'Montar Prometheus', 'todo', '92000000-0000-4000-8000-000000000002') returning id into t;
  insert into public.project_tasks (project_id, title, status) values (p2, 'Ajena', 'todo') returning id into t2;
  perform set_config('k.p', p::text, false); perform set_config('k.p2', p2::text, false);
  perform set_config('k.t', t::text, false); perform set_config('k.t2', t2::text, false);
end $$;

set role authenticated;
-- El lector (Luis) comenta y menciona a Ana, a sí mismo y a alguien de fuera.
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', false);
do $$ declare c uuid; m uuid[]; pid uuid; begin
  insert into public.task_comments (project_id, task_id, body, mentions)
  values (current_setting('k.p2')::uuid, current_setting('k.t')::uuid, '@Ana María ¿ya quedó el compose?',
          array['92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000004']::uuid[])
  returning id, mentions, project_id into c, m, pid;
  if pid <> current_setting('k.p')::uuid then raise exception 'el proyecto no salió de la tarea'; end if;
  if m <> array['92000000-0000-4000-8000-000000000002']::uuid[] then raise exception 'menciones mal filtradas: %', m; end if;
  perform set_config('k.c', c::text, false);
  begin insert into public.task_comments (task_id, body) values (current_setting('k.t2')::uuid, 'hola'); raise exception 'comentó en un proyecto ajeno';
  exception when insufficient_privilege then null; end;
  begin insert into public.task_comments (task_id, body) values (current_setting('k.t')::uuid, '   '); raise exception 'aceptó un comentario vacío';
  exception when check_violation then null; end;
  begin insert into public.task_comments (task_id, body, author_id) values (current_setting('k.t')::uuid, 'suplantado', '91000000-0000-4000-8000-000000000001'); raise exception 'comentó a nombre de otro';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 1 integrantes (también lectores) comentan; menciones solo de integrantes; nada ajeno ni a nombre de otro';
end $$;

reset role;
do $$ declare n int; begin
  select count(*) into n from public.notification_queue where user_id = '92000000-0000-4000-8000-000000000002' and kind = 'mention' and url like '%?tarea=%';
  if n <> 1 then raise exception 'Ana no recibió el aviso de mención (%)', n; end if;
  select count(*) into n from public.notification_queue where user_id = '92000000-0000-4000-8000-000000000002' and kind = 'comment';
  if n <> 0 then raise exception 'Ana recibió doble aviso (mención y comentario)'; end if;
  select count(*) into n from public.notification_queue where user_id in ('93000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000004') and kind in ('mention', 'comment');
  if n <> 0 then raise exception 'avisó a quien no debía'; end if;
  raise notice 'ok 2 aviso de mención con enlace a la tarea, sin duplicar con el de comentario';
end $$;

set role authenticated;
-- El dueño comenta sin mencionar: Ana (responsable) recibe "comentó en tu tarea".
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
do $$ declare n int; begin
  insert into public.task_comments (task_id, project_id, body) values (current_setting('k.t')::uuid, current_setting('k.p')::uuid, 'Revisen el informe');
  select count(*) into n from public.task_comments;
  if n < 2 then raise exception 'el dueño no ve los comentarios'; end if;
  -- El dueño no puede editar lo de otro, pero sí borrarlo.
  update public.task_comments set body = 'cambiado' where id = current_setting('k.c')::uuid;
  if (select body from public.task_comments where id = current_setting('k.c')::uuid) = 'cambiado' then raise exception 'editó un comentario ajeno'; end if;
  raise notice 'ok 3 el dueño ve todo y no edita lo ajeno';
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.notification_queue where user_id = '92000000-0000-4000-8000-000000000002' and kind = 'comment') then
    raise exception 'la responsable no recibió el aviso de comentario';
  end if;
  if not exists (select 1 from public.notification_queue where user_id = '92000000-0000-4000-8000-000000000002' and kind = 'assigned' and url like '%?tarea=%') then
    raise exception 'el aviso de asignación no abre la tarea';
  end if;
  raise notice 'ok 4 aviso a la responsable de la tarea; el de asignación abre la tarea';
end $$;

set role authenticated;
-- Luis edita su comentario y agrega a Juan: solo Juan recibe aviso nuevo.
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', false);
do $$ declare e timestamptz; begin
  update public.task_comments set body = '@Ana María @Juan ¿ya quedó?', mentions = array['92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001']::uuid[]
   where id = current_setting('k.c')::uuid returning edited_at into e;
  if e is null then raise exception 'no quedó la marca de editado'; end if;
  begin update public.task_comments set task_id = current_setting('k.t2')::uuid where id = current_setting('k.c')::uuid; raise exception 'movió el comentario a otra tarea';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 5 editar deja la marca y no se puede mover el comentario';
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.notification_queue where kind = 'mention' and ref like current_setting('k.c') || ':%';
  if n <> 2 then raise exception 'menciones al editar: esperaba 2 avisos en total, hay %', n; end if;
  raise notice 'ok 6 al editar solo avisa a los mencionados nuevos';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000004', false);
do $$ begin
  if exists (select 1 from public.task_comments where task_id = current_setting('k.t')::uuid) then raise exception 'alguien de fuera ve los comentarios'; end if;
  raise notice 'ok 7 los de fuera no ven nada';
end $$;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
do $$ begin
  delete from public.task_comments where id = current_setting('k.c')::uuid;
  if exists (select 1 from public.task_comments where id = current_setting('k.c')::uuid) then raise exception 'el dueño no pudo borrar'; end if;
  raise notice 'ok 8 el dueño del proyecto puede borrar comentarios';
end $$;
reset role;
do $$ begin
  delete from public.project_tasks where id = current_setting('k.t')::uuid;
  if exists (select 1 from public.task_comments where task_id = current_setting('k.t')::uuid) then raise exception 'quedaron comentarios de una tarea borrada'; end if;
  raise notice 'ok 9 se borran con la tarea';
end $$;
select 'PASARON' as v23_fase2;
