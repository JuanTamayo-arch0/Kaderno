-- ============================================================
--  v11 — Tipos de tarea propios
--  assignments.type sigue siendo texto libre (SIN llave foránea) a propósito:
--  así una tarea nunca se rompe si borras el tipo, sólo cae al respaldo "Tarea".
--  Idempotente.
-- ============================================================

create table if not exists public.task_types (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,                    -- slug estable, ej. 'laboratorio'
  label      text not null,                    -- 'Laboratorio'
  icon       text not null default '📌',
  color      text not null default '#6c8cff',
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table public.task_types enable row level security;

drop policy if exists "task_types own" on public.task_types;
create policy "task_types own" on public.task_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists task_types_user_idx on public.task_types(user_id, position);

notify pgrst, 'reload schema';
