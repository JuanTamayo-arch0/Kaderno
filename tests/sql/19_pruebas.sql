-- Pruebas de supabase/schema_v19.sql, fase 5 (Enfocar juntos). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'a@upb.edu.co'),
  ('b2000000-0000-4000-8000-000000000002', 'b@upb.edu.co'),
  ('c3000000-0000-4000-8000-000000000003', 'c@upb.edu.co')
on conflict do nothing;
select public.ensure_profile(u::uuid) from (values ('a1000000-0000-4000-8000-000000000001'), ('b2000000-0000-4000-8000-000000000002'), ('c3000000-0000-4000-8000-000000000003')) v(u);
grant select, insert, update, delete on public.focus_sessions to authenticated;
grant select, insert, update, delete on public.study_rooms, public.study_room_members to authenticated; -- el schema debe volver a quitar la escritura
\i supabase/schema_v19.sql
create temp table t (k text primary key, v text);
grant select, insert, update on t to authenticated;
set role authenticated;

-- 1. Crear una sala de amigos
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);
do $$ declare r public.study_rooms; begin
  r := public.study_room_create('  Grupo de cálculo ');
  if r.code !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception 'código raro: %', r.code; end if;
  if r.name <> 'Grupo de cálculo' then raise exception 'no limpió el nombre'; end if;
  if not public.is_room_member(r.id) then raise exception 'quien crea no quedó adentro'; end if;
  insert into t values ('room', r.id::text), ('code', r.code);
  begin perform public.study_room_create('   '); raise exception 'aceptó nombre vacío'; exception when raise_exception then
    if sqlerrm not like 'Ponle un nombre%' then raise; end if; end;
  raise notice 'ok 1 crear sala con código';
end $$;

-- 2. Unirse con el código (sin importar mayúsculas, espacios o guiones)
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
do $$ declare r public.study_rooms; c text; xr uuid; n int; begin
  select v::uuid into xr from t where k = 'room'; select v into c from t where k = 'code';
  if exists (select 1 from public.study_rooms where study_rooms.id = xr) then raise exception 've la sala antes de unirse'; end if;
  r := public.study_room_join('ZZZZZZ');
  if r.id is not null then raise exception 'aceptó un código falso'; end if;
  r := public.study_room_join(lower(substr(c, 1, 3)) || '-' || substr(c, 4) || ' ');
  if r.id <> xr then raise exception 'se unió a otra sala'; end if;
  perform public.study_room_join(c); -- dos veces no duplica
  select count(*) into n from public.study_room_members m where m.room_id = xr;
  if n <> 2 then raise exception 'miembros: %', n; end if;
  raise notice 'ok 2 unirse con código';
end $$;

-- 3. Alguien de afuera no ve nada ni puede escribir directo
select set_config('request.jwt.claim.sub', 'c3000000-0000-4000-8000-000000000003', false);
do $$ declare xr uuid; begin
  select v::uuid into xr from t where k = 'room';
  if public.is_room_member(xr) then raise exception 'afuera parece miembro'; end if;
  if exists (select 1 from public.study_rooms) or exists (select 1 from public.study_room_members) then raise exception 'afuera ve salas'; end if;
  begin perform * from public.study_room_people(xr); raise exception 'afuera ve a la gente'; exception when raise_exception then
    if sqlerrm not like 'No estás%' then raise; end if; end;
  begin insert into public.study_room_members (room_id, user_id) values (xr, auth.uid()); raise exception 'se metió sin código';
  exception when insufficient_privilege then null; end;
  begin insert into public.study_rooms (owner_id, name, code) values (auth.uid(), 'x', 'ABCDEF'); raise exception 'creó sala directo';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 3 sin acceso desde afuera';
end $$;

-- 4. Los pomodoros cuentan solo dentro de tus salas
do $$ declare xr uuid; rid uuid; begin
  select v::uuid into xr from t where k = 'room';
  insert into public.focus_sessions (user_id, minutes, room_id) values (auth.uid(), 25, xr) returning room_id into rid;
  if rid is not null then raise exception 'guardó un pomodoro en una sala ajena'; end if;
  raise notice 'ok 4 un pomodoro no se cuela en una sala ajena';
end $$;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
do $$ declare xr uuid; p record; total int; begin
  select v::uuid into xr from t where k = 'room';
  insert into public.focus_sessions (user_id, minutes, room_id) values (auth.uid(), 25, xr), (auth.uid(), 50, xr), (auth.uid(), 5, xr);
  insert into public.focus_sessions (user_id, minutes, room_id, created_at) values (auth.uid(), 25, xr, now() - interval '2 days');
  select * into p from public.study_room_people(xr) where user_id = auth.uid();
  if p.pomodoros <> 2 or p.minutes <> 75 then raise exception 'conteo: % pomodoros, % min', p.pomodoros, p.minutes; end if;
  select sum(pomodoros) into total from public.study_room_people(xr, 'Zona/Inventada');
  if total <> 2 then raise exception 'total del grupo: %', total; end if;
  if (select name from public.study_room_people(xr) where user_id = 'a1000000-0000-4000-8000-000000000001') <> 'a' then raise exception 'nombre'; end if;
  raise notice 'ok 5 meta del grupo: cuentan los de hoy de 10 min o más';
end $$;

-- 6. Cambiar nombre y meta: solo el dueño
do $$ declare xr uuid; begin
  select v::uuid into xr from t where k = 'room';
  begin perform public.study_room_update(xr, 'Mía', 5); raise exception 'otro cambió la sala'; exception when raise_exception then
    if sqlerrm not like 'Solo quien%' then raise; end if; end;
  begin perform public.study_room_new_code(xr); raise exception 'otro cambió el código'; exception when raise_exception then
    if sqlerrm not like 'Solo quien%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);
