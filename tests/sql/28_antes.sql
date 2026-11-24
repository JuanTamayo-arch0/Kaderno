-- El Postgres de las pruebas no tiene pgvector: la tabla de vectores del Oráculo
-- (schema_v3) se arma con float8[] y un <=> de distancia coseno en SQL.
reset role;
create or replace function public._cos_dist(a float8[], b float8[]) returns float8 language sql immutable as $$
  select 1 - (select sum(x * y) from unnest(a, b) as t(x, y)) / nullif(sqrt((select sum(x * x) from unnest(a) x)) * sqrt((select sum(y * y) from unnest(b) y)), 0);
$$;
drop operator if exists <=> (float8[], float8[]);
create operator <=> (leftarg = float8[], rightarg = float8[], function = public._cos_dist);
create table if not exists public.note_embeddings (
  note_id uuid primary key references public.notes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  subject_id uuid references public.subjects on delete set null,
  content text, embedding float8[], updated_at timestamptz default now()
);
alter table public.notes add column if not exists deleted_at timestamptz;
