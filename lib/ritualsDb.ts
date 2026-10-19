// ============================================================
//  Fase 4 (schema_v19): plan de la semana, metas WOOP y preferencias
//  de los rituales. Sin la migración, todo devuelve vacío.
// ============================================================
import { supabase, currentUserId } from './supabase';
import { fetchPrefs, savePrefs, getTasks } from './db';
import { addDaysISO, type StudyDayRow } from './streaks';
import { cleanPriorities, type Priority, type WeekPlan, type GoalDraft } from './rituals';

const missingTable = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(String(e.message ?? '')));
let RITUAL_DB: boolean | null = null;
export function hasRitualDb(): boolean { return RITUAL_DB !== false; }

// ---------- Preferencias (user_prefs.settings.ritual) ----------
export type RitualPrefs = { monday: boolean; semesterAt: string | null; semesterDismissed: boolean };
export async function getRitualPrefs(): Promise<RitualPrefs> {
  const p = await fetchPrefs().catch(() => null);
  const r = p?.ritual ?? {};
  return { monday: r.monday !== false, semesterAt: typeof r.semesterAt === 'string' ? r.semesterAt : null, semesterDismissed: r.semesterDismissed === true };
}
export async function saveRitualPrefs(patch: Partial<RitualPrefs>): Promise<void> {
  const cur = await getRitualPrefs();
  await savePrefs({ ritual: { ...cur, ...patch } });
}

// ---------- Plan de la semana ----------
export async function getWeekPlan(weekStart: string): Promise<WeekPlan | null> {
  if (RITUAL_DB === false) return null;
  const { data, error } = await supabase.from('week_plans').select('week_start, priorities, goal_days, done_at, snoozed_until').eq('week_start', weekStart).maybeSingle();
  if (error) { if (missingTable(error)) RITUAL_DB = false; return null; }
  RITUAL_DB = true;
  if (!data) return null;
  const d = data as any;
  return { ...d, priorities: Array.isArray(d.priorities) ? d.priorities : [] };
}

export async function saveWeekPlan(weekStart: string, patch: Partial<Omit<WeekPlan, 'week_start'>>): Promise<void> {
  const u = await currentUserId();
  if (!u) return;
  const row: Record<string, any> = { user_id: u, week_start: weekStart, ...patch };
  if (patch.priorities) row.priorities = cleanPriorities(patch.priorities as Priority[]);
  const { error } = await supabase.from('week_plans').upsert(row, { onConflict: 'user_id,week_start' });
  if (error) {
    if (missingTable(error)) { RITUAL_DB = false; throw new Error('Para el ritual del lunes falta correr schema_v19.sql (fase 4) en Supabase.'); }
    throw error;
  }
}

/** Datos de la semana anterior: días de estudio, minutos de enfoque y lo estimado de lo que vencía. */
export async function lastWeekData(weekStart: string): Promise<{ rows: StudyDayRow[]; focusMin: number; plannedMin: number }> {
  const from = addDaysISO(weekStart, -7);
  const [days, focus, tasks] = await Promise.all([
    supabase.from('study_days').select('day, focus_min, tasks_done, cards, tests, protected').gte('day', from).lt('day', weekStart),
    supabase.from('focus_sessions').select('minutes, created_at').gte('created_at', new Date(from + 'T00:00:00').toISOString()).lt('created_at', new Date(weekStart + 'T00:00:00').toISOString()),
    getTasks().catch(() => []),
  ]);
  const focusMin = ((focus.data as { minutes: number }[]) ?? []).reduce((a, r) => a + (r.minutes || 0), 0);
  const plannedMin = tasks.filter((t) => t.due_date && t.due_date >= from && t.due_date < weekStart).reduce((a, t) => a + (t.estimate_min ?? 0), 0);
  return { rows: (days.data as StudyDayRow[]) ?? [], focusMin, plannedMin };
}

// ---------- Metas ----------
export type Goal = GoalDraft & { id: string; subject_id: string | null; status: string; created_at: string };

export async function getGoals(): Promise<Goal[]> {
  if (RITUAL_DB === false) return [];
  const { data, error } = await supabase.from('goals').select('*').eq('status', 'active').order('created_at', { ascending: false });
  if (error) { if (missingTable(error)) RITUAL_DB = false; return []; }
  return (data as Goal[]) ?? [];
}
export async function getGoal(subjectId: string | null): Promise<Goal | null> {
  const all = await getGoals();
  return all.find((g) => (g.subject_id ?? null) === subjectId) ?? null;
}

export async function saveGoal(g: GoalDraft, subjectId: string | null, id?: string | null): Promise<Goal> {
  const row = {
    wish: g.wish.trim().slice(0, 200), outcome: g.outcome?.trim() || null, obstacle: g.obstacle?.trim() || null,
    plan: g.plan?.trim() || null, target_grade: g.target_grade ?? null,
  };
  const q = id
    ? supabase.from('goals').update(row).eq('id', id).select('*').single()
    : supabase.from('goals').insert({ ...row, subject_id: subjectId }).select('*').single();
  const { data, error } = await q;
  if (error) {
    if (missingTable(error)) throw new Error('Para las metas falta correr schema_v19.sql (fase 4) en Supabase.');
    throw error;
  }
  return data as Goal;
}

export async function closeGoal(id: string, status: 'done' | 'dropped'): Promise<void> {
  const { error } = await supabase.from('goals').update({ status }).eq('id', id);
  if (error) throw error;
}
