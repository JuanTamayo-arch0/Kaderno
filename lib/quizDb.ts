// ============================================================
//  Fase 3 (schema_v19): plan del parcial, simulacros y "Ponme a prueba".
// ============================================================
import { supabase, currentUserId } from './supabase';
import { getTasks, isMissingColumn, type Task } from './db';
import type { QuizQuestion, QuizAnswer } from './quiz';
import type { RecallResult, GradeResult } from '../supabase/functions/_shared/quiz';
import { planSessions, sessionTitle, type SessionKind } from './examPlan';
import { suggestSlotsForDay } from './planHelpers';

async function fnError(error: any): Promise<Error> {
  try { const b = await error?.context?.json?.(); if (b?.error) return new Error(b.error); } catch { /* noop */ }
  return error instanceof Error ? error : new Error(String(error?.message ?? error));
}

// ---------- IA ----------
export async function aiQuiz(notes: { title: string; content: string }[], count: number, subject: string | null, quick = false): Promise<QuizQuestion[]> {
  const { data, error } = await supabase.functions.invoke('ai', { body: { task: 'quiz', notes, count, subject, quick } });
  if (error) throw await fnError(error);
  const qs = (data as { questions?: QuizQuestion[] })?.questions ?? [];
  if (!qs.length) throw new Error('La IA no devolvió preguntas, intenta de nuevo.');
  return qs;
}
export async function aiGrade(items: { q: string; expected: string; given: string }[]): Promise<GradeResult[]> {
  if (!items.length) return [];
  const { data, error } = await supabase.functions.invoke('ai', { body: { task: 'grade', items } });
  if (error) throw await fnError(error);
  return (data as { grades?: GradeResult[] })?.grades ?? items.map(() => null);
}
export async function aiRecall(title: string, content: string, headings: string[], recalled: string): Promise<RecallResult> {
  const { data, error } = await supabase.functions.invoke('ai', { body: { task: 'recall', title, content, headings, recalled } });
  if (error) throw await fnError(error);
  const r = (data as { result?: RecallResult })?.result;
  if (!r) throw new Error('La IA no pudo comparar tu respuesta, intenta de nuevo.');
  return r;
}

// ---------- Simulacros ----------
export type QuizRow = {
  id: string; subject_id: string | null; exam_task_id: string | null; created_at: string; note_ids: string[];
  questions: QuizQuestion[]; answers: QuizAnswer[]; score: number | null; scale: number | null; pct: number | null; duration_sec: number | null;
};
let QUIZ_DB: boolean | null = null;
export function hasQuizDb(): boolean { return QUIZ_DB !== false; }
const missingTable = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(String(e.message ?? '')));

export async function getQuizzes(subjectId: string | null, limit = 10): Promise<QuizRow[]> {
  if (QUIZ_DB === false) return [];
  let q = supabase.from('quizzes').select('id, subject_id, exam_task_id, created_at, score, scale, pct, duration_sec').order('created_at', { ascending: false }).limit(limit);
  if (subjectId) q = q.eq('subject_id', subjectId);
  const { data, error } = await q;
  if (error) { if (missingTable(error)) QUIZ_DB = false; return []; }
  return (data as QuizRow[]) ?? [];
}

