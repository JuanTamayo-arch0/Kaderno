// ============================================================
//  Ritual del lunes, ritual del semestre y metas WOOP (v20, J y K).
//  Puro, con pruebas.
// ============================================================
import { addDaysISO, weekStartISO, dayCounts, type StudyDayRow } from './streaks';
import { planVsReal } from './estimate';

export type Priority =
  | { kind: 'task'; taskId: string; title: string }
  | { kind: 'text'; title: string; at?: string | null; done?: boolean };
export type WeekPlan = { week_start: string; priorities: Priority[]; goal_days: number | null; done_at: string | null; snoozed_until: string | null };

export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** La semana que se planea: el domingo desde las 6 pm ya es la siguiente. */
export function ritualWeekStart(now: Date): string {
  const today = localISO(now);
  if (now.getDay() === 0 && now.getHours() >= 18) return addDaysISO(today, 1);
  return weekStartISO(today);
}

/** ¿Se ofrece hoy "Planea tu semana"? Lunes (o domingo en la noche), o el día al que se pospuso. */
export function shouldOfferRitual(now: Date, plan: Pick<WeekPlan, 'done_at' | 'snoozed_until'> | null, enabled = true): boolean {
  if (!enabled || plan?.done_at) return false;
  const today = localISO(now);
  const ws = ritualWeekStart(now);
  if (plan?.snoozed_until) return today >= plan.snoozed_until && today <= addDaysISO(ws, 6);
  return now.getDay() === 1 || (now.getDay() === 0 && now.getHours() >= 18);
}

export function tomorrowISO(now: Date): string { return addDaysISO(localISO(now), 1); }

type TaskLike = { id: string; title: string; type?: string | null; status?: string | null; due_date?: string | null; estimate_min?: number | null; parent_id?: string | null };

/** Entregas y exámenes de la semana que se planea y de la siguiente. */
export function weekItems<T extends TaskLike>(tasks: T[], weekStart: string): { thisWeek: T[]; nextWeek: T[] } {
  const end1 = addDaysISO(weekStart, 6), end2 = addDaysISO(weekStart, 13);
  const live = tasks.filter((t) => t.status !== 'done' && t.due_date && !t.parent_id)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  return {
    thisWeek: live.filter((t) => t.due_date! >= weekStart && t.due_date! <= end1),
    nextWeek: live.filter((t) => t.due_date! > end1 && t.due_date! <= end2),
  };
}

/** Candidatas a prioridad: exámenes primero, luego lo que vence antes (incluye vencidas). */
export function suggestPriorities<T extends TaskLike>(tasks: T[], weekStart: string, max = 6): T[] {
  const end = addDaysISO(weekStart, 13);
  return tasks.filter((t) => t.status !== 'done' && !t.parent_id && (!t.due_date || t.due_date <= end))
    .sort((a, b) => {
      const ea = ['examen', 'quiz'].includes(String(a.type)) ? 0 : 1, eb = ['examen', 'quiz'].includes(String(b.type)) ? 0 : 1;
      return ea - eb || String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999'));
    })
    .slice(0, max);
}

export function cleanPriorities(list: Priority[]): Priority[] {
  const out: Priority[] = [];
  for (const p of list) {
    const title = String(p.title ?? '').trim().slice(0, 120);
    if (!title) continue;
    if (p.kind === 'task' && out.some((x) => x.kind === 'task' && x.taskId === p.taskId)) continue;
    out.push(p.kind === 'task' ? { kind: 'task', taskId: p.taskId, title } : { kind: 'text', title, at: p.at ?? null, done: !!p.done });
    if (out.length >= 3) break;
  }
  return out;
}

