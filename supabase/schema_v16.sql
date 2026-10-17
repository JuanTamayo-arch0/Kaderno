-- =====================================================================
-- Kaderno · schema_v16.sql  (versión 17 de la app: mascotas de estudio)
--
-- Requiere schema_v2 (focus_sessions, flashcards), schema_v9 (user_prefs)
-- y schema_v14 (completed_at, deleted_at y _kaderno_tz). Es idempotente:
-- se puede correr dos veces.
--
-- Cómo funciona:
--   · pets: una fila por mascota adoptada (una por especie). Cada una tiene
--     su moneda, su experiencia y su ropa. Solo una está activa.
--   · Las monedas las suma SOLO la base, con disparadores sobre lo que la
--     app ya guarda: terminar una tarea, una sesión de enfoque, repasar
--     tarjetas. El navegador no puede escribir en estas tablas.
--   · pet_ledger guarda cada ganancia o gasto con (motivo, referencia)
--     únicos: una misma tarea o sesión no paga dos veces.
--   · pet_daily lleva lo ganado por día (tope de 300) y los repasos.
--   · Comprar, vestir, adoptar, activar y renombrar van por funciones.
--   · pet_achievements() calcula los logros, paga los nuevos (fuera del tope
--     diario) y devuelve el avance de cada uno.
-- =====================================================================

-- ---------- Tablas ----------
create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  species text not null check (species in ('pinguino', 'gato', 'perro', 'loro')),
  name text not null check (char_length(name) between 1 and 24),
  outfit jsonb not null default '{}'::jsonb,
  coins integer not null default 0 check (coins >= 0),
  xp integer not null default 0 check (xp >= 0),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, species)
);
create unique index if not exists pets_one_active_idx on public.pets (user_id) where active;

create table if not exists public.pet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  pet_id uuid references public.pets on delete set null,
  delta integer not null,
  reason text not null,
  ref text not null,
  created_at timestamptz not null default now(),
  unique (user_id, reason, ref)
);
create index if not exists pet_ledger_user_idx on public.pet_ledger (user_id, created_at desc);

create table if not exists public.pet_items (
  pet_id uuid not null references public.pets on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  item text not null,
  bought_at timestamptz not null default now(),
  primary key (pet_id, item)
);

create table if not exists public.pet_daily (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  earned integer not null default 0,
  reviews integer not null default 0,
  primary key (user_id, day)
);

create table if not exists public.pet_reviews (
  user_id uuid not null references auth.users on delete cascade,
  card_id uuid not null,
  day date not null,
  primary key (user_id, card_id, day)
);

-- ---------- Seguridad: solo lectura de lo propio ----------
alter table public.pets        enable row level security;
alter table public.pet_ledger  enable row level security;
alter table public.pet_items   enable row level security;
alter table public.pet_daily   enable row level security;
alter table public.pet_reviews enable row level security;

drop policy if exists "pets: ver las mías" on public.pets;
create policy "pets: ver las mías" on public.pets for select using (auth.uid() = user_id);
drop policy if exists "pet_ledger: ver lo mío" on public.pet_ledger;
create policy "pet_ledger: ver lo mío" on public.pet_ledger for select using (auth.uid() = user_id);
drop policy if exists "pet_items: ver lo mío" on public.pet_items;
create policy "pet_items: ver lo mío" on public.pet_items for select using (auth.uid() = user_id);
drop policy if exists "pet_daily: ver lo mío" on public.pet_daily;
create policy "pet_daily: ver lo mío" on public.pet_daily for select using (auth.uid() = user_id);
-- pet_reviews no tiene políticas: solo la usa la base.

-- ---------- Reglas (las mismas que lib/pets/economy.ts) ----------
create or replace function public.pet_level(p_xp integer) returns integer
language sql immutable as $$
  -- Nivel n necesita 50 * n * (n - 1) de experiencia.
  select greatest(1, floor((1 + sqrt(1 + (8 * greatest(p_xp, 0))::numeric / 100)) / 2)::int);
$$;

