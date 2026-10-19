// ============================================================
//  Días de estudio y rachas amables (v20, sección D). Puro, con pruebas.
//  Las reglas son las mismas que usa la base (schema_v19.sql, fase 2):
//  la base escribe (escudos, reparar); esto solo calcula lo que se ve.
// ============================================================

export type StudyDayRow = { day: string; focus_min: number; tasks_done: number; cards: number; tests: number; protected: boolean };

/** Un día cuenta con cualquiera de estas cosas. */
export const DAY_RULE = { focus: 10, tasks: 1, cards: 10, tests: 1 };
/** Reparar la racha: hacer hoy el doble. */
export const REPAIR_RULE = { focus: 50, cards: 30 };
export const MAX_SHIELDS = 2;
export const SHIELD_PRICE = 80;
export const SHIELD_EVERY = 7;
export const DEFAULT_GOAL = 4;
export const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function dayCounts(r: Pick<StudyDayRow, 'focus_min' | 'tasks_done' | 'cards' | 'tests'> | null | undefined): boolean {
  if (!r) return false;
  return (r.focus_min ?? 0) >= DAY_RULE.focus || (r.tasks_done ?? 0) >= DAY_RULE.tasks
    || (r.cards ?? 0) >= DAY_RULE.cards || (r.tests ?? 0) >= DAY_RULE.tests;
}

export function cleanGoal(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(2, Math.min(7, v)) : DEFAULT_GOAL;
}

/** Suma n días a una fecha 'YYYY-MM-DD' (sin zonas horarias de por medio). */
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
/** Lunes de la semana de esa fecha. */
export function weekStartISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lunes
  return addDaysISO(iso, -dow);
}

export type DotState = 'done' | 'protected' | 'missed' | 'today' | 'future';
export type StreakSummary = {
  daily: number;            // días seguidos (con escudos)
  weekly: number;           // semanas seguidas cumpliendo la meta
  goal: number;
  shields: number;
  weekDone: number;         // días que cuentan esta semana
  week: { day: string; letter: string; state: DotState }[];
  today: { focus: number; tasks: number; cards: number; tests: number; ok: boolean };
  /** El escudo tapará el hueco cuando hoy cuente. */
  shieldWillCover: number;
  /** Se puede reparar haciendo hoy el doble. */
  repair: null | { missed: number; prev: number; focus: number; cards: number };
};

export function summarize(rows: StudyDayRow[], today: string, goalIn: number = DEFAULT_GOAL, shields = 0): StreakSummary {
  const goal = cleanGoal(goalIn);
  const by = new Map(rows.map((r) => [r.day, r]));
  const ok = (iso: string) => { const r = by.get(iso); return !!r && (r.protected || dayCounts(r)); };
  const streakAt = (iso: string) => { let n = 0; while (n < 1000 && ok(addDaysISO(iso, -n))) n++; return n; };

  const t = by.get(today);
  const todayOk = dayCounts(t);
  const daily = streakAt(todayOk || t?.protected ? today : addDaysISO(today, -1));

  let weekly = 0;
  let wk = weekStartISO(today);
  for (let i = 0; i <= 104; i++) {
    let n = 0;
    for (let k = 0; k < 7; k++) if (ok(addDaysISO(wk, k))) n++;
    if (n >= goal) weekly++;
    else if (i > 0) break;
    wk = addDaysISO(wk, -7);
  }

  const start = weekStartISO(today);
  const week = WEEK_LETTERS.map((letter, k) => {
    const day = addDaysISO(start, k);
    const r = by.get(day);
    let state: DotState;
    if (day > today) state = 'future';
    else if (r && dayCounts(r)) state = 'done';
    else if (r?.protected) state = 'protected';
    else if (day === today) state = 'today';
    else state = 'missed';
    return { day, letter, state };
  });
  const weekDone = week.filter((w) => w.state === 'done' || w.state === 'protected').length;

  // Hueco justo antes de hoy (hasta 3 días) y la racha que había antes.
  let gap = 0;
  while (gap < 3 && !ok(addDaysISO(today, -gap - 1))) gap++;
  const prev = gap >= 1 && gap <= 2 ? streakAt(addDaysISO(today, -gap - 1)) : 0;
  let shieldWillCover = 0;
  let repair: StreakSummary['repair'] = null;
  if (prev > 0) {
    if (!todayOk && shields >= gap) shieldWillCover = gap;
    else repair = { missed: gap, prev, focus: t?.focus_min ?? 0, cards: t?.cards ?? 0 };
  }

  return {
    daily, weekly, goal, shields: Math.max(0, Math.min(MAX_SHIELDS, shields)), weekDone, week,
    today: { focus: t?.focus_min ?? 0, tasks: t?.tasks_done ?? 0, cards: t?.cards ?? 0, tests: t?.tests ?? 0, ok: todayOk },
    shieldWillCover, repair,
  };
}

/** Qué falta para que hoy cuente, en una frase corta. */
export function todayHint(s: StreakSummary): string {
  if (s.today.ok) return 'Hoy ya cuenta.';
  const mins = Math.max(1, DAY_RULE.focus - s.today.focus);
  const cards = Math.max(1, DAY_RULE.cards - s.today.cards);
  return `Para que hoy cuente: ${mins} min de enfoque, 1 tarea o ${cards} ${cards === 1 ? 'tarjeta' : 'tarjetas'}.`;
}

/** Mensaje sin culpa cuando se rompe la racha. */
export function brokeMessage(s: StreakSummary): string | null {
  if (!s.repair) return null;
  if (s.repair.missed === 1) return 'Te saltaste un día: no pasa nada. Lo importante es no saltarse dos.';
  return `Te saltaste dos días. Si hoy haces el doble, recuperas tu racha de ${s.repair.prev} ${s.repair.prev === 1 ? 'día' : 'días'}.`;
}

/** Avance para reparar (0 a 1) y texto. */
export function repairProgress(s: StreakSummary): { frac: number; text: string } | null {
  if (!s.repair) return null;
  const f = s.repair.focus / REPAIR_RULE.focus;
  const c = s.repair.cards / REPAIR_RULE.cards;
  const frac = Math.min(1, Math.max(f, c));
  const leftF = Math.max(0, REPAIR_RULE.focus - s.repair.focus);
  const leftC = Math.max(0, REPAIR_RULE.cards - s.repair.cards);
  return { frac, text: frac >= 1 ? 'Listo: racha reparada.' : `Te faltan ${leftF} min de enfoque o ${leftC} tarjetas.` };
}

export function weeksLabel(n: number): string { return `${n} ${n === 1 ? 'semana' : 'semanas'}`; }
export function daysLabel(n: number): string { return `${n} ${n === 1 ? 'día' : 'días'}`; }
