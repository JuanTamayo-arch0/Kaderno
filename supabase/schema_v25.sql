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
