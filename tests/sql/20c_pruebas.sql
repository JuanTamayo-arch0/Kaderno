-- Pruebas de supabase/schema_v20.sql, fase 3 (calendarios externos y notas compartidas). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-0000000000f1', false);
do $$ declare c uuid; i int; begin
  insert into public.external_calendars (name, url) values ('Trabajo', 'https://calendar.google.com/calendar/ical/x/private-abc/basic.ics') returning id into c;
  begin insert into public.external_calendars (name, url) values ('Malo', 'http://x.co/cal.ics'); raise exception 'aceptó http';
  exception when check_violation then null; end;
  begin update public.external_calendars set last_sync = now() where id = c; raise exception 'el navegador escribió la sincronización';
  exception when insufficient_privilege then null; end;
  update public.external_calendars set name = 'Trabajo y gym' where id = c;
  begin insert into public.external_events (calendar_id, user_id, uid, start_at, end_at, title) values (c, auth.uid(), 'x', now(), now(), 'x'); raise exception 'escribió eventos';
  exception when insufficient_privilege then null; end;
  for i in 1..4 loop insert into public.external_calendars (name, url) values ('C' || i, 'https://example.com/' || i || '.ics'); end loop;
  begin insert into public.external_calendars (name, url) values ('Sexto', 'https://example.com/6.ics'); raise exception 'pasó de 5';
  exception when raise_exception then if sqlerrm not like 'Máximo 5%' then raise; end if; end;
  perform set_config('k.cal', c::text, false);
  raise notice 'ok 1 calendarios: solo https, máximo 5 y la sincronización solo desde el servidor';
end $$;
reset role;
insert into public.external_events (calendar_id, user_id, uid, start_at, end_at, title)
values (current_setting('k.cal')::uuid, 'f1000000-0000-4000-8000-0000000000f1', 'g1', now(), now() + interval '1 hour', 'Gimnasio');
set role authenticated;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000007', false);
do $$ begin
  if exists (select 1 from public.external_calendars) or exists (select 1 from public.external_events) then raise exception 've calendarios ajenos'; end if;
  raise notice 'ok 2 calendarios y eventos aislados por persona';
end $$;
reset role;
do $$ declare n uuid; t uuid := gen_random_uuid(); r record; begin
  insert into public.notes (user_id, title, content, share_token) values ('f1000000-0000-4000-8000-0000000000f1', 'Compartida', 'Contenido $x^2$', t) returning id into n;
  perform set_config('k.tok', t::text, false);
  perform set_config('k.note', n::text, false);
end $$;
set role anon;
do $$ declare r record; n int; begin
  select * into r from public.get_shared_note(current_setting('k.tok')::uuid);
  if r.title <> 'Compartida' or r.content not like 'Contenido%' then raise exception 'nota compartida: %', r; end if;
  select count(*) into n from public.get_shared_note(gen_random_uuid());
  if n <> 0 then raise exception 'devolvió una nota con un enlace inventado'; end if;
  select count(*) into n from public.get_shared_note(null);
  if n <> 0 then raise exception 'devolvió algo sin enlace'; end if;
  raise notice 'ok 3 la nota compartida se lee solo con su enlace (sin datos del dueño)';
end $$;
reset role;
update public.notes set share_token = null where id = current_setting('k.note')::uuid;
set role anon;
do $$ begin
  if exists (select 1 from public.get_shared_note(current_setting('k.tok')::uuid)) then raise exception 'el enlace siguió funcionando'; end if;
  raise notice 'ok 4 al desactivar el enlace deja de funcionar';
end $$;
reset role;
select 'PASARON' as v21_fase3;