/** Cómo te fue la semana anterior a `weekStart`. */
export function lastWeekSummary(rows: StudyDayRow[], weekStart: string, goal: number, focusMin: number, plannedMin: number): { days: number; met: boolean; text: string; vs: string | null } {
  const from = addDaysISO(weekStart, -7);
  const by = new Map(rows.map((r) => [r.day, r]));
  let days = 0;
  for (let k = 0; k < 7; k++) { const r = by.get(addDaysISO(from, k)); if (r && (r.protected || dayCounts(r))) days++; }
  const met = days >= goal;
  const h = Math.floor(focusMin / 60), m = focusMin % 60;
  const hours = focusMin ? `${h ? `${h} h ` : ''}${m ? `${m} min` : ''}`.trim() : '0 min';
  const text = `${met ? 'Cumpliste la meta' : 'No alcanzaste la meta'}: estudiaste ${days} de ${goal} días, ${hours} de enfoque.`;
  return { days, met, text, vs: planVsReal(plannedMin, focusMin) };
}

/** ¿Ofrecer el ritual del semestre? Tres materias nuevas o más en 7 días. */
export function shouldOfferSemester(subjects: { created_at?: string | null }[], now: Date, done: boolean): boolean {
  if (done) return false;
  const since = now.getTime() - 7 * 86_400_000;
  return subjects.filter((s) => s.created_at && new Date(s.created_at).getTime() >= since).length >= 3;
}

// ---------- WOOP ----------
export const OBSTACLES = ['me distraigo con el celular', 'dejo todo para el final', 'no entiendo y no pregunto', 'me cuesta empezar', 'estudio solo la noche antes'];
export const PLAN_HINTS: Record<string, string> = {
  'me distraigo con el celular': 'lo dejo en otra habitación y pongo un pomodoro',
  'dejo todo para el final': 'hago 25 minutos el mismo día que me dejan la tarea',
  'no entiendo y no pregunto': 'escribo la duda y la pregunto en la siguiente clase',
  'me cuesta empezar': 'empiezo con el paso más fácil durante 2 minutos',
  'estudio solo la noche antes': 'repaso 15 minutos el día de la clase',
};

export type GoalDraft = { wish: string; outcome?: string | null; obstacle?: string | null; plan?: string | null; target_grade?: number | null };

export function planTemplate(obstacle: string | null | undefined): string {
  const o = (obstacle ?? '').trim();
  return o ? `Si ${o}, entonces ` : 'Si…, entonces ';
}

/** Lo que va después de "Si…, entonces " (la plantilla de este u otro obstáculo de la lista). */
export function planThen(raw: string | null | undefined, obstacle?: string | null): string {
  const r = String(raw ?? '');
  const low = r.toLowerCase();
  const tpls = [planTemplate(obstacle), 'Si…, entonces ', ...OBSTACLES.map((o) => planTemplate(o))];
  const hit = tpls.find((t) => low.startsWith(t.toLowerCase()));
  return hit ? r.slice(hit.length) : r;
}

/** "Si me distraigo con el celular, entonces lo dejo en otra habitación." */
export function fullPlan(obstacle: string | null | undefined, then: string): string {
  const t = planThen(then, obstacle).trim().replace(/\.$/, '');
  if (!t) return '';
  if (/^si\s/i.test(t)) return t + '.';
  if (!(obstacle ?? '').trim()) return t[0].toUpperCase() + t.slice(1) + '.';
  return `${planTemplate(obstacle)}${t}.`;
}

export function wishExample(subject: string | null, scale = 5): string {
  const grade = scale >= 20 ? '80' : '4.0';
  return subject ? `Pasar ${subject} con ${grade}` : `Terminar el semestre con promedio de ${grade}`;
}

export function goalError(g: GoalDraft, scale = 5): string | null {
  if (!g.wish?.trim()) return 'Escribe tu meta.';
  if (g.wish.trim().length > 200) return 'La meta es muy larga (máximo 200 caracteres).';
  if (g.target_grade != null && (!Number.isFinite(g.target_grade) || g.target_grade < 0 || g.target_grade > scale)) return `La nota debe estar entre 0 y ${scale}.`;
  return null;
}

/** Nota que aparece en la meta ("4.0", "4,5") o null. */
export function gradeInWish(wish: string, scale = 5): number | null {
  const m = wish.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return Number.isFinite(v) && v > 0 && v <= scale ? v : null;
}
