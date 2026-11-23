-- =====================================================================
-- Kaderno · schema_v25.sql  (versión 26 de la app: dos espacios, marca y semestres)
--
-- Es idempotente: se puede correr dos veces. Crece por fases (ver PLAN_v26.md).
--
-- Fase 2 · Espacios
--   · subjects.space: 'estudio' o 'trabajo'. Vacío = el modo de la persona
--     (así nadie tiene que hacer nada si usa un solo modo). Solo quien tiene
--     "Los dos" ve cada espacio por separado; la app pregunta una vez cómo
--     ordenar lo que ya tenía.
--
-- Fase 3 · Semestres
--   · terms: los semestres de cada persona (abierto o cerrado). Uno abierto a
--     la vez. subjects.term_id dice a qué semestre pertenece cada materia.
--   · term_close(): cierra el semestre con una foto del resumen (notas finales,
--     créditos, horas, tarjetas, racha y una línea), calcula el promedio en el
--     servidor, archiva sus materias y abre el siguiente.
--   · term_add_past(): agrega a mano un semestre que ya terminó.
--   La foto no cambia aunque después se borren materias o notas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fase 2 · Espacios
-- ---------------------------------------------------------------------
alter table public.subjects add column if not exists space text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subjects_space_chk') then
    alter table public.subjects add constraint subjects_space_chk check (space is null or space in ('estudio', 'trabajo'));
  end if;
end $$;
create index if not exists subjects_user_space_idx on public.subjects (user_id, space);
comment on column public.subjects.space is 'v26: espacio (estudio o trabajo). Vacío = el modo de la persona.';

-- ---------------------------------------------------------------------
-- Fase 3 · Semestres
-- ---------------------------------------------------------------------
alter table public.subjects add column if not exists archived boolean default false;
alter table public.subjects add column if not exists archived_at timestamptz;

create table if not exists public.terms (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  starts_on   date,
  ends_on     date,
  status      text not null default 'open' check (status in ('open', 'closed')),
  closed_at   timestamptz,
  summary     jsonb,
  reflection  text check (reflection is null or char_length(reflection) <= 1000),
  created_at  timestamptz not null default now(),
  constraint terms_dates_chk check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint terms_summary_size check (summary is null or octet_length(summary::text) <= 60000)
);
create unique index if not exists terms_one_open on public.terms (user_id) where status = 'open';
create index if not exists terms_user_idx on public.terms (user_id, created_at);
alter table public.terms enable row level security;
drop policy if exists "own terms" on public.terms;
create policy "own terms" on public.terms for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.terms to authenticated;

alter table public.subjects add column if not exists term_id uuid references public.terms on delete set null;
create index if not exists subjects_term_idx on public.subjects (term_id);

-- Tope: 40 semestres por persona (diez años de carrera holgados).
create or replace function public._terms_cap() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.terms where user_id = new.user_id) >= 40 then
    raise exception 'Llegaste al máximo de 40 semestres.';
  end if;
  return new;
end $$;
drop trigger if exists terms_cap on public.terms;
create trigger terms_cap before insert on public.terms for each row execute function public._terms_cap();

/*
  Limpia y completa el resumen de un semestre. Cada materia:
    {name, credits, grade, status}  status: aprobada | reprobada | homologada | retirada
  El promedio se pondera por créditos con las materias aprobadas o reprobadas
  que tienen nota; los créditos aprobados suman las aprobadas y homologadas.
*/
create or replace function public._term_summary(p jsonb, p_max numeric) returns jsonb
language plpgsql immutable as $$
declare
  subs jsonb := '[]'::jsonb; it jsonb; g numeric; cr numeric; st text; nm text;
  wsum numeric := 0; csum numeric := 0; passed numeric := 0; n int := 0;
