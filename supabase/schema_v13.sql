-- =====================================================================
-- Kaderno · schema_v13.sql
-- Importar tareas, actualizar por archivo, editar en masa y deshacer,
-- todo dentro de Proyectos.
--
-- Requiere schema_v8 a schema_v12 aplicados (en ese orden).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Supuestos sobre las tablas de schema_v12 (se verifican contra el código real
-- antes de la entrega final; si algo cambia, solo hay que tocar las funciones
-- auxiliares _kaderno_insert_task y _kaderno_replace_steps):
--   project_tasks(id, project_id, title, description, status, assignee_id,
--                 due_date o due_at, position)
--   project_task_steps(id, task_id, title, done, position)
--   project_members(project_id, user_id, role in owner|editor|viewer)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------

alter table public.project_tasks
  add column if not exists start_at   timestamptz,
  add column if not exists due_at     timestamptz,
  add column if not exists batch_id   uuid,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists updated_by uuid references auth.users on delete set null;

alter table public.project_task_steps
  add column if not exists batch_id uuid;

create index if not exists project_tasks_batch_idx on public.project_tasks(batch_id) where batch_id is not null;


-- ---------------------------------------------------------------------
-- 2. Fecha con hora: due_at, sincronizada con due_date si existe
--
-- Si la tabla ya tenía due_date (solo fecha), se copia a due_at a las
-- 11:59 p. m. de Bogotá y un trigger mantiene las dos iguales, para que
-- las pantallas que todavía leen due_date sigan funcionando.
-- ---------------------------------------------------------------------

do $$
declare
  v_type text;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'project_tasks' and column_name = 'due_date';

  if v_type = 'date' then
    update public.project_tasks
       set due_at = (due_date::timestamp + time '23:59') at time zone 'America/Bogota'
     where due_at is null and due_date is not null;

    create or replace function public.project_tasks_sync_due() returns trigger
    language plpgsql as $f$
    begin
      if tg_op = 'INSERT' then
        if new.due_at is not null then
          new.due_date := (new.due_at at time zone 'America/Bogota')::date;
        elsif new.due_date is not null then
          new.due_at := (new.due_date::timestamp + time '23:59') at time zone 'America/Bogota';
        end if;
      else
        if new.due_at is distinct from old.due_at then
          new.due_date := case when new.due_at is null then null
                               else (new.due_at at time zone 'America/Bogota')::date end;
        elsif new.due_date is distinct from old.due_date then
          new.due_at := case when new.due_date is null then null
                             else (new.due_date::timestamp + time '23:59') at time zone 'America/Bogota' end;
        end if;
      end if;
      return new;
    end $f$;

    drop trigger if exists project_tasks_sync_due on public.project_tasks;
    create trigger project_tasks_sync_due
      before insert or update on public.project_tasks
      for each row execute function public.project_tasks_sync_due();

  elsif v_type in ('timestamp with time zone', 'timestamp without time zone') then
    -- due_date ya guardaba la hora: due_at queda como copia exacta.
    execute 'update public.project_tasks set due_at = due_date::timestamptz where due_at is null and due_date is not null';

    create or replace function public.project_tasks_sync_due() returns trigger
    language plpgsql as $f$
    begin
      if tg_op = 'INSERT' then
        if new.due_at is not null then new.due_date := new.due_at;
        elsif new.due_date is not null then new.due_at := new.due_date; end if;
      else
        if new.due_at is distinct from old.due_at then new.due_date := new.due_at;
        elsif new.due_date is distinct from old.due_date then new.due_at := new.due_date; end if;
      end if;
      return new;
    end $f$;

    drop trigger if exists project_tasks_sync_due on public.project_tasks;
    create trigger project_tasks_sync_due
      before insert or update on public.project_tasks
      for each row execute function public.project_tasks_sync_due();
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 3. Historial de cambios masivos (para deshacer y para el registro)
-- ---------------------------------------------------------------------

create table if not exists public.project_batches (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('import', 'bulk_edit', 'file_update')),
  summary     jsonb not null default '{}'::jsonb,
  -- Lista de operaciones en el orden en que se hicieron:
  --   {"op":"insert","id":...}
  --   {"op":"update","task":{fila antes},"steps":[pasos antes] | null}
  --   {"op":"delete","task":{fila},"steps":[pasos]}
  snapshot    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  undone_at   timestamptz
);

