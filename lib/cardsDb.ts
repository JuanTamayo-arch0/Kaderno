// ============================================================
//  Tarjetas de repaso: lecturas y escrituras (schema_v19, fase 1).
//  Sin la migración funciona como antes (SM-2 por fechas) y avisa.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, currentUserId, dedupe } from './supabase';
import { cleanGoal } from './streaks';
import { fetchPrefs, savePrefs, isMissingColumn, getTasks, reviewFlashcard, type Flashcard } from './db';
import { schedule, stateOf, dueOf, DEFAULT_RETENTION, localISODate, type CardRating, type FsrsPatch } from './fsrs';
import { buildQueue, secondsPerCard, type CardKind, type CardLike, type Draft, type ReviewStat } from './cards';

export type CardRow = CardLike & Flashcard & {
  kind: CardKind; fsrs_state: number; stability: number | null; difficulty: number | null; due_at: string | null;
  suspended: boolean; source_heading: string | null; created_from: string; created_at: string; learning_steps?: number; scheduled_days?: number | null;
};

let FSRS_DB: boolean | null = null;
export function hasFsrsDb(): boolean { return FSRS_DB !== false; }
export const FSRS_MISSING = 'Para el repaso nuevo (FSRS, tarjetas de completar, estadísticas) falta correr schema_v19.sql en Supabase.';

function withDefaults(r: any): CardRow {
  return {
    ...r,
    kind: r.kind === 'cloze' ? 'cloze' : 'basic',
    fsrs_state: typeof r.fsrs_state === 'number' ? r.fsrs_state : stateOf(r),
    suspended: !!r.suspended,
    source_heading: r.source_heading ?? null,
    created_from: r.created_from ?? 'manual',
  };
}

/** Todas mis tarjetas. */
export async function getCards(): Promise<CardRow[]> {
  const { data, error } = await supabase.from('flashcards').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (FSRS_DB === null) FSRS_DB = rows.length ? 'fsrs_state' in rows[0] : await probe();
  return rows.map(withDefaults);
}
async function probe(): Promise<boolean> {
  const { error } = await supabase.from('flashcards').select('fsrs_state').limit(1);
  return !(error && isMissingColumn(error));
}

/** Mis repasos de los últimos `days` días (para estadísticas, tiempo estimado y tope de nuevas). */
export async function getReviews(days = 90): Promise<ReviewStat[]> {
  if (FSRS_DB === false) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase.from('flashcard_reviews').select('reviewed_at, rating, duration_ms, state_before, card_id')
    .gte('reviewed_at', since).order('reviewed_at', { ascending: true }).limit(10000);
  if (error) { if (missingTable(error)) { FSRS_DB = false; return []; } throw error; }
  return (data ?? []) as ReviewStat[];
}
function missingTable(err: any): boolean {
  return ['42P01', 'PGRST205'].includes(err?.code) || /does not exist|Could not find the table/i.test(String(err?.message ?? ''));
}

export function newDoneToday(reviews: ReviewStat[], now = new Date()): number {
  const today = localISODate(now);
  return reviews.filter((r) => r.state_before === 0 && localISODate(new Date(r.reviewed_at)) === today).length;
}

// ---------- Ajustes de repaso (user_prefs.settings.study) ----------
export type StudyPrefs = { newPerDay: number; retention: number; typeAnswer: boolean; weeklyGoal: number };
export const DEFAULT_STUDY: StudyPrefs = { newPerDay: 15, retention: DEFAULT_RETENTION, typeAnswer: false, weeklyGoal: 4 };
const STUDY_KEY = 'kd:study';
let studyCache: StudyPrefs | null = null;
function cleanStudy(x: any): StudyPrefs {
  const n = Number(x?.newPerDay);
  const r = Number(x?.retention);
  return {
    newPerDay: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : DEFAULT_STUDY.newPerDay,
    retention: [0.85, 0.9, 0.95].includes(r) ? r : DEFAULT_STUDY.retention,
    typeAnswer: x?.typeAnswer === true,
    weeklyGoal: cleanGoal(x?.weeklyGoal ?? DEFAULT_STUDY.weeklyGoal),
  };
}
export async function getStudyPrefs(): Promise<StudyPrefs> {
  if (studyCache) return studyCache;
  try { const raw = await AsyncStorage.getItem(STUDY_KEY); if (raw) studyCache = cleanStudy(JSON.parse(raw)); } catch { /* noop */ }
  try { const p = await fetchPrefs(); if (p?.study) { studyCache = cleanStudy(p.study); AsyncStorage.setItem(STUDY_KEY, JSON.stringify(studyCache)).catch(() => {}); } } catch { /* sin conexión */ }
  return studyCache ?? DEFAULT_STUDY;
}
export async function saveStudyPrefs(patch: Partial<StudyPrefs>): Promise<StudyPrefs> {
  const next = cleanStudy({ ...(studyCache ?? DEFAULT_STUDY), ...patch });
  studyCache = next;
  AsyncStorage.setItem(STUDY_KEY, JSON.stringify(next)).catch(() => {});
  await savePrefs({ study: next });
  return next;
}

