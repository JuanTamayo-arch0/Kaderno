-- Pruebas de supabase/schema_v19.sql, fase 4 (rituales y metas). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-0000000000f1', false);
do $$ declare mon date := date_trunc('week', current_date)::date; begin
  insert into public.week_plans (week_start, priorities, goal_days) values (mon, '[{"kind":"text","title":"Estudiar para el parcial"}]', 4);
  begin insert into public.week_plans (week_start) values (mon + 1); raise exception 'aceptó una semana que no empieza el lunes';
  exception when check_violation then null; end;
  begin update public.week_plans set priorities = '[1,2,3,4]' where week_start = mon; raise exception 'aceptó 4 prioridades';
  exception when check_violation then null; end;
  begin update public.week_plans set goal_days = 9 where week_start = mon; raise exception 'aceptó meta de 9 días';
  exception when check_violation then null; end;
  update public.week_plans set done_at = now() where week_start = mon;
  raise notice 'ok 1 plan de la semana con sus límites';
end $$;
do $$ declare s uuid; begin
  insert into public.goals (wish, target_grade) values ('Terminar el semestre con 4.0', 4.0);
  begin insert into public.goals (wish) values ('Otra meta del semestre'); raise exception 'dos metas activas del semestre';
  exception when unique_violation then null; end;
  update public.goals set status = 'done' where subject_id is null;
  insert into public.goals (wish) values ('Nueva meta del semestre');
  begin insert into public.goals (wish) values (''); raise exception 'aceptó una meta vacía';
  exception when check_violation then null; end;
  raise notice 'ok 2 una meta activa por materia (o del semestre)';
end $$;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000007', false);
do $$ begin
  if exists (select 1 from public.goals) or exists (select 1 from public.week_plans) then raise exception 've metas o planes ajenos'; end if;
  begin insert into public.goals (user_id, wish) values ('f1000000-0000-4000-8000-0000000000f1', 'x'); raise exception 'creó una meta a nombre de otro';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 3 nadie ve ni crea metas ajenas';
end $$;
reset role;
do $$ declare n int; t timestamptz; begin
  insert into public.user_prefs (user_id, settings) values ('d8000000-0000-4000-8000-000000000008', '{"notif": {"monday": true}}')
    on conflict (user_id) do update set settings = excluded.settings;
  -- Un lunes a las 8 am en Bogotá.
  t := ((date_trunc('week', now() at time zone 'America/Bogota') + interval '8 hours 5 minutes') at time zone 'America/Bogota');
  n := public.enqueue_week_plans(t);
  if n <> 1 then raise exception 'aviso del lunes: %', n; end if;
  if public.enqueue_week_plans(t) <> 0 then raise exception 'aviso repetido'; end if;
  if public.enqueue_week_plans(t + interval '1 day') <> 0 then raise exception 'avisó un martes'; end if;
  if (public.enqueue_all(t) ->> 'week') is null then raise exception 'enqueue_all sin el aviso de la semana'; end if;
  raise notice 'ok 4 aviso del lunes a las 8, una vez y solo con la opción';
end $$;
select 'PASARON' as fase4;