create index if not exists project_batches_project_idx
  on public.project_batches(project_id, created_at desc);

alter table public.project_batches enable row level security;

drop policy if exists "project_batches read members" on public.project_batches;
create policy "project_batches read members" on public.project_batches
  for select using (public.is_project_member(project_id));
-- Sin políticas de escritura: solo las funciones de abajo escriben aquí.


-- ---------------------------------------------------------------------
-- 4. Funciones auxiliares (no se pueden llamar desde la app)
-- ---------------------------------------------------------------------

-- ¿Quien llama puede editar el proyecto? (owner o editor)
create or replace function public._kaderno_can_edit(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members
     where project_id = p and user_id = auth.uid() and role in ('owner', 'editor')
  );
$$;

create or replace function public._kaderno_is_member(p uuid, u uuid) returns boolean
language sql stable set search_path = public as $$
  select u is not null and exists (select 1 from project_members where project_id = p and user_id = u);
$$;

-- Texto para comparar ítems de checklist sin tildes ni mayúsculas.
create or replace function public._kaderno_norm(s text) returns text
language sql immutable as $$
  select translate(lower(btrim(coalesce(s, ''))), 'áéíóúüñàèìòùäëïö', 'aeiouunaeiouaeio');
$$;

-- Fila de la tarea y su checklist, para guardar en el snapshot.
create or replace function public._kaderno_task_snapshot(p_task uuid, p_with_steps boolean)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'task', to_jsonb(t),
    'steps', case when p_with_steps then coalesce(
      (select jsonb_agg(to_jsonb(s) order by s.position) from project_task_steps s where s.task_id = t.id),
      '[]'::jsonb) else null end)
  from project_tasks t where t.id = p_task;
$$;

-- Reemplaza el checklist de una tarea. Un ítem con "done": null conserva el
-- estado del ítem existente con el mismo texto. Devuelve cuántos ítems quedaron.
create or replace function public._kaderno_replace_steps(p_task uuid, p_steps jsonb, p_batch uuid)
returns int language plpgsql set search_path = public as $$
declare
  v_prev jsonb;
  v_item jsonb;
  v_title text;
  v_done boolean;
  v_pos int := 0;
begin
  select coalesce(jsonb_object_agg(_kaderno_norm(title), done), '{}'::jsonb)
    into v_prev
    from (select distinct on (_kaderno_norm(title)) title, done
            from project_task_steps where task_id = p_task order by _kaderno_norm(title), position) x;

  delete from project_task_steps where task_id = p_task;

  for v_item in select value from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) limit 50 loop
    v_title := left(btrim(v_item->>'title'), 300);
    continue when v_title is null or v_title = '';
    if v_item ? 'done' and jsonb_typeof(v_item->'done') = 'boolean' then
      v_done := (v_item->>'done')::boolean;
    else
      v_done := coalesce((v_prev->>_kaderno_norm(v_title))::boolean, false);
    end if;
    v_pos := v_pos + 1;
    -- AJUSTAR si project_task_steps tiene más columnas obligatorias.
    insert into project_task_steps (task_id, title, done, position, batch_id)
    values (p_task, v_title, v_done, v_pos, p_batch);
  end loop;
  return v_pos;
end $$;

-- Crea una tarea. Devuelve su id.
create or replace function public._kaderno_insert_task(p_project uuid, t jsonb, p_position numeric, p_batch uuid)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_title text := left(btrim(t->>'title'), 200);
begin
  if v_title is null or v_title = '' then
    raise exception 'KADERNO_NO_TITLE';
  end if;
  -- AJUSTAR si project_tasks tiene más columnas obligatorias.
  insert into project_tasks (project_id, title, description, status, assignee_id,
                             start_at, due_at, position, batch_id, updated_by)
  values (p_project,
          v_title,
          left(nullif(btrim(t->>'description'), ''), 5000),
          coalesce(nullif(t->>'status', ''), 'todo'),
          nullif(t->>'assignee_id', '')::uuid,
          nullif(t->>'start_at', '')::timestamptz,
          nullif(t->>'due_at', '')::timestamptz,
          p_position,
          p_batch,
          auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Ninguna tarea del lote puede quedar con inicio después de la entrega.
create or replace function public._kaderno_check_dates(p_ids uuid[]) returns void
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from project_tasks
              where id = any(p_ids) and start_at is not null and due_at is not null and start_at > due_at) then
    raise exception 'KADERNO_BAD_DATES';
  end if;
