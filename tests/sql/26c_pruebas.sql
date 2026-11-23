-- Pruebas de supabase/schema_v26.sql, fase 4 (Algún día). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values ('98000000-0000-4000-8000-000000000008', 'algun@prueba.co') on conflict do nothing;
insert into public.assignments (id, user_id, title, inbox) values ('98200000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000008', 'Aprender guitarra', true)
  on conflict (id) do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000008', false);
do $$ begin
  if (select someday from public.assignments where id = '98200000-0000-4000-8000-000000000001') then raise exception 'nace en algún día'; end if;
  update public.assignments set someday = true where id = '98200000-0000-4000-8000-000000000001';
  if (select count(*) from public.assignments where user_id = auth.uid() and inbox and not someday and status is distinct from 'done') <> 0 then
    raise exception 'sigue contando como por ordenar';
  end if;
  raise notice 'ok 1 algún día: nace en falso, se marca y no cuenta como por ordenar';
end $$;
reset role;
