-- =====================================================================
-- Kaderno · schema_v20.sql  (versión 21 de la app: organizar el día y notas conectadas)
--
-- Requiere schema_v19.sql completo (versión 20). Es idempotente: se puede
-- correr dos veces. Crece por fases (ver PLAN_v21.md).
--
-- Fase 1 · Organizar el día
--   · assignments.repeat_rule y repeat_parent_id: tareas que se repiten. Al
--     marcar una como hecha, la base crea la siguiente (una sola vez, aunque
--     se marque dos veces o desde dos dispositivos). skip_repeat() la salta.
--   · assignments.inbox: la bandeja (lo capturado sin fecha ni materia).
--   · assignments.plan_day y plan_band: "mañana", "tarde" o "noche" de un día,
--     para quien no quiere poner hora exacta.
--   · day_reviews: el cierre del día (lo hecho, lo movido y una línea).
--   · Aviso opcional a la hora del cierre (tipo "cierre").
-- =====================================================================


-- =====================================================================
--  FASE 1 · Organizar el día
-- =====================================================================
alter table public.assignments add column if not exists repeat_rule jsonb;
alter table public.assignments add column if not exists repeat_parent_id uuid references public.assignments(id) on delete set null;
alter table public.assignments add column if not exists inbox boolean not null default false;
alter table public.assignments add column if not exists plan_day date;
alter table public.assignments add column if not exists plan_band text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_repeat_rule_chk') then
    alter table public.assignments add constraint assignments_repeat_rule_chk
      check (repeat_rule is null or (jsonb_typeof(repeat_rule) = 'object' and repeat_rule ->> 'freq' in ('day', 'week', 'month')));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assignments_plan_band_chk') then
    alter table public.assignments add constraint assignments_plan_band_chk check (plan_band is null or plan_band in ('manana', 'tarde', 'noche'));
  end if;
end $$;
-- Una sola "siguiente" por tarea: así no se duplica.
create unique index if not exists assignments_repeat_parent_idx on public.assignments (repeat_parent_id) where repeat_parent_id is not null;
create index if not exists assignments_inbox_idx on public.assignments (user_id) where inbox and deleted_at is null;

-- ---------- Repeticiones (las mismas reglas que lib/repeat.ts) ----------
create or replace function public._repeat_step(r jsonb, base date, anchor date) returns date
language plpgsql immutable as $$
declare
  n int := greatest(1, least(99, coalesce((r ->> 'interval')::int, 1)));
  f text := r ->> 'freq'; days int[]; md int; tot int; y int; m int; dim int; k int; c date; a date; wk int;
begin
  if f = 'day' then return base + n; end if;
  if f = 'month' then
    md := coalesce((r ->> 'monthDay')::int, extract(day from anchor)::int);
    tot := extract(year from base)::int * 12 + extract(month from base)::int - 1 + n;
    y := tot / 12; m := tot % 12 + 1;
    dim := extract(day from (make_date(y, m, 1) + interval '1 month' - interval '1 day'))::int;
    return make_date(y, m, least(md, dim));
  end if;
  select array_agg(x::int order by x::int) into days
    from jsonb_array_elements_text(case when jsonb_typeof(r -> 'days') = 'array' then r -> 'days' else '[]'::jsonb end) x;
  if days is null or cardinality(days) = 0 then return base + 7 * n; end if;
  a := anchor - (extract(isodow from anchor)::int - 1);
  for k in 1..(7 * n + 7) loop
    c := base + k;
    wk := ((c - (extract(isodow from c)::int - 1)) - a) / 7;
    if extract(dow from c)::int = any(days) and wk % n = 0 then return c; end if;
  end loop;
  return base + 7 * n;
end $$;

-- Siguiente fecha al completar: nunca nace vencida; null si pasa de "hasta".
create or replace function public._repeat_next(r jsonb, p_due date, p_done date, p_today date) returns date
language plpgsql immutable as $$
declare anchor date := coalesce(p_due, p_done); d date; i int := 0;
begin
  d := public._repeat_step(r, case when coalesce((r ->> 'fromDone')::boolean, false) then p_done else anchor end, anchor);
  while d < p_today and i < 1000 loop d := public._repeat_step(r, d, anchor); i := i + 1; end loop;
  if (r ->> 'until') ~ '^\d{4}-\d{2}-\d{2}$' and d > (r ->> 'until')::date then return null; end if;
  return d;
end $$;

