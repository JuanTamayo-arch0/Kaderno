// ============================================================
//  ¿Cómo te fue? (schema_v21, fase 3): reunir el esfuerzo de un parcial,
//  guardar la nota (también en Calificaciones) y lo que harás distinto.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, currentUserId } from './supabase';
import type { Task } from './db';
import { getSessions } from './quizDb';
import { getGoal } from './ritualsDb';
import { computeEffort, effortWindow, shouldAsk, type Effort, type PastResult } from './examReview';
import { dueDay } from './time';
import { localISO } from './day';

const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V21_3 = 'Para guardar cómo te fue falta correr schema_v21.sql (fase 3) en Supabase.';
const DISMISS_KEY = 'kd-exam-review-dismissed';

export type ExamResult = PastResult & {
  id: string; task_id: string; subject_id: string | null; exam_date: string | null; felt: number | null;
  reasons: string[]; change: string | null; grade_id: string | null; created_at: string;
};

let RESULTS_DB: boolean | null = null;
export async function getResults(subjectId?: string | null, limit = 60): Promise<ExamResult[]> {
  if (RESULTS_DB === false) return [];
  let q = supabase.from('exam_results').select('*').order('created_at', { ascending: false }).limit(limit);
  if (subjectId) q = q.eq('subject_id', subjectId);
  const { data, error } = await q;
  if (error) { if (missing(error)) RESULTS_DB = false; return []; }
  RESULTS_DB = true;
  return (data as ExamResult[]) ?? [];
}

async function dismissed(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(DISMISS_KEY)) ?? '[]'); } catch { return []; }
}
/** "No lo presenté" se guarda; "Ahora no" solo lo esconde en este dispositivo. */
export async function dismissReview(taskId: string): Promise<void> {
  const list = (await dismissed()).filter((x) => x !== taskId).concat(taskId).slice(-80);
  await AsyncStorage.setItem(DISMISS_KEY, JSON.stringify(list)).catch(() => {});
}

/** Parciales y quices que ya pasaron y no tienen resultado (para Hoy). */
export async function pendingReviews(tasks: Task[], now = new Date()): Promise<Task[]> {
  const cand = tasks.filter((t) => shouldAsk(t as any, now));
  if (!cand.length) return [];
  const done = new Set((await getResults(null, 200)).map((r) => r.task_id));
  if (RESULTS_DB === false) return [];
  const hidden = new Set(await dismissed());
  return cand.filter((t) => !done.has(t.id) && !hidden.has(t.id)).sort((a, b) => String(a.due_date ?? '').localeCompare(String(b.due_date ?? '')));
}

