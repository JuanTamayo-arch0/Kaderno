-- =====================================================================
-- Kaderno · schema_v26.sql  (versión 27 de la app: organizar el tiempo)
--
-- Requiere schema_v14 (tareas con fecha y hora). Es idempotente: se puede
-- correr dos veces. Crece por fases (ver PLAN_v27.md).
--
-- Fase 1 · Importante y la matriz de Eisenhower
--   · assignments.important: la estrella de "importante". Urgente no se
--     guarda: la app lo calcula con la fecha.
-- =====================================================================

alter table public.assignments add column if not exists important boolean not null default false;
