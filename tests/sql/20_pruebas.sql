-- Pruebas de supabase/schema_v20.sql, fase 1 (organizar el día). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
-- La base de prueba no corre schema_v10 (pasos de las tareas).
create table if not exists public.assignment_steps (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  assignment_id uuid not null references public.assignments on delete cascade, title text not null,
  done boolean not null default false, position int not null default 0);

do $$ declare t date := (now() at time zone 'America/Bogota')::date; begin
  -- Mismas reglas que lib/repeat.ts
  if public._repeat_next('{"freq":"week","interval":1,"days":[1,2,3,4,5]}', date '2026-10-23', date '2026-10-23', date '2026-10-23') <> date '2026-10-26' then raise exception 'días hábiles'; end if;
  if public._repeat_next('{"freq":"week","interval":2,"days":[1,3]}', date '2026-10-21', date '2026-10-21', date '2026-10-21') <> date '2026-11-02' then raise exception 'cada 2 semanas'; end if;
  if public._repeat_next('{"freq":"month","interval":1,"monthDay":31}', date '2027-01-31', date '2027-01-31', date '2027-01-31') <> date '2027-02-28' then raise exception 'fin de mes'; end if;
  if public._repeat_next('{"freq":"week","interval":1,"days":[2]}', date '2026-10-06', date '2026-10-19', date '2026-10-19') <> date '2026-10-20' then raise exception 'atrasada'; end if;
  if public._repeat_next('{"freq":"day","interval":3,"fromDone":true}', date '2026-10-10', date '2026-10-19', date '2026-10-19') <> date '2026-10-22' then raise exception 'desde que la termino'; end if;
  if public._repeat_next('{"freq":"week","interval":1,"days":[1],"until":"2026-10-30"}', date '2026-10-26', date '2026-10-26', date '2026-10-26') is not null then raise exception 'hasta'; end if;
  raise notice 'ok 1 la siguiente fecha coincide con lib/repeat.ts';
end $$;

do $$ declare a uuid; n int; nxt record; s uuid; begin
  insert into public.assignments (user_id, title, status, type, due_date, estimate_min, repeat_rule, created_at)
  values ('f1000000-0000-4000-8000-0000000000f1', 'Lab de física', 'pending', 'tarea', (now() at time zone 'America/Bogota')::date, 60, '{"freq":"week","interval":1}', now() - interval '1 day')
  returning id into a;
  insert into public.assignment_steps (user_id, assignment_id, title, done, position) values ('f1000000-0000-4000-8000-0000000000f1', a, 'Preinforme', true, 0);
  update public.assignments set status = 'done' where id = a;
  update public.assignments set status = 'pending' where id = a;
  update public.assignments set status = 'done' where id = a;
  select count(*) into n from public.assignments where repeat_parent_id = a;
  if n <> 1 then raise exception 'se crearon % repeticiones', n; end if;
  select * into nxt from public.assignments where repeat_parent_id = a;
  if nxt.due_date <> (now() at time zone 'America/Bogota')::date + 7 or nxt.status <> 'pending' or nxt.estimate_min <> 60 then raise exception 'siguiente: % %', nxt.due_date, nxt.status; end if;
  if (select done from public.assignment_steps where assignment_id = nxt.id) is not false then raise exception 'los pasos no quedaron sin marcar'; end if;
  raise notice 'ok 2 una sola siguiente aunque se marque dos veces, con pasos sin marcar';
  perform set_config('k.rep', nxt.id::text, false);
end $$;

grant select on public.assignments to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000007', false);
do $$ begin
  begin perform public.skip_repeat(current_setting('k.rep')::uuid); raise exception 'saltó una tarea ajena';
  exception when raise_exception then if sqlerrm not like 'No encontré%' then raise; end if; end;
  raise notice 'ok 3 nadie salta tareas ajenas';
end $$;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-0000000000f1', false);
do $$ declare nid uuid; r record; begin
  nid := public.skip_repeat(current_setting('k.rep')::uuid);
  select * into r from public.assignments where id = current_setting('k.rep')::uuid;
  if r.deleted_at is null or r.status = 'done' then raise exception 'saltar: % %', r.deleted_at, r.status; end if;
  if nid is null then raise exception 'saltar no creó la siguiente'; end if;
  insert into public.day_reviews (day, done, moved, note) values ((now() at time zone 'America/Bogota')::date, '{"tasks":2}', '[]', 'Aprendí Bernoulli');
  begin insert into public.day_reviews (day, note) values (current_date - 1, repeat('x', 501)); raise exception 'nota muy larga';
  exception when check_violation then null; end;
  raise notice 'ok 4 saltar esta vez (a la papelera, sin contar como hecha) y cierre del día';
end $$;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000007', false);
do $$ begin
  if exists (select 1 from public.day_reviews) then raise exception 've cierres ajenos'; end if;
  raise notice 'ok 5 cierres del día privados';
end $$;
reset role;
do $$ declare t timestamptz; begin
  insert into public.user_prefs (user_id, settings) values ('e9000000-0000-4000-8000-000000000009', '{"notif": {"close": true, "close_hour": 20}}')
    on conflict (user_id) do update set settings = excluded.settings;
  t := (((now() at time zone 'America/Bogota')::date + time '20:05') at time zone 'America/Bogota');
  if public.enqueue_day_close(t) <> 1 or public.enqueue_day_close(t) <> 0 then raise exception 'aviso de cierre'; end if;
  if public.enqueue_day_close(t + interval '1 hour') <> 0 then raise exception 'avisó a otra hora'; end if;
  if (public.enqueue_all(t) ->> 'close') is null then raise exception 'enqueue_all sin cierre'; end if;
  begin update public.assignments set plan_band = 'madrugada' where user_id = 'f1000000-0000-4000-8000-0000000000f1'; raise exception 'franja rara';
  exception when check_violation then null; end;
  raise notice 'ok 6 aviso de cierre a su hora, una vez';
end $$;
select 'PASARON' as v21_fase1;
