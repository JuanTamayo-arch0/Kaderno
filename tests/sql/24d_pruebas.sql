-- Pruebas de supabase/schema_v24.sql, fase 4 (entradas y clientes). Corren sobre la base k16, después de 24c_pruebas.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
grant select on public.project_links to authenticated;
select set_config('k.zenit', (select id::text from public.projects where name = 'Zenit' limit 1), false);

set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
do $$ declare f public.project_links; v public.project_links; cols jsonb; begin
  f := public.project_link_set(current_setting('k.zenit')::uuid, 'form', true, false, 'Cuéntanos qué necesitas.');
  v := public.project_link_set(current_setting('k.zenit')::uuid, 'view', true);
  if length(f.token) <> 32 or f.token = v.token then raise exception 'tokens: % %', f.token, v.token; end if;
  select board_columns into cols from public.projects where id = current_setting('k.zenit')::uuid;
  if cols -> 0 ->> 'key' <> 'solicitudes' then raise exception 'sin columna de solicitudes: %', cols; end if;
  perform public.project_link_set(current_setting('k.zenit')::uuid, 'form', true);
  if (select count(*) from jsonb_array_elements((select board_columns from public.projects where id = current_setting('k.zenit')::uuid)) c where c ->> 'key' = 'solicitudes') <> 1 then raise exception 'columna repetida'; end if;
  perform set_config('k.form', f.token, false); perform set_config('k.view', v.token, false);
  insert into public.project_tasks (project_id, title, status, labels) values (current_setting('k.zenit')::uuid, 'Pagar el servidor', 'todo', array['interno']);
  raise notice 'ok 1 enlaces de formulario y de vista, con su columna Solicitudes una sola vez';
end $$;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', false);
do $$ begin
  begin perform public.project_link_set(current_setting('k.zenit')::uuid, 'view', true); raise exception 'quien solo ve prendió un enlace';
  exception when raise_exception then if sqlerrm not like 'Solo quien edita%' then raise; end if; end;
  if exists (select 1 from public.project_links) then raise exception 'quien solo ve lee los enlaces'; end if;
  raise notice 'ok 2 solo quien edita maneja y ve los enlaces';
end $$;

-- Sin sesión.
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare info jsonb; r jsonb; i int; begin
  info := public.public_form_info(current_setting('k.form'));
  if info ->> 'name' <> 'Zenit' or info ->> 'intro' <> 'Cuéntanos qué necesitas.' then raise exception 'info: %', info; end if;
  if public.public_form_info('no-existe-este-token') is not null then raise exception 'token falso'; end if;
  begin perform public.public_form_submit(current_setting('k.form'), 'Carla', 'no-es-correo', 'Nuevo reporte', ''); raise exception 'correo inválido';
  exception when raise_exception then if sqlerrm not like 'Escribe un correo%' then raise; end if; end;
  r := public.public_form_submit(current_setting('k.form'), 'Robot', 'r@b.co', 'Spam', 'x', null, 'soy un robot');
  r := public.public_form_submit(current_setting('k.form'), 'Carla Ruiz', 'Carla@Cliente.co', 'Reporte de ventas de octubre', 'Lo necesito en PDF.', current_date + 5);
  if not (r ->> 'ok')::boolean then raise exception 'envío: %', r; end if;
  for i in 1..4 loop perform public.public_form_submit(current_setting('k.form'), 'Carla Ruiz', 'carla@cliente.co', 'Pedido ' || i, ''); end loop;
  begin perform public.public_form_submit(current_setting('k.form'), 'Carla Ruiz', 'carla@cliente.co', 'Pedido 6', ''); raise exception 'pasó el tope por correo';
  exception when raise_exception then if sqlerrm not like 'Llegaron muchas%' then raise; end if; end;
  begin perform 1 from public.project_tasks limit 1; raise exception 'anónimo leyó tareas';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 3 formulario sin sesión: valida, ignora robots, tope por correo y no deja leer nada más';
end $$;
reset role;
do $$ declare t public.project_tasks; begin
  select * into t from public.project_tasks where title = 'Reporte de ventas de octubre';
  if t.status <> 'solicitudes' or t.labels <> array['solicitud'] or t.description not like 'Pedido por Carla Ruiz <carla@cliente.co>%' or t.due_date <> current_date + 5 then raise exception 'tarea: %', t; end if;
  if exists (select 1 from public.project_tasks where title = 'Spam') then raise exception 'guardó al robot'; end if;
  if not exists (select 1 from public.notification_queue where user_id = '92000000-0000-4000-8000-000000000002' and title = 'Solicitud nueva en Zenit') then raise exception 'sin aviso a la editora'; end if;
  raise notice 'ok 4 la solicitud entra a Solicitudes con su correo y avisa a quien edita';
end $$;
set role anon;
do $$ declare v jsonb; begin
  v := public.public_project_view(current_setting('k.view'));
  if v ->> 'name' <> 'Zenit' or v -> 'update' ->> 'health' <> 'en_riesgo' then raise exception 'vista: %', v; end if;
  if v::text like '%Pagar el servidor%' or v::text like '%Reporte de ventas%' then raise exception 'mostró lo interno o las solicitudes'; end if;
  if v::text like '%Ana%' or v::text like '%@%' then raise exception 'mostró nombres o correos'; end if;
  if exists (select 1 from jsonb_array_elements(v -> 'columns') c where c ->> 'label' = 'Solicitudes') then raise exception 'mostró la columna de solicitudes'; end if;
  raise notice 'ok 5 vista del cliente: avance y estado, sin lo interno, solicitudes, nombres ni correos';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
do $$ declare v public.project_links; begin
  v := public.project_link_set(current_setting('k.zenit')::uuid, 'view', true, true);
  if v.token = current_setting('k.view') then raise exception 'no cambió el enlace'; end if;
  perform public.project_link_set(current_setting('k.zenit')::uuid, 'form', false);
  raise notice 'ok 6 cambiar el enlace invalida el viejo; apagar el formulario';
end $$;
reset role;
set role anon;
do $$ begin
  if public.public_project_view(current_setting('k.view')) is not null then raise exception 'el enlace viejo sigue sirviendo'; end if;
  begin perform public.public_form_submit(current_setting('k.form'), 'Carla', 'c@c.co', 'Otra cosa', ''); raise exception 'formulario apagado recibió';
  exception when raise_exception then if sqlerrm not like 'Este formulario ya no%' then raise; end if; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', false);
do $$ begin
  perform public.project_link_set('97a00000-0000-4000-8000-000000000001', 'view', true);
  begin perform public.project_link_set('97a00000-0000-4000-8000-000000000002', 'form', true); raise exception 'Gratis abrió enlaces en dos proyectos';
  exception when raise_exception then if sqlerrm not like 'Con el plan Gratis los enlaces%' then raise; end if; end;
  raise notice 'ok 7 Gratis: enlaces para clientes en 1 proyecto';
end $$;
reset role;
