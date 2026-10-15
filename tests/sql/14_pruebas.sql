-- Pruebas de supabase/schema_v14.sql. Cada bloque falla con una excepción si algo no cuadra.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- Usuarios: A en Bogotá, B en Madrid.
insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'a@upb.edu.co'),
  ('b2000000-0000-4000-8000-000000000002', 'b@upb.edu.co')
on conflict do nothing;
insert into public.user_prefs (user_id, settings) values
  ('a1000000-0000-4000-8000-000000000001', '{"notif": {"tz": "America/Bogota", "daily": true, "daily_hour": 7, "weekly": true}}'),
  ('b2000000-0000-4000-8000-000000000002', '{"notif": {"tz": "Europe/Madrid", "daily": false}}')
on conflict (user_id) do update set settings = excluded.settings;

-- Momento fijo: jueves 15 de octubre de 2026, 7:05 am en Bogotá (12:05 UTC).
-- Tareas de A
insert into public.assignments (id, user_id, title, due_date, due_at, remind_at, status) values
  ('c0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Recordar ya',     '2026-10-15', '2026-10-15 23:00+00', '2026-10-15 12:00+00', 'pending'),
  ('c0000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Recordar luego',  '2026-10-20', null,                  '2026-10-19 14:00+00', 'pending'),
  ('c0000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'Hecha',           '2026-10-15', null,                  '2026-10-15 11:00+00', 'done'),
  ('c0000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'En papelera',     '2026-10-15', null,                  '2026-10-15 11:00+00', 'pending'),
  ('c0000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', 'Vencida',         '2026-10-13', null,                  null,                  'pending'),
  ('c0000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'Basura vieja',    '2026-09-01', null,                  null,                  'pending');
update public.assignments set deleted_at = '2026-10-15 10:00+00' where id = 'c0000000-0000-4000-8000-000000000004';
update public.assignments set deleted_at = '2026-09-01 10:00+00' where id = 'c0000000-0000-4000-8000-000000000006';

-- 1. completed_at lo maneja el disparador
do $$ declare c timestamptz; begin
  select completed_at into c from public.assignments where id = 'c0000000-0000-4000-8000-000000000003';
  if c is null then raise exception 'completed_at no se llenó al crear hecha'; end if;
  update public.assignments set status = 'pending' where id = 'c0000000-0000-4000-8000-000000000003';
  select completed_at into c from public.assignments where id = 'c0000000-0000-4000-8000-000000000003';
  if c is not null then raise exception 'completed_at no se borró al desmarcar'; end if;
  update public.assignments set status = 'done' where id = 'c0000000-0000-4000-8000-000000000003';
  raise notice 'ok 1 completed_at';
end $$;

-- 2. Recordatorios: solo el que ya llegó, pendiente y fuera de la papelera; sin duplicar
do $$ declare n int; begin
  n := public.enqueue_reminders('2026-10-15 12:05+00');
  if n <> 1 then raise exception 'enqueue_reminders devolvió % y se esperaba 1', n; end if;
  if not exists (select 1 from public.notification_queue where kind = 'reminder' and title = 'Recordar ya' and body like 'Entrega: 15/10%') then
    raise exception 'el aviso no tiene el título o la hora esperada: %', (select body from public.notification_queue where kind = 'reminder' limit 1);
  end if;
  n := public.enqueue_reminders('2026-10-15 12:10+00');
  if n <> 0 then raise exception 'se duplicó el recordatorio (%)', n; end if;
  -- Cambiar el recordatorio lo deja pendiente otra vez
  update public.assignments set remind_at = '2026-10-15 12:20+00' where id = 'c0000000-0000-4000-8000-000000000001';
  if (select reminded_at from public.assignments where id = 'c0000000-0000-4000-8000-000000000001') is not null then
    raise exception 'reminded_at no se reinició al cambiar remind_at';
  end if;
  n := public.enqueue_reminders('2026-10-15 12:25+00');
  if n <> 1 then raise exception 'el recordatorio reprogramado no salió (%)', n; end if;
  raise notice 'ok 2 recordatorios';
end $$;

-- 3. Resumen diario a las 7 am de Bogotá, una sola vez; B lo tiene apagado
do $$ declare n int; b text; begin
  n := public.enqueue_digests('2026-10-15 12:05+00');
  if n <> 1 then raise exception 'enqueue_digests devolvió % y se esperaba 1', n; end if;
  select title || ' | ' || body into b from public.notification_queue where kind = 'daily';
  if b not like 'Hoy tienes 1 entrega | 1 vencida.%' then raise exception 'texto del resumen inesperado: %', b; end if;
  n := public.enqueue_digests('2026-10-15 12:40+00');
  if n <> 0 then raise exception 'resumen diario duplicado'; end if;
  n := public.enqueue_digests('2026-10-15 15:00+00');  -- 10 am Bogotá
  if n <> 0 then raise exception 'resumen fuera de hora'; end if;
  if exists (select 1 from public.notification_queue where user_id = 'b2000000-0000-4000-8000-000000000002' and kind = 'daily') then
    raise exception 'B tenía el resumen apagado';
  end if;
  raise notice 'ok 3 resumen diario';
end $$;

-- 4. Resumen semanal: domingo 18 de octubre, 7 pm Bogotá (00:00 UTC del lunes)
do $$ declare n int; begin
  insert into public.focus_sessions (user_id, minutes, created_at) values ('a1000000-0000-4000-8000-000000000001', 95, '2026-10-16 15:00+00');
  n := public.enqueue_digests('2026-10-19 00:10+00');
  if not exists (select 1 from public.notification_queue where kind = 'weekly' and user_id = 'a1000000-0000-4000-8000-000000000001' and body like '%1 h 35 min de enfoque%') then
    raise exception 'no salió el resumen semanal con los minutos: %', (select body from public.notification_queue where kind = 'weekly' limit 1);
  end if;
  raise notice 'ok 4 resumen semanal';
end $$;

-- 5. Tareas de proyecto: aviso al asignar (si no es a sí mismo) y por vencer en 24 h
insert into public.projects (id, owner_id, name) values ('f1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'Proyecto final') on conflict do nothing;
insert into public.project_members (project_id, user_id, role) values ('f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'editor') on conflict do nothing;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
insert into public.project_tasks (id, project_id, title, status, assignee_id, due_at, position) values
  ('d0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Montaje', 'todo', 'a1000000-0000-4000-8000-000000000001', '2026-10-16 10:00+00', 1),
  ('d0000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'Mío', 'todo', 'b2000000-0000-4000-8000-000000000002', '2026-10-16 10:00+00', 2);
select set_config('request.jwt.claim.sub', '', false);
do $$ declare n int; begin
  if (select count(*) from public.notification_queue where kind = 'assigned') <> 1 then
    raise exception 'avisos de asignación: % (se esperaba 1)', (select count(*) from public.notification_queue where kind = 'assigned');
  end if;
  if not exists (select 1 from public.notification_queue where kind = 'assigned' and user_id = 'a1000000-0000-4000-8000-000000000001' and body = 'Proyecto final: Montaje') then
    raise exception 'el aviso de asignación no es para A o tiene otro texto';
  end if;
  n := public.enqueue_project_due('2026-10-15 12:05+00');
  if n <> 2 then raise exception 'enqueue_project_due devolvió % y se esperaba 2', n; end if;
  n := public.enqueue_project_due('2026-10-15 12:30+00');
  if n <> 0 then raise exception 'aviso de proyecto duplicado'; end if;
  raise notice 'ok 5 proyectos';
end $$;

-- 6. Papelera: solo lo de hace más de 30 días
do $$ declare n int; begin
  n := public.purge_trash('2026-10-15 12:00+00');
  if n <> 1 then raise exception 'purge_trash borró % y se esperaba 1', n; end if;
  if not exists (select 1 from public.assignments where id = 'c0000000-0000-4000-8000-000000000004') then
    raise exception 'se borró una tarea con menos de 30 días en la papelera';
  end if;
  raise notice 'ok 6 papelera';
end $$;

-- 7. Todo junto
do $$ declare r jsonb; begin
  r := public.enqueue_all('2026-10-15 12:05+00');
  if not (r ? 'reminders' and r ? 'digests' and r ? 'project_due' and r ? 'purged') then raise exception 'enqueue_all: %', r; end if;
  raise notice 'ok 7 enqueue_all %', r;
end $$;

-- 8. Seguridad: cada quien ve solo sus avisos y nadie llama las funciones del servidor
grant select, update, delete on public.notification_queue to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.calendar_tokens to authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.notification_queue where user_id <> 'b2000000-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'B ve % avisos ajenos', n; end if;
  update public.notification_queue set read_at = now() where user_id = 'a1000000-0000-4000-8000-000000000001';
  begin
    perform public.enqueue_all(now());
    raise exception 'authenticated pudo llamar enqueue_all';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('a1000000-0000-4000-8000-000000000001', 'https://x/1', 'k', 'a');
    raise exception 'B pudo guardar una suscripción a nombre de A';
  exception when insufficient_privilege or check_violation then null;
           when others then if sqlstate <> '42501' then raise; end if;
  end;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('b2000000-0000-4000-8000-000000000002', 'https://x/2', 'k', 'a');
  raise notice 'ok 8 seguridad';
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.notification_queue where user_id = 'a1000000-0000-4000-8000-000000000001' and read_at is not null) then
    raise exception 'B marcó como leídos avisos de A';
  end if;
end $$;

-- 9. Enlace de calendario: estable, y uno nuevo al regenerar
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$ declare t1 text; t2 text; t3 text; begin
  t1 := public.my_calendar_token(false);
  t2 := public.my_calendar_token(false);
  t3 := public.my_calendar_token(true);
  if t1 is null or length(t1) < 40 then raise exception 'token muy corto: %', t1; end if;
  if t1 <> t2 then raise exception 'el token cambió sin pedirlo'; end if;
  if t3 = t1 then raise exception 'regenerar no cambió el token'; end if;
  if (select count(*) from public.calendar_tokens) <> 1 then raise exception 'A ve tokens ajenos'; end if;
  raise notice 'ok 9 calendario';
end $$;
reset role;

-- 10. SM-2: columnas con valores por defecto
do $$ begin
  insert into public.flashcards (user_id, front, back) values ('a1000000-0000-4000-8000-000000000001', 'p', 'r');
  if not exists (select 1 from public.flashcards where ease = 2.5 and interval_days = 0 and reps = 0) then raise exception 'flashcards sin valores SM-2'; end if;
  raise notice 'ok 10 flashcards';
end $$;

select 'TODAS LAS PRUEBAS DE V14 PASARON' as resultado;