end $$;

revoke all on function public._kaderno_is_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public._kaderno_task_snapshot(uuid, boolean) from public, anon, authenticated;
revoke all on function public._kaderno_replace_steps(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public._kaderno_insert_task(uuid, jsonb, numeric, uuid) from public, anon, authenticated;
revoke all on function public._kaderno_check_dates(uuid[]) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. import_project_tasks: crear tareas desde un archivo
--
-- p_tasks: [{title, description, status, assignee_id, start_at, due_at,
--            checklist: [{title, done}]}]
-- p_duplicates: 'omitir' | 'actualizar' | 'crear'
--   (duplicado = mismo título sin tildes ni mayúsculas y misma entrega)
-- ---------------------------------------------------------------------

create or replace function public.import_project_tasks(
  p_project uuid, p_tasks jsonb, p_duplicates text default 'omitir')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_snapshot jsonb := '[]'::jsonb;
  v_pos numeric;
  t jsonb;
  v_id uuid;
  v_dup uuid;
  v_assignee uuid;
  v_due timestamptz;
  v_touched uuid[] := '{}';
  n_created int := 0; n_updated int := 0; n_skipped int := 0; n_steps int := 0; n_unassigned int := 0;
begin
  if not _kaderno_can_edit(p_project) then
    raise exception 'KADERNO_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_tasks) <> 'array' then
    raise exception 'KADERNO_BAD_PAYLOAD';
  end if;
  if jsonb_array_length(p_tasks) > 500 then
    raise exception 'KADERNO_TOO_MANY';
  end if;
  if p_duplicates not in ('omitir', 'actualizar', 'crear') then
    p_duplicates := 'omitir';
  end if;

  select coalesce(max(position), 0) into v_pos from project_tasks where project_id = p_project;

  for t in select value from jsonb_array_elements(p_tasks) loop
    -- Responsable: solo integrantes del proyecto.
    v_assignee := nullif(t->>'assignee_id', '')::uuid;
    if v_assignee is not null and not _kaderno_is_member(p_project, v_assignee) then
      t := jsonb_set(t, '{assignee_id}', 'null'::jsonb);
      n_unassigned := n_unassigned + 1;
    end if;

    v_due := nullif(t->>'due_at', '')::timestamptz;
    v_dup := null;
    if p_duplicates <> 'crear' then
      select id into v_dup from project_tasks
       where project_id = p_project
         and _kaderno_norm(title) = _kaderno_norm(t->>'title')
         and due_at is not distinct from v_due
       limit 1;
    end if;

    if v_dup is not null and p_duplicates = 'omitir' then
      n_skipped := n_skipped + 1;
      continue;
    end if;

    if v_dup is not null and p_duplicates = 'actualizar' then
      v_snapshot := v_snapshot || jsonb_build_array(
        jsonb_build_object('op', 'update') || _kaderno_task_snapshot(v_dup, t->'checklist' is not null and jsonb_typeof(t->'checklist') = 'array'));
      update project_tasks set
        description = coalesce(left(nullif(btrim(t->>'description'), ''), 5000), description),
        status      = coalesce(nullif(t->>'status', ''), status),
        assignee_id = coalesce(nullif(t->>'assignee_id', '')::uuid, assignee_id),
        start_at    = coalesce(nullif(t->>'start_at', '')::timestamptz, start_at),
        updated_at  = now(),
        updated_by  = auth.uid()
      where id = v_dup;
      if jsonb_typeof(t->'checklist') = 'array' then
        n_steps := n_steps + _kaderno_replace_steps(v_dup, t->'checklist', v_batch);
      end if;
      v_touched := v_touched || v_dup;
      n_updated := n_updated + 1;
      continue;
    end if;

    v_pos := v_pos + 1024;
    v_id := _kaderno_insert_task(p_project, t, v_pos, v_batch);
    if jsonb_typeof(t->'checklist') = 'array' then
      n_steps := n_steps + _kaderno_replace_steps(v_id, t->'checklist', v_batch);
    end if;
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('op', 'insert', 'id', v_id));
    v_touched := v_touched || v_id;
    n_created := n_created + 1;
  end loop;

  perform _kaderno_check_dates(v_touched);

  insert into project_batches (id, project_id, user_id, kind, summary, snapshot)
  values (v_batch, p_project, auth.uid(), 'import',
          jsonb_build_object('created', n_created, 'updated', n_updated, 'skipped', n_skipped,
                             'steps', n_steps, 'unassigned', n_unassigned),
          v_snapshot);

  return jsonb_build_object('batch_id', v_batch, 'created', n_created, 'updated', n_updated,
                            'skipped', n_skipped, 'steps', n_steps, 'unassigned', n_unassigned);
