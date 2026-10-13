// ============================================================
//  Importar, exportar y editar en masa las tareas de un proyecto.
//
//  Toda escritura pasa por funciones RPC de supabase/schema_v13.sql, que
//  validan permisos, trabajan en una sola transacción (o todo o nada) y
//  guardan un lote para poder deshacer.
// ============================================================

import { supabase } from './supabase';
import { toBulkPatch, type BulkPatch, type RpcTask } from './import/payload';
import type { BoardColumnRef, DuplicatePolicy, ExistingTask, Member as ImportMember } from './import/types';
import { columnsOf, type Member, type Project } from './projects';

export interface BatchResult {
  batch_id: string;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  steps: number;
  unassigned: number;
  ignored_ids: number;
}

// ---------- Adaptadores entre el modelo de Proyectos y el importador ----------

export function importMembers(members: Member[]): ImportMember[] {
  return members.map((m) => ({
    user_id: m.user_id,
    email: m.profile?.email ?? null,
    name: m.profile?.display_name ?? null,
    role: m.role,
  }));
}

export function importColumns(project: Pick<Project, 'board_columns'> | null): BoardColumnRef[] {
  return columnsOf(project).map((c) => ({ key: c.key, label: c.label, done: !!c.done }));
}

// ---------- Errores legibles ----------

const NEEDS_MIGRATION =
  'Falta correr supabase/schema_v13.sql en Supabase (SQL Editor). Sin eso no se puede importar ni editar en masa.';

function friendly(error: { message?: string; code?: string } | null): Error {
  const msg = error?.message ?? 'Error desconocido';
  const code = error?.code ?? '';
  if (code === 'PGRST202' || code === '42883' || code === '42703' || /schema cache|does not exist/i.test(msg)) {
    return new Error(NEEDS_MIGRATION);
  }
  if (msg.includes('KADERNO_FORBIDDEN')) return new Error('No tienes permiso para editar este proyecto');
  if (msg.includes('KADERNO_TOO_MANY')) return new Error('Máximo 500 tareas por archivo');
  if (msg.includes('KADERNO_NO_TITLE')) return new Error('Hay una tarea sin título');
  if (msg.includes('KADERNO_NOT_MEMBER')) return new Error('Esa persona no es integrante del proyecto');
  if (msg.includes('KADERNO_UNDO_NOT_LATEST')) return new Error('Solo se puede deshacer el último cambio masivo del proyecto');
  if (msg.includes('KADERNO_UNDO_EXPIRED')) return new Error('Ese cambio tiene más de 7 días y ya no se puede deshacer');
  if (msg.includes('KADERNO_UNDO_DONE')) return new Error('Ese cambio ya se deshizo');
  if (msg.includes('KADERNO_BAD_DATES')) return new Error('Alguna tarea quedaría con el inicio después de la entrega. No se cambió nada');
  return new Error(msg);
}

function asResult(data: unknown): BatchResult {
  const d = (data ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);
  return {
    batch_id: d.batch_id ? String(d.batch_id) : '',
    created: n('created'),
    updated: n('updated'),
    deleted: n('deleted'),
    skipped: n('skipped'),
    steps: n('steps'),
    unassigned: n('unassigned'),
    ignored_ids: n('ignored_ids'),
  };
}

// ---------- Escrituras ----------

export async function importProjectTasks(projectId: string, tasks: RpcTask[], duplicates: DuplicatePolicy): Promise<BatchResult> {
  const { data, error } = await supabase.rpc('import_project_tasks', {
    p_project: projectId,
    p_tasks: tasks,
    p_duplicates: duplicates,
  });
  if (error) throw friendly(error);
  return asResult(data);
}

export async function applyProjectFile(projectId: string, rows: RpcTask[]): Promise<BatchResult> {
  const { data, error } = await supabase.rpc('apply_project_file', { p_project: projectId, p_rows: rows });
  if (error) throw friendly(error);
  return asResult(data);
}

export async function bulkUpdateProjectTasks(projectId: string, ids: string[], patch: BulkPatch): Promise<BatchResult> {
  const { data, error } = await supabase.rpc('bulk_update_project_tasks', {
    p_project: projectId,
    p_ids: ids,
    p_patch: toBulkPatch(patch),
  });
  if (error) throw friendly(error);
  return asResult(data);
}

export async function undoProjectBatch(batchId: string): Promise<void> {
  const { error } = await supabase.rpc('undo_project_batch', { p_batch: batchId });
  if (error) throw friendly(error);
}

// ---------- Lectura ----------

/**
 * Tareas del proyecto con su checklist, en la forma que usan la exportación, el
 * diff y la vista previa de correr fechas.
 */
export async function getProjectTasksForBulk(projectId: string): Promise<ExistingTask[]> {
  const { data: tasks, error } = await supabase
    .from('project_tasks')
    .select('id, title, description, status, done, assignee_id, start_at, due_at, position')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  if (error) throw friendly(error);
  const { data: steps, error: e2 } = await supabase
    .from('project_task_steps')
    .select('task_id, title, done, position')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  if (e2) throw friendly(e2);

  const byTask = new Map<string, { text: string; done: boolean }[]>();
  ((steps as { task_id: string; title: string; done: boolean }[]) ?? []).forEach((s) => {
    const list = byTask.get(s.task_id) ?? [];
    list.push({ text: s.title, done: s.done });
    byTask.set(s.task_id, list);
  });

  return ((tasks as Record<string, unknown>[]) ?? []).map((t) => ({
    id: String(t.id),
    title: String(t.title ?? ''),
    description: (t.description as string | null) ?? null,
    status: String(t.status ?? ''),
    done: !!t.done,
    assignee_id: (t.assignee_id as string | null) ?? null,
    start_at: (t.start_at as string | null) ?? null,
    due_at: (t.due_at as string | null) ?? null,
    checklist: byTask.get(String(t.id)) ?? [],
  }));
}
