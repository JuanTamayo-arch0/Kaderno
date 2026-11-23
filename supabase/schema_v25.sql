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
