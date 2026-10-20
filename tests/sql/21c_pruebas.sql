-- Pruebas de supabase/schema_v21.sql, fase 3 (¿cómo te fue?). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
do $$ declare s uuid; a uuid; b uuid; begin
  insert into public.subjects (user_id, name) values ('f1000000-0000-4000-8000-0000000000f1', 'Física') returning id into s;
  insert into public.assignments (user_id, subject_id, title, due_date, type) values ('f1000000-0000-4000-8000-0000000000f1', s, 'Parcial 2', current_date - 2, 'examen') returning id into a;
  insert into public.assignments (user_id, title, due_date, type) values ('c7000000-0000-4000-8000-000000000007', 'Ajeno', current_date - 2, 'examen') returning id into b;
  perform set_config('k.s', s::text, false); perform set_config('k.a', a::text, false); perform set_config('k.b', b::text, false);
end $$;
grant select, insert, update, delete on public.grades to authenticated;  -- en Supabase ya viene así
set role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-0000000000f1', false);
do $$ declare g uuid; r uuid; begin
  insert into public.grades (user_id, subject_id, name, weight, score, max_score) values (auth.uid(), current_setting('k.s')::uuid, 'Parcial 2', 25, 3.4, 5) returning id into g;
  insert into public.exam_results (task_id, subject_id, title, score, max_score, felt, reasons, change, grade_id, focus_min)
  values (current_setting('k.a')::uuid, current_setting('k.s')::uuid, 'Parcial 2', 3.4, 5, 3, '{late,nerves}', 'Empezar el plan 14 días antes', g, 270) returning id into r;
  begin insert into public.exam_results (task_id, score) values (current_setting('k.a')::uuid, 4); raise exception 'aceptó dos resultados del mismo parcial';
  exception when unique_violation then null; end;
  begin insert into public.exam_results (task_id, score) values (current_setting('k.b')::uuid, 4); raise exception 'guardó el resultado de un parcial ajeno';
  exception when insufficient_privilege then null; end;
  begin update public.exam_results set score = 6 where id = r; raise exception 'aceptó una nota mayor que la escala';
  exception when check_violation then null; end;
  raise notice 'ok 1 un resultado por parcial propio, nota dentro de la escala';
end $$;
do $$ declare a2 uuid; begin
  insert into public.assignments (user_id, title, due_date, type) values (auth.uid(), 'Quiz 3', current_date - 1, 'quiz') returning id into a2;
  insert into public.exam_results (task_id, skipped) values (a2, true);
  begin
    insert into public.assignments (user_id, title, due_date, type) values (auth.uid(), 'Quiz 4', current_date - 1, 'quiz') returning id into a2;
    insert into public.exam_results (task_id) values (a2); raise exception 'aceptó sin nota ni "no lo presenté"';
  exception when check_violation then null; end;
  raise notice 'ok 2 "no lo presenté" sin nota; con nota obligatoria si lo presentó';
end $$;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000007', false);
do $$ begin
  if exists (select 1 from public.exam_results) then raise exception 've resultados ajenos'; end if;
  update public.exam_results set change = 'x';
  if (select count(*) from public.exam_results) <> 0 then raise exception 'raro'; end if;
  raise notice 'ok 3 nadie más ve tus resultados';
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.exam_results where change = 'Empezar el plan 14 días antes';
  if n <> 1 then raise exception 'el resultado no quedó guardado o lo cambió otra persona'; end if;
  delete from public.assignments where id = current_setting('k.a')::uuid;
  select count(*) into n from public.exam_results where task_id = current_setting('k.a')::uuid;
  if n <> 0 then raise exception 'quedó el resultado de un parcial borrado'; end if;
  raise notice 'ok 4 se borra con el parcial';
end $$;
select 'PASARON' as v22_fase3;
