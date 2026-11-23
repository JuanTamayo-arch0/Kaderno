-- Pruebas de supabase/schema_v25.sql, fase 2 (espacios). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
do $$ declare u uuid := '91000000-0000-4000-8000-000000000001'; o uuid := '92000000-0000-4000-8000-000000000002'; begin
  delete from public.subjects where name in ('Espacio A', 'Espacio B', 'Espacio ajeno');
  insert into public.subjects (user_id, name) values (u, 'Espacio A'), (u, 'Espacio B'), (o, 'Espacio ajeno');
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
do $$ declare n int; begin
  if (select count(*) from public.subjects where name like 'Espacio %' and space is null) <> 2 then raise exception 'las nuevas no nacen vacías'; end if;
  update public.subjects set space = 'trabajo' where name = 'Espacio A';
  update public.subjects set space = 'estudio' where name = 'Espacio B';
  if (select space from public.subjects where name = 'Espacio A') <> 'trabajo' then raise exception 'no guardó el espacio'; end if;
  begin update public.subjects set space = 'otro' where name = 'Espacio A'; raise exception 'aceptó un espacio inválido';
  exception when check_violation then null; end;
  update public.subjects set space = 'trabajo' where name = 'Espacio ajeno';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'cambió el espacio de algo ajeno'; end if;
  raise notice 'ok 1 cada materia o área guarda su espacio (estudio o trabajo), vacío por defecto, y solo la persona lo cambia';
end $$;
reset role;
