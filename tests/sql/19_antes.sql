-- Imitación mínima de Supabase Realtime (para probar las políticas de los canales "sala:").
create schema if not exists realtime;
create table if not exists realtime.messages (
  id bigserial primary key, topic text not null, extension text not null, payload jsonb, inserted_at timestamptz default now()
);
create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '');
$$;
alter table realtime.messages enable row level security; -- como en Supabase
grant usage on schema realtime to authenticated;
grant select, insert on realtime.messages to authenticated;
grant usage on sequence realtime.messages_id_seq to authenticated;
grant execute on function realtime.topic() to authenticated;

-- Fase 1: tarjetas "de antes" para probar la migración a FSRS.
insert into public.flashcards (id, user_id, front, back, due_date, reps, interval_days, ease, last_reviewed_at)
values
  ('fc000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Nueva de antes', 'r', current_date, 0, 0, 2.5, null),
  ('fc000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Repasada de antes', 'r', current_date + 3, 4, 6, 2.0, now() - interval '3 days')
on conflict do nothing;
