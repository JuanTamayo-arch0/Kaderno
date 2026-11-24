-- =====================================================================
-- Kaderno · demo_cuenta_maxima.sql
--
-- Deja una cuenta YA CREADA lista para demos, con todo al máximo:
--   · Plan Equipo (el más alto) por 10 años, sin cobro automático.
--   · Las 4 mascotas adoptadas; el pingüino activo.
--   · Nivel 20 en todas (la corona, lo más alto de la tienda, pide nivel 10).
--   · 99.999 monedas en cada una.
--   · Toda la ropa (también la de temporada) y todo lo de la casa, comprado.
--   · Puesto lo mejor: corona, gafas de sol, bufanda, capa y lápiz; cuarto
--     con estrellas, piso de mármol, vista al espacio y todos los muebles.
--
-- Uso: en Supabase > SQL Editor, cambia el correo de la línea de abajo y
-- corre todo. Se puede correr varias veces. La persona recarga la app.
-- =====================================================================
do $$
declare
  v_email text := 'demo@kaderno.app';   -- <- el correo de la cuenta demo
  v_user  uuid;
  v_xp    int := 50 * 20 * 19;          -- nivel 20 (xpForLevel(20))
  v_items text[] := array[
    -- ropa
    'gorro','corbatin','collar','gafas','bufanda','boina','audifonos','gafas_sol','birrete','corona',
    'luces','gorro_navidad','gafas_corazon','antifaz','cuernos_reno','sombrero_bruja','sombrero_vueltiao',
    'lapiz','lapiz_oreja','taza','carne','lentes','corbata','mochila','maletin','diadema','capa',
    -- casa
    'papel_rayas','papel_ladrillo','papel_madera','papel_estrellas','piso_baldosa','piso_alfombrado','piso_marmol',
    'vista_montanas','vista_playa','vista_espacio','lampara','cojin','planta','alfombra','cuadro','estante'];
  v_home jsonb := '{"papel":"papel_estrellas","piso":"piso_marmol","vista":"vista_espacio",
                    "lampara":true,"cojin":true,"planta":true,"alfombra":true,"cuadro":true,"estante":true}';
  r record;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No existe una cuenta con el correo %. Créala primero en la app.', v_email;
  end if;

  -- Plan Equipo por 10 años, sin renovación ni cobro.
  insert into public.subscriptions (user_id, plan, period, status, current_period_end, trial_used, auto_renew, seats, updated_at)
  values (v_user, 'team', 'year', 'active', now() + interval '10 years', true, false, 1, now())
  on conflict (user_id) do update set plan = 'team', period = 'year', status = 'active',
    current_period_end = now() + interval '10 years', auto_renew = false, next_charge_at = null,
    retries = 0, last_error = null, updated_at = now();

  -- Las cuatro mascotas (si ya existen, se conservan sus nombres).
  update public.pets set active = false where user_id = v_user;
  insert into public.pets (user_id, species, name, outfit, coins, xp, active, home)
  values
    (v_user, 'pinguino', 'Pingu', '{"cabeza":"corona","ojos":"gafas_sol","cuello":"bufanda","espalda":"capa","mano":"lapiz"}', 99999, v_xp, true,  v_home),
    (v_user, 'gato',     'Michi', '{"cabeza":"birrete","ojos":"lentes","cuello":"corbatin","espalda":"mochila","mano":"taza"}', 99999, v_xp, false, v_home),
    (v_user, 'perro',    'Toby',  '{"cabeza":"audifonos","ojos":"gafas","cuello":"corbata","espalda":"capa","mano":"maletin"}', 99999, v_xp, false, v_home),
    (v_user, 'loro',     'Kiwi',  '{"cabeza":"sombrero_vueltiao","ojos":"gafas_corazon","cuello":"collar","mano":"lapiz"}', 99999, v_xp, false, v_home)
  on conflict (user_id, species) do update set coins = excluded.coins, xp = excluded.xp,
    outfit = excluded.outfit, home = excluded.home, active = excluded.active;

  -- Todo comprado para cada mascota.
  for r in select id from public.pets where user_id = v_user loop
    insert into public.pet_items (pet_id, user_id, item)
    select r.id, v_user, unnest(v_items)
    on conflict (pet_id, item) do nothing;
  end loop;

  raise notice 'Listo: % con plan %, 4 mascotas a nivel 20 y todo desbloqueado.', v_email, public.plan_of(v_user);
end $$;
