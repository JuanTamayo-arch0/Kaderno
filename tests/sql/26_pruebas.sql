-- Pruebas de supabase/schema_v26.sql, fase 1 (importante). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into public.assignments (id, user_id, title, due_date) values
  ('94200000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000004', 'Leer capítulo 3', current_date + 9)
  on conflict (id) do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000004', false);
do $$ begin
  if (select important from public.assignments where id = '94200000-0000-4000-8000-000000000001') then raise exception 'nace importante'; end if;
  update public.assignments set important = true where id = '94200000-0000-4000-8000-000000000001';
  if not (select important from public.assignments where id = '94200000-0000-4000-8000-000000000001') then raise exception 'no quedó importante'; end if;
  raise notice 'ok 1 importante: nace en falso y la dueña lo cambia';
end $$;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000005', false);
do $$ declare n int; begin
  update public.assignments set important = false where id = '94200000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'otra persona cambió la estrella'; end if;
  raise notice 'ok 2 nadie más cambia la estrella de una tarea ajena';
end $$;
reset role;
