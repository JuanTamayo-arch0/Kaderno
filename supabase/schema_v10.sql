-- ============================================================
--  v10 — Microtareas de una tarea + bucket para fondos de pantalla
--  Idempotente: se puede correr varias veces sin romper nada.
-- ============================================================

-- ---------- Microtareas (checklist dentro de una tarea) ----------
create table if not exists public.assignment_steps (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  title         text not null,
  done          boolean not null default false,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.assignment_steps enable row level security;

drop policy if exists "assignment_steps own" on public.assignment_steps;
create policy "assignment_steps own" on public.assignment_steps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists assignment_steps_assignment_idx
  on public.assignment_steps(assignment_id, position);
create index if not exists assignment_steps_user_idx
  on public.assignment_steps(user_id);

-- La descripción ya existía en assignments; por si algún proyecto viejo no la tiene:
alter table public.assignments add column if not exists description text;

-- ---------- Bucket público para el fondo de pantalla propio ----------
-- Antes la foto se guardaba como base64 dentro de user_prefs.settings (varios MB
-- viajando en cada carga). Ahora se sube al bucket y en las preferencias sólo
-- queda la URL.
insert into storage.buckets (id, name, public)
values ('wallpapers', 'wallpapers', true)
on conflict (id) do update set public = true;

-- Lectura pública (el bucket es público: la URL funciona sin firmar y no expira).
drop policy if exists "wallpapers read" on storage.objects;
create policy "wallpapers read" on storage.objects
  for select using (bucket_id = 'wallpapers');

-- Escritura/borrado sólo dentro de la carpeta del propio usuario: <uid>/archivo.jpg
drop policy if exists "wallpapers insert own" on storage.objects;
create policy "wallpapers insert own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'wallpapers' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallpapers update own" on storage.objects;
create policy "wallpapers update own" on storage.objects
  for update to authenticated using (
    bucket_id = 'wallpapers' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallpapers delete own" on storage.objects;
create policy "wallpapers delete own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'wallpapers' and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
