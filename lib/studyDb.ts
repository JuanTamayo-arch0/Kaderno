// ============================================================
//  Lecturas de la fase 2 (schema_v19): días de estudio y escudos, horas
//  habituales de enfoque, lugares guardados y tu tiempo real.
//  Sin la migración, todo devuelve null o vacío y la app sigue como antes.
// ============================================================
import { supabase, currentUserId, dedupe } from './supabase';
import { fetchPrefs, savePrefs } from './db';
import { localISODate } from './fsrs';
import { summarize, addDaysISO, type StreakSummary, type StudyDayRow } from './streaks';
import { getStudyPrefs } from './cardsDb';
import { habitHours, mergePlaces } from './planSlots';
import { estimateRatio, type EstimateRow } from './estimate';

let STUDY_DB: boolean | null = null;
export function hasStudyDb(): boolean { return STUDY_DB !== false; }
const missingTable = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(String(e.message ?? '')));

/** Días de estudio de los últimos 4 meses, escudos y meta: todo lo que se ve de la racha. */
export async function getStreakSummary(): Promise<StreakSummary | null> {
  if (STUDY_DB === false) return null;
  return dedupe('streak', async () => {
    const today = localISODate(new Date());
    const since = addDaysISO(today, -120);
    const [days, sh, prefs] = await Promise.all([
      supabase.from('study_days').select('day, focus_min, tasks_done, cards, tests, protected').gte('day', since),
      supabase.from('study_shields').select('count').maybeSingle(),
      getStudyPrefs(),
    ]);
    if (days.error) { if (missingTable(days.error)) STUDY_DB = false; return null; }
    STUDY_DB = true;
    return summarize((days.data as StudyDayRow[]) ?? [], today, prefs.weeklyGoal, (sh.data as { count: number } | null)?.count ?? 0);
  });
}

export async function buyShield(): Promise<number> {
  const { data, error } = await supabase.rpc('study_buy_shield');
  if (error) throw error;
  return Number(data) || 0;
}

/** Horas en que sueles empezar a enfocarte (últimos 60 días). */
export async function getHabitHours(): Promise<number[]> {
  return dedupe('habit', async () => {
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const { data, error } = await supabase.from('focus_sessions').select('created_at, minutes').gte('created_at', since).limit(500);
    if (error) return [];
    return habitHours((data as { created_at: string; minutes: number }[]) ?? []);
  });
}

/** Lugares para "¿Cuándo lo haces?": Casa, Biblioteca, Universidad y los tuyos. */
export async function getPlaces(): Promise<string[]> {
  const p = await fetchPrefs().catch(() => null);
  return mergePlaces(p?.places);
}
export async function addPlace(place: string): Promise<string[]> {
  const p = await fetchPrefs().catch(() => null);
  const mine = Array.isArray(p?.places) ? p.places : [];
  const next = mergePlaces([...mine, place]);
  await savePrefs({ places: next.slice(3) });
  return next;
}

/** Minutos de enfoque por tarea desde una fecha (para saber si un plan arrancó). */
export async function focusSince(ids: string[], sinceISO: string): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.from('focus_sessions').select('assignment_id, minutes').in('assignment_id', ids).gte('created_at', sinceISO);
  if (error) return {};
  const out: Record<string, number> = {};
  ((data as { assignment_id: string; minutes: number }[]) ?? []).forEach((r) => { out[r.assignment_id] = (out[r.assignment_id] ?? 0) + r.minutes; });
  return out;
}

/** Cuánto sueles tardar respecto a lo que estimas (null si no hay datos suficientes). */
let ratioMemo: { at: number; v: number | null } | null = null;
export async function getEstimateRatio(): Promise<number | null> {
  if (ratioMemo && Date.now() - ratioMemo.at < 10 * 60_000) return ratioMemo.v;
  const me = await currentUserId();
  if (!me) return null;
  const { data, error } = await supabase.from('assignments').select('id, estimate_min, completed_at')
    .eq('status', 'done').gte('estimate_min', 10).is('deleted_at', null)
    .order('completed_at', { ascending: false, nullsFirst: false }).limit(40);
  if (error) return null;
  const tasks = (data as { id: string; estimate_min: number }[]) ?? [];
  if (tasks.length < 5) { ratioMemo = { at: Date.now(), v: null }; return null; }
  const { data: fs } = await supabase.from('focus_sessions').select('assignment_id, minutes').in('assignment_id', tasks.map((t) => t.id));
  const by: Record<string, number> = {};
  ((fs as { assignment_id: string; minutes: number }[]) ?? []).forEach((r) => { by[r.assignment_id] = (by[r.assignment_id] ?? 0) + r.minutes; });
  const rows: EstimateRow[] = tasks.map((t) => ({ estimate_min: t.estimate_min, focus_min: by[t.id] ?? 0 }));
  const v = estimateRatio(rows);
  ratioMemo = { at: Date.now(), v };
  return v;
}
export function forgetEstimateRatio() { ratioMemo = null; }
