-- ============================================================
--  Kaderno — Migración v4 (adjuntos de nota: diagramas / imágenes)
--  Pega TODO esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.note_images (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  path text not null,            -- ruta dentro del bucket privado "notes"
  created_at timestamptz default now()
);

alter table public.note_images enable row level security;
create policy "own note images" on public.note_images
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists note_images_note_idx on public.note_images (note_id);
