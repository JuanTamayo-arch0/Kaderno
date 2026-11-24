-- Pruebas de supabase/schema_v28.sql (v31, vectores con su modelo). Corren sobre k16.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values ('98000000-0000-4000-8000-000000000001', 'v28@prueba.co') on conflict do nothing;
insert into public.notes (id, user_id, title, content) values
  ('98000000-0000-4000-8000-0000000000a1', '98000000-0000-4000-8000-000000000001', 'Vieja', 'x'),
  ('98000000-0000-4000-8000-0000000000a2', '98000000-0000-4000-8000-000000000001', 'Nueva', 'y'),
  ('98000000-0000-4000-8000-0000000000a3', '98000000-0000-4000-8000-000000000001', 'Nueva 2', 'z') on conflict do nothing;
insert into public.note_embeddings (note_id, user_id, content, embedding) values
  ('98000000-0000-4000-8000-0000000000a1', '98000000-0000-4000-8000-000000000001', 'x', array[1, 0, 0]::float8[]) on conflict do nothing;
\i /tmp/kd_schema_v28.sql
\i /tmp/kd_schema_v28.sql
insert into public.note_embeddings (note_id, user_id, content, embedding, embed_model) values
  ('98000000-0000-4000-8000-0000000000a2', '98000000-0000-4000-8000-000000000001', 'y', array[1, 0.1, 0]::float8[], 'gemini-embedding-2'),
  ('98000000-0000-4000-8000-0000000000a3', '98000000-0000-4000-8000-000000000001', 'z', array[0, 1, 0]::float8[], 'gemini-embedding-2') on conflict do nothing;
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', false);
do $$
declare n int; t text;
begin
  if (select embed_model from note_embeddings where note_id = '98000000-0000-4000-8000-0000000000a1') <> 'text-embedding-3-small' then raise exception 'los vectores de antes quedan como de OpenAI'; end if;
  raise notice 'ok 1 los vectores que ya existían quedan marcados como de OpenAI';
  select count(*) into n from match_notes_model(array[1, 0, 0]::float8[], null, 6, 'gemini-embedding-2');
  select title into t from match_notes_model(array[1, 0, 0]::float8[], null, 6, 'gemini-embedding-2') limit 1;
  if n <> 2 or t <> 'Nueva' then raise exception 'match_notes_model: % %', n, t; end if;
  select count(*) into n from match_notes_model(array[1, 0, 0]::float8[], null, 6, 'text-embedding-3-small');
  if n <> 1 then raise exception 'openai: %', n; end if;
  raise notice 'ok 2 la búsqueda solo mira los vectores del mismo modelo, del más parecido al menos';
  select count(*) into n from related_notes('98000000-0000-4000-8000-0000000000a2', 5);
  if n <> 1 then raise exception 'related_notes mezcla modelos: %', n; end if;
  raise notice 'ok 3 notas parecidas sin mezclar modelos';
  raise notice 'PASARON las pruebas de schema_v28';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.notes where user_id = '98000000-0000-4000-8000-000000000001';
