-- ============================================================
--  Kaderno — Migración v5 (archivos/materiales por materia)
--  Pega TODO esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.subject_files (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  path text not null,            -- ruta dentro del bucket privado "notes"
  mime text,
  size bigint,
  created_at timestamptz default now()
);

alter table public.subject_files enable row level security;
create policy "own subject files" on public.subject_files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists subject_files_subject_idx on public.subject_files (subject_id);