/** El examen o quiz más cercano de cada materia: días que faltan y título. */
export async function examInfo(now = new Date()): Promise<Record<string, { days: number; title: string }>> {
  const tasks = await getTasks();
  const out: Record<string, { days: number; title: string }> = {};
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  for (const t of tasks) {
    if (!t.subject_id || t.status === 'done' || !t.due_date || !['examen', 'quiz'].includes(String(t.type))) continue;
    const [y, m, d] = t.due_date.split('-').map(Number);
    const days = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
    if (days >= 0 && (out[t.subject_id] === undefined || days < out[t.subject_id].days)) out[t.subject_id] = { days, title: t.title };
  }
  return out;
}
export async function examDays(now = new Date()): Promise<Record<string, number>> {
  const info = await examInfo(now);
  return Object.fromEntries(Object.entries(info).map(([k, v]) => [k, v.days]));
}

/** Títulos de las notas de donde salieron las tarjetas. */
export async function noteTitles(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))].slice(0, 500);
  if (!uniq.length) return {};
  const { data } = await supabase.from('notes').select('id, title').in('id', uniq);
  return Object.fromEntries(((data ?? []) as { id: string; title: string }[]).map((n) => [n.id, n.title || 'Nota']));
}

// ---------- Responder ----------
export type Answered = { prev: CardRow; patch: FsrsPatch | null; reviewId: number | null };

export async function answerCard(card: CardRow, rating: CardRating, durationMs: number, retention: number, now = new Date()): Promise<Answered> {
  if (FSRS_DB === false) {
    await reviewFlashcard(card, (rating - 1) as 0 | 1 | 2 | 3);
    return { prev: card, patch: null, reviewId: null };
  }
  const { patch, log } = schedule(card, rating, now, retention);
  const { error } = await supabase.from('flashcards').update(patch).eq('id', card.id);
  if (error) throw error;
  const { data, error: e2 } = await supabase.from('flashcard_reviews')
    .insert({ card_id: card.id, rating, state_before: log.state_before, elapsed_days: log.elapsed_days, scheduled_days: log.scheduled_days, duration_ms: Math.max(0, Math.min(3_600_000, Math.round(durationMs))) })
    .select('id').single();
  if (e2) throw e2;
  return { prev: card, patch, reviewId: (data as any)?.id ?? null };
}

/** Deshacer la última respuesta: la tarjeta vuelve a como estaba y el repaso se borra. */
export async function undoAnswer(a: Answered): Promise<void> {
  const p = a.prev;
  const back: Record<string, any> = {
    due_date: p.due_date, reps: p.reps ?? 0, lapses: p.lapses ?? 0, last_reviewed_at: p.last_reviewed_at ?? null,
    interval_days: p.interval_days ?? 0, ease: p.ease ?? 2.5, box: p.box ?? 1,
  };
  if (FSRS_DB !== false) Object.assign(back, { fsrs_state: p.fsrs_state, stability: p.stability, difficulty: p.difficulty, due_at: p.due_at, learning_steps: p.learning_steps ?? 0, scheduled_days: p.scheduled_days ?? null });
  const { error } = await supabase.from('flashcards').update(back).eq('id', p.id);
  if (error) throw error;
  if (a.reviewId != null) await supabase.from('flashcard_reviews').delete().eq('id', a.reviewId);
}