begin
  if p_max is null or p_max <= 0 or p_max > 1000 then raise exception 'La nota máxima no es válida.'; end if;
  for it in select * from jsonb_array_elements(coalesce(p -> 'subjects', '[]'::jsonb)) loop
    n := n + 1;
    if n > 40 then raise exception 'Máximo 40 materias por semestre.'; end if;
    nm := left(btrim(coalesce(it ->> 'name', '')), 80);
    if nm = '' then raise exception 'Cada materia necesita un nombre.'; end if;
    cr := coalesce(nullif(it ->> 'credits', '')::numeric, 0);
    if cr < 0 or cr > 30 then raise exception 'Los créditos de % no son válidos.', nm; end if;
    g := nullif(it ->> 'grade', '')::numeric;
    if g is not null and (g < 0 or g > p_max) then raise exception 'La nota de % debe estar entre 0 y %.', nm, p_max; end if;
    st := coalesce(it ->> 'status', 'aprobada');
    if st not in ('aprobada', 'reprobada', 'homologada', 'retirada') then raise exception 'Estado no válido: %', st; end if;
    if g is not null and st in ('aprobada', 'reprobada') then wsum := wsum + g * cr; csum := csum + cr; end if;
    if st in ('aprobada', 'homologada') then passed := passed + cr; end if;
    subs := subs || jsonb_build_object('name', nm, 'credits', cr, 'grade', g, 'status', st,
      'hours', greatest(0, least(2000, coalesce(nullif(it ->> 'hours', '')::numeric, 0))), 'color', left(coalesce(it ->> 'color', ''), 9));
  end loop;
  return jsonb_build_object(
    'subjects', subs,
    'avg', case when csum > 0 then round(wsum / csum, 3) else null end,
    'credits', passed,
    'credits_graded', csum,
    'max', p_max,
    'pass', nullif(p ->> 'pass', '')::numeric,
    'focus_minutes', greatest(0, least(500000, coalesce(nullif(p ->> 'focus_minutes', '')::numeric, 0))),
    'cards', greatest(0, least(1000000, coalesce(nullif(p ->> 'cards', '')::int, 0))),
    'best_streak', greatest(0, least(400, coalesce(nullif(p ->> 'best_streak', '')::int, 0))),
    'manual', coalesce((p ->> 'manual')::boolean, false)
  );
end $$;

/*
  Cierra el semestre abierto: guarda la foto, archiva sus materias (las de
  Estudio sin semestre también, si son de este) y abre el siguiente con
  p_next (o ninguno si viene vacío).
*/
create or replace function public.term_close(p_term uuid, p_summary jsonb, p_max numeric, p_reflection text default null, p_next text default null, p_ends date default null)
returns public.terms language plpgsql security definer set search_path = public as $$
declare t public.terms; nxt public.terms;
begin
  select * into t from public.terms where id = p_term and user_id = auth.uid() for update;
  if not found then raise exception 'Ese semestre no existe.'; end if;
  if t.status <> 'open' then raise exception 'Ese semestre ya está cerrado.'; end if;
  update public.terms set status = 'closed', closed_at = now(), ends_on = coalesce(p_ends, ends_on, current_date),
    summary = public._term_summary(p_summary, p_max), reflection = nullif(left(btrim(coalesce(p_reflection, '')), 1000), '')
    where id = p_term returning * into t;
  update public.subjects set archived = true, archived_at = now() where term_id = p_term and user_id = auth.uid();
  if nullif(btrim(coalesce(p_next, '')), '') is not null then
    insert into public.terms (user_id, name, starts_on) values (auth.uid(), left(btrim(p_next), 40), current_date) returning * into nxt;
  end if;
  return t;
end $$;

create or replace function public.term_add_past(p_name text, p_summary jsonb, p_max numeric, p_starts date default null, p_ends date default null)
returns public.terms language plpgsql security definer set search_path = public as $$
declare t public.terms;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  insert into public.terms (user_id, name, starts_on, ends_on, status, closed_at, summary)
    values (auth.uid(), left(btrim(p_name), 40), p_starts, p_ends, 'closed', now(), public._term_summary(p_summary || jsonb_build_object('manual', true), p_max))
    returning * into t;
  return t;
end $$;

revoke all on function public.term_close(uuid, jsonb, numeric, text, text, date) from public;
revoke all on function public.term_add_past(text, jsonb, numeric, date, date) from public;
grant execute on function public.term_close(uuid, jsonb, numeric, text, text, date) to authenticated;
grant execute on function public.term_add_past(text, jsonb, numeric, date, date) to authenticated;


