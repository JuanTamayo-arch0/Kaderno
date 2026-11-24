import { t, trn } from './i18n';
// ============================================================
//  Proyectos de trabajo (v25, fase 3). Puro, con pruebas: prioridad,
//  etiquetas, bloqueos, filtros, reglas y estado del proyecto.
// ============================================================

export type Priority = 'urgente' | 'alta' | 'normal' | 'baja';
export const PRIORITIES: { key: Priority; label: string; color: string; rank: number }[] = [
  { key: 'urgente', label: t('Urgente'), color: '#ef5b5b', rank: 0 },
  { key: 'alta', label: t('Alta'), color: '#f5904c', rank: 1 },
  { key: 'normal', label: t('Normal'), color: '#6c8cff', rank: 2 },
  { key: 'baja', label: t('Baja'), color: '#9aa3b2', rank: 3 },
];
export const priorityOf = (p: string | null | undefined) => PRIORITIES.find((x) => x.key === p) ?? null;
const rank = (p: string | null | undefined) => priorityOf(p)?.rank ?? 4;

type T = { id: string; done: boolean; priority?: string | null; labels?: string[] | null; blocked_by?: string[] | null; assignee_id?: string | null };

/** Etiquetas como las guarda el servidor: minúsculas, sin repetir, máximo 8 de 30 letras. */
export function cleanLabels(input: string | string[]): string[] {
  const list = Array.isArray(input) ? input : input.split(/[,;#]/);
  const out: string[] = [];
  for (const l of list) { const x = l.trim().toLowerCase().slice(0, 30); if (x && !out.includes(x)) out.push(x); }
  return out.slice(0, 8);
}
/** Todas las etiquetas del proyecto, de la más usada a la menos. */
export function projectLabels(tasks: T[]): string[] {
  const n = new Map<string, number>();
  for (const t of tasks) for (const l of t.labels ?? []) n.set(l, (n.get(l) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
}
/** Las tareas pendientes que todavía bloquean a esta. */
export function blockersOf<X extends T>(t: T, byId: Record<string, X>): X[] {
  return (t.blocked_by ?? []).map((id) => byId[id]).filter((b): b is X => !!b && !b.done);
}
export const isBlocked = (t: T, byId: Record<string, T>) => !t.done && blockersOf(t, byId).length > 0;

export type TaskFilter = { priority?: Priority | null; label?: string | null; mine?: string | null; blocked?: boolean };
export function filterTasks<X extends T>(tasks: X[], f: TaskFilter, byId: Record<string, T>): X[] {
  return tasks.filter((t) => (!f.priority || t.priority === f.priority) && (!f.label || (t.labels ?? []).includes(f.label))
    && (!f.mine || t.assignee_id === f.mine) && (!f.blocked || isBlocked(t, byId)));
}
/** Más urgente primero; a igual prioridad, el orden que traían. */
export function byPriority<X extends T>(tasks: X[]): X[] {
  return tasks.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.priority) - rank(b.t.priority) || a.i - b.i).map((x) => x.t);
}

// ---------- Reglas ----------
export type Rule = { id: string; project_id: string; trigger: 'moved' | 'created' | 'overdue'; column_key: string | null; action: 'assign' | 'notify' | 'notify_assignee'; user_id: string | null; enabled: boolean };
/** "Cuando pase a En revisión, asignar a Ana". */
export function ruleText(r: Pick<Rule, 'trigger' | 'column_key' | 'action' | 'user_id'>, cols: { key: string; label: string }[], nameOf: (id: string) => string): string {
  const when = r.trigger === 'moved' ? t('Cuando pase a {v}', { v: cols.find((c) => c.key === r.column_key)?.label ?? r.column_key }) : r.trigger === 'created' ? t('Cuando se cree una tarea') : t('Cuando se venza una tarea');
  const what = r.action === 'assign' ? trn('asignar a {name}', { name: r.user_id ? nameOf(r.user_id) : '…' })
    : r.action === 'notify_assignee' ? t('avisar a quien la tiene') : r.user_id ? trn('avisar a {name}', { name: nameOf(r.user_id) }) : t('avisar al dueño del proyecto');
  return `${when}, ${what}`;
}
/** ¿La regla se puede guardar? (igual que las restricciones del servidor) */
export function ruleError(r: Partial<Rule>): string | null {
  if (!r.trigger) return t('Escoge cuándo.');
  if (r.trigger === 'moved' && !r.column_key) return t('Escoge la columna.');
  if (!r.action) return t('Escoge qué hacer.');
  if (r.action === 'assign' && !r.user_id) return t('Escoge a quién asignar.');
  if (r.trigger === 'overdue' && r.action === 'assign') return t('Al vencerse solo se puede avisar.');
  return null;
}

// ---------- Estado del proyecto ----------
export type Health = 'en_curso' | 'en_riesgo' | 'atrasado';
export const HEALTH: Record<Health, { label: string; color: string; icon: string }> = {
  en_curso: { label: t('En curso'), color: '#37c98b', icon: 'checkmark-circle' },
  en_riesgo: { label: t('En riesgo'), color: '#f5b64c', icon: 'alert-circle' },
  atrasado: { label: t('Atrasado'), color: '#ef5b5b', icon: 'close-circle' },
};
/** Estado sugerido con los números del informe semanal. */
export function suggestHealth(r: { late: unknown[]; next: unknown[]; total: number; doneTotal: number }): Health {
  if (r.late.length >= 3 || (r.total > 0 && r.late.length / Math.max(1, r.total - r.doneTotal) > 0.3)) return 'atrasado';
  if (r.late.length > 0) return 'en_riesgo';
  return 'en_curso';
}
