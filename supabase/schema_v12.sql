-- ============================================================
--  v12 — Proyectos compartidos (Entrega B)
--
--  Es la primera vez que esta base guarda filas que ven VARIOS usuarios, así
--  que aquí está la parte delicada. Dos reglas que se repiten en todo el
--  archivo y conviene tener en la cabeza al leerlo:
--
--  1) NADA de políticas que se llamen entre sí. Si la política de `projects`
--     consultara `project_members` y la de `project_members` consultara
--     `projects`, Postgres entra en recursión infinita de políticas y todo el
--     módulo deja de responder. Por eso toda la comprobación de pertenencia
--     pasa por funciones `security definer` (is_project_member, project_role):
--     al ejecutarse con los permisos del dueño de la función, saltan RLS y
--     cortan la cadena.
--
--  2) Nadie se mete solo en un proyecto ajeno. La tabla `project_members` NO
--     acepta que un usuario inserte su propia fila; entrar se hace únicamente
--     por `join_project(codigo)`, que valida el código de 6 caracteres. Así el
--     código de invitación es el único camino de entrada.
--
--  Idempotente: se puede correr varias veces sin romper nada.
-- ============================================================


-- ============================================================
--  0. Utilidades
-- ============================================================

-- Cast a uuid que no explota con texto inválido (devuelve null).
-- Lo usan las políticas del bucket de archivos, donde el nombre de la carpeta
-- viene del cliente y podría no ser un uuid.
create or replace function public.try_uuid(t text)
returns uuid language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;


-- ============================================================
--  1. Perfiles públicos
--
--  auth.users no es legible desde el cliente, y para el tablero hacen falta
--  los nombres de los compañeros (avatar con iniciales, "asignado a…", panel
--  de carga). `profiles` es la cara visible y mínima de cada cuenta.
-- ============================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email        text,
  avatar_emoji text not null default '🙂',
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Crea (o completa) el perfil de un usuario. `security definer` porque lee
-- auth.users, que el cliente no puede tocar.
create or replace function public.ensure_profile(u uuid)
returns void language plpgsql security definer set search_path = public as $$
declare em text;
begin
  if u is null then return; end if;
  select email into em from auth.users where id = u;
  insert into public.profiles (id, display_name, email)
  values (u, coalesce(split_part(em, '@', 1), 'Estudiante'), em)
  on conflict (id) do update
    set email = coalesce(public.profiles.email, excluded.email);
end;
$$;

-- Perfil automático al registrarse.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'Estudiante'), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cuentas que ya existían antes de esta migración.
insert into public.profiles (id, display_name, email)
select u.id, coalesce(split_part(u.email, '@', 1), 'Estudiante'), u.email
from auth.users u
on conflict (id) do nothing;

-- (Las políticas de `profiles` están más abajo, en la sección 10: dependen de
--  shares_project_with(), que a su vez necesita que exista project_members.)


-- ============================================================
--  2. Proyectos
--
--  `board_columns` es un jsonb con las columnas del tablero: son configurables
--  por proyecto, no fijas. Cada columna es {key, label, color, done?}. `done`
--  marca la(s) columna(s) que cuentan como terminado (sirve para la barra de
--  progreso y para el panel de carga por integrante).
--
--  Va como jsonb y no como tabla aparte a propósito: reordenar, renombrar o
--  borrar columnas es una sola escritura atómica, y no añade otra tabla más
--  con sus propias políticas al grafo de RLS.
-- ============================================================

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  description   text,
  -- Materia opcional: el proyecto hereda color y contexto de la materia.
  subject_id    uuid references public.subjects(id) on delete set null,
  color         text not null default '#6c8cff',
  icon          text not null default '📦',
  join_code     text unique,
  board_columns jsonb not null default '[
    {"key":"todo",   "label":"Por hacer",   "color":"#9aa3b2"},
    {"key":"doing",  "label":"En curso",    "color":"#6c8cff"},
    {"key":"review", "label":"En revisión", "color":"#f5b64c"},
    {"key":"done",   "label":"Hecho",       "color":"#37c98b", "done":true}
  ]'::jsonb,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.projects enable row level security;

