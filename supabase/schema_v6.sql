-- ============================================================
--  Kaderno — Migración v6 (tipo de tarea: tarea / examen / quiz / proyecto)
--  Pega TODO esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

alter table public.assignments add column if not exists type text default 'tarea';