create or replace function public._pet_item(p_item text, out price integer, out min_level integer, out slot text)
language sql immutable as $$
  select v.p, v.l, v.s from (values
    ('gorro', 60, 1, 'cabeza'), ('corbatin', 80, 1, 'cuello'), ('collar', 100, 1, 'cuello'),
    ('gafas', 120, 1, 'ojos'), ('bufanda', 150, 2, 'cuello'), ('boina', 200, 2, 'cabeza'),
    ('audifonos', 250, 3, 'cabeza'), ('gafas_sol', 300, 4, 'ojos'), ('birrete', 500, 6, 'cabeza'),
    ('corona', 1000, 10, 'cabeza')
  ) v(i, p, l, s) where v.i = p_item;
$$;

create or replace function public._pet_adopt_price(p_owned integer) returns integer
language sql immutable as $$
  select case when p_owned <= 0 then 0 when p_owned = 1 then 600 when p_owned = 2 then 1000 else 1500 end;
$$;

-- ---------- Ganar (solo desde la base) ----------
-- Suma p_amount a la mascota activa respetando el tope diario de 300.
-- Con p_amount = 0 solo deja la marca para que esa referencia no pague después.
create or replace function public._pet_award(p_user uuid, p_reason text, p_ref text, p_amount integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_pet uuid; v_day date; v_earned integer; v_amt integer; v_first boolean; v_streak integer := 1; i integer;
begin
  if p_user is null or p_amount is null or p_amount < 0 then return 0; end if;
  select id into v_pet from pets where user_id = p_user and active;
  if v_pet is null then return 0; end if;
  v_day := (now() at time zone public._kaderno_tz(p_user))::date;
  insert into pet_daily (user_id, day) values (p_user, v_day) on conflict do nothing;
  select earned into v_earned from pet_daily where user_id = p_user and day = v_day for update;
  v_first := v_earned = 0;
  v_amt := greatest(0, least(p_amount, 300 - v_earned));
  insert into pet_ledger (user_id, pet_id, delta, reason, ref) values (p_user, v_pet, v_amt, p_reason, p_ref)
    on conflict (user_id, reason, ref) do nothing;
  if not found then return 0; end if;
  if v_amt > 0 then
    update pets set coins = coins + v_amt, xp = xp + v_amt where id = v_pet;
    update pet_daily set earned = earned + v_amt where user_id = p_user and day = v_day;
    -- Primera ganancia del día: premio por racha (días seguidos ganando algo).
    if v_first and p_reason <> 'racha' then
      for i in 1..6 loop
        exit when not exists (select 1 from pet_daily where user_id = p_user and day = v_day - i and earned > 0);
        v_streak := v_streak + 1;
      end loop;
      perform public._pet_award(p_user, 'racha', v_day::text, 5 * v_streak);
    end if;
  end if;
  return v_amt;
end $$;

-- Tarea personal marcada como hecha (la primera vez).
create or replace function public._pet_on_task_done() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tz text; v_day date; v_due timestamptz; v_amt integer; v_task_day date;
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.deleted_at is null then
    begin
      v_tz := public._kaderno_tz(new.user_id);
      v_day := (now() at time zone v_tz)::date;
      v_due := coalesce(new.due_at, case when new.due_date is not null then ((new.due_date + 1)::timestamp at time zone v_tz) end);
      -- Crear y marcar enseguida no paga (evita crear tareas solo para ganar).
      if new.created_at is not null and now() - new.created_at < interval '1 minute' then v_amt := 0;
      elsif v_due is null or now() <= v_due then v_amt := 5;
      else v_amt := 2; end if;
      perform public._pet_award(new.user_id, 'tarea', new.id::text, v_amt);
      -- ¿Era lo último de hoy (o vencido)? Premio por terminar el día.
      v_task_day := coalesce((new.due_at at time zone v_tz)::date, new.due_date);
      if v_task_day is not null and v_task_day <= v_day and not exists (
        select 1 from assignments a
         where a.user_id = new.user_id and a.id <> new.id and a.deleted_at is null
           and a.status is distinct from 'done'
           and coalesce((a.due_at at time zone v_tz)::date, a.due_date) <= v_day
      ) then
        perform public._pet_award(new.user_id, 'dia', v_day::text, 10);
      end if;
    exception when others then
      raise warning 'mascota: no se pudo premiar la tarea %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists assignments_pet_trg on public.assignments;
create trigger assignments_pet_trg after update of status on public.assignments
  for each row execute function public._pet_on_task_done();

-- Sesión de enfoque guardada: 1 por minuto (máximo 180 por sesión).
create or replace function public._pet_on_focus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._pet_award(new.user_id, 'enfoque', new.id::text, least(greatest(coalesce(new.minutes, 0), 0), 180));
  exception when others then
    raise warning 'mascota: no se pudo premiar el enfoque %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists focus_sessions_pet_trg on public.focus_sessions;
create trigger focus_sessions_pet_trg after insert on public.focus_sessions
  for each row execute function public._pet_on_focus();

-- Tarjeta repasada (cambia su fecha): 3 por cada 10 tarjetas distintas del día.
create or replace function public._pet_on_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_day date; v_n integer;
begin
  if new.due_date is distinct from old.due_date then
    begin
      v_day := (now() at time zone public._kaderno_tz(new.user_id))::date;
      insert into pet_reviews (user_id, card_id, day) values (new.user_id, new.id, v_day) on conflict do nothing;
      if found then
        insert into pet_daily (user_id, day) values (new.user_id, v_day) on conflict do nothing;
        update pet_daily set reviews = reviews + 1 where user_id = new.user_id and day = v_day returning reviews into v_n;
        if v_n % 10 = 0 then
          perform public._pet_award(new.user_id, 'repaso', v_day::text || ':' || (v_n / 10)::text, 3);
        end if;
      end if;
    exception when others then
      raise warning 'mascota: no se pudo contar el repaso %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists flashcards_pet_trg on public.flashcards;
create trigger flashcards_pet_trg after update of due_date on public.flashcards
  for each row execute function public._pet_on_review();

-- ---------- Acciones del usuario ----------
create or replace function public._pet_clean_name(p_name text) returns text
language plpgsql immutable as $$
declare v text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if char_length(v) < 1 then raise exception 'Ponle un nombre a tu mascota.' using errcode = 'P0001'; end if;
  return left(v, 24);
end $$;

-- Adoptar: la primera es gratis; las siguientes se pagan con la moneda de la activa.
create or replace function public.pet_adopt(p_species text, p_name text) returns public.pets
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_owned integer; v_price integer; v_active public.pets; v_new public.pets;
begin
  if v_user is null then raise exception 'Inicia sesión.' using errcode = '42501'; end if;
  if p_species not in ('pinguino', 'gato', 'perro', 'loro') then raise exception 'Esa mascota no existe.' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('pets:' || v_user::text));
  if exists (select 1 from pets where user_id = v_user and species = p_species) then
    raise exception 'Ya tienes esa mascota.' using errcode = 'P0001';
  end if;
  select count(*) into v_owned from pets where user_id = v_user;
  v_price := public._pet_adopt_price(v_owned);
  if v_price > 0 then
    select * into v_active from pets where user_id = v_user and active for update;
    if v_active.id is null or v_active.coins < v_price then
      raise exception 'Te faltan monedas: adoptar cuesta %.', v_price using errcode = 'P0001';
    end if;
    update pets set coins = coins - v_price where id = v_active.id;
    insert into pet_ledger (user_id, pet_id, delta, reason, ref) values (v_user, v_active.id, -v_price, 'adopcion', p_species);
  end if;
  update pets set active = false where user_id = v_user and active;
  insert into pets (user_id, species, name, active) values (v_user, p_species, public._pet_clean_name(p_name), true)
    returning * into v_new;
  return v_new;
