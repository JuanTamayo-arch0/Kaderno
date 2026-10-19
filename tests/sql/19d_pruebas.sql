-- Pruebas de supabase/schema_v19.sql, fase 3 (plan del parcial, simulacro, ponme a prueba). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
-- La base de prueba no corre schema_v6 (tipos de tarea).
alter table public.assignments add column if not exists type text default 'tarea';
insert into auth.users (id, email) values ('f1000000-0000-4000-8000-0000000000f1', 'parcial@x.co') on conflict do nothing;

do $$ declare ex uuid; s1 uuid; s2 uuid; other uuid; begin
  insert into public.assignments (user_id, title, status, type, due_date) values ('f1000000-0000-4000-8000-0000000000f1', 'Parcial 3', 'pending', 'examen', current_date + 10) returning id into ex;
  insert into public.assignments (user_id, title, status, type, due_date) values ('c7000000-0000-4000-8000-000000000007', 'Ajeno', 'pending', 'examen', current_date + 10) returning id into other;
  begin
    insert into public.assignments (user_id, title, status, type, parent_id) values ('f1000000-0000-4000-8000-0000000000f1', 'Colada', 'pending', 'repaso', other);
    raise exception 'colgó una sesión de un examen ajeno';
  exception when insufficient_privilege then null; end;
  insert into public.assignments (user_id, title, status, type, parent_id, session_kind, estimate_min) values
    ('f1000000-0000-4000-8000-0000000000f1', 'Preparar · Parcial 3', 'pending', 'repaso', ex, 'prep', 50) returning id into s1;
  insert into public.assignments (user_id, title, status, type, parent_id, session_kind, estimate_min) values
    ('f1000000-0000-4000-8000-0000000000f1', 'Simulacro · Parcial 3', 'pending', 'repaso', ex, 'sim', 50) returning id into s2;
  begin update public.assignments set session_kind = 'otra' where id = s1; raise exception 'aceptó un tipo de sesión raro';
  exception when check_violation then null; end;
  insert into public.focus_sessions (user_id, minutes, assignment_id) values ('f1000000-0000-4000-8000-0000000000f1', 25, s1);
  if (select status from public.assignments where id = s1) = 'done' then raise exception 'se marcó hecha con la mitad'; end if;
  insert into public.focus_sessions (user_id, minutes, assignment_id) values ('f1000000-0000-4000-8000-0000000000f1', 25, s1);
  if (select status from public.assignments where id = s1) <> 'done' then raise exception 'no se marcó hecha al llegar a 50 min'; end if;
  insert into public.focus_sessions (user_id, minutes, assignment_id) values ('f1000000-0000-4000-8000-0000000000f1', 60, s2);
  if (select status from public.assignments where id = s2) = 'done' then raise exception 'el simulacro se marcó solo con enfoque'; end if;
  raise notice 'ok 1 sesiones ligadas al examen y hechas solas al cumplir el enfoque';
  delete from public.assignments where id = ex;
  if exists (select 1 from public.assignments where parent_id = ex or id in (s1, s2)) then raise exception 'borrar el examen dejó sesiones'; end if;
  raise notice 'ok 2 borrar el examen borra sus sesiones';
end $$;

grant select, update on public.notes to authenticated;
do $$ declare n uuid; begin
  insert into public.notes (user_id, title, content) values ('f1000000-0000-4000-8000-0000000000f1', 'Leyes de Newton', 'F = m a') returning id into n;
  perform set_config('k.nota', n::text, false);
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-0000000000f1', false);
do $$ declare t int; q uuid; begin
  select coalesce(tests, 0) into t from public.study_days where user_id = auth.uid() and day = (now() at time zone 'America/Bogota')::date;
  insert into public.quizzes (questions, answers, score, scale, pct, duration_sec) values ('[{"type":"mc"}]', '[{"verdict":"ok"}]', 4.2, 5, 84, 300) returning id into q;
  update public.quizzes set answers = '[{"verdict":"partial"}]', pct = 50 where id = q;
  update public.notes set last_recall_at = now(), last_recall_score = 70 where id = current_setting('k.nota')::uuid;
  begin update public.notes set last_recall_score = 120 where id = current_setting('k.nota')::uuid; raise exception 'aceptó 120 %%';
  exception when check_violation then null; end;
  if (select tests from public.study_days where user_id = auth.uid() and day = (now() at time zone 'America/Bogota')::date) <> coalesce(t, 0) + 2 then
    raise exception 'el simulacro y la prueba no contaron';
  end if;
  raise notice 'ok 3 simulacro y "Ponme a prueba" cuentan para el día';
end $$;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000007', false);
do $$ declare n int; begin
  select count(*) into n from public.quizzes;
  if n <> 0 then raise exception 've simulacros ajenos'; end if;
  begin insert into public.quizzes (user_id, questions) values ('f1000000-0000-4000-8000-0000000000f1', '[]'); raise exception 'creó un simulacro a nombre de otro';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 4 nadie ve ni crea simulacros ajenos';
end $$;
reset role;
select 'PASARON' as fase3;
