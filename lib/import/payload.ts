// Convierte las tareas normalizadas en lo que reciben las funciones RPC de schema_v13.sql.

import type { Field, NormalizedTask, ProjectStatus, ShiftTarget } from './types';
import type { TaskUpdate } from './diff';

export interface RpcStep {
  title: string;
  /** null: conservar el estado del ítem existente con el mismo texto. */
  done: boolean | null;
}

export interface RpcTask {
  id?: string;
  title?: string;
  description?: string | null;
  status?: string;
  assignee_id?: string | null;
  start_at?: string | null;
  due_at?: string | null;
  checklist?: RpcStep[] | null;
  delete?: boolean;
  /** Campos a escribir al actualizar. */
  fields?: string[];
}

const FIELD_TO_COLUMN: Partial<Record<Field, string>> = {
  title: 'title',
  description: 'description',
  status: 'status',
  assignee: 'assignee_id',
  start: 'start_at',
  due: 'due_at',
  checklist: 'checklist',
};

function steps(t: NormalizedTask, forCreate: boolean): RpcStep[] | null {
  if (!t.checklist) return null;
  return t.checklist.map((c) => ({ title: c.text, done: forCreate ? c.done === true : c.done }));
}

/**
 * Una tarea nueva: todos sus campos. Sin estado va a `defaultStatus`
 * (la primera columna del tablero).
 */
export function toCreatePayload(t: NormalizedTask, defaultStatus: ProjectStatus): RpcTask {
  return {
    title: t.title ?? '',
    description: t.description,
    status: t.status ?? defaultStatus,
    assignee_id: t.assignee_id,
    start_at: t.start_at,
    due_at: t.due_at,
    checklist: steps(t, true),
  };
}

/** Lo que recibe import_project_tasks. */
export function toImportPayload(tasks: NormalizedTask[], defaultStatus: ProjectStatus): RpcTask[] {
  return tasks.filter((t) => !t.skip && !t.id).map((t) => toCreatePayload(t, defaultStatus));
}

/** Una fila con id: solo los campos que venían en el archivo. */
export function toUpdatePayload(u: TaskUpdate): RpcTask {
  const t = u.task;
  const fields = u.changes.map((c) => FIELD_TO_COLUMN[c.field]).filter((x): x is string => !!x);
  const out: RpcTask = { id: t.id!, fields };
  if (fields.includes('title')) out.title = t.title!;
  if (fields.includes('description')) out.description = t.description;
  if (fields.includes('status')) out.status = t.status!;
  if (fields.includes('assignee_id')) out.assignee_id = t.assignee_id;
  if (fields.includes('start_at')) out.start_at = t.start_at;
  if (fields.includes('due_at')) out.due_at = t.due_at;
  if (fields.includes('checklist')) out.checklist = (u.checklist ?? []).map((c) => ({ title: c.text, done: c.done }));
  return out;
}

/** Lo que recibe apply_project_file: actualizaciones, nuevas y borradas. */
export function toFilePayload(diff: {
  creates: NormalizedTask[];
  updates: TaskUpdate[];
  deletes: { task: NormalizedTask }[];
}, defaultStatus: ProjectStatus): RpcTask[] {
  return [
    ...diff.updates.map(toUpdatePayload),
    ...diff.creates.map((t) => toCreatePayload(t, defaultStatus)),
    ...diff.deletes.map((d) => ({ id: d.task.id!, delete: true })),
  ];
}

/** Cambio para varias tareas seleccionadas (bulk_update_project_tasks). */
export interface BulkPatch {
  status?: ProjectStatus;
  assignee_id?: string | null;
  start_at?: string | null;
  due_at?: string | null;
  shift_days?: number;
  shift_target?: ShiftTarget;
  delete?: boolean;
}

export function toBulkPatch(p: BulkPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.status !== undefined) out.status = p.status;
  if (p.assignee_id !== undefined) out.assignee_id = p.assignee_id;
  if (p.start_at !== undefined) out.start_at = p.start_at;
  if (p.due_at !== undefined) out.due_at = p.due_at;
  if (p.shift_days !== undefined) {
    out.shift_minutes = Math.round(p.shift_days * 1440);
    out.shift_target = p.shift_target ?? 'ambas';
  }
  if (p.delete) out.delete = true;
  return out;
}