-- =====================================================================
--  v26 · FASE 5 · Mascotas: ropa nueva y nada de monedas en Trabajo
-- =====================================================================
-- Catálogo completo: el de schema_v22 más los juegos de Estudio y de Trabajo,
-- con dos lugares nuevos: espalda (mochila, capa) y mano (lápiz, taza, maletín).
create or replace function public._pet_item(p_item text, out price integer, out min_level integer, out slot text)
language sql immutable as $$
  select v.p, v.l, v.s from (values
    ('gorro', 60, 1, 'cabeza'), ('corbatin', 80, 1, 'cuello'), ('collar', 100, 1, 'cuello'),
    ('gafas', 120, 1, 'ojos'), ('bufanda', 150, 2, 'cuello'), ('boina', 200, 2, 'cabeza'),
    ('audifonos', 250, 3, 'cabeza'), ('gafas_sol', 300, 4, 'ojos'), ('birrete', 500, 6, 'cabeza'),
    ('corona', 1000, 10, 'cabeza'),
    ('luces', 120, 1, 'cuello'), ('gorro_navidad', 150, 1, 'cabeza'), ('gafas_corazon', 160, 1, 'ojos'),
    ('antifaz', 180, 1, 'ojos'), ('cuernos_reno', 200, 2, 'cabeza'), ('sombrero_bruja', 200, 2, 'cabeza'),
    ('sombrero_vueltiao', 220, 2, 'cabeza'),
    ('lapiz', 50, 1, 'mano'), ('lapiz_oreja', 70, 1, 'cabeza'), ('taza', 70, 1, 'mano'),
    ('carne', 80, 1, 'cuello'), ('lentes', 90, 1, 'ojos'), ('corbata', 90, 1, 'cuello'),
    ('mochila', 140, 2, 'espalda'), ('maletin', 180, 2, 'mano'), ('diadema', 260, 3, 'cabeza'),
    ('capa', 350, 5, 'espalda'),
    ('papel_rayas', 80, 1, 'papel'), ('papel_ladrillo', 120, 1, 'papel'), ('papel_madera', 200, 2, 'papel'),
    ('papel_estrellas', 250, 3, 'papel'),
    ('piso_baldosa', 80, 1, 'piso'), ('piso_alfombrado', 120, 1, 'piso'), ('piso_marmol', 250, 3, 'piso'),
    ('vista_montanas', 150, 1, 'vista'), ('vista_playa', 200, 2, 'vista'), ('vista_espacio', 400, 5, 'vista'),
    ('lampara', 60, 1, 'mueble'), ('cojin', 60, 1, 'mueble'), ('planta', 70, 1, 'mueble'),
    ('alfombra', 90, 1, 'mueble'), ('cuadro', 100, 1, 'mueble'), ('estante', 120, 1, 'mueble')
  ) v(i, p, l, s) where v.i = p_item;
$$;

-- Lugares de la ropa (los de la casa van aparte).
create or replace function public._pet_wear_slot(p_slot text) returns boolean
language sql immutable as $$ select p_slot in ('cabeza', 'ojos', 'cuello', 'espalda', 'mano') $$;

-- Comprar: igual que en schema_v22, con los lugares nuevos.
create or replace function public.pet_buy(p_item text) returns public.pets
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pet public.pets; v_it record; v_day date; v_season record;
begin
  if v_user is null then raise exception 'Inicia sesión.' using errcode = '42501'; end if;
  select * into v_it from public._pet_item(p_item);
  if v_it.price is null then raise exception 'Eso no está en la tienda.' using errcode = 'P0001'; end if;
  select * into v_pet from pets where user_id = v_user and active for update;
  if v_pet.id is null then raise exception 'Primero elige una mascota.' using errcode = 'P0001'; end if;
  if exists (select 1 from pet_items where pet_id = v_pet.id and item = p_item) then
    raise exception 'Ya la tienes.' using errcode = 'P0001';
  end if;
  v_day := (now() at time zone public._kaderno_tz(v_user))::date;
  if not public._pet_season_ok(p_item, v_day) then
    select * into v_season from public._pet_season(p_item);
    raise exception 'Solo se vende en temporada de %.', v_season.name using errcode = 'P0001';
  end if;
  if public.pet_level(v_pet.xp) < v_it.min_level then
    raise exception 'Se desbloquea en el nivel %.', v_it.min_level using errcode = 'P0001';
  end if;
  if v_pet.coins < v_it.price then
    raise exception 'Te faltan % monedas.', v_it.price - v_pet.coins using errcode = 'P0001';
  end if;
  insert into pet_items (pet_id, user_id, item) values (v_pet.id, v_user, p_item);
  insert into pet_ledger (user_id, pet_id, delta, reason, ref) values (v_user, v_pet.id, -v_it.price, 'compra', v_pet.id::text || ':' || p_item);
  if public._pet_wear_slot(v_it.slot) then
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
revoke all on function public.pet_buy(text) from public, anon;
grant execute on function public.pet_buy(text) to authenticated;

