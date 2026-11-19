-- =====================================================================
-- Kaderno · schema_v22.sql  (versión 23 de la app: proyectos en grupo)
--
-- Requiere schema_v12 (proyectos) y schema_v14 (bandeja de avisos). Es
-- idempotente: se puede correr dos veces. Crece por fases (ver PLAN_v23.md).
--
-- Fase 2 · Comentarios y menciones en tareas de proyecto
--   · task_comments: comentarios de los integrantes (también los lectores)
--     con @menciones. Solo los ven los integrantes del proyecto; cada quien
--     edita o borra lo suyo (el dueño del proyecto también puede borrar).
--   · Avisos: a quien mencionan ("te mencionó") y a quien tiene la tarea
--     ("comentó en tu tarea"), con enlace que abre la tarea. El aviso de
--     "te asignaron una tarea" ya existe desde schema_v14.
-- =====================================================================


-- =====================================================================
--  FASE 2 · Comentarios y menciones
-- =====================================================================
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  task_id    uuid not null references public.project_tasks on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  mentions   uuid[] not null default '{}' check (cardinality(mentions) <= 20),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);
create index if not exists task_comments_project_idx on public.task_comments (project_id);

alter table public.task_comments enable row level security;
drop policy if exists "members read comments" on public.task_comments;
create policy "members read comments" on public.task_comments for select
  using (public.is_project_member(project_id));
drop policy if exists "members write comments" on public.task_comments;
create policy "members write comments" on public.task_comments for insert
  with check (author_id = auth.uid() and public.is_project_member(project_id));
drop policy if exists "authors edit comments" on public.task_comments;
create policy "authors edit comments" on public.task_comments for update
  using (author_id = auth.uid()) with check (author_id = auth.uid() and public.is_project_member(project_id));
drop policy if exists "authors or owner delete comments" on public.task_comments;
create policy "authors or owner delete comments" on public.task_comments for delete
  using (author_id = auth.uid() or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
revoke update on public.task_comments from authenticated;
grant select, insert, delete on public.task_comments to authenticated;
grant update (body, mentions) on public.task_comments to authenticated;

-- El proyecto sale de la tarea (no se puede comentar "en otro proyecto"), las
-- menciones solo pueden ser integrantes, y editar deja la marca.
create or replace function public._task_comments_fix() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from project_tasks where id = new.task_id;
  if pid is null then raise exception 'La tarea no existe.' using errcode = 'P0001'; end if;
  new.project_id := pid;
  new.mentions := coalesce(array(
    select distinct m from unnest(new.mentions) m
     where m is distinct from new.author_id
       and exists (select 1 from project_members pm where pm.project_id = pid and pm.user_id = m)), '{}');
  if tg_op = 'INSERT' then
    if (select count(*) from task_comments where task_id = new.task_id) >= 500 then
      raise exception 'Máximo 500 comentarios por tarea.' using errcode = 'P0001';
    end if;
  else
    new.edited_at := now();
  end if;
  return new;
end $$;
drop trigger if exists task_comments_fix_trg on public.task_comments;
create trigger task_comments_fix_trg before insert or update on public.task_comments
  for each row execute function public._task_comments_fix();

-- Avisos al comentar.
create or replace function public._task_comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; who text; pname text; excerpt text; link text; m uuid;
begin
  select pt.title, pt.assignee_id into t from project_tasks pt where pt.id = new.task_id;
  select name into pname from projects where id = new.project_id;
  select coalesce(nullif(btrim(display_name), ''), split_part(email, '@', 1), 'Alguien') into who from profiles where id = new.author_id;
  who := coalesce(who, 'Alguien');
  excerpt := left(regexp_replace(new.body, '\s+', ' ', 'g'), 90) || case when char_length(new.body) > 90 then '…' else '' end;
  link := '/proyectos/' || new.project_id::text || '?tarea=' || new.task_id::text;
  -- Menciones nuevas (al editar, solo las que no estaban).
  foreach m in array new.mentions loop
    if tg_op = 'UPDATE' and m = any(old.mentions) then continue; end if;
    insert into notification_queue (user_id, kind, ref, title, body, url)
    values (m, 'mention', new.id::text || ':' || m::text, who || ' te mencionó',
            coalesce(pname, 'Proyecto') || ' · ' || coalesce(t.title, 'Tarea') || ': ' || excerpt, link)
    on conflict (user_id, kind, ref) do nothing;
  end loop;
  -- Quien tiene la tarea (si no comentó ni fue mencionado).
  if tg_op = 'INSERT' and t.assignee_id is not null and t.assignee_id <> new.author_id and not (t.assignee_id = any(new.mentions)) then
    insert into notification_queue (user_id, kind, ref, title, body, url)
    values (t.assignee_id, 'comment', new.id::text, who || ' comentó en tu tarea',
            coalesce(pname, 'Proyecto') || ' · ' || coalesce(t.title, 'Tarea') || ': ' || excerpt, link)
    on conflict (user_id, kind, ref) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists task_comments_notify_trg on public.task_comments;
create trigger task_comments_notify_trg after insert or update of mentions on public.task_comments
  for each row execute function public._task_comments_notify();

-- El aviso de asignación (schema_v14) ahora abre la tarea directamente.
create or replace function public._kaderno_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and new.assignee_id is distinct from auth.uid() then
    select name into pname from public.projects where id = new.project_id;
    insert into public.notification_queue (user_id, kind, ref, title, body, url)
    values (new.assignee_id, 'assigned', new.id::text || ':' || new.assignee_id::text,
            'Te asignaron una tarea', coalesce(pname, 'Proyecto') || ': ' || new.title,
            '/proyectos/' || new.project_id::text || '?tarea=' || new.id::text)
    on conflict (user_id, kind, ref) do nothing;
  end if;
  return new;
end $$;
