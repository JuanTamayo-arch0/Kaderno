// ============================================================
//  Agenda de un día: clases del horario, entregas con hora y planes
//  ("¿Cuándo lo haces?", 50 min).
//  Pura (sin React ni Supabase) para poder probarla.
// ============================================================
import { dueDay, dueTimeHHMM, dayDiff, type DueLike } from './time';

export type AgendaBlock = { id: string; start: string; end: string };
export type AgendaSlot = { day: number; slot: number; subject_id: string };
export type AgendaSubject = { id: string; name: string; color: string };
export type AgendaTask = DueLike & { id: string; title: string; subject_id?: string | null; status?: string | null; kind?: 'task' | 'project'; color?: string; project?: string; plan_at?: string | null; plan_place?: string | null };

export type AgendaItem = {
  kind: 'class' | 'due' | 'plan' | 'event';
  start: number;         // minutos desde la medianoche
  end: number | null;
  title: string;
  color: string;
  subjectId?: string | null;
  taskId?: string;
  project?: string;
  place?: string | null;
};

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };
export function minToLabel(min: number): string {
  let h = Math.floor(min / 60); const m = min % 60;
  const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

/** Clases del día, juntando bloques seguidos de la misma materia. */
export function classesOf(day: Date, slots: AgendaSlot[], blocks: AgendaBlock[], subjects: AgendaSubject[]): AgendaItem[] {
  const dow = (day.getDay() + 6) % 7; // 0 = lunes
  const today = slots.filter((s) => s.day === dow && blocks[s.slot])
    .map((s) => ({ s, b: blocks[s.slot] }))
    .sort((a, b) => toMin(a.b.start) - toMin(b.b.start));
  const out: AgendaItem[] = [];
  for (const { s, b } of today) {
    const sub = subjects.find((x) => x.id === s.subject_id);
    if (!sub) continue;
    const last = out[out.length - 1];
    if (last && last.subjectId === s.subject_id && last.end === toMin(b.start)) { last.end = toMin(b.end); continue; }
    out.push({ kind: 'class', start: toMin(b.start), end: toMin(b.end), title: sub.name, color: sub.color, subjectId: sub.id });
  }
  return out;
}

/** Evento de un calendario externo (v21). */
export type AgendaEvent = { id: string; title: string; start: string; end: string; all_day?: boolean; color?: string | null };

/** Agenda completa del día: clases, entregas con hora, planes y eventos de otros calendarios, en orden. */
export function buildAgenda(day: Date, slots: AgendaSlot[], blocks: AgendaBlock[], subjects: AgendaSubject[], tasks: AgendaTask[], events: AgendaEvent[] = []): { timed: AgendaItem[]; allDay: AgendaTask[] } {
  const timed = classesOf(day, slots, blocks, subjects);
  const allDay: AgendaTask[] = [];
  const d0 = new Date(day); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
  for (const e of events) {
    const s = new Date(e.start), en = new Date(e.end);
    if (e.all_day) {
      // Los de todo el día vienen en UTC (medianoche): se comparan por fecha.
      const sd = e.start.slice(0, 10), ed = e.end.slice(0, 10), iso = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
      if (sd <= iso && (ed > iso || ed === sd)) allDay.push({ id: e.id, title: e.title } as AgendaTask);
      continue;
    }
    if (s >= d1 || en <= d0) continue;
    const st = s < d0 ? 0 : s.getHours() * 60 + s.getMinutes();
    const end = en >= d1 ? 24 * 60 : en.getHours() * 60 + en.getMinutes();
    timed.push({ kind: 'event', start: st, end, title: e.title, color: e.color ?? '#8a93a6' });
  }
  for (const t of tasks) {
    if (t.status === 'done') continue;
    if (t.plan_at) {
      const p = new Date(t.plan_at);
      if (dayDiff(p, day) === 0) {
        const sub = subjects.find((x) => x.id === t.subject_id);
        const st = p.getHours() * 60 + p.getMinutes();
        timed.push({ kind: 'plan', start: st, end: st + 50, title: t.title, color: t.color ?? sub?.color ?? '#9aa3b2', subjectId: t.subject_id ?? null, taskId: t.id, place: t.plan_place ?? null });
      }
    }
    const d = dueDay(t);
    if (!d || dayDiff(d, day) !== 0) continue;
    const hhmm = dueTimeHHMM(t);
    if (!hhmm) { allDay.push(t); continue; }
    const sub = subjects.find((x) => x.id === t.subject_id);
    timed.push({ kind: 'due', start: toMin(hhmm), end: null, title: t.title, color: t.color ?? sub?.color ?? '#9aa3b2', subjectId: t.subject_id ?? null, taskId: t.id, project: t.project });
  }
  timed.sort((a, b) => a.start - b.start || (a.kind === 'class' ? -1 : 1));
  return { timed, allDay };
}

/** Clase de ahora y la siguiente (solo clases). */
export function nowAndNext(now: Date, slots: AgendaSlot[], blocks: AgendaBlock[], subjects: AgendaSubject[]): { now: AgendaItem | null; next: AgendaItem | null } {
  const list = classesOf(now, slots, blocks, subjects);
  const m = now.getHours() * 60 + now.getMinutes();
  const cur = list.find((c) => c.start <= m && (c.end ?? c.start) > m) ?? null;
  const next = list.find((c) => c.start > m) ?? null;
  return { now: cur, next };
}
