-- Pruebas de supabase/schema_v21.sql, fase 2 (anotar PDFs). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
do $$ declare s uuid; sf uuid; other uuid; p uuid; pf uuid; begin
  insert into public.profiles (id) values ('f1000000-0000-4000-8000-0000000000f1') on conflict do nothing;
  insert into public.profiles (id) values ('c7000000-0000-4000-8000-000000000007') on conflict do nothing;
  insert into public.subjects (user_id, name) values ('f1000000-0000-4000-8000-0000000000f1', 'Circuitos') returning id into s;
  insert into public.subject_files (subject_id, user_id, name, path) values (s, 'f1000000-0000-4000-8000-0000000000f1', 'Guía 3.pdf', 'f1/guia3.pdf') returning id into sf;
  insert into public.subjects (user_id, name) values ('c7000000-0000-4000-8000-000000000007', 'Ajena') returning id into other;
  insert into public.subject_files (subject_id, user_id, name, path) values (other, 'c7000000-0000-4000-8000-000000000007', 'Ajeno.pdf', 'c7/a.pdf') returning id into other;
  insert into public.projects (owner_id, name) values ('c7000000-0000-4000-8000-000000000007', 'Grupo') returning id into p;
  insert into public.project_members (project_id, user_id, role) values (p, 'c7000000-0000-4000-8000-000000000007', 'owner'), (p, 'f1000000-0000-4000-8000-0000000000f1', 'viewer') on conflict do nothing;
  insert into public.project_files (project_id, name, path) values (p, 'Enunciado.pdf', 'p/enunciado.pdf') returning id into pf;
  perform set_config('k.sf', sf::text, false); perform set_config('k.other', other::text, false);
  perform set_config('k.pf', pf::text, false); perform set_config('k.p', p::text, false);
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-0000000000f1', false);
do $$ declare h uuid; begin
  insert into public.file_highlights (file_kind, file_id, page, rects, text, color)
  values ('subject', current_setting('k.sf')::uuid, 4, '[{"x":0.1,"y":0.2,"w":0.5,"h":0.02}]', 'La ley de Ohm', 'yellow') returning id into h;
  update public.file_highlights set comment = 'Sale en el parcial', color = 'green' where id = h;
  insert into public.file_highlights (file_kind, file_id, page, rects, text)
  values ('project', current_setting('k.pf')::uuid, 1, '[{"x":0,"y":0,"w":1,"h":0.1}]', 'Entrega el viernes');
  begin insert into public.file_highlights (file_kind, file_id, page, rects) values ('subject', current_setting('k.other')::uuid, 1, '[{"x":0,"y":0,"w":1,"h":1}]'); raise exception 'resaltó un archivo ajeno';
  exception when insufficient_privilege then null; end;
  begin insert into public.file_highlights (file_kind, file_id, page, rects) values ('subject', current_setting('k.sf')::uuid, 1, '[]'); raise exception 'aceptó sin rectángulos';
  exception when check_violation then null; end;
  begin insert into public.file_highlights (file_kind, file_id, page, rects, color) values ('subject', current_setting('k.sf')::uuid, 1, '[{"x":0,"y":0,"w":1,"h":1}]', 'red'); raise exception 'aceptó otro color';
  exception when check_violation then null; end;
  raise notice 'ok 1 resaltados en archivos propios y de proyectos donde es miembro (también como lector)';
end $$;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000007', false);
do $$ declare n int; begin
  select count(*) into n from public.file_highlights;
  if n <> 0 then raise exception 've resaltados de otro miembro del proyecto'; end if;
  delete from public.file_highlights;
  raise notice 'ok 2 los resaltados son de cada persona aunque el archivo sea del grupo';
end $$;
reset role;
do $$ declare n int; begin
  delete from public.subject_files where id = current_setting('k.sf')::uuid;
  delete from public.project_files where id = current_setting('k.pf')::uuid;
  select count(*) into n from public.file_highlights where user_id = 'f1000000-0000-4000-8000-0000000000f1';
  if n <> 0 then raise exception 'quedaron % resaltados de archivos borrados', n; end if;
  raise notice 'ok 3 se borran con el archivo';
end $$;
select 'PASARON' as v22_fase2;