end $$;

-- Comprar una prenda para la mascota activa.
create or replace function public.pet_buy(p_item text) returns public.pets
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pet public.pets; v_it record;
begin
  if v_user is null then raise exception 'Inicia sesión.' using errcode = '42501'; end if;
  select * into v_it from public._pet_item(p_item);
  if v_it.price is null then raise exception 'Esa prenda no existe.' using errcode = 'P0001'; end if;
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
  -- Se la pone de una vez.
  update pets set coins = coins - v_it.price, outfit = outfit || jsonb_build_object(v_it.slot, p_item)
   where id = v_pet.id returning * into v_pet;
  return v_pet;
end $$;

-- Ponerse o quitarse una prenda (p_item null = quitar lo de ese lugar).
create or replace function public.pet_wear(p_pet uuid, p_slot text, p_item text) returns public.pets
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pet public.pets; v_slot text;
begin
  if p_slot not in ('cabeza', 'ojos', 'cuello') then raise exception 'Lugar no válido.' using errcode = 'P0001'; end if;
  select * into v_pet from pets where id = p_pet and user_id = v_user for update;
  if v_pet.id is null then raise exception 'No encontré esa mascota.' using errcode = 'P0001'; end if;
  if p_item is null then
    update pets set outfit = outfit - p_slot where id = p_pet returning * into v_pet;
    return v_pet;
  end if;
  select slot into v_slot from public._pet_item(p_item);
  if v_slot is distinct from p_slot then raise exception 'Esa prenda no va ahí.' using errcode = 'P0001'; end if;
  if not exists (select 1 from pet_items where pet_id = p_pet and item = p_item) then
    raise exception 'Primero cómprala.' using errcode = 'P0001';
  end if;
  update pets set outfit = outfit || jsonb_build_object(p_slot, p_item) where id = p_pet returning * into v_pet;
  return v_pet;
