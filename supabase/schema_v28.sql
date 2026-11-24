-- =====================================================================
--  Kaderno v31: vectores del Oráculo con su modelo.
--  Correr una vez en Supabase (SQL Editor), después de schema_v27.sql.
--
--  Los vectores de OpenAI y los de Gemini no se pueden comparar entre sí.
--  Cada vector guarda el modelo que lo hizo; la búsqueda solo mira los del
--  mismo modelo. Los que ya existían quedan marcados como de OpenAI.
--  Al cambiar EMBED_PROVIDER, cada persona los vuelve a armar con
--  "Preparar mis notas" en el Oráculo (mientras tanto responde con sus notas
--  recientes, como cuando no hay vectores).
-- =====================================================================

alter table public.note_embeddings add column if not exists embed_model text not null default 'text-embedding-3-small';

create or replace function public.match_notes_model(query_embedding vector(1536), match_subject uuid, match_count int, match_model text)
returns table (note_id uuid, title text, content text, similarity float)
language sql stable security invoker set search_path = public as $$
  select e.note_id, n.title, e.content, 1 - (e.embedding <=> query_embedding) as similarity
    from public.note_embeddings e
    join public.notes n on n.id = e.note_id
   where e.user_id = auth.uid()
     and e.embed_model = match_model
     and (match_subject is null or e.subject_id = match_subject)
   order by e.embedding <=> query_embedding
   limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_notes_model(vector, uuid, int, text) from public, anon;
grant execute on function public.match_notes_model(vector, uuid, int, text) to authenticated;

-- Notas parecidas: solo entre vectores del mismo modelo.
create or replace function public.related_notes(p_note uuid, p_count int default 5)
returns table (note_id uuid, title text, subject_id uuid, similarity float)
language sql stable security invoker set search_path = public as $$
  select e.note_id, n.title, n.subject_id, 1 - (e.embedding <=> src.embedding) as similarity
    from note_embeddings src
    join note_embeddings e on e.user_id = src.user_id and e.note_id <> src.note_id and e.embed_model = src.embed_model
    join notes n on n.id = e.note_id and n.deleted_at is null
   where src.note_id = p_note and src.user_id = auth.uid() and e.embedding is not null
   order by e.embedding <=> src.embedding
   limit least(greatest(p_count, 1), 10)
$$;
revoke all on function public.related_notes(uuid, int) from public, anon;
grant execute on function public.related_notes(uuid, int) to authenticated;