-- Crea la siguiente repetición de una tarea (con sus pasos sin marcar).
create or replace function public._repeat_spawn(p_id uuid, p_done date) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; tz text; today date; due date; nd date; delta int; nid uuid;
begin
  select * into a from assignments where id = p_id;
  if a.id is null or a.repeat_rule is null or a.deleted_at is not null then return null; end if;
  tz := public._kaderno_tz(a.user_id);
  today := (now() at time zone tz)::date;
  due := coalesce((a.due_at at time zone tz)::date, a.due_date);
  nd := public._repeat_next(a.repeat_rule, due, coalesce(p_done, today), today);
  if nd is null then return null; end if;
  delta := nd - coalesce(due, p_done, today);
  insert into assignments (user_id, subject_id, note_id, title, description, due_date, due_at, status, remind_days, remind_at,
                           type, estimate_min, plan_at, plan_place, repeat_rule, repeat_parent_id)
  values (a.user_id, a.subject_id, a.note_id, a.title, a.description, nd,
          case when a.due_at is not null then a.due_at + make_interval(days => delta) end,
          'pending', a.remind_days,
          case when a.remind_at is not null then a.remind_at + make_interval(days => delta) end,
          a.type, a.estimate_min,
          case when a.plan_at is not null then a.plan_at + make_interval(days => delta) end,
          a.plan_place, a.repeat_rule, a.id)
  on conflict (repeat_parent_id) where repeat_parent_id is not null do nothing
  returning id into nid;
  if nid is not null then
    insert into assignment_steps (user_id, assignment_id, title, done, position)
    select a.user_id, nid, s.title, false, s.position from assignment_steps s where s.assignment_id = a.id;
  end if;
  return nid;
end $$;

create or replace function public._repeat_on_done() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.repeat_rule is not null and new.deleted_at is null then
    begin
      perform public._repeat_spawn(new.id, (coalesce(new.completed_at, now()) at time zone public._kaderno_tz(new.user_id))::date);
    exception when others then raise warning 'repetición de %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists assignments_repeat_trg on public.assignments;
create trigger assignments_repeat_trg after update of status on public.assignments
  for each row execute function public._repeat_on_done();

-- "Saltar esta vez": crea la siguiente y manda esta a la papelera (no cuenta como hecha).
create or replace function public.skip_repeat(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nid uuid;
begin
  if not exists (select 1 from assignments where id = p_id and user_id = me and repeat_rule is not null) then
    raise exception 'No encontré esa tarea repetida.' using errcode = 'P0001';
  end if;
  nid := public._repeat_spawn(p_id, (now() at time zone public._kaderno_tz(me))::date);
  update assignments set deleted_at = now() where id = p_id;
  return nid;
end $$;

-- ---------- Cierre del día ----------
create table if not exists public.day_reviews (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  day        date not null,
  done       jsonb not null default '{}'::jsonb,
  moved      jsonb not null default '[]'::jsonb,
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.day_reviews enable row level security;
drop policy if exists "own day reviews" on public.day_reviews;
create policy "own day reviews" on public.day_reviews for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.day_reviews to authenticated;

-- Aviso opcional a la hora del cierre (Ajustes → Avisos → "Cerrar el día").
create or replace function public.enqueue_day_close(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; tz text; loc timestamp; hr int; n int := 0;
begin
  for r in select p.user_id, p.settings -> 'notif' as notif from public.user_prefs p
            where coalesce((p.settings -> 'notif' ->> 'close')::boolean, false) loop
    tz := public._kaderno_tz(r.user_id);
    loc := p_now at time zone tz;
    hr := coalesce((r.notif ->> 'close_hour')::int, 21);
    if extract(hour from loc) <> hr then continue; end if;
    if exists (select 1 from public.day_reviews d where d.user_id = r.user_id and d.day = loc::date) then continue; end if;
    insert into public.notification_queue (user_id, kind, ref, title, body, url)
    values (r.user_id, 'cierre', loc::date::text, 'Cierra el día', '1 minuto: lo que hiciste y lo que pasa a mañana.', '/?cierre=1')
    on conflict (user_id, kind, ref) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.enqueue_all(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'reminders', public.enqueue_reminders(p_now),
    'project_due', public.enqueue_project_due(p_now),
    'plans', public.enqueue_plans(p_now),
    'week', public.enqueue_week_plans(p_now),
    'close', public.enqueue_day_close(p_now),
    'digests', public.enqueue_digests(p_now),
    'purged', public.purge_trash(p_now)
  );
end $$;

-- ---------- Permisos de la fase 1 ----------
revoke all on function public._repeat_spawn(uuid, date) from public, anon, authenticated;
revoke all on function public._repeat_on_done() from public, anon, authenticated;
revoke all on function public.enqueue_day_close(timestamptz) from public, anon, authenticated;
revoke all on function public.enqueue_all(timestamptz) from public, anon, authenticated;
revoke all on function public.skip_repeat(uuid) from public, anon;
grant execute on function public.skip_repeat(uuid) to authenticated;
