-- ============================================================
--  Kaderno — Migración v7 (créditos por materia)
--  Pega TODO esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

alter table public.subjects add column if not exists credits int default 0;
