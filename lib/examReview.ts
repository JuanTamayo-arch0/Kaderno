// ============================================================
//  ¿Cómo te fue? (v22, fase 3). Puro, con pruebas.
//  Compara la nota del parcial con el esfuerzo de las 3 semanas antes:
//  horas de enfoque, en cuántos días, cuándo empezaste, cuánto quedó para
//  las últimas 48 horas, sesiones del plan, tarjetas, simulacros y
//  "Ponme a prueba". Todo con datos de la app; no gasta IA.
// ============================================================
import { dueMoment, type DueLike } from './time';
import { localISO, fmtHours } from './day';

export const WINDOW_DAYS = 21;
export const ASK_DAYS = 21;
const DAY = 86_400_000;

export type ExamLike = DueLike & { id: string; title: string; subject_id: string | null; type?: string | null };
export type FocusLike = { minutes: number; created_at: string; assignment_id?: string | null; subject_id?: string | null };
export type SessionLike = { id: string; status?: string | null };
export type QuizLike = { pct: number | null; created_at: string; exam_task_id?: string | null };

export type Effort = {
  minutes: number; days: number; firstDaysBefore: number | null; last48Share: number;
  sessionsDone: number; sessionsTotal: number; cardReviews: number;
  quizzes: number; bestQuiz: number | null; lastQuiz: number | null; recalls: number;
};

/** ¿Es un parcial o quiz que ya pasó y todavía se puede preguntar cómo fue? */
export function shouldAsk(t: ExamLike & { deleted_at?: string | null }, now: Date): boolean {
  if (!['examen', 'quiz'].includes(String(t.type)) || t.deleted_at) return false;
  const due = dueMoment(t);
  if (!due) return false;
  const ago = now.getTime() - due.getTime();
  return ago > 0 && ago <= ASK_DAYS * DAY;
}

/** Ventana del esfuerzo: las 3 semanas antes del examen, hasta su hora. */
export function effortWindow(exam: DueLike): { from: Date; to: Date } | null {
  const to = dueMoment(exam);
  if (!to) return null;
  return { from: new Date(to.getTime() - WINDOW_DAYS * DAY), to };
}

export function computeEffort(exam: ExamLike, input: {
  focus: FocusLike[]; sessions: SessionLike[]; reviews: string[]; quizzes: QuizLike[]; recalls: string[];
}): Effort {
  const w = effortWindow(exam);
  const ids = new Set([exam.id, ...input.sessions.map((s) => s.id)]);
  const inWin = (iso: string) => { const t = new Date(iso).getTime(); return !!w && t >= w.from.getTime() && t <= w.to.getTime(); };
  // Cuenta lo de la tarea y sus sesiones, y lo de la materia (sin contar dos veces).
  const focus = input.focus.filter((f) => inWin(f.created_at) && ((f.assignment_id && ids.has(f.assignment_id)) || (!!exam.subject_id && f.subject_id === exam.subject_id)));
  const minutes = focus.reduce((a, f) => a + Math.max(0, f.minutes || 0), 0);
  const dayset = new Set(focus.filter((f) => f.minutes > 0).map((f) => localISO(new Date(f.created_at))));
  const examDay = w ? new Date(w.to) : null;
  examDay?.setHours(0, 0, 0, 0);
  const first = focus.length ? new Date(Math.min(...focus.map((f) => new Date(f.created_at).getTime()))) : null;
  if (first) first.setHours(0, 0, 0, 0);
  const firstDaysBefore = first && examDay ? Math.round((examDay.getTime() - first.getTime()) / DAY) : null;
  const last48 = w ? focus.filter((f) => new Date(f.created_at).getTime() >= w.to.getTime() - 2 * DAY).reduce((a, f) => a + f.minutes, 0) : 0;
  const quizzes = input.quizzes.filter((q) => inWin(q.created_at) && q.pct != null).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    minutes,
    days: dayset.size,
    firstDaysBefore,
    last48Share: minutes ? last48 / minutes : 0,
    sessionsDone: input.sessions.filter((s) => s.status === 'done').length,
    sessionsTotal: input.sessions.length,
    cardReviews: input.reviews.filter(inWin).length,
    quizzes: quizzes.length,
    bestQuiz: quizzes.length ? Math.max(...quizzes.map((q) => q.pct as number)) : null,
    lastQuiz: quizzes.length ? (quizzes[quizzes.length - 1].pct as number) : null,
    recalls: input.recalls.filter(inWin).length,
  };
}

