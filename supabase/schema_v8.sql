-- ============================================================
--  Kaderno — Migración v8 (consolidada, idempotente)
--  Arregla el error 400 al crear tareas (faltaba la columna "type")
--  y asegura las columnas recientes. Puedes correr esto aunque ya
--  hayas aplicado migraciones anteriores: usa IF NOT EXISTS.
--
--  Pega TODO esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Tipo de tarea (tarea / examen / quiz / proyecto)  ← causa del 400
alter table public.assignments add column if not exists type text default 'tarea';

-- Créditos por materia
alter table public.subjects add column if not exists credits int default 0;

-- Rellena valores nulos por si quedaron filas viejas
update public.assignments set type = 'tarea' where type is null;
update public.subjects   set credits = 0     where credits is null;

-- Refresca el cache de esquema de PostgREST (para que el 400 desaparezca de una)
notify pgrst, 'reload schema';
