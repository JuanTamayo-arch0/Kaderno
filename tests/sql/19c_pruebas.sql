-- Pruebas de supabase/schema_v19.sql, fase 2 (días de estudio, rachas y planes). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values
  ('c7000000-0000-4000-8000-000000000007', 'racha@x.co'),
  ('d8000000-0000-4000-8000-000000000008', 'repara@x.co'),
  ('e9000000-0000-4000-8000-000000000009', 'hueco@x.co')
on conflict do nothing;

-- Ayuda: un enfoque de m minutos el día (hoy - k) al mediodía.
create or replace function pg_temp.enf(u uuid, k int, m int) returns void language sql as $$
  insert into public.focus_sessions (user_id, minutes, created_at)
  values (u, m, ((((now() at time zone 'America/Bogota')::date - k)::timestamp + time '12:00') at time zone 'America/Bogota'));
$$;
create or replace function pg_temp.dia(u uuid, k int) returns public.study_days language sql as $$
  select * from public.study_days where user_id = u and day = (now() at time zone 'America/Bogota')::date - k;
$$;

do $$ declare r public.study_days; begin
  perform pg_temp.enf('c7000000-0000-4000-8000-000000000007', 9, 5);
  r := pg_temp.dia('c7000000-0000-4000-8000-000000000007', 9);
  if r.focus_min <> 5 or public._study_day_ok(r.user_id, r.day) then raise exception '5 min no deberían contar'; end if;
  perform pg_temp.enf('c7000000-0000-4000-8000-000000000007', 9, 5);
  r := pg_temp.dia('c7000000-0000-4000-8000-000000000007', 9);
  if r.focus_min <> 10 or not public._study_day_ok(r.user_id, r.day) then raise exception '10 min deberían contar: %', r.focus_min; end if;
  raise notice 'ok 1 un día cuenta desde 10 min de enfoque';
end $$;

do $$ declare k int; s int; begin
  for k in reverse 8..3 loop perform pg_temp.enf('c7000000-0000-4000-8000-000000000007', k, 25); end loop;
  select count into s from public.study_shields where user_id = 'c7000000-0000-4000-8000-000000000007';
  if s <> 1 then raise exception '7 días seguidos deberían dar un escudo: %', s; end if;
  perform pg_temp.enf('c7000000-0000-4000-8000-000000000007', 3, 25);
  select count into s from public.study_shields where user_id = 'c7000000-0000-4000-8000-000000000007';
  if s <> 1 then raise exception 'ganó dos veces el mismo día: %', s; end if;
  raise notice 'ok 2 se gana un escudo cada 7 días seguidos';
end $$;

do $$ declare s int; begin
  perform pg_temp.enf('c7000000-0000-4000-8000-000000000007', 1, 30);
  if not (pg_temp.dia('c7000000-0000-4000-8000-000000000007', 2)).protected then raise exception 'el escudo no protegió el día perdido'; end if;
  select count into s from public.study_shields where user_id = 'c7000000-0000-4000-8000-000000000007';
  if s <> 0 then raise exception 'el escudo no se gastó: %', s; end if;
  if public._study_streak_at('c7000000-0000-4000-8000-000000000007', (now() at time zone 'America/Bogota')::date - 1) <> 9 then
    raise exception 'racha con escudo: %', public._study_streak_at('c7000000-0000-4000-8000-000000000007', (now() at time zone 'America/Bogota')::date - 1);
  end if;
  raise notice 'ok 3 el escudo se usa solo y la racha sigue';
end $$;

do $$ begin
  for k in reverse 5..2 loop perform pg_temp.enf('d8000000-0000-4000-8000-000000000008', k, 15); end loop;
  perform pg_temp.enf('d8000000-0000-4000-8000-000000000008', 0, 20);
  if (pg_temp.dia('d8000000-0000-4000-8000-000000000008', 1)).protected is true then raise exception 'reparó sin hacer el doble'; end if;
  insert into public.focus_sessions (user_id, minutes) values ('d8000000-0000-4000-8000-000000000008', 30);
  if (pg_temp.dia('d8000000-0000-4000-8000-000000000008', 1)).protected is not true then raise exception 'no reparó con 50 min'; end if;
  if public._study_streak_at('d8000000-0000-4000-8000-000000000008', (now() at time zone 'America/Bogota')::date) <> 6 then raise exception 'racha reparada'; end if;
  raise notice 'ok 4 reparar: el doble hoy protege el día perdido';
end $$;

do $$ begin
  perform pg_temp.enf('e9000000-0000-4000-8000-000000000009', 6, 15);
  insert into public.study_shields (user_id, count) values ('e9000000-0000-4000-8000-000000000009', 2) on conflict (user_id) do update set count = 2;
  perform pg_temp.enf('e9000000-0000-4000-8000-000000000009', 2, 60);
  if (select count from public.study_shields where user_id = 'e9000000-0000-4000-8000-000000000009') <> 2 then raise exception 'gastó escudos en un hueco de 3 días'; end if;
  if exists (select 1 from public.study_days where user_id = 'e9000000-0000-4000-8000-000000000009' and protected) then raise exception 'protegió un hueco de 3 días'; end if;
  raise notice 'ok 5 un hueco de 3 días no se tapa';
end $$;

