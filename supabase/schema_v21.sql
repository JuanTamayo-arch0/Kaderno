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
--
-- Fase 2 · Anotar PDFs
--   · file_highlights: resaltados y comentarios en los PDF de Archivos de la
--     materia y de los proyectos. Son de cada persona (aunque el archivo sea
--     de un proyecto en grupo) y se borran con el archivo.
--
-- Fase 3 · ¿Cómo te fue?
--   · exam_results: la nota de un parcial o quiz (o "no lo presenté"), cómo
--     te sentiste, tus razones y qué harás distinto, con una foto de las
--     horas de enfoque de ese momento. Uno por parcial. La nota también va a
--     Calificaciones (grade_id).
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


-- =====================================================================
--  FASE 2 · Anotar PDFs
-- =====================================================================
create table if not exists public.file_highlights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  file_kind  text not null check (file_kind in ('subject', 'project')),
  file_id    uuid not null,
  page       integer not null check (page between 1 and 5000),
  rects      jsonb not null check (jsonb_typeof(rects) = 'array' and jsonb_array_length(rects) between 1 and 200),
  text       text not null default '' check (char_length(text) <= 5000),
  color      text not null default 'yellow' check (color in ('yellow', 'green', 'blue', 'pink')),
  comment    text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists file_highlights_file_idx on public.file_highlights (user_id, file_kind, file_id, page);

-- ¿Puede la persona ver ese archivo? (el suyo de una materia, o de un proyecto donde es miembro)
create or replace function public._can_see_file(p_kind text, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'subject' then
    return exists (select 1 from subject_files f where f.id = p_id and f.user_id = auth.uid());
  elsif p_kind = 'project' then
    return exists (select 1 from project_files f where f.id = p_id and is_project_member(f.project_id));
  end if;
  return false;
end $$;
revoke all on function public._can_see_file(text, uuid) from public, anon;
grant execute on function public._can_see_file(text, uuid) to authenticated;

alter table public.file_highlights enable row level security;
drop policy if exists "own highlights" on public.file_highlights;
create policy "own highlights" on public.file_highlights for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public._can_see_file(file_kind, file_id));
grant select, insert, update, delete on public.file_highlights to authenticated;

-- Tope de 2000 resaltados por archivo y persona.
create or replace function public._file_highlights_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from file_highlights where user_id = new.user_id and file_kind = new.file_kind and file_id = new.file_id) >= 2000 then
    raise exception 'Máximo 2000 resaltados por archivo.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists file_highlights_cap_trg on public.file_highlights;
create trigger file_highlights_cap_trg before insert on public.file_highlights
  for each row execute function public._file_highlights_cap();

-- Al borrar el archivo se borran sus resaltados (de todos).
create or replace function public._file_highlights_gone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from file_highlights where file_kind = tg_argv[0] and file_id = old.id;
  return old;
end $$;
do $$ begin
  if to_regclass('public.subject_files') is not null then
    drop trigger if exists subject_files_highlights_trg on public.subject_files;
    create trigger subject_files_highlights_trg after delete on public.subject_files
      for each row execute function public._file_highlights_gone('subject');
  end if;
  if to_regclass('public.project_files') is not null then
    drop trigger if exists project_files_highlights_trg on public.project_files;
    create trigger project_files_highlights_trg after delete on public.project_files
      for each row execute function public._file_highlights_gone('project');
  end if;
end $$;


-- =====================================================================
--  FASE 3 · ¿Cómo te fue?
-- =====================================================================
create table if not exists public.exam_results (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  task_id    uuid not null unique references public.assignments on delete cascade,
  subject_id uuid references public.subjects on delete set null,
  title      text not null default '' check (char_length(title) <= 200),
  exam_date  date,
  score      numeric check (score is null or score >= 0),
  max_score  numeric not null default 5 check (max_score > 0 and max_score <= 1000),
  skipped    boolean not null default false,
  felt       smallint check (felt is null or felt between 1 and 5),
  reasons    text[] not null default '{}' check (cardinality(reasons) <= 12),
  change     text check (change is null or char_length(change) <= 300),
  grade_id   uuid references public.grades on delete set null,
  focus_min  integer not null default 0 check (focus_min between 0 and 100000),
  created_at timestamptz not null default now(),
  constraint exam_results_score_chk check (skipped or (score is not null and score <= max_score))
);
create index if not exists exam_results_user_idx on public.exam_results (user_id, subject_id, created_at desc);
alter table public.exam_results enable row level security;
drop policy if exists "own exam results" on public.exam_results;
create policy "own exam results" on public.exam_results for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.assignments a where a.id = task_id and a.user_id = auth.uid()));
grant select, insert, update, delete on public.exam_results to authenticated;

