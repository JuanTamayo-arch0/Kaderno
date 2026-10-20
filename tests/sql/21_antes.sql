-- k16 no tiene schema_v5 (Archivos de la materia): se crea la tabla tal como en producción.
create table if not exists public.subject_files (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  path text not null,
  mime text,
  size bigint,
  created_at timestamptz default now()
);
alter table public.subject_files enable row level security;
