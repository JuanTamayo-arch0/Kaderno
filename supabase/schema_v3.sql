-- ============================================================
--  Kaderno — Migración v3 (Oráculo: búsqueda semántica + chat)
--  Pega TODO esto en: Supabase → SQL Editor → New query → Run
--  Requiere la extensión pgvector (se activa abajo).
-- ============================================================

-- 1) Activar pgvector
create extension if not exists vector;

-- 2) Embeddings de notas (dimensión 1536 = OpenAI text-embedding-3-small)
create table if not exists public.note_embeddings (
  note_id uuid primary key references public.notes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  subject_id uuid references public.subjects on delete set null,
  content text,
  embedding vector(1536),
  updated_at timestamptz default now()
);

alter table public.note_embeddings enable row level security;
create policy "own embeddings" on public.note_embeddings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Índice de similitud (coseno)
create index if not exists note_embeddings_ivfflat
  on public.note_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 3) Función de recuperación semántica (respeta al usuario autenticado)
create or replace function public.match_notes(query_embedding vector(1536), match_subject uuid, match_count int)
returns table (note_id uuid, title text, content text, similarity float)
language plpgsql stable security invoker
as $$
begin
  return query
  select e.note_id, n.title, e.content, 1 - (e.embedding <=> query_embedding) as similarity
  from public.note_embeddings e
  join public.notes n on n.id = e.note_id
  where e.user_id = auth.uid()
    and (match_subject is null or e.subject_id = match_subject)
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 4) Historial de conversaciones del Oráculo
create table if not exists public.oracle_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role text not null,          -- 'user' | 'assistant'
  content text not null,
  scope text,                  -- 'all' | 'subject:<id>' | 'note:<id>'
  created_at timestamptz default now()
);
alter table public.oracle_messages enable row level security;
create policy "own oracle msgs" on public.oracle_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists oracle_messages_user_idx on public.oracle_messages (user_id, created_at);
