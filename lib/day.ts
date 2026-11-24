// ============================================================
//  Organizar el día (v21, secciones 2 a 5). Puro, con pruebas.
//  Línea de tiempo (acomodo de bloques, horas libres, sobrecarga),
//  franjas, cierre del día, cuenta regresiva y bandeja.
// ============================================================
import { isMeaningful } from './estimate';
import { t, trn } from './i18n';

export type Block = { id: string; start: number; end: number };   // minutos del día
export type Placed = Block & { lane: number; lanes: number };

export const DAY_START = 6 * 60;
export const DAY_END = 23 * 60;
export const DEFAULT_MIN = 30;
export type Band = 'manana' | 'tarde' | 'noche';
export const BANDS: Record<Band, { label: string; start: number; end: number }> = {
  manana: { label: t('Mañana'), start: 6 * 60, end: 12 * 60 },
  tarde: { label: t('Tarde'), start: 12 * 60, end: 18 * 60 },
  noche: { label: t('Noche'), start: 18 * 60, end: 23 * 60 },
};

/** Bloques que se cruzan quedan lado a lado (carriles), como en un calendario. */
export function layoutBlocks<T extends Block>(blocks: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & { lane: number; lanes: number })[] = [];
  let group: (T & { lane: number; lanes: number })[] = [];
  let groupEnd = -1;
  const flush = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); group.forEach((g) => { g.lanes = n; }); out.push(...group); group = []; };
  for (const b of sorted) {
    if (group.length && b.start >= groupEnd) { flush(); groupEnd = -1; }
    const used = new Set(group.filter((g) => g.end > b.start).map((g) => g.lane));
    let lane = 0; while (used.has(lane)) lane++;
    group.push({ ...b, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, b.end);
  }
  if (group.length) flush();
  return out;
}

/** Minutos libres desde ahora hasta el final del día, fuera de lo ocupado. */
export function freeMinutes(nowMin: number, busy: { start: number; end: number }[], dayEnd = DAY_END): number {
  const from = Math.max(nowMin, DAY_START);
  if (from >= dayEnd) return 0;
  const parts = busy.map((b) => ({ start: Math.max(b.start, from), end: Math.min(b.end, dayEnd) })).filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  let taken = 0, cur = from;
  for (const p of parts) { const s = Math.max(p.start, cur); if (p.end > s) { taken += p.end - s; cur = p.end; } }
  return dayEnd - from - taken;
}

/** Duración de una tarea para planear: el estimado (corregido con "tu tiempo real") o 30 min. */
export function taskMinutes(estimate: number | null | undefined, ratio?: number | null): number {
  const base = estimate && estimate > 0 ? estimate : DEFAULT_MIN;
  return Math.round(isMeaningful(ratio) ? base * ratio : base);
}

