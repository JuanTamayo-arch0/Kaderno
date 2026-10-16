-- =====================================================================
-- Kaderno · schema_v15.sql
--
-- Versiones de los archivos de un proyecto.
-- Requiere schema_v12.sql (Proyectos: tabla project_files y bucket
-- project-files). Es idempotente: se puede correr dos veces.
--
-- Cómo funciona:
--   · project_files es "el archivo" (nombre, descripción, versión actual).
--   · project_file_versions guarda cada versión subida (ruta en Storage,
--     tamaño, nota de qué cambió, quién y cuándo).
--   · Al insertar una versión, el disparador le pone el número siguiente
--     (1, 2, 3...) y actualiza el archivo para que apunte a ella.
--   · Restaurar una versión vieja = crear una versión nueva con la misma
--     ruta; así el historial nunca se pierde.
-- =====================================================================

alter table public.project_files
  add column if not exists current_version integer not null default 1,
  add column if not exists description     text,
  add column if not exists updated_at      timestamptz not null default now(),
  add column if not exists updated_by      uuid references public.profiles(id) on delete set null;

create table if not exists public.project_file_versions (
  id          uuid primary key default gen_random_uuid(),
  file_id     uuid not null references public.project_files(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  version     integer not null,
  name        text,                 -- nombre con que se subió esta versión
  path        text not null,
  size        bigint,
  mime        text,
  note        text,
  restored_from integer,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (file_id, version)
);
create index if not exists project_file_versions_file_idx on public.project_file_versions (file_id, version desc);
create index if not exists project_files_updated_idx on public.project_files (project_id, updated_at desc);

-- Número de versión, proyecto y autor los pone la base (no el cliente).
create or replace function public._kaderno_file_version_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select id, project_id, name into f from public.project_files where id = new.file_id for update;
  if f.id is null then raise exception 'KADERNO_FILE_NOT_FOUND'; end if;
  new.project_id := f.project_id;
  new.name := coalesce(nullif(btrim(new.name), ''), f.name);
  new.version := coalesce((select max(version) from public.project_file_versions where file_id = new.file_id), 0) + 1;
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  if new.note is not null then new.note := nullif(left(btrim(new.note), 500), ''); end if;
  return new;
end $$;

create or replace function public._kaderno_file_version_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.project_files
     set current_version = new.version, path = new.path, size = new.size, mime = coalesce(new.mime, mime),
         updated_at = new.created_at, updated_by = new.uploaded_by
   where id = new.file_id;
  return new;
end $$;

drop trigger if exists project_file_versions_before on public.project_file_versions;
create trigger project_file_versions_before before insert on public.project_file_versions
  for each row execute function public._kaderno_file_version_before();
drop trigger if exists project_file_versions_after on public.project_file_versions;
create trigger project_file_versions_after after insert on public.project_file_versions
  for each row execute function public._kaderno_file_version_after();

-- Las versiones no se editan: un historial que se puede cambiar no es historial.
alter table public.project_file_versions enable row level security;
drop policy if exists "pfversions read" on public.project_file_versions;
create policy "pfversions read" on public.project_file_versions
  for select using (public.is_project_member(project_id));
drop policy if exists "pfversions insert" on public.project_file_versions;
create policy "pfversions insert" on public.project_file_versions
  for insert with check (
    public.can_edit_project((select project_id from public.project_files where id = file_id))
  );

-- Archivos que ya existían: quedan como versión 1.
insert into public.project_file_versions (file_id, project_id, version, name, path, size, mime, uploaded_by, created_at)
select f.id, f.project_id, 1, f.name, f.path, f.size, f.mime, f.uploaded_by, f.created_at
  from public.project_files f
 where f.path <> ''
   and not exists (select 1 from public.project_file_versions v where v.file_id = f.id);

revoke all on function public._kaderno_file_version_before() from public, anon, authenticated;
revoke all on function public._kaderno_file_version_after() from public, anon, authenticated;

notify pgrst, 'reload schema';
