import { monthsLong } from './i18n';
// ============================================================
//  Calendario del proyecto (v23, fase 3). Puro, con pruebas:
//  el mes, la línea de tiempo con inicio y entrega de cada tarea, los cruces
//  por persona y el camino a la entrega final.
// ============================================================

export type CalTask = {
  id: string; title: string; status: string; done: boolean; assignee_id: string | null;
  due_date: string | null; due_at?: string | null; start_at?: string | null;
};

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysBetween = (a: Date, b: Date) => Math.round((startOf(b).getTime() - startOf(a).getTime()) / DAY);

/** Día de entrega (local) de una tarea, o null. */
export function dueDayOf(t: CalTask): Date | null {
  if (t.due_at) { const d = new Date(t.due_at); if (!isNaN(d.getTime())) return startOf(d); }
  return t.due_date ? fromIso(t.due_date) : null;
}
/** Inicio y fin (días locales). Sin inicio, la tarea ocupa solo su día de entrega. */
export function spanOf(t: CalTask): { start: Date; end: Date } | null {
  const end = dueDayOf(t);
  const s = t.start_at ? new Date(t.start_at) : null;
  const start = s && !isNaN(s.getTime()) ? startOf(s) : null;
  if (!end && !start) return null;
  if (!end) return { start: start!, end: start! };
  if (!start || start > end) return { start: end, end };
  return { start, end };
}

/** Las 6 semanas del mes (lunes a domingo) para la cuadrícula. */
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}

/** Tareas por día de entrega (clave "2026-11-20"). */
export function byDueDay(tasks: CalTask[]): Record<string, CalTask[]> {
  const out: Record<string, CalTask[]> = {};
  for (const t of tasks) { const d = dueDayOf(t); if (d) (out[isoDay(d)] ??= []).push(t); }
  for (const k of Object.keys(out)) out[k].sort((a, b) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title));
  return out;
}

/** Rango de la línea de tiempo: de lo primero a lo último, con margen, sin pasarse de `maxDays`. */
export function timelineRange(tasks: CalTask[], today: Date, maxDays = 120): { from: Date; to: Date; days: number } {
  const spans = tasks.map(spanOf).filter(Boolean) as { start: Date; end: Date }[];
  let from = addDays(startOf(today), -3), to = addDays(startOf(today), 14);
  for (const s of spans) { if (s.start < from) from = s.start; if (s.end > to) to = s.end; }
  from = addDays(from, -1); to = addDays(to, 2);
  if (daysBetween(from, to) > maxDays) {
    // Se recorta alrededor de hoy: 30 días antes y el resto hacia adelante.
    const f2 = addDays(startOf(today), -30);
    from = f2 > from ? f2 : from;
    to = addDays(from, maxDays);
  }
  return { from, to, days: daysBetween(from, to) + 1 };
}

/** Posición de una tarea en la línea de tiempo (en días desde `from`), recortada al rango. */
export function barOf(t: CalTask, from: Date, days: number): { left: number; width: number; clippedStart: boolean; clippedEnd: boolean } | null {
  const s = spanOf(t);
  if (!s) return null;
  const a = daysBetween(from, s.start), b = daysBetween(from, s.end);
  if (b < 0 || a > days - 1) return null;
  const left = Math.max(0, a), right = Math.min(days - 1, b);
  return { left, width: right - left + 1, clippedStart: a < 0, clippedEnd: b > days - 1 };
}

export type Clash = { user_id: string; from: Date; to: Date; count: number; titles: string[] };
/**
 * Cruces: días en que una persona tiene `min` o más tareas pendientes al
 * mismo tiempo (entre su inicio y su entrega). Se juntan los días seguidos.
 */
export function clashes(tasks: CalTask[], min = 3, today?: Date): Clash[] {
  const per: Record<string, { day: string; ids: Set<string> }[]> = {};
  const map: Record<string, Record<string, Set<string>>> = {};
  const t0 = today ? startOf(today) : null;
  for (const t of tasks) {
    if (t.done || !t.assignee_id) continue;
    const s = spanOf(t); if (!s) continue;
    for (let d = s.start; d <= s.end; d = addDays(d, 1)) {
      if (t0 && d < t0) continue;
      ((map[t.assignee_id] ??= {})[isoDay(d)] ??= new Set()).add(t.id);
    }
  }
  const out: Clash[] = [];
  const title = Object.fromEntries(tasks.map((t) => [t.id, t.title]));
  for (const [user, days] of Object.entries(map)) {
    per[user] = Object.entries(days).filter(([, ids]) => ids.size >= min).map(([day, ids]) => ({ day, ids })).sort((a, b) => a.day.localeCompare(b.day));
    let cur: Clash | null = null;
    for (const { day, ids } of per[user]) {
      const d = fromIso(day);
      if (cur && daysBetween(cur.to, d) === 1) {
        cur.to = d; cur.count = Math.max(cur.count, ids.size);
        ids.forEach((id) => { if (!cur!.titles.includes(title[id])) cur!.titles.push(title[id]); });
      } else {
        if (cur) out.push(cur);
        cur = { user_id: user, from: d, to: d, count: ids.size, titles: [...ids].map((id) => title[id]) };
      }
    }
    if (cur) out.push(cur);
  }
  return out.sort((a, b) => a.from.getTime() - b.from.getTime());
}

export type Road = {
  final: CalTask | null; daysLeft: number | null; total: number; done: number;
  late: number; thisWeek: number; undated: number; pace: 'ok' | 'tight' | 'late' | 'none';
};
/**
 * Camino a la entrega final: la tarea con la entrega más tarde (la que se
 * marque como final, si hay), cuántos días faltan y cómo va el resto.
 * "Apretado" si lo pendiente no cabe a una tarea cada dos días hábiles.
 */
export function roadToFinal(tasks: CalTask[], today: Date, finalId?: string | null): Road {
  const t0 = startOf(today);
  const dated = tasks.filter((t) => dueDayOf(t));
  const final = (finalId && tasks.find((t) => t.id === finalId)) || dated.reduce<CalTask | null>((m, t) => (!m || dueDayOf(t)! > dueDayOf(m)! ? t : m), null);
  const pending = tasks.filter((t) => !t.done);
  const late = pending.filter((t) => { const d = dueDayOf(t); return !!d && d < t0; }).length;
  const thisWeek = pending.filter((t) => { const d = dueDayOf(t); return !!d && d >= t0 && daysBetween(t0, d) <= 7; }).length;
  const fd = final ? dueDayOf(final) : null;
  const daysLeft = fd ? daysBetween(t0, fd) : null;
  let pace: Road['pace'] = 'none';
  if (daysLeft != null) {
    if (daysLeft < 0 && final && !final.done) pace = 'late';
    else if (late > 0) pace = 'late';
    else { const work = Math.max(1, Math.round(daysLeft * 5 / 7)); pace = pending.length * 2 > work ? 'tight' : 'ok'; }
  }
  return { final, daysLeft, total: tasks.length, done: tasks.length - pending.length, late, thisWeek, undated: tasks.filter((t) => !dueDayOf(t)).length, pace };
}

const MONTHS = monthsLong();
export const monthLabel = (y: number, m: number) => `${MONTHS[m][0].toUpperCase()}${MONTHS[m].slice(1)} ${y}`;
export const shortDay = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
