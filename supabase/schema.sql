-- ============================================================
--  Kaderno — Esquema de base de datos + seguridad (Supabase)
--  Pega TODO esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Tablas ----------
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  color text default '#6c8cff',
  icon text default '📘',
  archived boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  subject_id uuid references public.subjects on delete set null,
  note_id uuid,
  title text not null,
  description text,
  due_date date,
  status text default 'pending',      -- pending | done
  remind_days int default 0,
  created_at timestamptz default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  subject_id uuid references public.subjects on delete set null,
  title text,
  content text,
  image_path text,
  ocr_status text default 'pending',  -- pending | done | failed
  created_at timestamptz default now()
);

create table if not exists public.schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  day int not null,     -- 0 = Lunes ... 4 = Viernes
  slot int not null,    -- índice de franja horaria
  subject_id uuid not null references public.subjects on delete cascade,
  unique (user_id, day, slot)
);

-- ---------- Row Level Security ----------
alter table public.subjects   enable row level security;
alter table public.assignments enable row level security;
alter table public.notes      enable row level security;
alter table public.schedule   enable row level security;

-- Cada usuario solo ve y modifica SUS filas.
create policy "own subjects"   on public.subjects   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own assignments" on public.assignments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notes"      on public.notes      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own schedule"   on public.schedule   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Storage (fotos privadas) ----------
insert into storage.buckets (id, name, public)
values ('notes', 'notes', false)
on conflict (id) do nothing;

-- Solo el dueño (carpeta = su user_id) puede leer/subir sus fotos.
create policy "own read notes bucket" on storage.objects for select
  using (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own write notes bucket" on storage.objects for insert
  with check (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own delete notes bucket" on storage.objects for delete
  using (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