export async function saveQuiz(row: Omit<QuizRow, 'id' | 'created_at'>, id?: string | null): Promise<string | null> {
  if (QUIZ_DB === false) return null;
  if (id) {
    const { error } = await supabase.from('quizzes').update({ answers: row.answers, score: row.score, pct: row.pct }).eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from('quizzes').insert(row).select('id').single();
  if (error) { if (missingTable(error)) { QUIZ_DB = false; return null; } throw error; }
  return (data as { id: string }).id;
}

// ---------- Ponme a prueba ----------
export async function saveRecall(noteId: string, score: number): Promise<boolean> {
  const { error } = await supabase.from('notes').update({ last_recall_at: new Date().toISOString(), last_recall_score: Math.round(score) }).eq('id', noteId);
  if (error) { if (isMissingColumn(error)) return false; throw error; }
  return true;
}

// ---------- Plan del parcial ----------
export type SessionTask = Task & { parent_id?: string | null; session_kind?: SessionKind | null };

export async function getSessions(examId: string): Promise<SessionTask[]> {
  const { data, error } = await supabase.from('assignments').select('*').eq('parent_id', examId).is('deleted_at', null).order('due_date', { ascending: true });
  if (error) return [];
  return (data as SessionTask[]) ?? [];
}

/** Exámenes con plan (id → sesiones), para saber a cuáles ya no ofrecer. */
export async function examsWithPlan(): Promise<Set<string>> {
  const { data, error } = await supabase.from('assignments').select('parent_id').not('parent_id', 'is', null).is('deleted_at', null);
  if (error) return new Set();
  return new Set(((data as { parent_id: string }[]) ?? []).map((r) => r.parent_id));
}

export type DraftSession = { kind: SessionKind; title: string; day: Date; at: Date | null; minutes: number };

/** Propuesta del plan con horario para cada sesión (sin guardar). */
export async function proposePlan(exam: Task, now = new Date()): Promise<DraftSession[]> {
  if (!exam.due_date) return [];
  const [y, m, d] = exam.due_date.split('-').map(Number);
  const list = planSessions(new Date(y, m - 1, d), now);
  const out: DraftSession[] = [];
  const taken: Date[] = [];
  for (const s of list) {
    const at = await suggestSlotsForDay(s.day, s.minutes, taken).catch(() => null);
    if (at) taken.push(at);
    out.push({ kind: s.kind, title: sessionTitle(s.kind, exam.title, s.title === 'Simulacro rápido'), day: s.day, at, minutes: s.minutes });
  }
  return out;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function createPlan(exam: Task, sessions: DraftSession[]): Promise<number> {
  const u = await currentUserId();
  if (!u || !sessions.length) return 0;
  const rows = sessions.map((s) => ({
    user_id: u, title: s.title, subject_id: exam.subject_id, type: 'repaso', status: 'pending', remind_days: 0,
    due_date: iso(s.day), plan_at: s.at ? s.at.toISOString() : null, estimate_min: s.minutes,
    parent_id: exam.id, session_kind: s.kind,
  }));
  const { error } = await supabase.from('assignments').insert(rows);
  if (error) {
    if (isMissingColumn(error)) throw new Error('Para el plan de repaso falta correr schema_v19.sql (fase 3) en Supabase.');
    throw error;
  }
  return rows.length;
}

/** Quita las sesiones pendientes (a la papelera). */
export async function removePlan(examId: string): Promise<void> {
  const { error } = await supabase.from('assignments').update({ deleted_at: new Date().toISOString() })
    .eq('parent_id', examId).neq('status', 'done').is('deleted_at', null);
  if (error) throw error;
}

export async function applyShift(move: { id: string; due_date: string; plan_at: string | null }[]): Promise<void> {
  for (const m of move) {
    const { error } = await supabase.from('assignments').update({ due_date: m.due_date, plan_at: m.plan_at }).eq('id', m.id);
    if (error) throw error;
  }
}

/** El examen o quiz más cercano de una materia (para el simulacro). */
export async function nextExamOf(subjectId: string): Promise<Task | null> {
  const t = await getTasks(subjectId).catch(() => [] as Task[]);
  const today = iso(new Date());
  return t.filter((x) => x.status !== 'done' && ['examen', 'quiz'].includes(String(x.type)) && x.due_date && x.due_date >= today)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0] ?? null;
}

/** A la papelera varias tareas (sesiones que ya no caben antes del examen). */
export async function trashTasks(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('assignments').update({ deleted_at: new Date().toISOString() }).in('id', ids);
  if (error) throw error;
}
