// ============================================================
//  Simulacro y "Ponme a prueba" (v20, secciones H e I). Puro, con pruebas.
//  Elegir notas, corregir lo que se puede en el navegador, calcular la
//  nota en la escala de la materia y armar las tarjetas de los errores.
// ============================================================
import type { QuizQuestion } from '../supabase/functions/_shared/quiz';
export type { QuizQuestion } from '../supabase/functions/_shared/quiz';

export const NOTES_BUDGET = 12000;
export const SECONDS_PER_Q = 90;
export type Verdict = 'ok' | 'partial' | 'wrong' | 'skip';
export type QuizAnswer = { given: string | number | null; verdict: Verdict | null; why?: string; by?: 'auto' | 'ai' | 'user' };

type NoteLike = { id: string; title: string | null; content: string | null; updated_at?: string | null; created_at: string };

/** Notas para el simulacro: las elegidas (o todas), de la más reciente a la más vieja, hasta el presupuesto. */
export function pickNotes(notes: NoteLike[], selected: string[] | null, budget = NOTES_BUDGET): { id: string; title: string; content: string }[] {
  const pool = notes.filter((n) => (n.content ?? '').trim().length >= 40 && (!selected || selected.includes(n.id)))
    .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
  const out: { id: string; title: string; content: string }[] = [];
  let left = budget;
  for (const n of pool) {
    if (left < 300) break;
    const content = (n.content ?? '').trim().slice(0, left);
    left -= content.length;
    out.push({ id: n.id, title: n.title || 'Nota sin título', content });
  }
  return out;
}

/** Primer número de un texto ("12,5 m/s" → 12.5). */
export function firstNumber(s: unknown): number | null {
  const m = String(s ?? '').replace(/(\d)\s+(?=\d{3}\b)/g, '$1').match(/-?\d+(?:[.,]\d+)?(?:e-?\d+)?/i);
  if (!m) return null;
  const v = Number(m[0].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

/** ¿El número dado está a 2 % del esperado? null si alguno no tiene número. */
export function numericClose(given: unknown, expected: unknown, tol = 0.02): boolean | null {
  const g = firstNumber(given), e = firstNumber(expected);
  if (g == null || e == null) return null;
  if (e === 0) return Math.abs(g) < 1e-9;
  return Math.abs(g - e) / Math.abs(e) <= tol;
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim();

/** Lo que se corrige sin IA. null = lo corrige la IA. */
export function autoGrade(q: QuizQuestion, given: string | number | null | undefined): Verdict | null {
  if (given == null || String(given).trim() === '') return 'skip';
  if (q.type === 'mc') return Number(given) === q.answer ? 'ok' : 'wrong';
  if (q.type === 'num') { const c = numericClose(given, q.answer); if (c) return 'ok'; return null; }
  return norm(given) === norm(q.answer) ? 'ok' : null;
}

export function correctText(q: QuizQuestion): string {
  return q.type === 'mc' ? (q.options?.[q.answer as number] ?? '') : String(q.answer);
}

export function givenText(q: QuizQuestion, a: QuizAnswer | undefined): string {
  if (!a || a.given == null || String(a.given).trim() === '') return 'Sin responder';
  return q.type === 'mc' ? (q.options?.[Number(a.given)] ?? '') : String(a.given);
}

const POINTS: Record<Verdict, number> = { ok: 1, partial: 0.5, wrong: 0, skip: 0 };

export function scoreQuiz(answers: QuizAnswer[], total: number): { points: number; pct: number } {
  const points = answers.slice(0, total).reduce((s, a) => s + (a?.verdict ? POINTS[a.verdict] : 0), 0);
  return { points, pct: total ? Math.round((points / total) * 100) : 0 };
}

export function toScale(pct: number, scale: number): number {
  return Math.round((pct / 100) * scale * 10) / 10;
}

/** "3,8 / 5" (o "76 / 100"). */
export function fmtGrade(v: number, scale: number): string {
  const n = scale >= 20 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',');
  return `${n} / ${scale}`;
}

/** Aciertos por nota de origen. */
export function byNote(qs: QuizQuestion[], answers: QuizAnswer[], notes: { id: string; title: string }[]): { id: string | null; title: string; points: number; total: number }[] {
  const map = new Map<string, { id: string | null; title: string; points: number; total: number }>();
  qs.forEach((q, i) => {
    const n = q.note != null ? notes[q.note] : undefined;
    const key = n?.id ?? '-';
    const row = map.get(key) ?? { id: n?.id ?? null, title: n?.title ?? 'Varias notas', points: 0, total: 0 };
    row.total += 1;
    const v = answers[i]?.verdict;
    row.points += v ? POINTS[v] : 0;
    map.set(key, row);
  });
  return [...map.values()].sort((a, b) => a.points / a.total - b.points / b.total);
}

/** Índices de lo que estuvo mal, a medias o sin responder. */
export function errorsOf(answers: QuizAnswer[], total: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < total; i++) { const v = answers[i]?.verdict; if (v !== 'ok') out.push(i); }
  return out;
}

/** Tarjetas para los errores (pasan por "Revisa tus tarjetas"). */
export function errorDrafts(qs: QuizQuestion[], answers: QuizAnswer[]): { kind: 'basic'; front: string; back: string }[] {
  return errorsOf(answers, qs.length).map((i) => {
    const q = qs[i];
    const back = [correctText(q), q.explain].filter(Boolean).join('. ').replace(/\.\./g, '.');
    return { kind: 'basic' as const, front: q.q.slice(0, 400), back: back.slice(0, 400) };
  });
}

/** Siguiente veredicto al tocar el chip (el usuario puede corregir a la IA). */
export function cycleVerdict(v: Verdict | null): Verdict {
  return v === 'ok' ? 'partial' : v === 'partial' ? 'wrong' : 'ok';
}

/** "Preparación: último simulacro 3,8 (antes 3,1)". */
export function prepText(quizzes: { score: number | null; scale: number | null; created_at: string }[]): string | null {
  const done = quizzes.filter((q) => q.score != null).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!done.length) return null;
  const s = (q: (typeof done)[number]) => fmtGrade(Number(q.score), Number(q.scale) || 5).split(' / ')[0];
  return `Preparación: último simulacro ${s(done[0])}${done[1] ? ` (antes ${s(done[1])})` : ''}`;
}

/** "Probada hace 3 días · 70%". */
export function recallLabel(at: string | null | undefined, score: number | null | undefined, now: Date): string | null {
  if (!at) return null;
  const d = new Date(at);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  const when = diff <= 0 ? 'hoy' : diff === 1 ? 'ayer' : `hace ${diff} días`;
  return `Probada ${when}${score != null ? ` · ${score}%` : ''}`;
}

/** Títulos (## …) de una nota en markdown, para enlazar lo que faltó. */
export function headingsOf(md: string): string[] {
  return (md ?? '').split('\n').map((l) => /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(l)?.[1]?.trim() ?? '').filter(Boolean).slice(0, 40);
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
