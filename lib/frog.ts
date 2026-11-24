// ============================================================
//  La rana, la lista para mañana y la regla 1-3-5 (v27, fase 2).
//  Puro, con pruebas.
//
//  · La rana (Brian Tracy): lo más pesado e importante, primero.
//  · Ivy Lee: al cerrar el día, hasta 6 tareas para mañana, en orden.
//  · 1-3-5: un día realista tiene 1 cosa grande, 3 medianas y 5 pequeñas.
// ============================================================
import { taskMinutes } from './day';
import { t } from './i18n';

type T = {
  id: string; title?: string; status?: string | null; inbox?: boolean | null; important?: boolean | null;
  due_date?: string | null; estimate_min?: number | null; created_at?: string | null;
  plan_day?: string | null; plan_order?: number | null; frog?: boolean | null; parent_id?: string | null;
};

export const IVY_MAX = 6;

/** La rana de un día (si hay). */
export function frogOf<X extends T>(tasks: X[], dayISO: string): X | null {
  return tasks.find((t) => t.frog && t.plan_day === dayISO && t.status !== 'done') ?? null;
}

function daysSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/**
 * Sugerencia de rana entre las tareas del día: importante, larga y la que más
 * lleva esperando. Las sesiones de un plan de repaso no cuentan.
 */
export function suggestFrog<X extends T>(dayTasks: X[], now = new Date(), ratio?: number | null): X | null {
  const score = (t: X) => (t.important ? 6 : 0)
    + Math.min(4, taskMinutes(t.estimate_min, ratio) / 30)
    + Math.min(3, daysSince(t.created_at, now) / 3);
  const list = dayTasks.filter((t) => t.status !== 'done' && !t.parent_id);
  if (!list.length) return null;
  return [...list].sort((a, b) => score(b) - score(a) || String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')))[0];
}

/** Orden de lo que no tiene hora: la rana primero, luego la lista en su orden, luego lo demás como venía. */
export function orderLoose<X extends T>(list: X[], dayISO: string): X[] {
  const rank = (t: X) => (t.frog && t.plan_day === dayISO ? 0 : t.plan_day === dayISO && t.plan_order ? t.plan_order : 99);
  return list.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t);
}

export type Size = 'grande' | 'mediana' | 'pequena';
/** Tamaño por el estimado: más de 90 min, de 30 a 90, menos de 30. Sin estimado cuenta como mediana. */
export function sizeOf(estimate: number | null | undefined, ratio?: number | null): Size {
  const m = taskMinutes(estimate, ratio);
  return m > 90 ? 'grande' : m >= 30 ? 'mediana' : 'pequena';
}

/** La regla 1-3-5 para un día: cuántas de cada tamaño y el aviso si se pasa (null si cabe). */
export function check135(tasks: { estimate_min?: number | null }[], ratio?: number | null): { counts: Record<Size, number>; text: string | null } {
  const counts: Record<Size, number> = { grande: 0, mediana: 0, pequena: 0 };
  tasks.forEach((t) => { counts[sizeOf(t.estimate_min, ratio)]++; });
  const over = counts.grande > 1 || counts.mediana > 3 || counts.pequena > 5;
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const text = over
    ? t('Hoy hay {grande}, {mediana} y {pequena}. Un día realista tiene 1 grande, 3 medianas y 5 pequeñas: ¿pasas algo a mañana?', { grande: part(counts.grande, 'grande', 'grandes'), mediana: part(counts.mediana, 'mediana', 'medianas'), pequena: part(counts.pequena, t('pequeña'), t('pequeñas')) })
    : null;
  return { counts, text };
}

/**
 * Candidatas para la lista de mañana: lo pendiente (sin la bandeja), primero
 * lo importante y luego lo que vence antes. Lo que ya estaba en la lista de
 * mañana va primero, en su orden.
 */
export function ivyCandidates<X extends T>(tasks: X[], tomorrowISO: string, max = 12): X[] {
  const pend = tasks.filter((t) => t.status !== 'done' && !t.inbox && !t.parent_id);
  const already = pend.filter((t) => t.plan_day === tomorrowISO && t.plan_order).sort((a, b) => (a.plan_order ?? 0) - (b.plan_order ?? 0));
  const rest = pend.filter((t) => !already.includes(t))
    .sort((a, b) => (a.important ? 0 : 1) - (b.important ? 0 : 1) || String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')));
  return [...already, ...rest].slice(0, Math.max(max, already.length));
}

/** Tocar una candidata: entra al final de la lista (hasta 6) o sale si ya estaba. */
export function togglePick(list: string[], id: string, max = IVY_MAX): { list: string[]; full: boolean } {
  if (list.includes(id)) return { list: list.filter((x) => x !== id), full: false };
  if (list.length >= max) return { list, full: true };
  return { list: [...list, id], full: false };
}