end $$;


-- ---------------------------------------------------------------------
-- 6. bulk_update_project_tasks: el mismo cambio a varias tareas
--
-- p_patch admite: status, assignee_id (null = sin asignar), start_at, due_at,
--   shift_minutes + shift_target ('ambas' | 'entrega'), delete (true).
-- Los ids que no son del proyecto se ignoran.
-- ---------------------------------------------------------------------

create or replace function public.bulk_update_project_tasks(
  p_project uuid, p_ids uuid[], p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_snapshot jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_id uuid;
  v_shift interval;
  v_target text := coalesce(p_patch->>'shift_target', 'ambas');
  v_assignee uuid;
  n int;
begin
  if not _kaderno_can_edit(p_project) then
    raise exception 'KADERNO_FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(array_agg(id), '{}') into v_ids
    from project_tasks where project_id = p_project and id = any(coalesce(p_ids, '{}'));
  n := coalesce(array_length(v_ids, 1), 0);
  if n = 0 then
    return jsonb_build_object('batch_id', null, 'updated', 0, 'deleted', 0,
                              'ignored_ids', coalesce(array_length(p_ids, 1), 0));
  end if;

  if coalesce((p_patch->>'delete')::boolean, false) then
    foreach v_id in array v_ids loop
      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('op', 'delete') || _kaderno_task_snapshot(v_id, true));
    end loop;
    delete from project_task_steps where task_id = any(v_ids);
    delete from project_tasks where id = any(v_ids);
    insert into project_batches (id, project_id, user_id, kind, summary, snapshot)
    values (v_batch, p_project, auth.uid(), 'bulk_edit', jsonb_build_object('deleted', n), v_snapshot);
    return jsonb_build_object('batch_id', v_batch, 'updated', 0, 'deleted', n,
                              'ignored_ids', coalesce(array_length(p_ids, 1), 0) - n);
  end if;

  if p_patch ? 'assignee_id' then
    v_assignee := nullif(p_patch->>'assignee_id', '')::uuid;
    if v_assignee is not null and not _kaderno_is_member(p_project, v_assignee) then
      raise exception 'KADERNO_NOT_MEMBER';
    end if;
  end if;

  if p_patch ? 'shift_minutes' then
    v_shift := make_interval(mins => (p_patch->>'shift_minutes')::int);
  end if;

  foreach v_id in array v_ids loop
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('op', 'update') || _kaderno_task_snapshot(v_id, false));
  end loop;

  update project_tasks set
    status = case when p_patch ? 'status' then coalesce(nullif(p_patch->>'status', ''), status) else status end,
    assignee_id = case when p_patch ? 'assignee_id' then v_assignee else assignee_id end,
    start_at = case
      when p_patch ? 'start_at' then nullif(p_patch->>'start_at', '')::timestamptz
      when v_shift is not null and v_target = 'ambas' then start_at + v_shift
      else start_at end,
    due_at = case
      when p_patch ? 'due_at' then nullif(p_patch->>'due_at', '')::timestamptz
      when v_shift is not null then due_at + v_shift
      else due_at end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = any(v_ids);

  perform _kaderno_check_dates(v_ids);

  insert into project_batches (id, project_id, user_id, kind, summary, snapshot)
  values (v_batch, p_project, auth.uid(), 'bulk_edit',
          jsonb_build_object('updated', n, 'patch', p_patch - 'delete'), v_snapshot);

  return jsonb_build_object('batch_id', v_batch, 'updated', n, 'deleted', 0,
                            'ignored_ids', coalesce(array_length(p_ids, 1), 0) - n);
end $$;