export type PastResult = { title: string; focus_min: number; score: number | null; max_score: number; skipped?: boolean };
export type Reason = { key: string; text: string; tone: 'good' | 'bad' };
export type Verdict = { reached: boolean; pct: number; targetPct: number; headline: string; detail: string; reasons: Reason[]; typicalGood: number | null };

const pctOf = (score: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0);
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmtGrade = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');

/** Lo que dicen los datos: si alcanzó, y por qué sí o por qué no. */
export function verdict(score: number, maxScore: number, target: number | null, e: Effort, history: PastResult[] = []): Verdict {
  const pct = pctOf(score, maxScore);
  const targetPct = target != null && target > 0 ? pctOf(target, maxScore) : 60;
  const reached = pct >= targetPct - 0.001;
  const good = history.filter((h) => !h.skipped && h.score != null && pctOf(h.score, h.max_score) >= targetPct).map((h) => h.focus_min);
  const typicalGood = median(good);
  const r: Reason[] = [];
  const bad = (key: string, text: string) => r.push({ key, text, tone: 'bad' });
  const ok = (key: string, text: string) => r.push({ key, text, tone: 'good' });

  if (e.minutes === 0) bad('nofocus', 'No hay enfoque registrado para este parcial ni para la materia en las 3 semanas antes.');
  else {
    if (e.firstDaysBefore != null && e.firstDaysBefore <= 2) bad('late', `Empezaste ${e.firstDaysBefore === 0 ? 'el mismo día' : e.firstDaysBefore === 1 ? 'un día antes' : `${e.firstDaysBefore} días antes`}. Lo que mejor funciona es repartir el estudio en una o dos semanas.`);
    else if (e.firstDaysBefore != null && e.firstDaysBefore >= 7) ok('early', `Empezaste ${e.firstDaysBefore} días antes.`);
    if (e.last48Share >= 0.6 && e.minutes >= 30) bad('cram', `El ${Math.round(e.last48Share * 100)} % del estudio fue en las últimas 48 horas.`);
    if (e.days >= 4) ok('spread', `Repartiste el estudio en ${e.days} días distintos.`);
    else if (e.days <= 2 && e.minutes >= 60 && !r.some((x) => x.key === 'late')) bad('fewdays', `Estudiaste solo ${e.days === 1 ? 'un día' : `${e.days} días`} distintos.`);
    if (typicalGood != null && typicalGood > 0) {
      if (e.minutes < typicalGood * 0.7) bad('less', `Menos horas que en los parciales donde te fue bien (${fmtHours(e.minutes)} contra unas ${fmtHours(typicalGood)}).`);
      else if (e.minutes >= typicalGood) ok('more', `Tantas horas o más que en los parciales donde te fue bien (${fmtHours(e.minutes)}).`);
    }
  }
  if (e.sessionsTotal > 0 && e.sessionsDone < e.sessionsTotal) bad('plan', `${e.sessionsTotal - e.sessionsDone} de ${e.sessionsTotal} sesiones del plan sin hacer.`);
  else if (e.sessionsTotal > 0) ok('plan', `Hiciste las ${e.sessionsTotal} sesiones del plan.`);
  if (e.quizzes === 0) { if (!reached) bad('nosim', 'No hiciste simulacro.'); }
  else if (e.bestQuiz != null && e.bestQuiz < 60 && !reached) bad('simlow', `En el simulacro sacaste ${Math.round(e.bestQuiz)} %: era una alerta.`);
  else ok('sim', `Hiciste ${e.quizzes === 1 ? 'un simulacro' : `${e.quizzes} simulacros`}${e.bestQuiz != null ? ` (mejor: ${Math.round(e.bestQuiz)} %)` : ''}.`);
  if (e.cardReviews >= 20) ok('cards', `Repasaste ${e.cardReviews} tarjetas de la materia.`);
  if (e.recalls > 0) ok('recall', `Te pusiste a prueba con ${e.recalls === 1 ? 'una nota' : `${e.recalls} notas`}.`);

  const badN = r.filter((x) => x.tone === 'bad').length;
  const targetText = target != null && target > 0 ? `la nota que querías (${fmtGrade(target)})` : `aprobar (${fmtGrade(maxScore * 0.6)})`;
  let headline: string, detail: string;
  if (reached) {
    headline = 'El esfuerzo alcanzó';
    detail = e.minutes < 60 && e.minutes > 0
      ? `Llegaste a ${targetText} con poco tiempo de estudio registrado. Si el próximo es más difícil, quizás no alcance igual.`
      : badN ? `Llegaste a ${targetText}. Aun así, ojo con esto para el próximo:` : `Llegaste a ${targetText}.`;
  } else if (badN === 0 && e.minutes > 0) {
    headline = 'Le pusiste esfuerzo, pero no alcanzó';
    detail = `Te faltó para ${targetText}. En los datos no se ve un problema de tiempo o de reparto: la diferencia parece estar en otra parte. ¿Qué pasó?`;
  } else {
    headline = 'El esfuerzo no alcanzó';
    detail = `Te faltó para ${targetText}. Esto es lo que se ve en los datos:`;
  }
  return { reached, pct, targetPct, headline, detail, reasons: r.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'bad' ? -1 : 1)), typicalGood };
}

