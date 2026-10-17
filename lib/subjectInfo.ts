// ============================================================
//  Cálculos puros para la ficha de la materia y sus notas:
//  días de clase, próxima clase, próxima evaluación, grupos de tareas,
//  orden y búsqueda de notas, índice y tiempo de lectura.
//  Sin React ni Supabase: se prueban en tests/v19.test.ts.
// ============================================================
import type { TimeBlock } from './schedule';
import { addDays, dayDiff, dueDay, startOfDay, compareDue, type DueLike } from './time';

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export type SlotLike = { day: number; slot: number; subject_id: string };

function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}
/** Lunes = 0 … Domingo = 6 (como la tabla schedule). */
export function mondayIndex(d: Date): number { return (d.getDay() + 6) % 7; }

export function joinEs(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];
}

/** "Lun y Mié" con los días en que la materia tiene clase. */
export function classDays(slots: SlotLike[], subjectId: string): { days: number[]; label: string } {
  const days = Array.from(new Set(slots.filter((s) => s.subject_id === subjectId).map((s) => s.day))).sort((a, b) => a - b);
  return { days, label: joinEs(days.map((d) => DAY_SHORT[d] ?? `Día ${d + 1}`)) };
}

export type NextClass = { date: Date; start: Date; end: Date; day: number; block: TimeBlock; now: boolean };

/**
 * Próxima clase (o la que está pasando ahora) según el horario.
 * Junta bloques seguidos del mismo día en una sola clase.
 */
export function nextClass(slots: SlotLike[], subjectId: string, blocks: TimeBlock[], now = new Date()): NextClass | null {
  const mine = slots.filter((s) => s.subject_id === subjectId && blocks[s.slot]);
  if (!mine.length) return null;
  for (let off = 0; off < 8; off++) {
    const date = startOfDay(addDays(now, off));
    const di = mondayIndex(date);
    const todays = mine.filter((s) => s.day === di).map((s) => blocks[s.slot]).sort((a, b) => hhmmToMin(a.start) - hhmmToMin(b.start));
    // Unir bloques contiguos (7:00-8:00 + 8:00-9:00 = una clase de 7 a 9).
    const merged: { start: number; end: number; block: TimeBlock }[] = [];
    todays.forEach((b) => {
      const st = hhmmToMin(b.start), en = hhmmToMin(b.end);
      const last = merged[merged.length - 1];
      if (last && st <= last.end + 10) last.end = Math.max(last.end, en);
      else merged.push({ start: st, end: en, block: b });
    });
    for (const m of merged) {
      const start = new Date(date); start.setMinutes(m.start);
      const end = new Date(date); end.setMinutes(m.end);
      if (end > now) return { date, start, end, day: di, block: m.block, now: start <= now };
    }
  }
  return null;
}

export function dayWord(d: Date, now = new Date()): string {
  const diff = dayDiff(startOfDay(d), startOfDay(now));
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return DAY_LONG[mondayIndex(d)];
}

export function countdown(d: Date, now = new Date()): string {
  const diff = dayDiff(startOfDay(d), startOfDay(now));
  if (diff < 0) return diff === -1 ? 'Venció ayer' : `Venció hace ${-diff} días`;
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return `En ${diff} días`;
}

export function normText(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

type TaskLike = DueLike & { id: string; title: string; status?: string | null; type?: string | null };
type GradeLike = { name: string; weight: number; score: number | null };
const EXAM_RE = /\b(parcial|examen|quiz|quices|final|previo|sustentacion|evaluacion)\b/;

export type NextEval = { title: string; due: Date | null; weight: number | null; taskId: string | null };

/**
 * Próxima evaluación: la tarea pendiente tipo examen/quiz (o con "parcial" en el
 * nombre) más cercana; si no hay, la primera calificación sin nota.
 * El peso sale de la calificación con el mismo nombre, si existe.
 */
export function nextEvaluation(tasks: TaskLike[], grades: GradeLike[], now = new Date()): NextEval | null {
  const today = startOfDay(now);
  const weightOf = (title: string) => {
    const g = grades.find((x) => normText(x.name) === normText(title));
    return g ? g.weight : null;
  };
  const exams = tasks
    .filter((t) => t.status !== 'done')
    .filter((t) => t.type === 'examen' || t.type === 'quiz' || EXAM_RE.test(normText(t.title)))
    .filter((t) => { const d = dueDay(t); return d && d >= today; })
    .sort(compareDue);
  if (exams[0]) return { title: exams[0].title, due: dueDay(exams[0]), weight: weightOf(exams[0].title), taskId: exams[0].id };
  const g = grades.find((x) => x.score == null);
  if (g) return { title: g.name, due: null, weight: g.weight, taskId: null };
  return null;
}

export type TaskGroupKey = 'overdue' | 'week' | 'later' | 'none';
export const TASK_GROUP_LABEL: Record<TaskGroupKey, string> = {
  overdue: 'Vencidas', week: 'Esta semana', later: 'Más adelante', none: 'Sin fecha',
};

/** Agrupa pendientes en vencidas, próximos 7 días, más adelante y sin fecha. */
export function groupTasks<T extends TaskLike>(pending: T[], now = new Date()): { key: TaskGroupKey; label: string; tasks: T[] }[] {
  const today = startOfDay(now);
  const out: Record<TaskGroupKey, T[]> = { overdue: [], week: [], later: [], none: [] };
  [...pending].sort(compareDue).forEach((t) => {
    const d = dueDay(t);
    if (!d) out.none.push(t);
    else if (d < today) out.overdue.push(t);
    else if (dayDiff(d, today) <= 6) out.week.push(t);
    else out.later.push(t);
  });
  return (['overdue', 'week', 'later', 'none'] as TaskGroupKey[])
    .filter((k) => out[k].length)
    .map((k) => ({ key: k, label: TASK_GROUP_LABEL[k], tasks: out[k] }));
}

// ---------- Notas ----------
type NoteLike = { id: string; title: string | null; content: string | null; created_at: string; pinned?: boolean; updated_at?: string | null };

export function noteTime(n: NoteLike): number { return new Date(n.updated_at || n.created_at).getTime(); }

/** Fijadas primero; luego la editada más reciente. */
export function sortNotes<T extends NoteLike>(notes: T[]): T[] {
  return [...notes].sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || (noteTime(b) - noteTime(a)));
}

/** Busca en título y contenido sin importar tildes ni mayúsculas. */
export function filterNotes<T extends NoteLike>(notes: T[], q: string): T[] {
  const words = normText(q).split(' ').filter(Boolean);
  if (!words.length) return notes;
  return notes.filter((n) => {
    const hay = normText(`${n.title ?? ''} ${n.content ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Texto plano corto para la vista previa en la lista. */
export function notePreview(md: string | null, max = 90): string {
  const t = (md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$(?!\s)([^$\n]+?)\$(?!\d)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(#{1,6}|>|[-*+]\s+\[[ xX]\]|[-*+]|\d+[.)])\s*/gm, '')
    .replace(/[*_`~#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

export function readingStats(md: string | null): { words: number; minutes: number } {
  const words = notePreview(md, 1e9).split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 200)) };
}

export type OutlineItem = { level: number; text: string; index: number };

/** Títulos de la nota (# a ###), sin contar los que están dentro de bloques de código. */
export function outline(md: string | null): OutlineItem[] {
  const out: OutlineItem[] = [];
  let fence = false;
  (md ?? '').split('\n').forEach((line) => {
    if (/^\s*```/.test(line)) { fence = !fence; return; }
    if (fence) return;
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, '').trim(), index: out.length });
  });
  return out;
}

export function minutesLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}
