-- Pruebas de supabase/schema_v18.sql (ficha de la materia y notas). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
grant select, insert, update, delete on public.subjects, public.notes to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);

do $$ declare s uuid; begin
  insert into public.subjects (user_id, name) values (auth.uid(), 'Física Moderna v18') returning id into s;
  update public.subjects set teacher = 'Ana Pérez', room = '11-201', link = 'https://aula.upb.edu.co/curso/1' where id = s;
  if (select teacher from public.subjects where id = s) <> 'Ana Pérez' then raise exception 'no guardó el profesor'; end if;
  raise notice 'ok 1 profesor, salón y enlace';
end $$;

do $$ begin
  begin
    update public.subjects set link = 'javascript:alert(1)' where name = 'Física Moderna v18';
    raise exception 'aceptó un enlace javascript:';
  exception when check_violation then null; end;
  begin
    update public.subjects set link = 'https://a b' where name = 'Física Moderna v18';
    raise exception 'aceptó un enlace con espacios';
  exception when check_violation then null; end;
  begin
    update public.subjects set teacher = repeat('x', 121) where name = 'Física Moderna v18';
    raise exception 'aceptó un profesor muy largo';
  exception when check_violation then null; end;
  raise notice 'ok 2 rechaza enlaces raros y textos largos';
end $$;

do $$ declare n uuid; t0 timestamptz; t1 timestamptz; begin
  insert into public.notes (user_id, title, content) values (auth.uid(), 'Nota v18', 'hola') returning id, updated_at into n, t0;
  if t0 is null then raise exception 'updated_at vacío al crear'; end if;
  perform pg_sleep(0.02);
  update public.notes set pinned = true where id = n;
  select updated_at into t1 from public.notes where id = n;
  if t1 <> t0 then raise exception 'fijar cambió updated_at'; end if;
  update public.notes set summary = 'resumen' where id = n;
  select updated_at into t1 from public.notes where id = n;
  if t1 <> t0 then raise exception 'guardar resumen cambió updated_at'; end if;
  raise notice 'ok 3 fijar y resumir no cuentan como edición';
end $$;

-- now() es la hora de inicio de la transacción: la edición va en otra.
do $$ declare n uuid; t0 timestamptz; t1 timestamptz; begin
  select id, updated_at into n, t0 from public.notes where title = 'Nota v18';
  update public.notes set content = 'hola mundo' where id = n;
  select updated_at into t1 from public.notes where id = n;
  if not (t1 > t0) then raise exception 'editar no movió updated_at: % %', t0, t1; end if;
  if not (select pinned from public.notes where id = n) then raise exception 'se perdió pinned'; end if;
  raise notice 'ok 4 editar el contenido actualiza updated_at';
end $$;

-- Otro usuario no ve ni cambia la ficha ajena.
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
do $$ declare c int; begin
  update public.subjects set teacher = 'intruso' where name = 'Física Moderna v18';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'otro usuario cambió la materia'; end if;
  update public.notes set pinned = false where title = 'Nota v18';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'otro usuario cambió la nota'; end if;
  raise notice 'ok 5 RLS se mantiene';
end $$;
select 'TODAS LAS PRUEBAS DE V18 PASARON';
