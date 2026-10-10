-- ============================================================
--  Kaderno — Migración v2 (calificaciones, Pomodoro, flashcards, resúmenes)
--  Pega TODO esto en: Supabase → SQL Editor → New query → Run
--  Es seguro correrlo aunque ya tengas la v1 (usa IF NOT EXISTS).
-- ============================================================

-- Columna de resumen IA en las notas
alter table public.notes add column if not exists summary text;

-- ---------- Calificaciones ----------
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  subject_id uuid not null references public.subjects on delete cascade,
  name text not null,               -- ej: "Parcial 1", "Quiz", "Taller"
  weight numeric not null default 0, -- peso en % (ej: 30 = 30%)
  score numeric,                     -- nota obtenida (misma escala que max_score)
  max_score numeric not null default 5, -- escala (5.0 en Colombia, 100, etc.)
  created_at timestamptz default now()
);

-- ---------- Sesiones de Pomodoro ----------
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  subject_id uuid references public.subjects on delete set null,
  minutes int not null default 0,
  created_at timestamptz default now()
);

-- ---------- Flashcards (repaso espaciado, sistema Leitner) ----------
create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  note_id uuid references public.notes on delete set null,
  subject_id uuid references public.subjects on delete set null,
  front text not null,
  back text not null,
  box int not null default 1,        -- caja Leitner 1..5
  due_date date not null default current_date,
  created_at timestamptz default now()
);

-- ---------- Seguridad (RLS) ----------
alter table public.grades         enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.flashcards     enable row level security;

create policy "own grades"   on public.grades         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own focus"    on public.focus_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own cards"    on public.flashcards     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Índice para buscar tarjetas "para hoy" rápido
create index if not exists flashcards_due_idx on public.flashcards (user_id, due_date);
