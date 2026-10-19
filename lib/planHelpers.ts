// ============================================================
//  Horarios sugeridos con datos reales: clases del horario, otros planes
//  y tus horas habituales de enfoque (usa lib/planSlots.ts, que es puro).
// ============================================================
import { getSchedule, getTasks, type Slot } from './db';
import { SCHEDULE, toMinutes } from './schedule';
import { getHabitHours } from './studyDb';
import { freeSlots, PLAN_MIN, type Range, type Busy } from './planSlots';

/** Clases de un día como rangos de minutos (para no sugerir encima). */
export function classRanges(slots: Slot[]): (day: Date) => Range[] {
  const blocks = SCHEDULE.blocks;
  return (day: Date) => {
    const dow = (day.getDay() + 6) % 7;
    return slots.filter((s) => s.day === dow && blocks[s.slot])
      .map((s) => ({ start: toMinutes(blocks[s.slot].start), end: toMinutes(blocks[s.slot].end) }));
  };
}

async function context(excludeId?: string | null): Promise<{ classesFor: (d: Date) => Range[]; busy: Busy[]; habit: number[] }> {
  const [slots, tasks, habit] = await Promise.all([
    getSchedule().catch(() => [] as Slot[]), getTasks().catch(() => []), getHabitHours().catch(() => [] as number[]),
  ]);
  const busy = tasks.filter((t) => t.plan_at && t.id !== excludeId && t.status !== 'done')
    .map((t) => { const s = new Date(t.plan_at!).getTime(); return { start: s, end: s + Math.max(PLAN_MIN, t.estimate_min ?? 0) * 60_000 }; });
  return { classesFor: classRanges(slots), busy, habit };
}

/** Horarios sugeridos para una tarea. */
export async function suggestSlots(o: { due: Date | null; dueHasTime: boolean; excludeId?: string | null; count?: number }): Promise<Date[]> {
  const c = await context(o.excludeId);
  return freeSlots({ now: new Date(), due: o.due, dueHasTime: o.dueHasTime, ...c, count: o.count ?? 3 });
}

/** El mejor hueco de un día (para las sesiones del plan del parcial). */
export async function suggestSlotsForDay(day: Date, minutes: number, taken: Date[] = []): Promise<Date | null> {
  const c = await context(null);
  const busy = [...c.busy, ...taken.map((t) => ({ start: t.getTime(), end: t.getTime() + 60 * 60_000 }))];
  return freeSlots({ now: new Date(), day, duration: minutes, count: 1, classesFor: c.classesFor, busy, habit: c.habit })[0] ?? null;
}
