// ============================================================
//  Semestres (v26, fase 3): datos. Ver lib/terms.ts y schema_v25 (fase 3).
// ============================================================
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { fetchPrefs, savePrefs, isMissingColumn } from './db';
import { cleanScale, DEFAULT_SCALE, suggestTermName, longestRun, type GradeScale, type Term, type TermSubject } from './terms';

export const NEEDS_V25_3 = 'Para los semestres falta correr schema_v25.sql (fase 3) en Supabase.';
const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42883' || /does not exist|Could not find/i.test(String(e.message ?? '')));
const errMsg = (e: any) => String(e?.message ?? e).replace(/^.*?ERROR:\s*/, '');

// ---------- Escala de notas (user_prefs.settings.grades) ----------
let scaleCache: GradeScale | null = null;
const scaleListeners = new Set<(s: GradeScale) => void>();
export async function getGradeScale(): Promise<GradeScale> {
  if (scaleCache) return scaleCache;
  try { const p = await fetchPrefs(); scaleCache = cleanScale(p?.grades ?? DEFAULT_SCALE); } catch { /* sin conexión */ }
  return scaleCache ?? DEFAULT_SCALE;
}
export async function saveGradeScale(s: Partial<GradeScale>): Promise<GradeScale> {
  const next = cleanScale({ ...(scaleCache ?? DEFAULT_SCALE), ...s });
  await savePrefs({ grades: next });
  scaleCache = next;
  scaleListeners.forEach((f) => f(next));
  return next;
}
/** La escala de la persona (0 a 5 con 3,0 hasta que la cambie). */
export function useGradeScale(): GradeScale {
  const [s, setS] = useState<GradeScale>(scaleCache ?? DEFAULT_SCALE);
  useEffect(() => {
    scaleListeners.add(setS);
    getGradeScale().then(setS).catch(() => {});
    return () => { scaleListeners.delete(setS); };
  }, []);
  return s;
}

// ---------- Semestres ----------
export async function getTerms(): Promise<{ terms: Term[]; ready: boolean }> {
  const { data, error } = await supabase.from('terms').select('*').order('created_at');
  if (error) { if (missing(error)) return { terms: [], ready: false }; throw error; }
  return { terms: (data as Term[]) ?? [], ready: true };
}

/**
 * El semestre abierto. Si no hay ninguno, lo crea con el nombre que toca por
 * la fecha y le asigna las materias de Estudio que no tienen semestre.
 */
export async function ensureOpenTerm(now = new Date()): Promise<Term | null> {
  const { terms, ready } = await getTerms();
  if (!ready) return null;
  let open = terms.find((t) => t.status === 'open') ?? null;
  if (!open) {
    const { data, error } = await supabase.from('terms').insert({ name: suggestTermName(now), starts_on: null }).select('*').single();
    if (error) { if (/duplicate|unique/i.test(String(error.message))) return (await getTerms()).terms.find((t) => t.status === 'open') ?? null; throw error; }
    open = data as Term;
  }
  await attachLoose(open.id);
  return open;
}
/** Las materias de Estudio sin semestre pasan al abierto. */
async function attachLoose(termId: string): Promise<void> {
  const { getModeSetting } = await import('./mode');
  let q = supabase.from('subjects').update({ term_id: termId }).is('term_id', null).eq('archived', false);
  if (getModeSetting() === 'ambos') q = q.or('space.is.null,space.eq.estudio');
  else if (getModeSetting() === 'trabajo') return;
  const { error } = await q;
  if (error && !isMissingColumn(error)) throw error;
}

export async function renameTerm(id: string, patch: { name?: string; starts_on?: string | null; ends_on?: string | null }): Promise<void> {
  const clean: Record<string, unknown> = {};
  if (patch.name != null) clean.name = patch.name.trim().slice(0, 40);
  if (patch.starts_on !== undefined) clean.starts_on = patch.starts_on;
  if (patch.ends_on !== undefined) clean.ends_on = patch.ends_on;
  const { error } = await supabase.from('terms').update(clean).eq('id', id);
  if (error) throw new Error(errMsg(error));
}

export async function deleteTerm(id: string): Promise<void> {
  const { error } = await supabase.from('terms').delete().eq('id', id);
  if (error) throw new Error(errMsg(error));
}

export type CloseInput = {
  termId: string; subjects: TermSubject[]; scale: GradeScale; reflection: string; next: string; endsOn?: string | null;
  focusMinutes: number; cards: number; bestStreak: number;
};
export async function closeTerm(o: CloseInput): Promise<Term> {
  const summary = { subjects: o.subjects, pass: o.scale.pass, focus_minutes: Math.round(o.focusMinutes), cards: o.cards, best_streak: o.bestStreak };
  const { data, error } = await supabase.rpc('term_close', { p_term: o.termId, p_summary: summary, p_max: o.scale.max, p_reflection: o.reflection || null, p_next: o.next || null, p_ends: o.endsOn ?? null });
  if (error) { if (missing(error)) throw new Error(NEEDS_V25_3); throw new Error(errMsg(error)); }
  return data as Term;
}

export async function addPastTerm(o: { name: string; subjects: TermSubject[]; scale: GradeScale; startsOn?: string | null; endsOn?: string | null }): Promise<Term> {
  const { data, error } = await supabase.rpc('term_add_past', { p_name: o.name, p_summary: { subjects: o.subjects, pass: o.scale.pass }, p_max: o.scale.max, p_starts: o.startsOn ?? null, p_ends: o.endsOn ?? null });
  if (error) { if (missing(error)) throw new Error(NEEDS_V25_3); throw new Error(errMsg(error)); }
  return data as Term;
}

/** Lo que se guarda en la foto del cierre: horas por materia, tarjetas y racha en el periodo. */
export async function termActivity(subjectIds: string[], from: string | null): Promise<{ minutesBySubject: Record<string, number>; focusMinutes: number; cards: number; bestStreak: number }> {
  const since = from ? new Date(from + 'T00:00:00').toISOString() : new Date(Date.now() - 200 * 86_400_000).toISOString();
  const [fs, rv] = await Promise.all([
    supabase.from('focus_sessions').select('subject_id, minutes, created_at').gte('created_at', since).limit(5000),
    supabase.from('flashcard_reviews').select('reviewed_at').gte('reviewed_at', since).limit(20000),
  ]);
  const minutesBySubject: Record<string, number> = {};
  let focusMinutes = 0;
  const days: string[] = [];
  for (const r of (fs.data as { subject_id: string | null; minutes: number; created_at: string }[] | null) ?? []) {
    if (r.subject_id && subjectIds.includes(r.subject_id)) { minutesBySubject[r.subject_id] = (minutesBySubject[r.subject_id] ?? 0) + (r.minutes || 0); focusMinutes += r.minutes || 0; }
    const d = new Date(r.created_at); days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const reviews = (rv.data as { reviewed_at: string }[] | null) ?? [];
  reviews.forEach((r) => { const d = new Date(r.reviewed_at); days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); });
  return { minutesBySubject, focusMinutes, cards: reviews.length, bestStreak: longestRun(days) };
}
