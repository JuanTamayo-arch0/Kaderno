-- Lo que el plan v10 describe para schema_v12 (Proyectos v1), en su forma mínima.
-- Se reemplaza por el schema_v12.sql real cuando se pueda leer del computador.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users,
  name text not null,
  subject_id uuid,
  join_code text unique,
  created_at timestamptz default now()
);
create table public.project_members (
  project_id uuid not null references public.projects on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'editor' check (role in ('owner','editor','viewer')),
  primary key (project_id, user_id)
);
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  assignee_id uuid references auth.users,
  due_date date,
  position numeric not null default 0,
  created_at timestamptz default now()
);
create table public.project_task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks on delete cascade,
  title text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz default now()
);
create or replace function public.is_project_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members m where m.project_id = p and m.user_id = auth.uid());
$$;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_task_steps enable row level security;
create policy "projects read" on public.projects for select using (public.is_project_member(id));
create policy "members read" on public.project_members for select using (public.is_project_member(project_id));
create policy "tasks read" on public.project_tasks for select using (public.is_project_member(project_id));
create policy "steps read" on public.project_task_steps for select using (
  exists (select 1 from public.project_tasks t where t.id = task_id and public.is_project_member(t.project_id)));
grant select on all tables in schema public to authenticated;