end $$;

-- Cambiar de mascota activa.
create or replace function public.pet_activate(p_pet uuid) returns public.pets
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pet public.pets;
begin
  perform pg_advisory_xact_lock(hashtext('pets:' || coalesce(v_user::text, '')));
  if not exists (select 1 from pets where id = p_pet and user_id = v_user) then
    raise exception 'No encontré esa mascota.' using errcode = 'P0001';
  end if;
  update pets set active = false where user_id = v_user and active and id <> p_pet;
  update pets set active = true where id = p_pet returning * into v_pet;
  return v_pet;
end $$;

create or replace function public.pet_rename(p_pet uuid, p_name text) returns public.pets
language plpgsql security definer set search_path = public as $$
declare v_pet public.pets;
begin
  update pets set name = public._pet_clean_name(p_name) where id = p_pet and user_id = auth.uid() returning * into v_pet;
  if v_pet.id is null then raise exception 'No encontré esa mascota.' using errcode = 'P0001'; end if;
  return v_pet;
end $$;

-- ---------- Logros ----------
-- Premio que no cuenta para el tope diario (logros). Solo lo usa la base.
create or replace function public._pet_grant(p_user uuid, p_pet uuid, p_reason text, p_ref text, p_amount integer)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into pet_ledger (user_id, pet_id, delta, reason, ref) values (p_user, p_pet, p_amount, p_reason, p_ref)
    on conflict (user_id, reason, ref) do nothing;
  if not found then return false; end if;
  update pets set coins = coins + p_amount, xp = xp + p_amount where id = p_pet;
  return true;
end $$;

