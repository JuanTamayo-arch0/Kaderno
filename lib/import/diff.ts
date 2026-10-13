import { formatHuman, sameInstant } from './dates';
import { FIELD_LABELS } from './fields';
import { columnLabel, mergeChecklist } from './values';
import type { ExistingTask, Field, Member, NormalizedTask, ProjectContext, RowIssue } from './types';

export interface FieldChange {
  field: Field;
  label: string;
  before: string;
  after: string;
}

export interface TaskUpdate {
  task: NormalizedTask;
  existing: ExistingTask;
  changes: FieldChange[];
  /** Checklist final ya unido con el existente, si cambia. */
  checklist: { text: string; done: boolean }[] | null;
}

export interface FileDiff {
  creates: NormalizedTask[];
  updates: TaskUpdate[];
  deletes: { task: NormalizedTask; existing: ExistingTask }[];
  unchanged: number;
  /** Filas con id que no pertenece a este proyecto (o la tarea ya se borró). */
  unknownIds: NormalizedTask[];
  /** Errores que solo aparecen al combinar con lo existente (inicio después de entrega). */
  issues: RowIssue[];
}

function memberName(members: Member[], id: string | null): string {
  if (!id) return 'Sin asignar';
  const m = members.find((x) => x.user_id === id);
  return m?.name || m?.email || 'Integrante';
}

function checklistSummary(items: { text: string; done: boolean }[]): string {
  if (!items.length) return 'Sin checklist';
  const done = items.filter((i) => i.done).length;
  return `${items.length} ítems, ${done} hechos`;
}

function sameChecklist(a: { text: string; done: boolean }[], b: { text: string; done: boolean }[]): boolean {
  return a.length === b.length && a.every((x, i) => x.text === b[i].text && x.done === b[i].done);
}

function short(s: string | null, n = 60): string {
  if (!s) return 'Vacío';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Compara el archivo con el proyecto actual. Solo cuenta como cambio un campo que
 * venía con valor en el archivo y es distinto del actual. Nada se borra porque falte:
 * borrar exige la columna eliminar.
 */
export function computeFileDiff(tasks: NormalizedTask[], existing: ExistingTask[], ctx: ProjectContext): FileDiff {
  const { members, columns } = ctx;
  const byId = new Map(existing.map((e) => [e.id.toLowerCase(), e]));
  const diff: FileDiff = { creates: [], updates: [], deletes: [], unchanged: 0, unknownIds: [], issues: [] };

  for (const t of tasks) {
    if (t.skip) continue;
    if (!t.id) {
      diff.creates.push(t);
      continue;
    }
    const e = byId.get(t.id);
    if (!e) {
      diff.unknownIds.push(t);
      diff.issues.push({ row: t.row, field: 'id', level: 'warning', message: 'Esta tarea no existe en el proyecto (quizá se borró). La fila se ignorará' });
      continue;
    }
    if (t.delete) {
      diff.deletes.push({ task: t, existing: e });
      continue;
    }

    const changes: FieldChange[] = [];
    const has = (f: Field) => t.present.includes(f);
    const push = (field: Field, before: string, after: string) => changes.push({ field, label: FIELD_LABELS[field], before, after });

    if (has('title') && t.title !== e.title) push('title', short(e.title), short(t.title));
    if (has('description') && t.description !== (e.description ?? null)) push('description', short(e.description), short(t.description));
    if (has('status') && t.status !== e.status) push('status', columnLabel(columns, e.status), columnLabel(columns, t.status));
    if (has('assignee') && t.assignee_id !== e.assignee_id) push('assignee', memberName(members, e.assignee_id), memberName(members, t.assignee_id));
    if (has('start') && !sameInstant(t.start_at, e.start_at)) push('start', formatHuman(e.start_at), formatHuman(t.start_at));
    if (has('due') && !sameInstant(t.due_at, e.due_at)) push('due', formatHuman(e.due_at), formatHuman(t.due_at));

    let checklist: { text: string; done: boolean }[] | null = null;
    if (has('checklist') && t.checklist) {
      const merged = mergeChecklist(e.checklist, t.checklist);
      if (!sameChecklist(merged, e.checklist)) {
        checklist = merged;
        push('checklist', checklistSummary(e.checklist), checklistSummary(merged));
      }
    }

    // Inicio y entrega finales, combinando el archivo con lo que ya había.
    const start = has('start') ? t.start_at : e.start_at;
    const due = has('due') ? t.due_at : e.due_at;
    if (start && due && Date.parse(start) > Date.parse(due)) {
      diff.issues.push({ row: t.row, field: 'start', level: 'error', message: 'Con este cambio el inicio queda después de la entrega' });
      continue;
    }

    if (changes.length) diff.updates.push({ task: t, existing: e, changes, checklist });
    else diff.unchanged++;
  }
  return diff;
}

export function diffSummary(d: FileDiff): string {
  const parts: string[] = [];
  if (d.updates.length) parts.push(`${d.updates.length} ${d.updates.length === 1 ? 'cambia' : 'cambian'}`);
  if (d.creates.length) parts.push(`${d.creates.length} ${d.creates.length === 1 ? 'nueva' : 'nuevas'}`);
  if (d.deletes.length) parts.push(`${d.deletes.length} se ${d.deletes.length === 1 ? 'borra' : 'borran'}`);
  if (!parts.length) return 'No hay cambios';
  return parts.join(', ');
}
