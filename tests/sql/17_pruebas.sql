-- Pruebas de supabase/schema_v17.sql (casa de la mascota). Corren sobre la base k16 ya probada.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
update public.pets set coins = 1000, xp = 300 where species = 'pinguino';  -- nivel 3
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);

do $$ declare p public.pets; v uuid; begin
  select id into v from public.pets where species = 'pinguino';
  p := public.pet_activate(v);
  p := public.pet_buy('papel_rayas');
  if p.coins <> 920 or p.home ->> 'papel' <> 'papel_rayas' then raise exception 'compra de papel mal: % %', p.coins, p.home; end if;
  p := public.pet_buy('lampara');
  if p.coins <> 860 or (p.home -> 'lampara')::boolean is not true then raise exception 'compra de lámpara mal: %', p.home; end if;
  p := public.pet_buy('corbatin');
  if p.outfit ->> 'cuello' <> 'corbatin' or p.home ? 'cuello' then raise exception 'la ropa quedó en la casa'; end if;
  raise notice 'ok 1 comprar para la casa y ropa';
end $$;

do $$ declare p public.pets; v uuid; begin
  select id into v from public.pets where active;
  p := public.pet_home(v, 'mueble', 'lampara', false);
  if p.home ? 'lampara' then raise exception 'no se quitó la lámpara'; end if;
  p := public.pet_home(v, 'mueble', 'lampara', true);
  if (p.home -> 'lampara')::boolean is not true then raise exception 'no se volvió a poner'; end if;
  p := public.pet_home(v, 'papel', null);
  if p.home ? 'papel' then raise exception 'no volvió a la pared de siempre'; end if;
  p := public.pet_home(v, 'papel', 'papel_rayas');
  if p.home ->> 'papel' <> 'papel_rayas' then raise exception 'no volvió a poner el papel'; end if;
  raise notice 'ok 2 poner y quitar';
end $$;

do $$ declare v uuid; begin
  select id into v from public.pets where active;
  begin perform public.pet_home(v, 'piso', 'piso_marmol'); raise exception 'puso algo sin comprar';
  exception when raise_exception then if sqlerrm <> 'Primero cómpralo.' then raise; end if; end;
  begin perform public.pet_home(v, 'piso', 'papel_rayas'); raise exception 'puso papel en el piso';
  exception when raise_exception then if sqlerrm <> 'Eso no va ahí.' then raise; end if; end;
  begin perform public.pet_wear(v, 'cabeza', 'lampara'); raise exception 'se puso la lámpara de sombrero';
  exception when raise_exception then if sqlerrm <> 'Esa prenda no va ahí.' then raise; end if; end;
  begin perform public.pet_buy('vista_espacio'); raise exception 'compró el espacio en nivel 3';
  exception when raise_exception then if sqlerrm <> 'Se desbloquea en el nivel 5.' then raise; end if; end;
  begin perform public.pet_buy('sofa'); raise exception 'compró algo que no existe';
  exception when raise_exception then if sqlerrm <> 'Eso no está en la tienda.' then raise; end if; end;
  raise notice 'ok 3 reglas';
end $$;

-- Cada mascota tiene su casa
do $$ declare g public.pets; begin
  g := public.pet_activate((select id from public.pets where species = 'gato'));
  if g.home ? 'papel' or g.home ? 'lampara' then raise exception 'el gato heredó la casa del pingüino'; end if;
  raise notice 'ok 4 una casa por mascota';
end $$;

reset role;
do $$ declare v uuid; begin
  select id into v from public.pets where species = 'pinguino';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
  begin perform public.pet_home(v, 'papel', null); raise exception 'B cambió la casa de A';
  exception when raise_exception then if sqlerrm <> 'No encontré esa mascota.' then raise; end if; end;
  raise notice 'ok 5 sin tocar casas ajenas';
end $$;

select 'TODAS LAS PRUEBAS DE V17 PASARON' as resultado;
