-- Pruebas de supabase/schema_v21.sql, fase 1 (grabar la clase). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
do $$ declare n uuid; m uuid; begin
  insert into public.notes (user_id, title, content) values ('f1000000-0000-4000-8000-0000000000f1', 'Clase del 20 oct', '## Ley de Ohm') returning id into n;
  insert into public.notes (user_id, title, content) values ('c7000000-0000-4000-8000-000000000007', 'Ajena', 'x') returning id into m;
  perform set_config('k.n', n::text, false);
  perform set_config('k.m', m::text, false);
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-0000000000f1', false);
do $$ declare t uuid; i int; begin
  insert into public.note_transcripts (note_id, lang, segments, marks)
  values (current_setting('k.n')::uuid, 'es-CO', '[{"t":3,"text":"Hoy vemos la ley de Ohm."}]', '[{"t":40,"line":"V = I R"}]') returning id into t;
  update public.note_transcripts set duration_s = 3600, summary = '{"ideas":["Ohm"]}' where id = t;
  begin insert into public.note_transcripts (note_id) values (current_setting('k.m')::uuid); raise exception 'grabó en una nota ajena';
  exception when insufficient_privilege then null; end;
  begin insert into public.note_transcripts (note_id, duration_s) values (current_setting('k.n')::uuid, 20000); raise exception 'aceptó más de 4 horas';
  exception when check_violation then null; end;
  begin insert into public.note_transcripts (note_id, segments) values (current_setting('k.n')::uuid, '{"a":1}'); raise exception 'aceptó segmentos que no son lista';
  exception when check_violation then null; end;
  for i in 1..9 loop insert into public.note_transcripts (note_id) values (current_setting('k.n')::uuid); end loop;
  begin insert into public.note_transcripts (note_id) values (current_setting('k.n')::uuid); raise exception 'pasó de 10';
  exception when raise_exception then if sqlerrm not like 'Máximo 10%' then raise; end if; end;
  raise notice 'ok 1 transcripciones: solo en notas propias, máximo 4 horas y 10 por nota';
end $$;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000007', false);
do $$ declare n int; begin
  select count(*) into n from public.note_transcripts;
  if n <> 0 then raise exception 've transcripciones ajenas'; end if;
  update public.note_transcripts set summary = null;
  delete from public.note_transcripts;
  raise notice 'ok 2 nadie más ve ni cambia la transcripción';
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.note_transcripts where summary is not null;
  if n <> 1 then raise exception 'otra persona cambió la transcripción'; end if;
  delete from public.notes where id = current_setting('k.n')::uuid;
  select count(*) into n from public.note_transcripts where note_id = current_setting('k.n')::uuid;
  if n <> 0 then raise exception 'quedaron transcripciones de una nota borrada'; end if;
  raise notice 'ok 3 se borran con la nota';
end $$;
select 'PASARON' as v22_fase1;
