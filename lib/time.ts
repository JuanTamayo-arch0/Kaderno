// ============================================================
//  Fechas y horas de las tareas personales.
//  Una tarea puede tener solo fecha (due_date) o fecha con hora (due_at,
//  desde schema_v14). Todo lo que agrupa, ordena o muestra fechas pasa por
//  aquí para que Hoy, Materias, la agenda y los avisos digan lo mismo.
// ============================================================

export type DueLike = { due_date?: string | null; due_at?: string | null };

export const DAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const DAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MONTH_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

/** Día de entrega (local) de la tarea, o null. */
export function dueDay(t: DueLike): Date | null {
  if (t.due_at) return startOfDay(new Date(t.due_at));
  if (t.due_date) return fromISODate(t.due_date);
  return null;
}
/** Momento exacto en que vence: la hora si la tiene, si no las 11:59 pm. */
export function dueMoment(t: DueLike): Date | null {
  if (t.due_at) return new Date(t.due_at);
  if (t.due_date) { const d = fromISODate(t.due_date); d.setHours(23, 59, 0, 0); return d; }
  return null;
}
export function hasTime(t: DueLike): boolean { return !!t.due_at; }
/** "HH:MM" local de la tarea, o null. */
export function dueTimeHHMM(t: DueLike): string | null {
  if (!t.due_at) return null;
  const d = new Date(t.due_at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** Junta fecha "YYYY-MM-DD" y hora "HH:MM" en un ISO con zona. */
export function combine(dateISO: string, hhmm: string): string {
  const d = fromISODate(dateISO);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

export function fmtTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h < 12 ? 'am' : 'pm';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
export function fmtHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return fmtTime(d);
}

/** Fecha corta y amable: "Hoy", "Mañana", "Ayer", "vie 16", "25 oct". */
export function fmtDay(d: Date, now = new Date()): string {
  const diff = dayDiff(d, now);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff > 1 && diff < 7) return `${DAY_SHORT[d.getDay()]} ${d.getDate()}`;
  if (diff < 0 && diff > -7) return `Hace ${-diff} días`;
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}
/** "Hoy, 10:00 am", "Mañana", "vie 16, 6:00 pm"... o "" si no tiene fecha. */
export function fmtDue(t: DueLike, now = new Date()): string {
  const day = dueDay(t);
  if (!day) return '';
  const base = fmtDay(day, now);
  return t.due_at ? `${base}, ${fmtTime(new Date(t.due_at))}` : base;
}
/** "jueves 15 de octubre" */
export function fmtLongDate(d: Date): string {
  return `${DAY_LONG[d.getDay()]} ${d.getDate()} de ${MONTH_LONG[d.getMonth()]}`;
}
export function capitalize(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export function isOverdue(t: DueLike & { status?: string | null }, now = new Date()): boolean {
  if (t.status === 'done') return false;
  const m = dueMoment(t);
  return !!m && m.getTime() < now.getTime();
}

export type Bucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'nextweek' | 'later' | 'none';
export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: 'Vencidas', today: 'Hoy', tomorrow: 'Mañana', week: 'Esta semana',
  nextweek: 'Próxima semana', later: 'Más adelante', none: 'Sin fecha',
};
export const BUCKET_ORDER: Bucket[] = ['overdue', 'today', 'tomorrow', 'week', 'nextweek', 'later', 'none'];

export function bucketOf(t: DueLike & { status?: string | null }, now = new Date()): Bucket {
  const day = dueDay(t);
  if (!day) return 'none';
  if (isOverdue(t, now)) return 'overdue';
  const diff = dayDiff(day, now);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  // Semana de lunes a domingo
  const dow = (now.getDay() + 6) % 7; // 0 = lunes
  const daysLeftThisWeek = 6 - dow;
  if (diff <= daysLeftThisWeek) return 'week';
  if (diff <= daysLeftThisWeek + 7) return 'nextweek';
  return 'later';
}

/** Orden natural: primero lo que vence antes; sin fecha al final. */
export function compareDue(a: DueLike, b: DueLike): number {
  const ma = dueMoment(a), mb = dueMoment(b);
  if (!ma && !mb) return 0;
  if (!ma) return 1;
  if (!mb) return -1;
  return ma.getTime() - mb.getTime();
}

/** Lunes de la semana de `d`. */
export function weekStart(d: Date): Date { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