/** Todo lo que hace falta para el análisis. */
export async function gatherEffort(exam: Task): Promise<{ effort: Effort; target: number | null; history: ExamResult[]; gradeMax: number }> {
  const w = effortWindow(exam as any);
  const from = w?.from.toISOString() ?? new Date(0).toISOString();
  const to = w?.to.toISOString() ?? new Date().toISOString();
  const sid = exam.subject_id ?? null;
  const [focusRes, sessions, reviewsRes, quizRes, recallRes, goal, history, gradesRes] = await Promise.all([
    supabase.from('focus_sessions').select('minutes, created_at, assignment_id, subject_id').gte('created_at', from).lte('created_at', to).limit(2000),
    getSessions(exam.id),
    sid ? supabase.from('flashcard_reviews').select('reviewed_at, flashcards!inner(subject_id)').eq('flashcards.subject_id', sid).gte('reviewed_at', from).lte('reviewed_at', to).limit(5000) : Promise.resolve({ data: [] as any[] }),
    supabase.from('quizzes').select('pct, created_at, exam_task_id, subject_id').gte('created_at', from).lte('created_at', to).limit(200),
    sid ? supabase.from('notes').select('last_recall_at').eq('subject_id', sid).gte('last_recall_at', from).lte('last_recall_at', to).limit(500) : Promise.resolve({ data: [] as any[] }),
    sid ? getGoal(sid).catch(() => null) : Promise.resolve(null),
    getResults(null, 100),
    sid ? supabase.from('grades').select('max_score').eq('subject_id', sid).limit(20) : Promise.resolve({ data: [] as any[] }),
  ]);
  const quizzes = (((quizRes as any).data as any[]) ?? []).filter((q) => q.exam_task_id === exam.id || (sid && q.subject_id === sid));
  const effort = computeEffort(exam as any, {
    focus: ((focusRes as any).data as any[]) ?? [],
    sessions: sessions.map((s) => ({ id: s.id, status: s.status })),
    reviews: ((((reviewsRes as any).data as any[]) ?? []).map((r) => r.reviewed_at)),
    quizzes,
    recalls: ((((recallRes as any).data as any[]) ?? []).map((r) => r.last_recall_at)),
  });
  // Escala de la materia: la más usada en Calificaciones, o 5.
  const maxes = ((((gradesRes as any).data as any[]) ?? []).map((g) => Number(g.max_score)).filter((x) => x > 0));
  const gradeMax = maxes.length ? maxes.sort((a, b) => maxes.filter((x) => x === b).length - maxes.filter((x) => x === a).length)[0] : 5;
  return { effort, target: goal?.target_grade ?? null, history: history.filter((h) => h.task_id !== exam.id), gradeMax };
}

/** ¿Ya hay una calificación con ese nombre en la materia? (para no pedir el peso) */
export async function findGrade(subjectId: string | null, title: string): Promise<{ id: string; weight: number; max_score: number } | null> {
  if (!subjectId) return null;
  const { data } = await supabase.from('grades').select('id, name, weight, max_score').eq('subject_id', subjectId).limit(100);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const g = ((data as any[]) ?? []).find((x) => norm(x.name) === norm(title));
  return g ? { id: g.id, weight: Number(g.weight) || 0, max_score: Number(g.max_score) || 5 } : null;
}

export async function saveResult(exam: Task, r: {
  score: number | null; max: number; skipped: boolean; felt: number | null; reasons: string[]; change: string | null; weight: number | null; focusMin: number;
}): Promise<void> {
  const u = await currentUserId();
  if (!u) throw new Error('Inicia sesión otra vez.');
  let gradeId: string | null = null;
  if (!r.skipped && r.score != null && exam.subject_id) {
    const g = await findGrade(exam.subject_id, exam.title);
    if (g) {
      const { error } = await supabase.from('grades').update({ score: r.score, max_score: r.max }).eq('id', g.id);
      if (!error) gradeId = g.id;
    } else {
      const { data, error } = await supabase.from('grades').insert({ user_id: u, subject_id: exam.subject_id, name: exam.title.slice(0, 120), weight: r.weight ?? 0, score: r.score, max_score: r.max }).select('id').single();
      if (!error) gradeId = (data as { id: string }).id;
    }
  }
  const d = dueDay(exam);
  const { error } = await supabase.from('exam_results').upsert({
    task_id: exam.id, subject_id: exam.subject_id ?? null, title: exam.title.slice(0, 200), exam_date: d ? localISO(d) : null,
    score: r.skipped ? null : r.score, max_score: r.max, skipped: r.skipped, felt: r.felt, reasons: r.reasons.slice(0, 12),
    change: r.change?.trim().slice(0, 300) || null, grade_id: gradeId, focus_min: Math.min(100000, Math.round(r.focusMin)),
  }, { onConflict: 'task_id' });
  if (error) { if (missing(error)) throw new Error(NEEDS_V21_3); throw error; }
}

/** "La última vez dijiste…" para el próximo plan de esa materia. */
export async function lastChange(subjectId: string | null): Promise<{ title: string; change: string } | null> {
  if (!subjectId) return null;
  const r = (await getResults(subjectId, 10)).find((x) => x.change);
  return r ? { title: r.title, change: r.change as string } : null;
}
