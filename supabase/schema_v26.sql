-- =====================================================================
-- Kaderno · schema_v26.sql  (versión 27 de la app: organizar el tiempo)
--
-- Requiere schema_v14 (tareas con fecha y hora). Es idempotente: se puede
-- correr dos veces. Crece por fases (ver PLAN_v27.md).
--
-- Fase 1 · Importante y la matriz de Eisenhower
--   · assignments.important: la estrella de "importante". Urgente no se
--     guarda: la app lo calcula con la fecha.
--
-- Fase 2 · La rana y la lista para mañana
--   · assignments.frog y assignments.plan_order, con day_set_frog y
--     day_plan_list (una rana por día; la lista de hasta 6 en orden).
--
-- Fase 4 · Algún día
--   · assignments.someday: ideas sin compromiso. Quedan en la bandeja
--     (inbox = true) pero aparte, y no cuentan como "por ordenar".
-- =====================================================================

alter table public.assignments add column if not exists important boolean not null default false;

-- =====================================================================
--  Fase 2 · La rana y la lista para mañana (método Ivy Lee)
-- =====================================================================
--   · assignments.frog: "la rana" del día (lo primero y más pesado). Una por
--     día y por persona; el día es plan_day.
--   · assignments.plan_order: el orden de la lista para ese día (1 a 6).
alter table public.assignments add column if not exists frog boolean not null default false;
alter table public.assignments add column if not exists plan_order smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_plan_order_ok') then
    alter table public.assignments add constraint assignments_plan_order_ok check (plan_order is null or plan_order between 1 and 6);
  end if;
end $$;
create unique index if not exists assignments_one_frog on public.assignments (user_id, plan_day) where frog;

-- Poner (o quitar, con p_task null) la rana de un día.
-- Es security definer para leer la zona horaria; cada cambio filtra por auth.uid().
create or replace function public.day_set_frog(p_task uuid, p_day date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  if p_day is null then raise exception 'Falta el día.'; end if;
  update public.assignments set frog = false where user_id = auth.uid() and frog and (plan_day = p_day or id = p_task);
  if p_task is not null then
    update public.assignments set frog = true, plan_day = p_day
     where id = p_task and user_id = auth.uid() and status is distinct from 'done';
    if not found then raise exception 'No encontré esa tarea pendiente.'; end if;
  end if;
end $$;

-- La lista para mañana: hasta 6 tareas, en orden. La primera queda como la rana.
-- Las que tenían hora otro día la pierden (el orden reemplaza la hora).
create or replace function public.day_plan_list(p_ids uuid[], p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare n int := coalesce(array_length(p_ids, 1), 0); i int;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  if p_day is null then raise exception 'Falta el día.'; end if;
  if n > 6 then raise exception 'Máximo 6 tareas: lo importante es poco.'; end if;
  if (select count(distinct x) from unnest(p_ids) x) <> n then raise exception 'Hay tareas repetidas.'; end if;
  if (select count(*) from public.assignments where id = any(p_ids) and user_id = auth.uid() and status is distinct from 'done') <> n then
    raise exception 'Alguna tarea no existe o ya está hecha.';
  end if;
  update public.assignments set plan_order = null where user_id = auth.uid() and plan_day = p_day and plan_order is not null;
  for i in 1..n loop
    update public.assignments
       set plan_day = p_day, plan_order = i,
           plan_at = case when plan_at is not null and (plan_at at time zone public._kaderno_tz(auth.uid()))::date = p_day then plan_at end
     where id = p_ids[i] and user_id = auth.uid();
  end loop;
  perform public.day_set_frog(case when n > 0 then p_ids[1] end, p_day);
end $$;
revoke all on function public.day_set_frog(uuid, date) from public, anon;
revoke all on function public.day_plan_list(uuid[], date) from public, anon;
grant execute on function public.day_set_frog(uuid, date) to authenticated;
grant execute on function public.day_plan_list(uuid[], date) to authenticated;

-- =====================================================================
--  Fase 4 · Algún día
-- =====================================================================
alter table public.assignments add column if not exists someday boolean not null default false;
-- Lo de "Algún día" vive en la bandeja: si se marca, se asegura inbox.
update public.assignments set inbox = true where someday and not inbox;
