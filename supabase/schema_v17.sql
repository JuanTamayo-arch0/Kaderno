-- =====================================================================
-- Kaderno · schema_v17.sql  (versión 18 de la app: la casa de la mascota)
--
-- Requiere schema_v16.sql. Es idempotente: se puede correr dos veces.
--
-- Cómo funciona:
--   · pets.home guarda la casa de cada mascota: papel de pared, piso, lo que
--     se ve por la ventana y qué muebles están puestos. Cada mascota tiene la
--     suya: al cambiar de mascota, cambia la casa.
--   · Las cosas de la casa se compran con pet_buy (como la ropa), con la moneda
--     de la mascota activa, y quedan en pet_items.
--   · pet_home pone o quita una cosa ya comprada.
-- =====================================================================

alter table public.pets add column if not exists home jsonb not null default '{}'::jsonb;

-- Catálogo: ropa (cabeza, ojos, cuello) y casa (papel, piso, vista, mueble).
create or replace function public._pet_item(p_item text, out price integer, out min_level integer, out slot text)
language sql immutable as $$
  select v.p, v.l, v.s from (values
    ('gorro', 60, 1, 'cabeza'), ('corbatin', 80, 1, 'cuello'), ('collar', 100, 1, 'cuello'),
    ('gafas', 120, 1, 'ojos'), ('bufanda', 150, 2, 'cuello'), ('boina', 200, 2, 'cabeza'),
    ('audifonos', 250, 3, 'cabeza'), ('gafas_sol', 300, 4, 'ojos'), ('birrete', 500, 6, 'cabeza'),
    ('corona', 1000, 10, 'cabeza'),
    ('papel_rayas', 80, 1, 'papel'), ('papel_ladrillo', 120, 1, 'papel'), ('papel_madera', 200, 2, 'papel'),
    ('papel_estrellas', 250, 3, 'papel'),
    ('piso_baldosa', 80, 1, 'piso'), ('piso_alfombrado', 120, 1, 'piso'), ('piso_marmol', 250, 3, 'piso'),
    ('vista_montanas', 150, 1, 'vista'), ('vista_playa', 200, 2, 'vista'), ('vista_espacio', 400, 5, 'vista'),
    ('lampara', 60, 1, 'mueble'), ('cojin', 60, 1, 'mueble'), ('planta', 70, 1, 'mueble'),
    ('alfombra', 90, 1, 'mueble'), ('cuadro', 100, 1, 'mueble'), ('estante', 120, 1, 'mueble')
  ) v(i, p, l, s) where v.i = p_item;
$$;

-- Comprar ropa o algo para la casa de la mascota activa. Se pone de una vez.
create or replace function public.pet_buy(p_item text) returns public.pets
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pet public.pets; v_it record;
begin
  if v_user is null then raise exception 'Inicia sesión.' using errcode = '42501'; end if;
  select * into v_it from public._pet_item(p_item);
  if v_it.price is null then raise exception 'Eso no está en la tienda.' using errcode = 'P0001'; end if;
  select * into v_pet from pets where user_id = v_user and active for update;
  if v_pet.id is null then raise exception 'Primero elige una mascota.' using errcode = 'P0001'; end if;
  if exists (select 1 from pet_items where pet_id = v_pet.id and item = p_item) then
    raise exception 'Ya la tienes.' using errcode = 'P0001';
  end if;
  if public.pet_level(v_pet.xp) < v_it.min_level then
    raise exception 'Se desbloquea en el nivel %.', v_it.min_level using errcode = 'P0001';
  end if;
  if v_pet.coins < v_it.price then
    raise exception 'Te faltan % monedas.', v_it.price - v_pet.coins using errcode = 'P0001';
  end if;
  insert into pet_items (pet_id, user_id, item) values (v_pet.id, v_user, p_item);
  insert into pet_ledger (user_id, pet_id, delta, reason, ref) values (v_user, v_pet.id, -v_it.price, 'compra', v_pet.id::text || ':' || p_item);
  if v_it.slot in ('cabeza', 'ojos', 'cuello') then
    update pets set coins = coins - v_it.price, outfit = outfit || jsonb_build_object(v_it.slot, p_item)
     where id = v_pet.id returning * into v_pet;
  elsif v_it.slot = 'mueble' then
    update pets set coins = coins - v_it.price, home = home || jsonb_build_object(p_item, true)
     where id = v_pet.id returning * into v_pet;
  else
    update pets set coins = coins - v_it.price, home = home || jsonb_build_object(v_it.slot, p_item)
     where id = v_pet.id returning * into v_pet;
  end if;
  return v_pet;
end $$;

-- Poner o quitar algo de la casa.
--   p_slot 'papel' | 'piso' | 'vista': p_item comprado, o null para volver al de siempre.
--   p_slot 'mueble': p_item comprado y p_on true (poner) o false (quitar).
create or replace function public.pet_home(p_pet uuid, p_slot text, p_item text, p_on boolean default true) returns public.pets
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pet public.pets; v_slot text;
begin
  if p_slot not in ('papel', 'piso', 'vista', 'mueble') then raise exception 'Lugar no válido.' using errcode = 'P0001'; end if;
  select * into v_pet from pets where id = p_pet and user_id = v_user for update;
  if v_pet.id is null then raise exception 'No encontré esa mascota.' using errcode = 'P0001'; end if;
  if p_item is null then
    if p_slot = 'mueble' then raise exception 'Falta el mueble.' using errcode = 'P0001'; end if;
    update pets set home = home - p_slot where id = p_pet returning * into v_pet;
    return v_pet;
  end if;
  select slot into v_slot from public._pet_item(p_item);
  if v_slot is distinct from p_slot then raise exception 'Eso no va ahí.' using errcode = 'P0001'; end if;
  if not exists (select 1 from pet_items where pet_id = p_pet and item = p_item) then
    raise exception 'Primero cómpralo.' using errcode = 'P0001';
  end if;
  if p_slot = 'mueble' then
    update pets set home = case when p_on then home || jsonb_build_object(p_item, true) else home - p_item end
     where id = p_pet returning * into v_pet;
  else
    update pets set home = home || jsonb_build_object(p_slot, p_item) where id = p_pet returning * into v_pet;
  end if;
  return v_pet;
end $$;

revoke all on function public.pet_home(uuid, text, text, boolean) from public, anon;
grant execute on function public.pet_home(uuid, text, text, boolean) to authenticated;
revoke all on function public.pet_buy(text) from public, anon;
grant execute on function public.pet_buy(text) to authenticated;