// ---------- Crear y editar ----------
export async function saveDrafts(drafts: Pick<Draft, 'kind' | 'front' | 'back'>[], opts: { noteId: string | null; subjectId: string | null; heading?: string | null; from: 'ai' | 'selection' | 'manual' | 'quiz' | 'recall' }): Promise<number> {
  const u = await currentUserId();
  if (!u || !drafts.length) return 0;
  const base = { user_id: u, note_id: opts.noteId, subject_id: opts.subjectId };
  const rows = drafts.map((d) => FSRS_DB === false
    ? { ...base, front: d.kind === 'cloze' ? d.front.replace(/\{\{([^{}]+)\}\}/, '___') : d.front.trim(), back: d.kind === 'cloze' ? (/\{\{([^{}]+)\}\}/.exec(d.front)?.[1] ?? d.back) : d.back.trim() }
    : { ...base, kind: d.kind, front: d.front.trim(), back: d.kind === 'cloze' ? '' : d.back.trim(), fsrs_state: 0, source_heading: opts.heading ?? null, created_from: opts.from });
  let { error } = await supabase.from('flashcards').insert(rows);
  if (error && isMissingColumn(error)) {
    FSRS_DB = false;
    return saveDrafts(drafts, opts);
  }
  if (error) throw error;
  return rows.length;
}

export async function updateCard(id: string, patch: { front?: string; back?: string; kind?: CardKind; subject_id?: string | null }): Promise<void> {
  const p: Record<string, any> = { ...patch };
  if (FSRS_DB === false) delete p.kind;
  const { error } = await supabase.from('flashcards').update(p).eq('id', id);
  if (error) throw error;
}
export async function setSuspended(ids: string[], on: boolean): Promise<void> {
  if (FSRS_DB === false) throw new Error(FSRS_MISSING);
  const { error } = await supabase.from('flashcards').update({ suspended: on }).in('id', ids);
  if (error) throw error;
}
export async function moveCards(ids: string[], subjectId: string | null): Promise<void> {
  const { error } = await supabase.from('flashcards').update({ subject_id: subjectId }).in('id', ids);
  if (error) throw error;
}
export async function deleteCards(ids: string[]): Promise<void> {
  const { error } = await supabase.from('flashcards').delete().in('id', ids);
  if (error) throw error;
}

// ---------- IA ----------
export async function aiCards(content: string, count: number, existing: string[], mode: 'note' | 'selection'): Promise<{ kind: CardKind; front: string; back: string }[]> {
  const { data, error } = await supabase.functions.invoke('ai', { body: { task: 'flashcards', content, count, existing: existing.slice(0, 60), mode } });
  if (error) {
    // El mensaje claro de la función (por ejemplo, el tope diario).
    let msg = '';
    try { const ctx: any = (error as any).context; const j = ctx?.json ? await ctx.json() : null; msg = j?.error ?? ''; } catch { /* noop */ }
    throw new Error(msg || 'No se pudo hablar con la IA. Intenta de nuevo.');
  }
  const cards = ((data as any)?.cards ?? []) as any[];
  return cards.map((c) => ({ kind: c.kind === 'cloze' ? 'cloze' : 'basic', front: String(c.front ?? ''), back: String(c.back ?? '') }));
}

// ---------- Para Hoy y la barra ----------
/** Solo lo necesario para contar (más liviano que getCards). */
async function getQueueCards(): Promise<CardLike[]> {
  if (FSRS_DB === false) return (await getCards());
  const { data, error } = await supabase.from('flashcards')
    .select('id, subject_id, fsrs_state, due_at, due_date, suspended, created_at, reps, last_reviewed_at');
  if (error) { if (isMissingColumn(error)) { FSRS_DB = false; return getCards(); } throw error; }
  FSRS_DB = true;
  return ((data ?? []) as any[]).map((r) => ({ ...r, front: '', back: '' }));
}
/** Lo que toca hoy: repasos vencidos + nuevas disponibles (con el tope del día). */
export function countToday(): Promise<{ due: number; fresh: number; learning: number; total: number; secs: number }> {
  return dedupe('cards-today', async () => {
    const [cards, reviews, prefs] = await Promise.all([getQueueCards(), getReviews(14), getStudyPrefs()]);
    const q = buildQueue({ cards, now: new Date(), newPerDay: prefs.newPerDay, newDoneToday: newDoneToday(reviews) });
    return { due: q.counts.due, fresh: q.counts.fresh, learning: q.counts.learning, total: q.counts.due + q.counts.fresh + q.counts.learning, secs: secondsPerCard(reviews) };
  });
}

export { dueOf };