do $$ declare xr uuid; r public.study_rooms; old text; begin
  select v::uuid into xr from t where k = 'room'; select v into old from t where k = 'code';
  r := public.study_room_update(xr, 'Cálculo II juntos', 6);
  if r.name <> 'Cálculo II juntos' or r.goal <> 6 then raise exception 'no actualizó'; end if;
  begin perform public.study_room_update(xr, null, 0); raise exception 'aceptó meta 0'; exception when check_violation then null; end;
  r := public.study_room_new_code(xr);
  if r.code = old then raise exception 'mismo código'; end if;
  update t set v = r.code where k = 'code';
  raise notice 'ok 6 nombre, meta y código nuevo solo para el dueño';
end $$;

-- 7. Sala del proyecto: se crea una vez y entran los miembros del proyecto
reset role;
insert into public.projects (id, owner_id, name) values ('f9000000-0000-4000-8000-000000000009', 'b2000000-0000-4000-8000-000000000002', 'Proyecto de robótica') on conflict do nothing;
insert into public.project_members (project_id, user_id, role) values
  ('f9000000-0000-4000-8000-000000000009', 'b2000000-0000-4000-8000-000000000002', 'owner'),
  ('f9000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000001', 'editor') on conflict do nothing;
set role authenticated;
do $$ declare r1 public.study_rooms; r2 public.study_rooms; begin
  r1 := public.study_room_for_project('f9000000-0000-4000-8000-000000000009');
  r2 := public.study_room_for_project('f9000000-0000-4000-8000-000000000009');
  if r1.id <> r2.id or r1.code is not null or r1.name <> 'Proyecto de robótica' then raise exception 'sala de proyecto rara'; end if;
  insert into t values ('proom', r1.id::text);
  raise notice 'ok 7 una sola sala por proyecto';
end $$;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
do $$ declare xr uuid; begin
  select v::uuid into xr from t where k = 'proom';
  if not public.is_room_member(xr) then raise exception 'el dueño del proyecto no entra a la sala'; end if;
  perform public.study_room_update(xr, null, 4); -- el dueño del proyecto puede cambiar la meta
end $$;
select set_config('request.jwt.claim.sub', 'c3000000-0000-4000-8000-000000000003', false);
do $$ begin
  begin perform public.study_room_for_project('f9000000-0000-4000-8000-000000000009'); raise exception 'entró a la sala de un proyecto ajeno';
  exception when raise_exception then if sqlerrm not like 'No eres parte%' then raise; end if; end;
  raise notice 'ok 8 la sala del proyecto es solo para sus miembros';
end $$;

-- 9. Probar códigos al azar se frena
do $$ declare c text; begin
  select v into c from t where k = 'code';
  for i in 1..20 loop
    perform public.study_room_join('QQQQQ' || i);
  end loop;
  begin perform public.study_room_join(c); raise exception 'no frenó tras 20 intentos'; exception when raise_exception then
    if sqlerrm not like 'Demasiados%' then raise; end if; end;
  raise notice 'ok 9 tope de códigos equivocados';
end $$;

-- 10. Realtime: solo los miembros escuchan y envían en "sala:<xr>"
reset role;
insert into realtime.messages (topic, extension, payload)
select 'sala:' || v, 'presence', '{}'::jsonb from t where k = 'room';
insert into realtime.messages (topic, extension, payload) values ('sala:no-es-uuid', 'broadcast', '{}');
set role authenticated;
do $$ declare xr text; n int; begin
  select v into xr from t where k = 'room';
  perform set_config('realtime.topic', 'sala:' || xr, false);
  select count(*) into n from realtime.messages;  -- c3 no es miembro
  if n <> 0 then raise exception 'afuera escucha la sala'; end if;
  begin insert into realtime.messages (topic, extension, payload) values ('sala:' || xr, 'broadcast', '{}'); raise exception 'afuera envía a la sala';
  exception when insufficient_privilege then null; end;
  perform set_config('realtime.topic', 'sala:no-es-uuid', false);
  select count(*) into n from realtime.messages;
  if n <> 0 then raise exception 'tema raro aceptado'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
do $$ declare xr text; n int; begin
  select v into xr from t where k = 'room';
  perform set_config('realtime.topic', 'sala:' || xr, false);
  select count(*) into n from realtime.messages;
  -- Realtime revisa la política con el tema del canal (realtime.topic()), no fila por fila.
  if n = 0 then raise exception 'el miembro no escucha'; end if;
  insert into realtime.messages (topic, extension, payload) values ('sala:' || xr, 'broadcast', '{"event":"propose"}');
  raise notice 'ok 10 canales privados solo para miembros';
end $$;

-- 11. Salir: el dueño pasa la sala; el último la borra
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);
do $$ declare xr uuid; begin
  select v::uuid into xr from t where k = 'room';
  perform public.study_room_leave(xr);
  if public.is_room_member(xr) then raise exception 'sigue adentro'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
do $$ declare xr uuid; begin
  select v::uuid into xr from t where k = 'room';
  if (select owner_id from public.study_rooms where study_rooms.id = xr) <> auth.uid() then raise exception 'no pasó la sala'; end if;
  perform public.study_room_leave(xr);
end $$;
reset role;
do $$ declare xr uuid; begin
  select v::uuid into xr from t where k = 'room';
  if exists (select 1 from public.study_rooms where study_rooms.id = xr) then raise exception 'la sala vacía no se borró'; end if;
  if exists (select 1 from public.focus_sessions where room_id = xr) then raise exception 'quedaron pomodoros con sala borrada'; end if;
  raise notice 'ok 11 salir pasa la sala y la última persona la borra';
  raise notice 'PASARON todas las pruebas de schema_v19 (fase 5)';
end $$;