/** Lo que los datos no ven. */
export const MY_REASONS: { key: string; label: string; tip: string }[] = [
  { key: 'notunderstand', label: 'No entendía algunos temas', tip: 'Preguntar los temas difíciles al profesor o al Oráculo con tiempo' },
  { key: 'different', label: 'El examen fue distinto a lo que estudié', tip: 'Estudiar con parciales anteriores y ejercicios tipo examen' },
  { key: 'nerves', label: 'Nervios', tip: 'Hacer un simulacro con tiempo, como si fuera el examen' },
  { key: 'careless', label: 'Errores por descuido', tip: 'Dejar 10 minutos al final para revisar' },
  { key: 'time', label: 'Me faltó tiempo en el examen', tip: 'Practicar con tiempo y empezar por lo que más sé' },
  { key: 'theory', label: 'Estudié teoría pero no practiqué ejercicios', tip: 'Practicar ejercicios, no solo leer' },
  { key: 'sleep', label: 'Dormí poco', tip: 'Terminar de estudiar la noche anterior a una hora razonable' },
  { key: 'other', label: 'Otra', tip: '' },
];

const DATA_TIPS: Record<string, string> = {
  nofocus: 'Registrar el estudio con el enfoque para poder comparar',
  late: 'Empezar el plan del parcial 14 días antes',
  cram: 'Repartir el estudio en varios días, no dejarlo para el final',
  fewdays: 'Estudiar un poco en más días distintos',
  less: 'Darle más horas, como en los parciales donde me fue bien',
  plan: 'Hacer todas las sesiones del plan',
  nosim: 'Hacer al menos un simulacro',
  simlow: 'Si el simulacro sale bajo, repasar esos temas antes del examen',
};

/** Sugerencias para "Qué harás distinto", según lo que pasó (sin repetir, máximo 4). */
export function changeSuggestions(dataReasons: Reason[], mine: string[]): string[] {
  const out: string[] = [];
  for (const r of dataReasons) if (r.tone === 'bad' && DATA_TIPS[r.key] && !out.includes(DATA_TIPS[r.key])) out.push(DATA_TIPS[r.key]);
  for (const k of mine) { const t = MY_REASONS.find((x) => x.key === k)?.tip; if (t && !out.includes(t)) out.push(t); }
  return out.slice(0, 4);
}

/** Valida la nota escrita ("4,2", "38/50"…). Devuelve la nota y la escala. */
export function parseScore(input: string, defaultMax = 5): { score: number; max: number } | null {
  const s = (input ?? '').trim().replace(',', '.');
  const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (frac) {
    const score = Number(frac[1]), max = Number(frac[2]);
    return max > 0 && score >= 0 && score <= max ? { score, max } : null;
  }
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  const score = Number(s);
  return score >= 0 && score <= defaultMax ? { score, max: defaultMax } : null;
}

/** Puntos para la gráfica horas contra nota (en %), con el actual marcado. */
export function chartPoints(history: PastResult[], current: { focus_min: number; pct: number; title: string } | null): { x: number; y: number; title: string; current: boolean }[] {
  const pts = history.filter((h) => !h.skipped && h.score != null).map((h) => ({ x: h.focus_min / 60, y: pctOf(h.score as number, h.max_score), title: h.title, current: false }));
  if (current) pts.push({ x: current.focus_min / 60, y: current.pct, title: current.title, current: true });
  return pts;
}

export { fmtGrade };