-- ---------------------------------------------------------------------
-- 7. apply_project_file: actualizar desde un archivo exportado
--
-- p_rows: filas con id  → actualizan solo los campos listados en "fields"
--         filas con id y "delete": true → se borran
--         filas sin id  → se crean
-- Una tarea que no aparece en el archivo no se toca.
-- ---------------------------------------------------------------------

create or replace function public.apply_project_file(p_project uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_snapshot jsonb := '[]'::jsonb;
  v_pos numeric;
  r jsonb;
  v_id uuid;
  f jsonb;
  v_assignee uuid;
  v_keep_assignee boolean;
  v_touched uuid[] := '{}';
  n_created int := 0; n_updated int := 0; n_deleted int := 0; n_steps int := 0;
  n_ignored int := 0; n_unassigned int := 0;
begin
  if not _kaderno_can_edit(p_project) then
    raise exception 'KADERNO_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'KADERNO_BAD_PAYLOAD';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'KADERNO_TOO_MANY';
  end if;

  select coalesce(max(position), 0) into v_pos from project_tasks where project_id = p_project;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_id := nullif(r->>'id', '')::uuid;

    -- Fila nueva
    if v_id is null then
      v_assignee := nullif(r->>'assignee_id', '')::uuid;
      if v_assignee is not null and not _kaderno_is_member(p_project, v_assignee) then
        r := jsonb_set(r, '{assignee_id}', 'null'::jsonb);
        n_unassigned := n_unassigned + 1;
      end if;
      v_pos := v_pos + 1024;
      v_id := _kaderno_insert_task(p_project, r, v_pos, v_batch);
      if jsonb_typeof(r->'checklist') = 'array' then
        n_steps := n_steps + _kaderno_replace_steps(v_id, r->'checklist', v_batch);
      end if;
      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('op', 'insert', 'id', v_id));
      v_touched := v_touched || v_id;
      n_created := n_created + 1;
      continue;
    end if;

    -- El id tiene que ser de este proyecto.
    if not exists (select 1 from project_tasks where id = v_id and project_id = p_project) then
      n_ignored := n_ignored + 1;
      continue;
    end if;

    -- Borrar
    if coalesce((r->>'delete')::boolean, false) then
      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('op', 'delete') || _kaderno_task_snapshot(v_id, true));
      delete from project_task_steps where task_id = v_id;
      delete from project_tasks where id = v_id;
      n_deleted := n_deleted + 1;
      continue;
    end if;

    -- Actualizar solo los campos que vienen
    f := coalesce(r->'fields', '[]'::jsonb);
    continue when jsonb_array_length(f) = 0;

    v_keep_assignee := not (f ? 'assignee_id');
    if f ? 'assignee_id' then
      v_assignee := nullif(r->>'assignee_id', '')::uuid;
      if v_assignee is not null and not _kaderno_is_member(p_project, v_assignee) then
        v_keep_assignee := true;
        n_unassigned := n_unassigned + 1;
      end if;
    end if;

    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('op', 'update') || _kaderno_task_snapshot(v_id, f ? 'checklist'));

    update project_tasks set
      title       = case when f ? 'title' and nullif(btrim(r->>'title'), '') is not null
                         then left(btrim(r->>'title'), 200) else title end,
      description = case when f ? 'description' then left(nullif(btrim(r->>'description'), ''), 5000) else description end,
      status      = case when f ? 'status' then coalesce(nullif(r->>'status', ''), status) else status end,
      assignee_id = case when v_keep_assignee then assignee_id else v_assignee end,
      start_at    = case when f ? 'start_at' then nullif(r->>'start_at', '')::timestamptz else start_at end,
      due_at      = case when f ? 'due_at' then nullif(r->>'due_at', '')::timestamptz else due_at end,
      updated_at  = now(),
      updated_by  = auth.uid()
    where id = v_id;

    if f ? 'checklist' then
      n_steps := n_steps + _kaderno_replace_steps(v_id, coalesce(r->'checklist', '[]'::jsonb), v_batch);
    end if;
    v_touched := v_touched || v_id;
    n_updated := n_updated + 1;
  end loop;

  perform _kaderno_check_dates(v_touched);

  insert into project_batches (id, project_id, user_id, kind, summary, snapshot)
  values (v_batch, p_project, auth.uid(), 'file_update',
          jsonb_build_object('created', n_created, 'updated', n_updated, 'deleted', n_deleted,
                             'steps', n_steps, 'ignored_ids', n_ignored, 'unassigned', n_unassigned),
          v_snapshot);

  return jsonb_build_object('batch_id', v_batch, 'created', n_created, 'updated', n_updated,
                            'deleted', n_deleted, 'steps', n_steps, 'ignored_ids', n_ignored,
                            'unassigned', n_unassigned);