do $$ declare t uuid; c uuid; i int; begin
  insert into public.assignments (user_id, title, status, created_at) values ('c7000000-0000-4000-8000-000000000007', 'Informe', 'pending', now() - interval '1 day') returning id into t;
  update public.assignments set status = 'done' where id = t;
  if (pg_temp.dia('c7000000-0000-4000-8000-000000000007', 0)).tasks_done <> 1 then raise exception 'no contó la tarea'; end if;
  update public.assignments set status = 'pending' where id = t;
  if (pg_temp.dia('c7000000-0000-4000-8000-000000000007', 0)).tasks_done <> 0 then raise exception 'no descontó la tarea'; end if;
  insert into public.flashcards (user_id, front, back) values ('c7000000-0000-4000-8000-000000000007', 'p', 'r') returning id into c;
  for i in 1..10 loop insert into public.flashcard_reviews (user_id, card_id, rating) values ('c7000000-0000-4000-8000-000000000007', c, 3); end loop;
  if (pg_temp.dia('c7000000-0000-4000-8000-000000000007', 0)).cards <> 10 then raise exception 'tarjetas: %', (pg_temp.dia('c7000000-0000-4000-8000-000000000007', 0)).cards; end if;
  delete from public.flashcard_reviews where id = (select max(id) from public.flashcard_reviews where user_id = 'c7000000-0000-4000-8000-000000000007');
  if (pg_temp.dia('c7000000-0000-4000-8000-000000000007', 0)).cards <> 9 then raise exception 'deshacer no descontó'; end if;
  raise notice 'ok 6 tareas y tarjetas cuentan (y deshacer descuenta)';
end $$;

insert into public.user_prefs (user_id, settings) values ('c7000000-0000-4000-8000-000000000007', '{"study": {"weeklyGoal": 5}}')
  on conflict (user_id) do update set settings = excluded.settings;
grant select on public.user_prefs to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000007', false);
do $$ declare j jsonb; n int; begin
  j := public.study_streaks();
  if (j ->> 'goal')::int <> 5 or (j ->> 'daily')::int <> 9 or (j ->> 'shields')::int <> 0 then raise exception 'study_streaks: %', j; end if;
  if (j ->> 'weekly') is null then raise exception 'falta la racha semanal'; end if;
  select count(*) into n from public.study_days;
  if n < 9 then raise exception 'no ve sus días: %', n; end if;
  begin insert into public.study_days (user_id, day, focus_min) values (auth.uid(), current_date + 30, 999); raise exception 'escribió en study_days';
  exception when insufficient_privilege then null; end;
  begin update public.study_shields set count = 2; exception when insufficient_privilege then null; end;
  if (select count from public.study_shields) <> 0 then raise exception 'se regaló escudos'; end if;
  raise notice 'ok 7 rachas desde la base y nada se escribe desde el navegador';
end $$;

select set_config('request.jwt.claim.sub', 'd8000000-0000-4000-8000-000000000008', false);
do $$ declare n int; begin
  select count(*) into n from public.study_days where user_id = 'c7000000-0000-4000-8000-000000000007';
  if n <> 0 then raise exception 've días ajenos'; end if;
  begin perform public.study_buy_shield(); raise exception 'compró sin mascota';
  exception when raise_exception then if sqlerrm not like 'Primero elige%' then raise; end if; end;
  raise notice 'ok 8 nadie ve días ajenos ni compra sin mascota';
end $$;
reset role;
insert into public.pets (user_id, species, name, coins, active) values ('d8000000-0000-4000-8000-000000000008', 'gato', 'Michi', 100, true);
set role authenticated;
do $$ declare s int; begin
  s := public.study_buy_shield();
  if s <> 1 or (select coins from public.pets where user_id = auth.uid()) <> 20 then raise exception 'compra: % escudos', s; end if;
  begin perform public.study_buy_shield(); raise exception 'compró sin monedas';
  exception when raise_exception then if sqlerrm not like 'Te faltan%' then raise; end if; end;
  raise notice 'ok 9 comprar escudo por 80 monedas';
end $$;
reset role;
update public.pets set coins = 500 where user_id = 'd8000000-0000-4000-8000-000000000008';
update public.study_shields set count = 2 where user_id = 'd8000000-0000-4000-8000-000000000008';
set role authenticated;
do $$ begin
  begin perform public.study_buy_shield(); raise exception 'pasó el tope de 2';
  exception when raise_exception then if sqlerrm not like 'Ya tienes 2%' then raise; end if; end;
  raise notice 'ok 10 máximo 2 escudos';
end $$;
reset role;

do $$ declare t uuid; n int; j jsonb; begin
  insert into public.assignments (user_id, title, status, plan_at, plan_place) values
    ('c7000000-0000-4000-8000-000000000007', 'Taller 3', 'pending', now() - interval '5 minutes', 'Biblioteca') returning id into t;
  insert into public.assignments (user_id, title, status, plan_at) values
    ('c7000000-0000-4000-8000-000000000007', 'Viejo', 'pending', now() - interval '2 hours');
  j := public.enqueue_all(now());
  if (j ->> 'plans')::int <> 1 then raise exception 'avisos de plan: %', j; end if;
  perform public.enqueue_plans(now());
  select count(*) into n from public.notification_queue where kind = 'plan' and user_id = 'c7000000-0000-4000-8000-000000000007';
  if n <> 1 then raise exception 'aviso repetido: %', n; end if;
  if not exists (select 1 from public.notification_queue where kind = 'plan' and body like 'En la biblioteca%' and url = '/enfoque?tarea=' || t::text) then raise exception 'texto del aviso'; end if;
  begin update public.assignments set plan_place = repeat('x', 41) where id = t; raise exception 'lugar muy largo';
  exception when check_violation then null; end;
  raise notice 'ok 11 aviso a la hora del plan, una sola vez';
end $$;

select 'PASARON' as fase2;