-- Ponerse o quitarse una prenda (p_item null = quitar lo de ese lugar).
create or replace function public.pet_wear(p_pet uuid, p_slot text, p_item text) returns public.pets
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pet public.pets; v_slot text;
begin
  if not public._pet_wear_slot(p_slot) then raise exception 'Lugar no válido.' using errcode = 'P0001'; end if;
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

-- ¿Es de Trabajo? Por el espacio de la materia; sin materia (o sin espacio),
-- por el modo de la cuenta ("trabajo" solo). En "ambos" sin materia cuenta como Estudio.
create or replace function public._pet_is_work(p_user uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.space = 'trabajo' from public.subjects s where s.id = p_subject and s.space is not null),
    (select u.settings ->> 'mode' = 'trabajo' from public.user_prefs u where u.user_id = p_user),
    false);
$$;
revoke all on function public._pet_is_work(uuid, uuid) from public, anon, authenticated;

-- Tarea hecha: igual que en schema_v16, pero lo de Trabajo no paga (deja la marca en 0).
create or replace function public._pet_on_task_done() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tz text; v_day date; v_due timestamptz; v_amt integer; v_task_day date;
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.deleted_at is null then
    begin
      if public._pet_is_work(new.user_id, new.subject_id) then
        perform public._pet_award(new.user_id, 'tarea', new.id::text, 0);
        return new;
      end if;
      v_tz := public._kaderno_tz(new.user_id);
      v_day := (now() at time zone v_tz)::date;
      v_due := coalesce(new.due_at, case when new.due_date is not null then ((new.due_date + 1)::timestamp at time zone v_tz) end);
      -- Crear y marcar enseguida no paga (evita crear tareas solo para ganar).
      if new.created_at is not null and now() - new.created_at < interval '1 minute' then v_amt := 0;
      elsif v_due is null or now() <= v_due then v_amt := 5;
      else v_amt := 2; end if;
      perform public._pet_award(new.user_id, 'tarea', new.id::text, v_amt);
      -- ¿Era lo último de hoy (o vencido) en Estudio? Premio por terminar el día.
      v_task_day := coalesce((new.due_at at time zone v_tz)::date, new.due_date);
      if v_task_day is not null and v_task_day <= v_day and not exists (
        select 1 from assignments a
         where a.user_id = new.user_id and a.id <> new.id and a.deleted_at is null
           and a.status is distinct from 'done'
           and coalesce((a.due_at at time zone v_tz)::date, a.due_date) <= v_day
           and not public._pet_is_work(a.user_id, a.subject_id)
      ) then
        perform public._pet_award(new.user_id, 'dia', v_day::text, 10);
      end if;
    exception when others then
      raise warning 'mascota: no se pudo premiar la tarea %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;

-- Enfoque: paga 1 por minuto (máximo 180) solo con el temporizador de Enfoque
-- y en Estudio. Las horas anotadas a mano o con el cronómetro de Trabajo no pagan.
create or replace function public._pet_on_focus() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_src text := coalesce(to_jsonb(new) ->> 'source', 'focus');
begin
  begin
    if v_src <> 'focus' or public._pet_is_work(new.user_id, new.subject_id) then
      return new;
    end if;
    perform public._pet_award(new.user_id, 'enfoque', new.id::text, least(greatest(coalesce(new.minutes, 0), 0), 180));
  exception when others then
    raise warning 'mascota: no se pudo premiar el enfoque %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