end $$;


-- ---------------------------------------------------------------------
-- 8. undo_project_batch: deshacer el último cambio masivo
--
-- Solo el último lote sin deshacer del proyecto y durante 7 días, para no
-- pisar cambios masivos que otro integrante haya hecho después.
-- ---------------------------------------------------------------------

create or replace function public.undo_project_batch(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b project_batches%rowtype;
  op jsonb;
  v_id uuid;
  n_removed int := 0; n_restored int := 0; n_recreated int := 0;
begin
  select * into b from project_batches where id = p_batch for update;
  if not found then
    raise exception 'KADERNO_NOT_FOUND';
  end if;
  if not _kaderno_can_edit(b.project_id) then
    raise exception 'KADERNO_FORBIDDEN' using errcode = '42501';
  end if;
  if b.undone_at is not null then
    raise exception 'KADERNO_UNDO_DONE';
  end if;
  if b.created_at < now() - interval '7 days' then
    raise exception 'KADERNO_UNDO_EXPIRED';
  end if;
  if exists (select 1 from project_batches
              where project_id = b.project_id and undone_at is null
                and (created_at, id) > (b.created_at, b.id)) then
    raise exception 'KADERNO_UNDO_NOT_LATEST';
  end if;

  -- Se recorre al revés para dejar todo como estaba antes del lote.
  for op in select value from jsonb_array_elements(b.snapshot) with ordinality as x(value, i) order by i desc loop
    if op->>'op' = 'insert' then
      v_id := (op->>'id')::uuid;
      delete from project_task_steps where task_id = v_id;
      delete from project_tasks where id = v_id and project_id = b.project_id;
      n_removed := n_removed + 1;

    elsif op->>'op' = 'update' then
      v_id := (op->'task'->>'id')::uuid;
      update project_tasks t set
        title = r.title, description = r.description, status = r.status,
        assignee_id = r.assignee_id, start_at = r.start_at, due_at = r.due_at,
        position = r.position, updated_at = now(), updated_by = auth.uid()
      from jsonb_populate_record(null::project_tasks, op->'task') r
      where t.id = v_id and t.project_id = b.project_id;
      if jsonb_typeof(op->'steps') = 'array' then
        delete from project_task_steps where task_id = v_id;
        insert into project_task_steps
          select * from jsonb_populate_recordset(null::project_task_steps, op->'steps');
      end if;
      n_restored := n_restored + 1;

    elsif op->>'op' = 'delete' then
      v_id := (op->'task'->>'id')::uuid;
      if not exists (select 1 from project_tasks where id = v_id) then
        insert into project_tasks select * from jsonb_populate_record(null::project_tasks, op->'task');
        if jsonb_typeof(op->'steps') = 'array' then
          insert into project_task_steps
            select * from jsonb_populate_recordset(null::project_task_steps, op->'steps');
        end if;
        n_recreated := n_recreated + 1;
      end if;
    end if;
  end loop;

  update project_batches set undone_at = now() where id = b.id;

  return jsonb_build_object('batch_id', b.id, 'removed', n_removed, 'restored', n_restored, 'recreated', n_recreated);
end $$;


-- ---------------------------------------------------------------------
-- 9. Permisos de las funciones públicas
-- ---------------------------------------------------------------------

revoke all on function public.import_project_tasks(uuid, jsonb, text) from public, anon;
revoke all on function public.bulk_update_project_tasks(uuid, uuid[], jsonb) from public, anon;
revoke all on function public.apply_project_file(uuid, jsonb) from public, anon;
revoke all on function public.undo_project_batch(uuid) from public, anon;

grant execute on function public.import_project_tasks(uuid, jsonb, text) to authenticated;
grant execute on function public.bulk_update_project_tasks(uuid, uuid[], jsonb) to authenticated;
grant execute on function public.apply_project_file(uuid, jsonb) to authenticated;
grant execute on function public.undo_project_batch(uuid) to authenticated;

notify pgrst, 'reload schema';
