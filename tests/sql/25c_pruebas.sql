-- Pruebas de supabase/schema_v25.sql, fase 5 de v26 (mascotas). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
delete from public.pets where user_id = '93000000-0000-4000-8000-000000000003';
delete from public.user_prefs where user_id = '93000000-0000-4000-8000-000000000003';
insert into public.subjects (id, user_id, name, space) values
  ('93100000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000003', 'Cálculo', 'estudio'),
  ('93100000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000003', 'Acme', 'trabajo')
  on conflict (id) do nothing;
insert into public.assignments (id, user_id, title, due_date, subject_id, created_at) values
  ('93200000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000003', 'Taller', current_date + 3, '93100000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('93200000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000003', 'Cotización', current_date + 3, '93100000-0000-4000-8000-000000000002', now() - interval '1 day'),
  ('93200000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000003', 'Sin área', current_date + 3, null, now() - interval '1 day')
  on conflict (id) do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', false);
do $$ declare p public.pets; begin
  p := public.pet_adopt('gato', 'Tinta');
  reset role;
  update public.pets set coins = 1000, xp = 2000 where id = p.id;
  set role authenticated;
  p := public.pet_buy('taza');
  if p.outfit ->> 'mano' <> 'taza' then raise exception 'la taza no quedó en la mano: %', p.outfit; end if;
  p := public.pet_buy('mochila');
  if p.outfit ->> 'espalda' <> 'mochila' then raise exception 'la mochila no quedó en la espalda: %', p.outfit; end if;
  p := public.pet_wear(p.id, 'mano', null);
  if p.outfit ? 'mano' then raise exception 'no se quitó la taza'; end if;
  p := public.pet_wear(p.id, 'mano', 'taza');
  begin perform public.pet_wear(p.id, 'espalda', 'taza'); raise exception 'puso la taza en la espalda';
  exception when raise_exception then if sqlerrm not like 'Esa prenda no va ahí%' then raise; end if; end;
  begin perform public.pet_wear(p.id, 'mano', 'lapiz'); raise exception 'se puso algo sin comprarlo';
  exception when raise_exception then if sqlerrm not like 'Primero cómprala%' then raise; end if; end;
  begin perform public.pet_wear(p.id, 'cola', null); raise exception 'aceptó un lugar inventado';
  exception when raise_exception then if sqlerrm not like 'Lugar no válido%' then raise; end if; end;
  if (select coins from public.pets where id = p.id) <> 1000 - 70 - 140 then raise exception 'cobró mal'; end if;
  raise notice 'ok 1 ropa nueva: espalda y mano se compran, se ponen y se quitan, cada una en su lugar';
end $$;
do $$ declare c0 int; c1 int; c2 int; c3 int; begin
  select coins into c0 from public.pets where active;
  update public.assignments set status = 'done' where id = '93200000-0000-4000-8000-000000000002';
  select coins into c1 from public.pets where active;
  if c1 <> c0 then raise exception 'pagó una tarea de Trabajo: % a %', c0, c1; end if;
  update public.assignments set status = 'done' where id = '93200000-0000-4000-8000-000000000001';
  select coins into c2 from public.pets where active;
  if c2 <= c1 then raise exception 'no pagó la tarea de Estudio'; end if;
  -- Volver a marcar la de Trabajo no paga después (quedó la marca en 0).
  update public.assignments set status = 'pending' where id = '93200000-0000-4000-8000-000000000002';
  update public.assignments set status = 'done' where id = '93200000-0000-4000-8000-000000000002';
  select coins into c3 from public.pets where active;
  if c3 <> c2 then raise exception 'la tarea de Trabajo pagó al marcarla otra vez'; end if;
  raise notice 'ok 2 las tareas de Trabajo no pagan monedas; las de Estudio sí';
end $$;
do $$ declare c0 int; c1 int; c2 int; c3 int; begin
  select coins into c0 from public.pets where active;
  insert into public.focus_sessions (user_id, minutes, source) values ('93000000-0000-4000-8000-000000000003', 60, 'manual');
  insert into public.focus_sessions (user_id, minutes, source, subject_id) values ('93000000-0000-4000-8000-000000000003', 30, 'timer', '93100000-0000-4000-8000-000000000002');
  insert into public.focus_sessions (user_id, minutes, subject_id) values ('93000000-0000-4000-8000-000000000003', 25, '93100000-0000-4000-8000-000000000002');
  select coins into c1 from public.pets where active;
  if c1 <> c0 then raise exception 'pagaron horas a mano o de Trabajo: % a %', c0, c1; end if;
  insert into public.focus_sessions (user_id, minutes, subject_id) values ('93000000-0000-4000-8000-000000000003', 25, '93100000-0000-4000-8000-000000000001');
  select coins into c2 from public.pets where active;
  if c2 <= c1 then raise exception 'no pagó el enfoque de Estudio'; end if;
  -- Con la cuenta solo en Trabajo, lo que no tiene área tampoco paga.
  insert into public.user_prefs (user_id, settings) values ('93000000-0000-4000-8000-000000000003', '{"mode":"trabajo"}')
    on conflict (user_id) do update set settings = excluded.settings;
  update public.assignments set status = 'done' where id = '93200000-0000-4000-8000-000000000003';
  insert into public.focus_sessions (user_id, minutes) values ('93000000-0000-4000-8000-000000000003', 20);
  select coins into c3 from public.pets where active;
  if c3 <> c2 then raise exception 'pagó en una cuenta solo de Trabajo: % a %', c2, c3; end if;
  raise notice 'ok 3 el enfoque paga solo con el temporizador y en Estudio; una cuenta solo de Trabajo no gana';
end $$;
reset role;
