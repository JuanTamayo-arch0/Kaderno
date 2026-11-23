-- Pruebas de supabase/schema_v25.sql, fase 3 (semestres). Corren sobre la base k16, después de 25_pruebas.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
delete from public.terms;
set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
do $$ declare t public.terms; c public.terms; a uuid; s jsonb; n int; begin
  insert into public.terms (name, starts_on) values ('2026-2', '2026-07-27') returning * into t;
  begin insert into public.terms (name) values ('Otro abierto'); raise exception 'dejó dos semestres abiertos';
  exception when unique_violation then null; end;
  update public.subjects set term_id = t.id where name in ('Espacio A', 'Espacio B');
  c := public.term_close(t.id, jsonb_build_object('subjects', jsonb_build_array(
      jsonb_build_object('name', 'Cálculo II', 'credits', 4, 'grade', 4.4, 'status', 'aprobada', 'hours', 48),
      jsonb_build_object('name', 'Física', 'credits', 4, 'grade', 2.8, 'status', 'reprobada'),
      jsonb_build_object('name', 'Inglés IV', 'credits', 2, 'grade', 4.0, 'status', 'homologada'),
      jsonb_build_object('name', 'Ética', 'credits', 2, 'grade', null, 'status', 'retirada')),
    'focus_minutes', 12720, 'cards', 3140, 'best_streak', 21, 'pass', 3), 5, '  Empezar los talleres el mismo día.  ', '2027-1');
  s := c.summary;
  if c.status <> 'closed' or c.closed_at is null then raise exception 'no cerró'; end if;
  if (s ->> 'avg')::numeric <> 3.6 then raise exception 'promedio: % (debe ser (4.4*4+2.8*4)/8 = 3.6)', s ->> 'avg'; end if;
  if (s ->> 'credits')::numeric <> 6 then raise exception 'créditos aprobados: % (4 aprobada + 2 homologada)', s ->> 'credits'; end if;
  if c.reflection <> 'Empezar los talleres el mismo día.' then raise exception 'reflexión: %', c.reflection; end if;
  if (select count(*) from public.subjects where term_id = t.id and archived) <> 2 then raise exception 'no archivó las materias del semestre'; end if;
  if (select count(*) from public.terms where status = 'open' and name = '2027-1') <> 1 then raise exception 'no abrió el siguiente'; end if;
  begin perform public.term_close(t.id, '{}'::jsonb, 5); raise exception 'cerró dos veces';
  exception when raise_exception then if sqlerrm not like 'Ese semestre ya está cerrado%' then raise; end if; end;
  raise notice 'ok 1 cerrar el semestre: promedio por créditos en el servidor, créditos aprobados, materias archivadas y el siguiente abierto';
end $$;
do $$ declare p public.terms; begin
  begin perform public.term_add_past('2026-1', jsonb_build_object('subjects', jsonb_build_array(jsonb_build_object('name', 'Química', 'credits', 3, 'grade', 6, 'status', 'aprobada'))), 5);
    raise exception 'aceptó una nota mayor que la máxima';
  exception when raise_exception then if sqlerrm not like 'La nota de Química debe estar entre 0 y 5%' then raise; end if; end;
  begin perform public.term_add_past('2026-1', jsonb_build_object('subjects', jsonb_build_array(jsonb_build_object('name', 'X', 'credits', 3, 'status', 'perdida'))), 5);
    raise exception 'aceptó un estado inventado';
  exception when raise_exception then if sqlerrm not like 'Estado no válido%' then raise; end if; end;
  p := public.term_add_past('2026-1', jsonb_build_object('subjects', jsonb_build_array(
    jsonb_build_object('name', 'Química', 'credits', 3, 'grade', 78, 'status', 'aprobada'),
    jsonb_build_object('name', 'Dibujo', 'credits', 2, 'grade', 90, 'status', 'aprobada'))), 100, '2026-02-02', '2026-06-06');
  if p.status <> 'closed' or (p.summary ->> 'avg')::numeric <> 82.8 or (p.summary ->> 'manual')::boolean is not true then raise exception 'semestre pasado: %', p.summary; end if;
  raise notice 'ok 2 semestres pasados a mano, con su propia escala, validados en el servidor';
end $$;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', false);
do $$ begin
  if exists (select 1 from public.terms) then raise exception 'otra persona ve semestres ajenos'; end if;
  begin perform public.term_close((select id from public.terms limit 1), '{}'::jsonb, 5); raise exception 'cerró algo ajeno';
  exception when raise_exception then if sqlerrm not like 'Ese semestre no existe%' then raise; end if; end;
  raise notice 'ok 3 cada quien ve y cierra solo sus semestres';
end $$;
reset role;
