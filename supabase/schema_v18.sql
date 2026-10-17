-- =====================================================================
-- Kaderno · schema_v18.sql  (versión 19 de la app: materias y notas)
--
-- Requiere schema.sql y schema_v14.sql. Es idempotente: se puede correr dos veces.
--
-- Qué agrega:
--   · subjects.teacher, subjects.room, subjects.link: profesor, salón y enlace
--     del aula virtual, para la ficha de la materia. El enlace solo acepta
--     http:// o https://.
--   · notes.pinned: notas fijadas arriba en la lista de la materia.
--   · notes.updated_at: última edición del título o el contenido (un trigger
--     lo mantiene). Fijar, mover de materia o guardar el resumen no la cambia.
-- =====================================================================

alter table public.subjects add column if not exists teacher text;
alter table public.subjects add column if not exists room    text;
alter table public.subjects add column if not exists link    text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subjects_teacher_len') then
    alter table public.subjects add constraint subjects_teacher_len check (teacher is null or char_length(teacher) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subjects_room_len') then
    alter table public.subjects add constraint subjects_room_len check (room is null or char_length(room) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subjects_link_http') then
    alter table public.subjects add constraint subjects_link_http
      check (link is null or (char_length(link) <= 500 and link ~* '^https?://[^[:space:]]+$'));
  end if;
end $$;

alter table public.notes add column if not exists pinned boolean not null default false;
alter table public.notes add column if not exists updated_at timestamptz;
update public.notes set updated_at = created_at where updated_at is null;
alter table public.notes alter column updated_at set default now();

create or replace function public._note_touch()
returns trigger language plpgsql as $$
begin
  if new.title is distinct from old.title or new.content is distinct from old.content then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public._note_touch();

create index if not exists notes_subject_recent_idx
  on public.notes (subject_id, pinned desc, updated_at desc);