export function fmtHours(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r}` : `${h} h`;
}

/** "Planeaste 7 h y te quedan 4 h libres hoy" (null si cabe). */
export function overloadText(plannedMin: number, freeMin: number): string | null {
  if (plannedMin <= freeMin || plannedMin < 60) return null;
  return t('Planeaste {plannedMin} y te quedan {freeMin} libres hoy.', { plannedMin: fmtHours(plannedMin), freeMin: fmtHours(freeMin) });
}

/** Minuto del día bajo una posición vertical, redondeado a 15. */
export function minuteAt(y: number, hourPx: number, startMin = DAY_START, snap = 15): number {
  const raw = startMin + (y / hourPx) * 60;
  return Math.max(startMin, Math.min(DAY_END - snap, Math.round(raw / snap) * snap));
}

export function bandOf(min: number): Band {
  return min < BANDS.tarde.start ? 'manana' : min < BANDS.noche.start ? 'tarde' : 'noche';
}

type T = { id: string; title?: string; status?: string | null; due_date?: string | null; plan_at?: string | null; plan_day?: string | null; plan_band?: string | null; estimate_min?: number | null; type?: string | null; inbox?: boolean | null; parent_id?: string | null };

export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const planDay = (t: T) => (t.plan_at ? localISO(new Date(t.plan_at)) : t.plan_day ?? null);

/** Lo de hoy: con hora (bloques), en franja, y lo pendiente sin hora (vence hoy o vencido). */
export function dayParts<X extends T>(tasks: X[], dayISO: string, todayISO: string): { timed: X[]; banded: Record<Band, X[]>; loose: X[] } {
  const timed: X[] = [], loose: X[] = [];
  const banded: Record<Band, X[]> = { manana: [], tarde: [], noche: [] };
  for (const t of tasks) {
    if (t.status === 'done' || t.inbox) continue;
    if (t.plan_at && planDay(t) === dayISO) { timed.push(t); continue; }
    if (!t.plan_at && t.plan_day === dayISO && t.plan_band && t.plan_band in banded) { banded[t.plan_band as Band].push(t); continue; }
    // Planeada para este día sin hora ni franja (pasar a mañana, la lista de Ivy Lee): va sin hora.
    // Antes se saltaba y la tarea no aparecía en ninguna parte de Mi día.
    if (!t.plan_at && t.plan_day === dayISO) { loose.push(t); continue; }
    if (planDay(t)) continue; // planeada otro día
    if (t.due_date && (t.due_date === dayISO || (dayISO === todayISO && t.due_date < todayISO))) loose.push(t);
  }
  return { timed, banded, loose };
}

/** Minutos planeados hoy (con hora, en franja o que vencen hoy). */
export function plannedMinutes(tasks: T[], dayISO: string, todayISO: string, ratio?: number | null): number {
  const p = dayParts(tasks, dayISO, todayISO);
  return [...p.timed, ...p.banded.manana, ...p.banded.tarde, ...p.banded.noche, ...p.loose].reduce((a, t) => a + taskMinutes(t.estimate_min, ratio), 0);
}

/** Qué mover a mañana si no cabe: lo que vence más lejos primero (nunca lo que vence hoy). */
export function moveCandidates<X extends T>(tasks: X[], dayISO: string, todayISO: string): X[] {
  const p = dayParts(tasks, dayISO, todayISO);
  return [...p.timed, ...p.banded.manana, ...p.banded.tarde, ...p.banded.noche]
    .filter((t) => !t.due_date || t.due_date > dayISO)
    .sort((a, b) => String(b.due_date ?? '9999').localeCompare(String(a.due_date ?? '9999')));
}

// ---------- Cierre del día ----------
export function shouldOfferClose(now: Date, reviewed: boolean, hour = 18): boolean {
  return !reviewed && now.getHours() >= hour;
}

/** Lo que quedó de hoy: vencía hoy (o antes) o estaba planeado para hoy. */
export function leftovers<X extends T>(tasks: X[], todayISO: string): X[] {
  return tasks.filter((t) => t.status !== 'done' && !t.inbox && ((t.due_date && t.due_date <= todayISO) || planDay(t) === todayISO));
}

/** "Mi día" se reinicia: lo planeado ayer que no se hizo ni se movió (y no está vencido) vuelve como sugerencia. */
export function carryOver<X extends T>(tasks: X[], todayISO: string, yesterdayISO: string): X[] {
  return tasks.filter((t) => t.status !== 'done' && !t.inbox && planDay(t) === yesterdayISO && (!t.due_date || t.due_date >= todayISO));
}

// ---------- Cuenta regresiva ----------
export type Countdown = { id: string; title: string; days: number; label: string; tone: 'bad' | 'warn' | 'muted' };
export function examCountdown(tasks: (T & { title: string })[], todayISO: string, horizon = 30): Countdown[] {
  const day = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return tasks.filter((t) => t.status !== 'done' && ['examen', 'quiz'].includes(String(t.type)) && t.due_date && t.due_date >= todayISO)
    .map((t) => { const days = Math.round((day(t.due_date!) - day(todayISO)) / 86_400_000); return { id: t.id, title: t.title, days, label: days === 0 ? trn('hoy') : days === 1 ? trn('mañana') : trn('{days} días', { days }), tone: (days <= 2 ? 'bad' : days <= 7 ? 'warn' : 'muted') as Countdown['tone'] }; })
    .filter((c) => c.days <= horizon)
    .sort((a, b) => a.days - b.days);
}

// ---------- Bandeja ----------
/** Lo capturado sin fecha ni materia va a la bandeja. */
export function goesToInbox(p: { dueDate: string | null; subjectId: string | null }): boolean {
  return !p.dueDate && !p.subjectId;
}

// ---------- Sugerir horario (v25, fase 6) ----------
export type Suggested = { id: string; start: number; end: number };

/** Huecos libres entre "from" y "to", fuera de lo ocupado (minutos del día). */
export function freeGaps(from: number, to: number, busy: { start: number; end: number }[]): { start: number; end: number }[] {
  const parts = busy.map((b) => ({ start: Math.max(b.start, from), end: Math.min(b.end, to) })).filter((b) => b.end > b.start).sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  let cur = from;
  for (const p of parts) { if (p.start > cur) out.push({ start: cur, end: p.start }); cur = Math.max(cur, p.end); }
  if (to > cur) out.push({ start: cur, end: to });
  return out;
}

/**
 * Acomoda lo pendiente sin hora en los huecos del día: primero lo vencido y
 * lo que vence antes, luego lo urgente; cada tarea en el primer hueco donde
 * cabe, empezando en un cuarto de hora y con 5 minutos de aire entre una y
 * otra. Lo que no cabe queda en "left" (no se parte en pedazos).
 */
export function suggestSchedule<X extends { id: string; due_date?: string | null; priority?: string | null; type?: string | null }>(
  tasks: X[], minutesOf: (t: X) => number, busy: { start: number; end: number }[],
  o: { from: number; to: number; snap?: number; gap?: number },
): { placed: Suggested[]; left: string[] } {
  const snap = o.snap ?? 15, gap = o.gap ?? 5;
  const start0 = Math.ceil(Math.max(o.from, DAY_START) / snap) * snap;
  const rank = (t: X) => (t.priority === 'urgente' ? 0 : t.priority === 'alta' ? 1 : ['examen', 'quiz', 'entrega'].includes(String(t.type)) ? 1 : 2);
  const order = [...tasks].sort((a, b) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')) || rank(a) - rank(b) || minutesOf(b) - minutesOf(a));
  let gaps = freeGaps(start0, o.to, busy);
  const placed: Suggested[] = [], left: string[] = [];
  for (const t of order) {
    const len = Math.max(5, Math.round(minutesOf(t)));
    let done = false;
    for (let i = 0; i < gaps.length && !done; i++) {
      const g = gaps[i];
      const s = Math.ceil(g.start / snap) * snap;
      if (s + len > g.end) continue;
      placed.push({ id: t.id, start: s, end: s + len });
      const rest = { start: s + len + gap, end: g.end };
      gaps = [...gaps.slice(0, i), ...(s > g.start ? [{ start: g.start, end: s }] : []), ...(rest.end > rest.start ? [rest] : []), ...gaps.slice(i + 1)];
      done = true;
    }
    if (!done) left.push(t.id);
  }
  placed.sort((a, b) => a.start - b.start);
  return { placed, left };
}

export const clockLabel = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

/** Cierre del día en modo Trabajo: el recordatorio de anotar horas (null si no hace falta). */
export function hoursNudge(loggedMin: number, doneTasks: number): string | null {
  if (loggedMin >= 6 * 60) return null;
  if (loggedMin === 0) return doneTasks ? t('Terminaste {doneTasks} {v} y no hay horas registradas hoy. ¿Las anotas?', { doneTasks, v: doneTasks === 1 ? t('tarea') : t('tareas') }) : t('No hay horas registradas hoy. Si trabajaste fuera de Kaderno, anótalas.');
  return t('Llevas {loggedMin} registradas hoy. ¿Falta anotar alguna reunión o llamada?', { loggedMin: fmtHours(loggedMin) });
}
