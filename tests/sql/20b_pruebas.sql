-- Pruebas de supabase/schema_v20.sql, fase 2 (notas conectadas). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
do $$ declare a uuid; b uuid; c uuid; x uuid; n int; begin
  insert into public.notes (user_id, title, content) values ('f1000000-0000-4000-8000-0000000000f1', 'Bernoulli', 'Presión y velocidad') returning id into a;
  insert into public.notes (user_id, title, content) values ('c7000000-0000-4000-8000-000000000007', 'Ajena', 'x') returning id into x;
  insert into public.notes (user_id, title, content) values ('f1000000-0000-4000-8000-0000000000f1', 'Venturi',
    format('Ver [Bernoulli](kd-note:%s) y [Ajena](kd-note:%s) y otra vez [B](kd-note:%s)', a, x, a)) returning id into b;
  select count(*) into n from public.note_links where from_note = b;
  if n <> 1 or not exists (select 1 from public.note_links where from_note = b and to_note = a) then raise exception 'enlaces: %', n; end if;
  update public.notes set content = 'sin enlaces' where id = b;
  if exists (select 1 from public.note_links where from_note = b) then raise exception 'no se quitaron los enlaces'; end if;
  insert into public.notes (user_id, title, content) values ('f1000000-0000-4000-8000-0000000000f1', 'Tubos', format('[[x]] (kd-note:%s)', a)) returning id into c;
  delete from public.notes where id = a;
  if exists (select 1 from public.note_links where to_note = a) then raise exception 'quedó un enlace a una nota borrada'; end if;
  raise notice 'ok 1 enlaces solo a notas propias, se recalculan y se borran con la nota';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000007', false);
do $$ begin
  if exists (select 1 from public.note_links) then raise exception 've enlaces ajenos'; end if;
  insert into public.note_templates (name, content) values ('Mi plantilla', '## Idea');
  begin insert into public.note_templates (name, content) values ('', 'x'); raise exception 'aceptó nombre vacío';
  exception when check_violation then null; end;
  raise notice 'ok 2 plantillas propias';
end $$;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-0000000000f1', false);
do $$ begin
  if exists (select 1 from public.note_templates) then raise exception 've plantillas ajenas'; end if;
  raise notice 'ok 3 nadie ve plantillas ajenas';
end $$;
reset role;
do $$ begin
  insert into public.flashcards (user_id, front, back, created_from, note_line) values ('f1000000-0000-4000-8000-0000000000f1', 'Bernoulli', 'P + ½ρv² = cte', 'note', 'Bernoulli :: P + ½ρv² = cte');
  raise notice 'ok 4 tarjetas con origen en la nota';
end $$;
select 'PASARON' as v21_fase2;
