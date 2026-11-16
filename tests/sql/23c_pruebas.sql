-- Pruebas de supabase/schema_v23.sql, fase 5 (registro de horas). Corren sobre la base k16, después de 22_pruebas.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
grant select, insert, update, delete on public.focus_sessions to authenticated;  -- en Supabase ya viene así
select set_config('k.zenit', (select id::text from public.projects where name = 'Zenit' limit 1), false);
select set_config('k.ajeno', (select id::text from public.projects where name = 'Ajeno' limit 1), false);

set role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', false);
do $$ declare z uuid := current_setting('k.zenit')::uuid; a uuid := current_setting('k.ajeno')::uuid; r public.focus_sessions; begin
  insert into public.focus_sessions (user_id, minutes, project_id) values (auth.uid(), 25, z) returning * into r;
  if r.source <> 'focus' or r.project_id <> z then raise exception 'enfoque con proyecto: %', r; end if;
  insert into public.focus_sessions (user_id, minutes, project_id, created_at) values (auth.uid(), 25, z, now() - interval '30 days') returning * into r;
  if r.created_at < now() - interval '1 minute' then raise exception 'el enfoque se fechó en el pasado'; end if;
  insert into public.focus_sessions (user_id, minutes, project_id, source, note, created_at) values (auth.uid(), 90, z, 'manual', 'Reunión con el cliente', now() - interval '2 days') returning * into r;
  if r.created_at > now() - interval '1 day' then raise exception 'horas a mano sin su fecha'; end if;
  begin insert into public.focus_sessions (user_id, minutes, project_id) values (auth.uid(), 25, a); raise exception 'anotó tiempo en un proyecto ajeno';
  exception when raise_exception then if sqlerrm not like 'No eres parte%' then raise; end if; end;
  begin insert into public.focus_sessions (user_id, minutes, source) values (auth.uid(), 800, 'manual'); raise exception 'más de 12 horas';
  exception when raise_exception then if sqlerrm not like 'Las horas a mano%' then raise; end if; end;
  begin insert into public.focus_sessions (user_id, minutes, source, created_at) values (auth.uid(), 60, 'manual', now() + interval '3 days'); raise exception 'horas en el futuro';
  exception when raise_exception then if sqlerrm not like 'No se pueden anotar%' then raise; end if; end;
  raise notice 'ok 1 enfoque por proyecto con su hora real; horas a mano con fecha, tope y solo en proyectos propios';
end $$;

-- Horas del equipo: solo con plan Equipo y solo integrantes.
do $$ declare z uuid := current_setting('k.zenit')::uuid; begin
  begin perform * from public.project_hours(z, now() - interval '7 days', now() + interval '1 hour'); raise exception 'sin plan Equipo vio horas';
  exception when raise_exception then if sqlerrm not like 'Las horas de todo el equipo%' then raise; end if; end;
  raise notice 'ok 2 las horas del equipo piden el plan Equipo';
end $$;
reset role;
insert into public.subscriptions (user_id, plan, period, status, current_period_end, seats)
values ('91000000-0000-4000-8000-000000000001', 'team', 'month', 'active', now() + interval '10 days', 3)
on conflict (user_id) do update set plan = 'team', current_period_end = now() + interval '10 days', seats = 3;
insert into public.team_seats (owner_id, email) values ('91000000-0000-4000-8000-000000000001', 'ana@upb.edu.co') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
do $$ declare z uuid := current_setting('k.zenit')::uuid; r record; n int := 0; begin
  insert into public.focus_sessions (user_id, minutes, project_id) values (auth.uid(), 50, z);
  for r in select * from public.project_hours(z, now() - interval '7 days', now() + interval '1 hour') loop
    n := n + 1;
    if r.name = 'Ana María' and (r.minutes <> 140 or r.sessions <> 3) then raise exception 'Ana: %', r; end if;
    if r.name = 'Juan' and r.minutes <> 50 then raise exception 'Juan: %', r; end if;
  end loop;
  if n <> 2 then raise exception 'filas: %', n; end if;
  begin perform * from public.project_hours(current_setting('k.ajeno')::uuid, now() - interval '7 days', now()); raise exception 'vio horas de un proyecto ajeno';
  exception when raise_exception then if sqlerrm not like 'No eres parte%' then raise; end if; end;
  raise notice 'ok 3 con Equipo se ven las horas de cada integrante en el proyecto, no las de proyectos ajenos';
end $$;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', false);
do $$ begin
  if exists (select 1 from public.focus_sessions where user_id <> auth.uid()) then raise exception 've sesiones de otros'; end if;
  raise notice 'ok 4 nadie ve las sesiones de otros directamente';
end $$;
reset role;