-- Código de invitación de 6 caracteres. Alfabeto sin 0/O ni 1/I/L: se dicta en
-- voz alta y se escribe en el celular del compañero, no queremos confusiones.
create or replace function public.gen_join_code()
returns text language plpgsql volatile as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.projects p where p.join_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.projects_set_code()
returns trigger language plpgsql as $$
begin
  if new.join_code is null or length(trim(new.join_code)) = 0 then
    new.join_code := public.gen_join_code();
  else
    new.join_code := upper(trim(new.join_code));
  end if;
  return new;
end;
$$;

drop trigger if exists projects_set_code_trg on public.projects;
create trigger projects_set_code_trg
  before insert on public.projects
  for each row execute function public.projects_set_code();

-- (is_project_member() y compañía se definen en la sección 3, justo después de
--  la tabla project_members: Postgres valida el cuerpo de la función al
--  crearla, así que la tabla tiene que existir antes.)


-- ============================================================
--  3. Integrantes
-- ============================================================

create table if not exists public.project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

alter table public.project_members enable row level security;

create index if not exists project_members_user_idx    on public.project_members(user_id);
create index if not exists project_members_project_idx on public.project_members(project_id);

-- ------------------------------------------------------------
--  LA función clave. Todo lo demás se apoya en ella.
--  `security definer` = se ejecuta con los permisos del dueño, así que la
--  consulta a project_members NO vuelve a pasar por RLS. Sin esto, la política
--  de projects consultaría project_members, cuya política consultaría projects,
--  y Postgres aborta con "infinite recursion detected in policy".
-- ------------------------------------------------------------
create or replace function public.is_project_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p and m.user_id = auth.uid()
  );
$$;

