// ============================================================
//  "¿Cuándo lo haces?" (v20, sección E). Puro, con pruebas.
//  Busca huecos libres de 50 min entre 7:00 y 21:00, fuera de clases y de
//  otros planes, prefiriendo las horas en que sueles enfocarte.
// ============================================================

export const PLAN_MIN = 50;
export const DEFAULT_PLACES = ['Casa', 'Biblioteca', 'Universidad'];
const DAY_START = 7 * 60;
const DAY_END = 21 * 60;
// Si no hay costumbre, estas horas primero (tarde, media mañana...).
const FALLBACK_HOURS = [16, 10, 14, 18, 9, 11, 15, 17, 19, 8, 12, 13, 20, 7];
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export type Range = { start: number; end: number };   // minutos del día
export type Busy = { start: number; end: number };    // milisegundos

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function dayDiff(a: Date, b: Date): number { return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000); }

/** Horas (0 a 23) en que sueles empezar a enfocarte, de la más frecuente a la menos. */
export function habitHours(sessions: { created_at: string; minutes: number }[], minCount = 2): number[] {
  const n = new Map<number, number>();
  for (const s of sessions) {
    const end = new Date(s.created_at).getTime();
    if (!Number.isFinite(end)) continue;
    const h = new Date(end - Math.max(0, s.minutes || 0) * 60_000).getHours();
    n.set(h, (n.get(h) ?? 0) + 1);
  }
  return [...n.entries()].filter(([, c]) => c >= minCount).sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([h]) => h);
}

/** ¿Vale la pena preguntar cuándo? Solo si vence mañana o después. */
export function needsPlan(dueISO: string | null | undefined, now: Date): boolean {
  if (!dueISO) return false;
  const [y, m, d] = dueISO.split('-').map(Number);
  return dayDiff(new Date(y, m - 1, d), now) >= 1;
}

export function freeSlots(o: {
  now: Date;
  /** Fecha de entrega (si hay). */
  due?: Date | null;
  /** La entrega tiene hora: el plan debe terminar 1 h antes. Sin hora: hasta el día anterior. */
  dueHasTime?: boolean;
  classesFor?: (day: Date) => Range[];
  busy?: Busy[];
  habit?: number[];
  count?: number;
  duration?: number;
  days?: number;
}): Date[] {
  const count = o.count ?? 3;
  const dur = o.duration ?? PLAN_MIN;
  const today = startOfDay(o.now);
  let last = addDays(today, (o.days ?? 7) - 1);
  if (o.due) {
    const dd = startOfDay(o.due);
    const lim = o.dueHasTime ? dd : addDays(dd, -1);
    if (lim < last) last = lim;
  }
  const earliest = o.now.getTime() + 15 * 60_000;
  const dueLimit = o.due && o.dueHasTime ? o.due.getTime() - 60 * 60_000 : Infinity;
  const habit = o.habit ?? [];
  const score = (min: number) => {
    const h = Math.floor(min / 60);
    const hi = habit.indexOf(h);
    const base = hi >= 0 ? hi : 100 + (FALLBACK_HOURS.indexOf(h) >= 0 ? FALLBACK_HOURS.indexOf(h) : 50);
    return base + (min % 60 ? 0.5 : 0);
  };

  const perDay: { at: Date; s: number }[][] = [];
  for (let day = today; day <= last; day = addDays(day, 1)) {
    const classes = o.classesFor?.(day) ?? [];
    const opts: { at: Date; s: number }[] = [];
    for (let m = DAY_START; m + dur <= DAY_END; m += 30) {
      const at = new Date(day); at.setHours(0, m, 0, 0);
      const t0 = at.getTime(), t1 = t0 + dur * 60_000;
      if (t0 < earliest || t1 > dueLimit) continue;
      if (classes.some((c) => m < c.end && m + dur > c.start)) continue;
      if ((o.busy ?? []).some((b) => t0 < b.end && t1 > b.start)) continue;
      opts.push({ at, s: score(m) });
    }
    opts.sort((a, b) => a.s - b.s || a.at.getTime() - b.at.getTime());
    if (opts.length) perDay.push(opts);
  }
  // Uno por día (el mejor), y si faltan, otros horarios de los mismos días (2 h aparte).
  const out: Date[] = perDay.slice(0, count).map((d) => d[0].at);
  for (const d of perDay) {
    if (out.length >= count) break;
    for (const c of d.slice(1)) {
      if (out.length >= count) break;
      if (out.every((x) => Math.abs(x.getTime() - c.at.getTime()) >= 2 * 3600_000)) out.push(c.at);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

export function timeLabel(d: Date): string {
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

/** "Hoy 4:00 pm", "Mañana 10:00 am", "Jue 2:00 pm" o "Jue 23 2:00 pm" si es más lejos. */
export function slotLabel(at: Date, now: Date): string {
  const dd = dayDiff(at, now);
  const day = dd === 0 ? 'Hoy' : dd === 1 ? 'Mañana' : dd < 7 ? DAY_SHORT[at.getDay()] : `${DAY_SHORT[at.getDay()]} ${at.getDate()}`;
  return `${day} ${timeLabel(at)}`;
}

/** "en casa", "en la biblioteca", "en la universidad" o "en <lugar>". */
export function placePhrase(place: string | null | undefined): string {
  const p = (place ?? '').trim();
  if (!p) return '';
  const low = p.toLowerCase();
  if (low === 'casa') return 'en casa';
  if (['biblioteca', 'universidad', 'oficina', 'cafetería', 'sala de estudio'].includes(low)) return `en la ${low}`;
  return `en ${p}`;
}

/** "Si son las 4:00 pm del jueves, empiezo "Informe" en la biblioteca." */
export function planPhrase(title: string, at: Date, place: string | null | undefined, now: Date): string {
  const dd = dayDiff(at, now);
  const when = dd === 0 ? 'de hoy' : dd === 1 ? 'de mañana' : `del ${DAY_NAMES[at.getDay()]}`;
  const one = (at.getHours() % 12 || 12) === 1;
  const where = placePhrase(place);
  const t = title.trim() || 'la tarea';
  return `${one ? 'Si es la' : 'Si son las'} ${timeLabel(at)} ${when}, empiezo "${t}"${where ? ' ' + where : ''}.`;
}

/** Plan que pasó hace 30 min o más (y menos de 24 h) sin que arrancara. */
export function isStalled(planAt: string | null | undefined, now: Date, started: boolean): boolean {
  if (!planAt || started) return false;
  const t = new Date(planAt).getTime();
  const ago = now.getTime() - t;
  return ago >= 30 * 60_000 && ago <= 24 * 3600_000;
}

/** Lugares guardados: los de siempre primero y luego los tuyos, sin repetir (máximo 8). */
export function mergePlaces(saved: unknown): string[] {
  const out: string[] = [];
  const add = (p: unknown) => {
    const v = String(p ?? '').trim().slice(0, 40);
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  };
  DEFAULT_PLACES.forEach(add);
  if (Array.isArray(saved)) saved.forEach(add);
  return out.slice(0, 8);
}
