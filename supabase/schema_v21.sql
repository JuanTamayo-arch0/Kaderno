-- =====================================================================
-- Kaderno · schema_v21.sql  (versión 22 de la app: grabar la clase,
-- anotar PDFs, ¿cómo te fue? y Capturar nueva)
--
-- Requiere schema_v20.sql completo (versión 21). Es idempotente: se puede
-- correr dos veces. Crece por fases (ver PLAN_v22.md).
--
-- Fase 1 · Grabar la clase
--   · note_transcripts: el texto de la clase (frases con su segundo) y las
--     líneas de la nota con el segundo en que se escribieron. El audio nunca
--     se guarda. Solo el dueño de la nota.
-- =====================================================================


-- =====================================================================
--  FASE 1 · Grabar la clase
-- =====================================================================
create table if not exists public.note_transcripts (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.notes on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null default now(),
  duration_s integer not null default 0 check (duration_s between 0 and 14400),
  lang       text not null default 'es-CO' check (lang ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  segments   jsonb not null default '[]'::jsonb check (jsonb_typeof(segments) = 'array' and pg_column_size(segments) <= 600000),
  marks      jsonb not null default '[]'::jsonb check (jsonb_typeof(marks) = 'array' and pg_column_size(marks) <= 200000),
  summary    jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists note_transcripts_note_idx on public.note_transcripts (note_id, started_at desc);
alter table public.note_transcripts enable row level security;
drop policy if exists "own transcripts" on public.note_transcripts;
create policy "own transcripts" on public.note_transcripts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid()));
grant select, insert, update, delete on public.note_transcripts to authenticated;

-- Hasta 10 transcripciones por nota (más es casi seguro un error).
create or replace function public._note_transcripts_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from note_transcripts where note_id = new.note_id) >= 10 then
    raise exception 'Máximo 10 grabaciones por nota.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists note_transcripts_cap_trg on public.note_transcripts;
create trigger note_transcripts_cap_trg before insert on public.note_transcripts
  for each row execute function public._note_transcripts_cap();

create or replace function public._note_transcripts_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists note_transcripts_touch_trg on public.note_transcripts;
create trigger note_transcripts_touch_trg before update on public.note_transcripts
  for each row execute function public._note_transcripts_touch();