-- Calcula los logros con lo que ya hay en la base, paga los que se acaban de
-- cumplir (a la mascota activa) y devuelve todos con su avance.
-- Solo cuenta lo hecho desde que adoptaste tu primera mascota.
create or replace function public.pet_achievements()
returns table (id text, progress integer, goal integer, reward integer, unlocked_at timestamptz, is_new boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_tz text; v_today date; v_since timestamptz; v_since_day date; v_pet uuid;
  m_done integer; m_focus_day integer; m_focus_total integer; m_streak integer := 0; m_clean integer := 0;
  m_reviews integer; m_days integer; m_items integer; m_pets integer; m_level integer; d date; i integer; r record;
begin
  if v_user is null then return; end if;
  select min(created_at) into v_since from pets where user_id = v_user;
  if v_since is null then return; end if;
  v_tz := public._kaderno_tz(v_user);
  v_today := (now() at time zone v_tz)::date;
  v_since_day := (v_since at time zone v_tz)::date;
  select p.id into v_pet from pets p where p.user_id = v_user and p.active;

  select count(*) into m_done from assignments a
   where a.user_id = v_user and a.status = 'done' and a.deleted_at is null and a.completed_at >= v_since;
  select coalesce(max(t.m), 0), coalesce(sum(t.m), 0) into m_focus_day, m_focus_total from (
    select sum(f.minutes)::int as m from focus_sessions f
     where f.user_id = v_user and f.created_at >= v_since
     group by (f.created_at at time zone v_tz)::date
  ) t;
  -- Racha: días seguidos ganando algo (si hoy todavía no, cuenta desde ayer).
  d := v_today;
  if not exists (select 1 from pet_daily x where x.user_id = v_user and x.day = d and x.earned > 0) then d := d - 1; end if;
  for i in 1..30 loop
    exit when not exists (select 1 from pet_daily x where x.user_id = v_user and x.day = d and x.earned > 0);
    m_streak := m_streak + 1; d := d - 1;
  end loop;
  -- Semana sin vencidas: días seguidos (hacia atrás desde ayer) en que nada se venció.
  if not exists (
    select 1 from assignments a
     where a.user_id = v_user and a.deleted_at is null and a.status is distinct from 'done'
       and coalesce((a.due_at at time zone v_tz)::date, a.due_date) < v_today - 7
  ) then
    for i in 1..7 loop
      d := v_today - i;
      exit when d < v_since_day;
      exit when exists (
        select 1 from assignments a
         where a.user_id = v_user and a.deleted_at is null
           and coalesce((a.due_at at time zone v_tz)::date, a.due_date) = d
           and (a.status is distinct from 'done' or (a.completed_at at time zone v_tz)::date > d)
      );
      m_clean := m_clean + 1;
    end loop;
  end if;
  select coalesce(sum(x.reviews), 0) into m_reviews from pet_daily x where x.user_id = v_user and x.day >= v_since_day;
  select count(*) into m_days from pet_ledger l where l.user_id = v_user and l.reason = 'dia';
  select count(*) into m_items from pet_items it where it.user_id = v_user;
  select count(*), coalesce(max(public.pet_level(p.xp)), 1) into m_pets, m_level from pets p where p.user_id = v_user;

  for r in
    select * from (values
      ('primera_tarea', least(m_done, 1), 1, 20),
      ('tareas_25', m_done, 25, 60),
      ('tareas_100', m_done, 100, 150),
      ('enfoque_hora', m_focus_day, 60, 30),
      ('enfoque_10h', m_focus_total, 600, 100),
      ('racha_7', m_streak, 7, 50),
      ('racha_30', m_streak, 30, 200),
      ('sin_vencidas', m_clean, 7, 70),
      ('repaso_100', m_reviews, 100, 50),
      ('dia_5', m_days, 5, 40),
      ('ropa_3', m_items, 3, 30),
      ('familia', m_pets, 4, 100),
      ('nivel_5', m_level, 5, 50),
      ('nivel_10', m_level, 10, 150)
    ) v(aid, prog, g, rew)
  loop
    id := r.aid; goal := r.g; reward := r.rew; progress := least(r.prog, r.g); is_new := false;
    select l.created_at into unlocked_at from pet_ledger l where l.user_id = v_user and l.reason = 'logro' and l.ref = r.aid;
    if unlocked_at is null and r.prog >= r.g and v_pet is not null then
      if public._pet_grant(v_user, v_pet, 'logro', r.aid, r.rew) then is_new := true; unlocked_at := now(); end if;
    end if;
    return next;
  end loop;
end $$;

-- ---------- Permisos ----------
revoke all on function public._pet_award(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public._pet_on_task_done() from public, anon, authenticated;
revoke all on function public._pet_on_focus() from public, anon, authenticated;
revoke all on function public._pet_on_review() from public, anon, authenticated;
revoke all on function public._pet_grant(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.pet_achievements() from public, anon;
grant execute on function public.pet_achievements() to authenticated;
revoke all on function public.pet_adopt(text, text) from public, anon;
revoke all on function public.pet_buy(text) from public, anon;
revoke all on function public.pet_wear(uuid, text, text) from public, anon;
revoke all on function public.pet_activate(uuid) from public, anon;
revoke all on function public.pet_rename(uuid, text) from public, anon;
grant execute on function public.pet_adopt(text, text) to authenticated;
grant execute on function public.pet_buy(text) to authenticated;
grant execute on function public.pet_wear(uuid, text, text) to authenticated;
grant execute on function public.pet_activate(uuid) to authenticated;
grant execute on function public.pet_rename(uuid, text) to authenticated;
grant execute on function public.pet_level(integer) to authenticated;
-- Lectura directa de las tablas (RLS deja ver solo lo propio).
grant select on public.pets, public.pet_ledger, public.pet_items, public.pet_daily to authenticated;
revoke insert, update, delete on public.pets, public.pet_ledger, public.pet_items, public.pet_daily, public.pet_reviews from anon, authenticated;
