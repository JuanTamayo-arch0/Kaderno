-- Pruebas de supabase/schema_v22.sql, fase 4 (ropa de temporada). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
do $$ begin
  if not public._pet_season_ok('gorro', '2026-11-15') then raise exception 'el gorro normal no se vende'; end if;
  if public._pet_season_ok('gorro_navidad', '2026-11-15') then raise exception 'gorro navideño en noviembre'; end if;
  if not public._pet_season_ok('gorro_navidad', '2026-12-01') or not public._pet_season_ok('luces', '2027-01-06') then raise exception 'Navidad no cruza el año'; end if;
  if public._pet_season_ok('luces', '2027-01-07') then raise exception 'Navidad sigue el 7 de enero'; end if;
  if not public._pet_season_ok('sombrero_bruja', '2026-11-02') or public._pet_season_ok('sombrero_bruja', '2026-11-03') then raise exception 'Halloween mal'; end if;
  if not public._pet_season_ok('antifaz', '2027-02-14') or public._pet_season_ok('antifaz', '2027-03-11') then raise exception 'Carnaval mal'; end if;
  if (select price from public._pet_item('sombrero_vueltiao')) <> 220 then raise exception 'precio del vueltiao'; end if;
  if (select price from public._pet_item('papel_rayas')) <> 80 then raise exception 'se perdió la casa del catálogo'; end if;
  raise notice 'ok 1 fechas y catálogo';
end $$;

insert into auth.users (id, email) values ('95000000-0000-4000-8000-000000000005', 'temporada@upb.edu.co') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000005', false);
select id from public.pet_adopt('gato', 'Michi') \gset
reset role;
update public.pets set coins = 1000, xp = 1000 where user_id = '95000000-0000-4000-8000-000000000005';
select set_config('k.hoy', ((now() at time zone public._kaderno_tz('95000000-0000-4000-8000-000000000005'))::date)::text, false);
set role authenticated;
do $$ declare hoy date := current_setting('k.hoy')::date; p public.pets; it text; fuera text; begin
  -- Una prenda de temporada activa hoy (si hay) y una que no.
  select i into it from unnest(array['antifaz','sombrero_vueltiao','gafas_corazon','sombrero_bruja','gorro_navidad']) i where public._pet_season_ok(i, hoy) limit 1;
  select i into fuera from unnest(array['antifaz','sombrero_vueltiao','gafas_corazon','sombrero_bruja','gorro_navidad']) i where not public._pet_season_ok(i, hoy) limit 1;
  begin perform public.pet_buy(fuera); raise exception 'compró % fuera de temporada', fuera;
  exception when raise_exception then if sqlerrm not like 'Solo se vende en temporada de %' then raise; end if; end;
  if it is not null then
    p := public.pet_buy(it);
    if not exists (select 1 from public.pet_items where item = it) then raise exception 'no compró % en temporada', it; end if;
  end if;
  p := public.pet_buy('gorro');
  if p.outfit ->> 'cabeza' <> 'gorro' then raise exception 'la ropa de siempre dejó de venderse'; end if;
  raise notice 'ok 2 fuera de temporada no se vende; la de siempre sí';
end $$;
reset role;
-- Lo comprado se queda: se puede poner fuera de temporada.
insert into public.pet_items (pet_id, user_id, item) select id, user_id, 'cuernos_reno' from public.pets where user_id = '95000000-0000-4000-8000-000000000005' on conflict do nothing;
set role authenticated;
do $$ declare p public.pets; begin
  p := public.pet_wear((select id from public.pets where active), 'cabeza', 'cuernos_reno');
  if p.outfit ->> 'cabeza' <> 'cuernos_reno' then raise exception 'no se pudo poner lo comprado'; end if;
  raise notice 'ok 3 lo comprado se pone todo el año';
end $$;
reset role;
select 'PASARON' as v23_fase4;
