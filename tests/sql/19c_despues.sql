-- Después de correr schema_v19.sql otra vez: el relleno no duplica ni borra protecciones.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
do $$ declare r public.study_days; t date := (now() at time zone 'America/Bogota')::date; begin
  select * into r from public.study_days where user_id = 'c7000000-0000-4000-8000-000000000007' and day = t - 9;
  if r.focus_min <> 10 then raise exception 'relleno duplicó el enfoque: %', r.focus_min; end if;
  select * into r from public.study_days where user_id = 'c7000000-0000-4000-8000-000000000007' and day = t;
  if r.cards <> 9 then raise exception 'relleno de tarjetas: %', r.cards; end if;
  select * into r from public.study_days where user_id = 'c7000000-0000-4000-8000-000000000007' and day = t - 2;
  if not r.protected then raise exception 'se perdió la protección'; end if;
  raise notice 'ok 12 correr la migración otra vez no duplica ni borra protecciones';
end $$;
