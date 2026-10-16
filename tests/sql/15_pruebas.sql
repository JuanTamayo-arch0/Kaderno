-- Pruebas de supabase/schema_v15.sql (versiones de archivos de proyecto).
-- Antes se corrió: stub, schema_v12, 02_seed, 15_antes (archivo viejo), schema_v15 dos veces.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
grant select, insert, update, delete on public.project_files, public.project_file_versions to authenticated;
grant select on public.projects, public.project_members, public.profiles to authenticated;

-- 1. El archivo que ya existía quedó como versión 1
do $$ begin
  if (select count(*) from public.project_file_versions where file_id = 'f0000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'el archivo viejo no tiene exactamente una versión (migración repetida duplica)';
  end if;
  if (select version || name || path from public.project_file_versions where file_id = 'f0000000-0000-4000-8000-000000000001') <> '1informe.docx11111111-0000-4000-8000-000000000001/viejo.docx' then
    raise exception 'la versión 1 no copió nombre o ruta';
  end if;
  if (select current_version from public.project_files where id = 'f0000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'current_version debería ser 1';
  end if;
  raise notice 'ok 1 respaldo de archivos viejos';
end $$;

-- 2. Un editor sube la versión 2: el número lo pone la base, y el archivo se actualiza
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
insert into public.project_file_versions (file_id, project_id, version, path, size, note, uploaded_by)
values ('f0000000-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 99,
        '11111111-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/2-informe.docx', 2048, '  corregí la intro  ', 'aaaaaaaa-0000-4000-8000-000000000001');
do $$ declare v record; f record; begin
  select * into v from public.project_file_versions where file_id = 'f0000000-0000-4000-8000-000000000001' order by version desc limit 1;
  if v.version <> 2 then raise exception 'se esperaba versión 2 y quedó %', v.version; end if;
  if v.project_id <> '11111111-0000-4000-8000-000000000001' then raise exception 'project_id no lo fijó la base'; end if;
  if v.uploaded_by <> 'bbbbbbbb-0000-4000-8000-000000000002' then raise exception 'uploaded_by se pudo falsear'; end if;
  if v.note <> 'corregí la intro' then raise exception 'la nota no se limpió: [%]', v.note; end if;
  if v.name <> 'informe.docx' then raise exception 'name no tomó el del archivo'; end if;
  select * into f from public.project_files where id = 'f0000000-0000-4000-8000-000000000001';
  if f.current_version <> 2 or f.path <> v.path or f.size <> 2048 or f.updated_by <> 'bbbbbbbb-0000-4000-8000-000000000002' then
    raise exception 'el archivo no quedó apuntando a la versión 2';
  end if;
  raise notice 'ok 2 versión nueva';
end $$;

-- 3. Restaurar la 1 crea la 3 con la misma ruta
insert into public.project_file_versions (file_id, path, size, note, restored_from)
select file_id, path, size, null, version from public.project_file_versions
 where file_id = 'f0000000-0000-4000-8000-000000000001' and version = 1;
do $$ begin
  if (select current_version from public.project_files where id = 'f0000000-0000-4000-8000-000000000001') <> 3 then raise exception 'restaurar no creó la versión 3'; end if;
  if (select path from public.project_files where id = 'f0000000-0000-4000-8000-000000000001') <> '11111111-0000-4000-8000-000000000001/viejo.docx' then raise exception 'restaurar no volvió a la ruta de la 1'; end if;
  if (select count(*) from public.project_file_versions where file_id = 'f0000000-0000-4000-8000-000000000001') <> 3 then raise exception 'se perdió historial'; end if;
  raise notice 'ok 3 restaurar';
end $$;

-- 4. Las versiones no se editan ni se borran (no hay política)
update public.project_file_versions set note = 'trampa' where file_id = 'f0000000-0000-4000-8000-000000000001';
delete from public.project_file_versions where file_id = 'f0000000-0000-4000-8000-000000000001';
do $$ begin
  if exists (select 1 from public.project_file_versions where note = 'trampa') then raise exception 'se pudo editar una versión'; end if;
  if (select count(*) from public.project_file_versions where file_id = 'f0000000-0000-4000-8000-000000000001') <> 3 then raise exception 'se pudo borrar una versión'; end if;
  raise notice 'ok 4 historial inmutable';
end $$;

-- 5. Quien solo mira puede leer, pero no subir
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000003', false);
do $$ begin
  if (select count(*) from public.project_file_versions) <> 3 then raise exception 'el viewer no ve el historial'; end if;
  begin
    insert into public.project_file_versions (file_id, path) values ('f0000000-0000-4000-8000-000000000001', 'x/y');
    raise exception 'el viewer pudo subir una versión';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok 5 viewer solo lee';
end $$;

-- 6. Alguien de fuera no ve nada ni puede subir
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-000000000004', false);
do $$ begin
  if (select count(*) from public.project_file_versions) <> 0 then raise exception 'un extraño ve versiones'; end if;
  begin
    insert into public.project_file_versions (file_id, path) values ('f0000000-0000-4000-8000-000000000001', 'x/y');
    raise exception 'un extraño pudo subir';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok 6 extraños fuera';
end $$;

-- 7. Archivo nuevo desde la app: fila sin ruta + versión 1; borrar el archivo borra sus versiones
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
insert into public.project_files (id, project_id, name, path, uploaded_by)
values ('f0000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'datos.xlsx', '', 'aaaaaaaa-0000-4000-8000-000000000001');
insert into public.project_file_versions (file_id, path, size, name) values ('f0000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001/f2/1-datos.xlsx', 10, 'datos (final).xlsx');
do $$ begin
  if (select current_version || path from public.project_files where id = 'f0000000-0000-4000-8000-000000000002') <> '111111111-0000-4000-8000-000000000001/f2/1-datos.xlsx' then
    raise exception 'el archivo nuevo no quedó en versión 1 con ruta';
  end if;
  if (select name from public.project_file_versions where file_id = 'f0000000-0000-4000-8000-000000000002') <> 'datos (final).xlsx' then raise exception 'no guardó el nombre de la versión'; end if;
  delete from public.project_files where id = 'f0000000-0000-4000-8000-000000000002';
  if exists (select 1 from public.project_file_versions where file_id = 'f0000000-0000-4000-8000-000000000002') then raise exception 'quedaron versiones huérfanas'; end if;
  raise notice 'ok 7 archivo nuevo y borrado en cascada';
end $$;
reset role;

do $$ begin raise notice 'PASARON las pruebas de schema_v15'; end $$;