-- Mi rol en el proyecto: 'owner' | 'editor' | 'viewer' | null si no soy parte.
create or replace function public.project_role(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.project_members m
  where m.project_id = p and m.user_id = auth.uid()
  limit 1;
$$;

-- ¿Puedo escribir aquí? Los "viewer" miran, no tocan.
create or replace function public.can_edit_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.project_role(p) in ('owner', 'editor');
$$;

-- ¿Comparto algún proyecto con este usuario? `security definer` para no volver
-- a entrar en las políticas de project_members. Se define aquí, justo después
-- de la tabla, porque Postgres valida el cuerpo al crear la función.
create or replace function public.shares_project_with(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.project_members a
    join public.project_members b on b.project_id = a.project_id
    where a.user_id = auth.uid() and b.user_id = u
  );
$$;


-- ============================================================
--  4. Tareas del proyecto
-- ============================================================

create table if not exists public.project_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  description text,
  -- `status` guarda la CLAVE de una columna del tablero (board_columns).
  -- Es texto libre a propósito, igual que assignments.type: si alguien borra
  -- una columna, sus tarjetas no desaparecen, se recogen en la primera columna.
  status      text not null default 'todo',
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date    date,
  -- Orden dentro de la columna. Es `double precision`, no un entero: para
  -- meter una tarjeta entre otras dos basta con promediar sus posiciones,
  -- sin reescribir toda la columna en cada arrastre.
  position    double precision not null default 1000,
  -- `done` lo calcula un trigger a partir de si la columna está marcada como
  -- final; el cliente no lo escribe. Así el progreso sigue siendo correcto
  -- aunque el equipo renombre o reordene sus columnas.
  done        boolean not null default false,
  done_at     timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.project_tasks enable row level security;

create index if not exists project_tasks_project_idx  on public.project_tasks(project_id, status, position);
create index if not exists project_tasks_assignee_idx on public.project_tasks(assignee_id, due_date);

-- Mantiene `done` / `done_at` en línea con las columnas del proyecto.
create or replace function public.project_tasks_sync_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare final_keys text[];
begin
  select coalesce(array_agg(c->>'key'), '{}')
    into final_keys
    from public.projects p
    cross join lateral jsonb_array_elements(p.board_columns) c
   where p.id = new.project_id
     and coalesce((c->>'done')::boolean, false);

  new.done := new.status = any(final_keys);
  if new.done then
    new.done_at := coalesce(new.done_at, now());
  else
    new.done_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists project_tasks_sync_done_trg on public.project_tasks;
create trigger project_tasks_sync_done_trg
  before insert or update of status, project_id on public.project_tasks
  for each row execute function public.project_tasks_sync_done();


-- ============================================================
--  5. Microtareas de una tarea de proyecto
--
--  Lleva `project_id` repetido aunque se pueda deducir de la tarea: así la
--  política es una llamada directa a is_project_member y no una subconsulta a
--  project_tasks (que a su vez tiene política). Menos trabajo por fila y una
--  arista menos en el grafo de RLS.
-- ============================================================

create table if not exists public.project_task_steps (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id    uuid not null references public.project_tasks(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.project_task_steps enable row level security;

create index if not exists project_task_steps_task_idx on public.project_task_steps(task_id, position);


-- ============================================================
--  6. Archivos del proyecto
--
--  Tabla y bucket quedan creados, pero esta entrega NO trae interfaz para
--  subir archivos (era opcional y se acordó dejarlo para después). Se deja
--  listo para que la pantalla se pueda añadir sin otra migración.
-- ============================================================

create table if not exists public.project_files (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  task_id     uuid references public.project_tasks(id) on delete cascade,
  name        text not null,
  path        text not null,
  mime        text,
  size        bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.project_files enable row level security;

create index if not exists project_files_project_idx on public.project_files(project_id, created_at desc);


-- ============================================================
--  7. Registro de actividad
--
--  "Quién movió qué". Sirve para que al abrir el proyecto se vea de un vistazo
--  lo que pasó desde la última vez, sin necesidad de tiempo real todavía.
-- ============================================================

create table if not exists public.project_activity (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  kind       text not null,          -- 'create' | 'move' | 'assign' | 'done' | 'join' | ...
  summary    text not null,          -- frase ya lista para mostrar
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.project_activity enable row level security;

create index if not exists project_activity_project_idx on public.project_activity(project_id, created_at desc);


-- ============================================================
--  8. Al crear un proyecto: su dueño entra solo
--
--  El propio creador no puede insertarse en project_members (la política no lo
--  permite, ver más abajo), así que lo hace este trigger `security definer`.
-- ============================================================

create or replace function public.projects_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_profile(new.owner_id);
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do nothing;

  insert into public.project_activity (project_id, actor_id, kind, summary)
  values (new.id, new.owner_id, 'create', 'creó el proyecto');
  return new;
end;
$$;

drop trigger if exists projects_after_insert_trg on public.projects;
create trigger projects_after_insert_trg
  after insert on public.projects
  for each row execute function public.projects_after_insert();


-- ============================================================
--  9. Entrar con código
--
--  Único camino de entrada a un proyecto ajeno. Al ser `security definer`
--  valida el código y escribe la fila él mismo; el cliente nunca inserta en
--  project_members directamente, así que no hay forma de colarse conociendo
--  sólo el id del proyecto.
-- ============================================================

create or replace function public.join_project(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  me  uuid := auth.uid();
begin
  if me is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select p.id into pid
  from public.projects p
  where p.join_code = upper(trim(code)) and p.archived = false;

  if pid is null then
    raise exception 'Ese código no corresponde a ningún proyecto';
  end if;

  perform public.ensure_profile(me);

  -- Si ya era integrante, no pasa nada: devuelve el proyecto igual.
  if exists (select 1 from public.project_members m where m.project_id = pid and m.user_id = me) then
    return pid;
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (pid, me, 'editor');

  insert into public.project_activity (project_id, actor_id, kind, summary)
  values (pid, me, 'join', 'se unió al proyecto');

  return pid;
end;
$$;

-- Rotar el código (por si se filtró). Sólo el dueño.
create or replace function public.regen_join_code(p uuid)
returns text language plpgsql security definer set search_path = public as $$
declare nuevo text;
begin
  if public.project_role(p) <> 'owner' then
    raise exception 'Sólo quien creó el proyecto puede cambiar el código';
  end if;
  nuevo := public.gen_join_code();
  update public.projects set join_code = nuevo where id = p;
  return nuevo;
end;
$$;

-- La app llama a esto al iniciar sesión: garantiza que existe mi perfil antes
-- de crear un proyecto (projects.owner_id apunta a profiles).
create or replace function public.ensure_my_profile()
returns void language sql security definer set search_path = public as $$
  select public.ensure_profile(auth.uid());
$$;

-- Tras cambiar las columnas del tablero, recalcula qué tareas cuentan como
-- terminadas (por si una columna dejó de ser final o pasó a serlo).
create or replace function public.resync_project_done(p uuid)
returns void language plpgsql security definer set search_path = public as $$
declare final_keys text[];
begin
  if not public.can_edit_project(p) then
    raise exception 'No puedes editar este proyecto';
  end if;

  select coalesce(array_agg(c->>'key'), '{}')
    into final_keys
    from public.projects x
    cross join lateral jsonb_array_elements(x.board_columns) c
   where x.id = p and coalesce((c->>'done')::boolean, false);

  update public.project_tasks t
     set done = (t.status = any(final_keys)),
         done_at = case when t.status = any(final_keys) then coalesce(t.done_at, now()) else null end
   where t.project_id = p
     and t.done is distinct from (t.status = any(final_keys));
end;
$$;

-- Vista previa del proyecto antes de entrar (para confirmar "¿es este?").
-- Devuelve sólo nombre e integrantes, nunca las tareas.
create or replace function public.peek_project(code text)
returns table (id uuid, name text, icon text, color text, members int)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.icon, p.color,
         (select count(*)::int from public.project_members m where m.project_id = p.id)
  from public.projects p
  where p.join_code = upper(trim(code)) and p.archived = false;
$$;


-- ============================================================
--  10. Políticas
--
--  Resumen: lees si eres integrante; escribes si además no eres "viewer";
--  borras el proyecto sólo si lo creaste.
-- ============================================================

-- ---------- profiles ----------
-- Ves tu propio perfil y el de la gente con la que compartes proyecto. Nadie
-- más: los perfiles no son un directorio público de la app.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select using (id = auth.uid() or public.shares_project_with(id));

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Insertar sólo tu propia fila (respaldo por si el trigger no corrió).
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (id = auth.uid());

-- ---------- projects ----------
-- Se incluye `owner_id = auth.uid()` además de la pertenencia como red de
-- seguridad: si por lo que sea la fila de integrante se perdiera, el creador
-- no se queda fuera de su propio proyecto.
drop policy if exists "projects read"   on public.projects;
create policy "projects read" on public.projects
  for select using (owner_id = auth.uid() or public.is_project_member(id));

-- Sólo puedes crear proyectos a tu nombre.
drop policy if exists "projects insert" on public.projects;
create policy "projects insert" on public.projects
  for insert with check (owner_id = auth.uid());

-- Editar el proyecto (nombre, columnas del tablero, materia): dueño o editor.
-- Que no se le pueda cambiar el dueño lo garantiza un trigger, NO esta política:
-- una subconsulta a `projects` dentro de una política de `projects` volvería a
-- disparar la misma política y Postgres abortaría por recursión.
drop policy if exists "projects update" on public.projects;
create policy "projects update" on public.projects
  for update using (public.can_edit_project(id))
  with check (public.can_edit_project(id));

create or replace function public.projects_guard_owner()
returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'El dueño de un proyecto no se puede cambiar';
  end if;
  -- El código se normaliza siempre en mayúsculas (se compara así al entrar).
  if new.join_code is not null then new.join_code := upper(trim(new.join_code)); end if;
  return new;
end;
$$;

drop trigger if exists projects_guard_owner_trg on public.projects;
create trigger projects_guard_owner_trg
  before update on public.projects
  for each row execute function public.projects_guard_owner();

-- Borrarlo: sólo quien lo creó.
drop policy if exists "projects delete" on public.projects;
create policy "projects delete" on public.projects
  for delete using (owner_id = auth.uid());

-- ---------- project_members ----------
drop policy if exists "members read" on public.project_members;
create policy "members read" on public.project_members
  for select using (user_id = auth.uid() or public.is_project_member(project_id));

-- OJO: no hay política de INSERT para el usuario normal. Añadir integrantes
-- pasa siempre por join_project() (código de invitación) o por el trigger que
-- mete al creador. Es lo que impide que alguien se agregue a un proyecto ajeno.
drop policy if exists "members insert" on public.project_members;

-- Cambiar el rol de alguien: sólo el dueño, y no sobre sí mismo (para que no
-- pueda dejar el proyecto sin dueño por accidente).
drop policy if exists "members update" on public.project_members;
create policy "members update" on public.project_members
  for update using (public.project_role(project_id) = 'owner' and user_id <> auth.uid())
  with check (public.project_role(project_id) = 'owner' and role in ('editor', 'viewer'));

-- Salirte tú (si no eres el dueño) o que el dueño saque a alguien.
drop policy if exists "members delete" on public.project_members;
create policy "members delete" on public.project_members
  for delete using (
    (user_id = auth.uid() and role <> 'owner')
    or (public.project_role(project_id) = 'owner' and user_id <> auth.uid())
  );

-- ---------- project_tasks ----------
drop policy if exists "ptasks read" on public.project_tasks;
create policy "ptasks read" on public.project_tasks
  for select using (public.is_project_member(project_id));

drop policy if exists "ptasks insert" on public.project_tasks;
create policy "ptasks insert" on public.project_tasks
  for insert with check (public.can_edit_project(project_id));

drop policy if exists "ptasks update" on public.project_tasks;
create policy "ptasks update" on public.project_tasks
  for update using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists "ptasks delete" on public.project_tasks;
create policy "ptasks delete" on public.project_tasks
  for delete using (public.can_edit_project(project_id));

-- ---------- project_task_steps ----------
drop policy if exists "psteps read" on public.project_task_steps;
create policy "psteps read" on public.project_task_steps
  for select using (public.is_project_member(project_id));

drop policy if exists "psteps write" on public.project_task_steps;
create policy "psteps write" on public.project_task_steps
  for all using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

-- ---------- project_files ----------
drop policy if exists "pfiles read" on public.project_files;
create policy "pfiles read" on public.project_files
  for select using (public.is_project_member(project_id));

drop policy if exists "pfiles write" on public.project_files;
create policy "pfiles write" on public.project_files
  for all using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

-- ---------- project_activity ----------
-- Se lee si eres integrante y sólo puedes escribir renglones a tu nombre.
-- No hay update ni delete: un historial que se puede editar no es un historial.
drop policy if exists "pactivity read" on public.project_activity;
create policy "pactivity read" on public.project_activity
  for select using (public.is_project_member(project_id));

drop policy if exists "pactivity insert" on public.project_activity;
create policy "pactivity insert" on public.project_activity
  for insert with check (public.is_project_member(project_id) and actor_id = auth.uid());


-- ============================================================
--  11. Bucket privado de archivos del proyecto
--
--  Convención de ruta: <project_id>/<archivo>. La política mira la primera
--  carpeta y pregunta si eres integrante de ESE proyecto.
--  (Sin interfaz todavía; queda listo para la siguiente entrega.)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do update set public = false;

drop policy if exists "project files read" on storage.objects;
create policy "project files read" on storage.objects
  for select to authenticated using (
    bucket_id = 'project-files'
    and public.is_project_member(public.try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists "project files insert" on storage.objects;
create policy "project files insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'project-files'
    and public.can_edit_project(public.try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists "project files update" on storage.objects;
create policy "project files update" on storage.objects
  for update to authenticated using (
    bucket_id = 'project-files'
    and public.can_edit_project(public.try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists "project files delete" on storage.objects;
create policy "project files delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'project-files'
    and public.can_edit_project(public.try_uuid((storage.foldername(name))[1]))
  );


-- ============================================================
--  Nota sobre las plantillas de proyecto
--  ("Trabajo en grupo", "Laboratorio", "Exposición", "Investigación")
--
--  Viven en el cliente (lib/projects.ts), no en la base. Una plantilla no es
--  más que un juego de columnas y unas tarjetas iniciales: aplicarla es crear
--  el proyecto y meter esas filas. Ponerlas en una tabla obligaría a migrar la
--  base cada vez que se quiera afinar el texto de una plantilla, y no aporta
--  nada porque no son datos del usuario.
-- ============================================================

notify pgrst, 'reload schema';
