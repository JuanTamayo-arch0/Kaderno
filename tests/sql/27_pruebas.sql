-- Pruebas de supabase/schema_v27.sql (v30, avisos en inglés). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values ('99000000-0000-4000-8000-000000000001', 'en@prueba.co'), ('99000000-0000-4000-8000-000000000002', 'es@prueba.co') on conflict do nothing;
insert into public.user_prefs (user_id, settings) values ('99000000-0000-4000-8000-000000000001', '{"lang":"en"}'), ('99000000-0000-4000-8000-000000000002', '{"lang":"es"}')
  on conflict (user_id) do update set settings = excluded.settings;
do $$
declare r record;
begin
  if public.kd_lang('99000000-0000-4000-8000-000000000001') <> 'en' or public.kd_lang('99000000-0000-4000-8000-000000000002') <> 'es'
     or public.kd_lang('99000000-0000-4000-8000-00000000ffff') <> 'es' then raise exception 'kd_lang'; end if;
  raise notice 'ok 1 el idioma sale de las preferencias (sin preferencia, español)';

  insert into public.notification_queue (user_id, kind, ref, title, body, url) values
    ('99000000-0000-4000-8000-000000000001', 'reminder', 'a', 'Informe de laboratorio', 'Entrega: 27/11 06:00 pm', '/'),
    ('99000000-0000-4000-8000-000000000002', 'reminder', 'a', 'Informe de laboratorio', 'Entrega: 27/11 06:00 pm', '/'),
    ('99000000-0000-4000-8000-000000000001', 'daily', 'b', 'Hoy tienes 3 entregas', '2 vencidas. Abre Kaderno para ver tu día.', '/'),
    ('99000000-0000-4000-8000-000000000001', 'weekly', 'c', 'Tu semana en Kaderno', '4 tareas hechas, 2 h 15 min de enfoque. Esta semana vienen 5.', '/'),
    ('99000000-0000-4000-8000-000000000001', 'plan', 'd', 'Son las 4:00 pm: toca Ensayo', 'En la biblioteca. Toca para empezar el enfoque.', '/'),
    ('99000000-0000-4000-8000-000000000001', 'billing', 'e', 'Pago recibido', 'Tienes Pro hasta el 23/12/2026. ¡Gracias por apoyar Kaderno!', '/plan'),
    ('99000000-0000-4000-8000-000000000001', 'timesheet', 'f', 'Horas para aprobar en Web', 'Alguien mandó 6.5 h de la semana del 16/11.', '/horas'),
    ('99000000-0000-4000-8000-000000000001', 'project_rule', 'g', '"Diseño" pasó a Hecho', 'Diseño', '/');
  select title, body into r from public.notification_queue where user_id = '99000000-0000-4000-8000-000000000001' and ref = 'a';
  if r.title <> 'Informe de laboratorio' or r.body <> 'Due: 11/27 06:00 pm' then raise exception 'reminder en: % / %', r.title, r.body; end if;
  select title, body into r from public.notification_queue where user_id = '99000000-0000-4000-8000-000000000002' and ref = 'a';
  if r.body <> 'Entrega: 27/11 06:00 pm' then raise exception 'reminder es: %', r.body; end if;
  raise notice 'ok 2 recordatorio: el título de la tarea no cambia; en español queda igual';
  select title, body into r from public.notification_queue where ref = 'b';
  if r.title <> '3 things due today' or r.body <> '2 overdue. Open Kaderno to see your day.' then raise exception 'daily: % / %', r.title, r.body; end if;
  select title, body into r from public.notification_queue where ref = 'c';
  if r.title <> 'Your week in Kaderno' or r.body <> '4 tasks done, 2 h 15 min of focus. 5 coming up this week.' then raise exception 'weekly: % / %', r.title, r.body; end if;
  select title, body into r from public.notification_queue where ref = 'd';
  if r.title <> 'It''s 4:00 pm: time for Ensayo' or r.body <> 'At the library. Tap to start focusing.' then raise exception 'plan: % / %', r.title, r.body; end if;
  select title, body into r from public.notification_queue where ref = 'e';
  if r.title <> 'Payment received' or r.body <> 'You have Pro until 12/23/2026. Thanks for supporting Kaderno!' then raise exception 'billing: % / %', r.title, r.body; end if;
  select title, body into r from public.notification_queue where ref = 'f';
  if r.title <> 'Hours to approve in Web' or r.body <> 'Someone submitted 6.5 h for the week of 11/16.' then raise exception 'timesheet: % / %', r.title, r.body; end if;
  select title, body into r from public.notification_queue where ref = 'g';
  if r.title <> '"Diseño" moved to Hecho' or r.body <> 'Diseño' then raise exception 'rule: % / %', r.title, r.body; end if;
  raise notice 'ok 3 resúmenes, plan, pagos, horas y reglas en inglés';
  delete from public.notification_queue where user_id in ('99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000002');
  raise notice 'PASARON las pruebas de schema_v27';
end $$;
