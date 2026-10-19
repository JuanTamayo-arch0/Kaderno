// ============================================================
//  Repaso espaciado con FSRS (ts-fsrs 5.4.2). Puro, con pruebas.
//
//  Estados: 0 nueva, 1 aprendiendo, 2 repaso, 3 reaprendiendo.
//  Botones: 1 Otra vez, 2 Difícil, 3 Bien, 4 Fácil.
//  Pasos cortos de aprendizaje: 1 min y 10 min (los de FSRS).
//  Reemplaza a lib/srs.ts (SM-2), que queda para la base sin schema_v19.
// ============================================================
import { fsrs, createEmptyCard, Rating, State, type Card, type Grade } from 'ts-fsrs';

export type FsrsState = 0 | 1 | 2 | 3;
export type CardRating = 1 | 2 | 3 | 4;

/** Lo que guarda la base de cada tarjeta (todo opcional: tarjetas viejas). */
export type FsrsRow = {
  fsrs_state?: number | null;
  stability?: number | null;
  difficulty?: number | null;
  due_at?: string | null;
  due_date?: string | null;
  reps?: number | null;
  lapses?: number | null;
  last_reviewed_at?: string | null;
  learning_steps?: number | null;
  scheduled_days?: number | null;
  interval_days?: number | null;
  ease?: number | null;
};

export type FsrsPatch = {
  fsrs_state: FsrsState; stability: number; difficulty: number; due_at: string; due_date: string;
  reps: number; lapses: number; last_reviewed_at: string; learning_steps: number; scheduled_days: number;
  interval_days: number; box: number;
};

export type ReviewLogRow = { rating: CardRating; state_before: FsrsState; elapsed_days: number; scheduled_days: number };

export const RETENTIONS = [0.85, 0.9, 0.95] as const;
export const DEFAULT_RETENTION = 0.9;

const schedulers = new Map<number, ReturnType<typeof fsrs>>();
function scheduler(retention: number) {
  const r = RETENTIONS.includes(retention as any) ? retention : DEFAULT_RETENTION;
  let s = schedulers.get(r);
  if (!s) { s = fsrs({ request_retention: r, enable_fuzz: false, enable_short_term: true, maximum_interval: 365 * 3 }); schedulers.set(r, s); }
  return s;
}

export function localISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Una fecha "AAAA-MM-DD" como las 4 a. m. locales de ese día (como Anki: el día empieza temprano). */
export function dateToDue(d: string): Date {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, (m || 1) - 1, dd || 1, 4, 0, 0, 0);
}

/** Migración desde SM-2: estabilidad = intervalo, dificultad desde la facilidad. */
export function fromSm2(ease: number | null | undefined, interval: number | null | undefined): { stability: number; difficulty: number } {
  const e = ease ?? 2.5;
  return { stability: Math.max(1, interval ?? 1), difficulty: Math.min(10, Math.max(1, 5 + (2.5 - e) * 4)) };
}

export function stateOf(row: FsrsRow): FsrsState {
  const s = row.fsrs_state;
  if (s === 0 || s === 1 || s === 2 || s === 3) return s;
  return (row.reps ?? 0) > 0 || row.last_reviewed_at ? 2 : 0;
}

/** Cuándo vence (null = nueva, no vence). */
export function dueOf(row: FsrsRow): Date | null {
  if (stateOf(row) === 0) return null;
  if (row.due_at) return new Date(row.due_at);
  if (row.due_date) return dateToDue(row.due_date);
  return new Date(0);
}

export function toCard(row: FsrsRow, now: Date): Card {
  const state = stateOf(row);
  if (state === 0) return createEmptyCard(now);
  const sm = fromSm2(row.ease, row.interval_days);
  const due = dueOf(row) ?? now;
  const sched = row.scheduled_days ?? row.interval_days ?? 0;
  const last = row.last_reviewed_at ? new Date(row.last_reviewed_at) : new Date(due.getTime() - Math.max(0, sched) * 86_400_000);
  return {
    due, stability: row.stability ?? sm.stability, difficulty: row.difficulty ?? sm.difficulty,
    elapsed_days: 0, scheduled_days: sched, learning_steps: row.learning_steps ?? 0,
    reps: row.reps ?? 0, lapses: row.lapses ?? 0, state: state as unknown as State, last_review: last,
  };
}

/** Responder una tarjeta: devuelve lo que hay que guardar y el registro del repaso. */
export function schedule(row: FsrsRow, rating: CardRating, now: Date, retention = DEFAULT_RETENTION): { patch: FsrsPatch; log: ReviewLogRow } {
  const before = stateOf(row);
  const card = toCard(row, now);
  const { card: c, log } = scheduler(retention).next(card, now, rating as unknown as Grade);
  const days = c.scheduled_days;
  return {
    patch: {
      fsrs_state: c.state as unknown as FsrsState,
      stability: round(c.stability, 4), difficulty: round(c.difficulty, 4),
      due_at: c.due.toISOString(), due_date: localISODate(c.due),
      reps: c.reps, lapses: c.lapses, last_reviewed_at: now.toISOString(),
      learning_steps: c.learning_steps, scheduled_days: days,
      interval_days: Math.max(0, Math.round(days)),
      box: days <= 1 ? 1 : days <= 3 ? 2 : days <= 7 ? 3 : days <= 15 ? 4 : 5,
    },
    log: { rating, state_before: before, elapsed_days: round(log.elapsed_days ?? 0, 3), scheduled_days: days },
  };
}

/** Cuándo vuelve con cada botón, para mostrarlo debajo. */
export function preview(row: FsrsRow, now: Date, retention = DEFAULT_RETENTION): Record<CardRating, { due: Date; label: string }> {
  const out = {} as Record<CardRating, { due: Date; label: string }>;
  ([1, 2, 3, 4] as CardRating[]).forEach((r) => {
    const due = new Date(schedule(row, r, now, retention).patch.due_at);
    out[r] = { due, label: spanLabel(due.getTime() - now.getTime()) };
  });
  return out;
}

/** "1 min", "10 min", "3 h", "1 día", "6 días", "2 meses", "1,5 años". */
export function spanLabel(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(ms / 86_400_000);
  if (d < 31) return d === 1 ? '1 día' : `${d} días`;
  const m = Math.round(d / 30.4);
  if (m < 12) return m === 1 ? '1 mes' : `${m} meses`;
  const y = Math.round((d / 365) * 10) / 10;
  return y === 1 ? '1 año' : `${String(y).replace('.', ',')} años`;
}

/** "Ahora", "En 10 min", "Mañana", "En 6 días", "Nueva". */
export function dueLabel(row: FsrsRow, now: Date): string {
  const due = dueOf(row);
  if (!due) return 'Nueva';
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return 'Para hoy';
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
  if (days <= 0) return `En ${spanLabel(ms)}`;
  if (days === 1) return 'Mañana';
  return `En ${spanLabel(days * 86_400_000)}`;
}
function startOfDay(d: Date): number { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

/** Probabilidad de recordarla ahora (para la "retención" de cada tarjeta). */
export function retrievability(row: FsrsRow, now: Date, retention = DEFAULT_RETENTION): number | null {
  if (stateOf(row) === 0) return null;
  try { return scheduler(retention).get_retrievability(toCard(row, now), now, false) as number; } catch { return null; }
}

function round(n: number, d: number) { const k = 10 ** d; return Math.round(n * k) / k; }

export { Rating };
