// Llamadas a Supabase para importar, actualizar por archivo, editar en masa y deshacer.
// Las funciones RPC están en supabase/schema_v13.sql.

import { supabase } from './supabase';
import { statusFromDb } from './import/values';
import { toBulkPatch, type BulkPatch, type RpcTask } from './import/payload';
import type { DuplicatePolicy, ExistingTask } from './import/types';

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

export interface ProjectBatch {
  id: string;
  kind: 'import' | 'bulk_edit' | 'file_update';
  summary: Record<string, number>;
  created_at: string;
  undone_at: string | null;
  user_id: string;
}

function friendly(error: { message?: string; code?: string } | null): Error {
  const msg = error?.message ?? 'Error desconocido';
  if (msg.includes('KADERNO_FORBIDDEN')) return new Error('No tienes permiso para editar este proyecto');
  if (msg.includes('KADERNO_TOO_MANY')) return new Error('Máximo 500 tareas por archivo');
  if (msg.includes('KADERNO_UNDO_NOT_LATEST')) return new Error('Solo se puede deshacer el último cambio masivo del proyecto');
  if (msg.includes('KADERNO_UNDO_EXPIRED')) return new Error('Ese cambio tiene más de 7 días y ya no se puede deshacer');
  if (msg.includes('KADERNO_UNDO_DONE')) return new Error('Ese cambio ya se deshizo');
  if (msg.includes('KADERNO_BAD_DATES')) return new Error('Alguna tarea quedaría con el inicio después de la entrega');
  return new Error(msg);
}

function asResult(data: unknown): BatchResult {
  const d = (data ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);
  return {
    batch_id: String(d.batch_id ?? ''),
    created: n('created'),
    updated: n('updated'),
    deleted: n('deleted'),
    skipped: n('skipped'),
    steps: n('steps'),
    unassigned: n('unassigned'),
    ignored_ids: n('ignored_ids'),
  };
}

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

export async function undoProjectBatch(batchId: string): Promise<BatchResult> {
  const { data, error } = await supabase.rpc('undo_project_batch', { p_batch: batchId });
  if (error) throw friendly(error);
  return asResult(data);
}

export async function getProjectBatches(projectId: string, limit = 20): Promise<ProjectBatch[]> {
  const { data, error } = await supabase
    .from('project_batches')
    .select('id, kind, summary, created_at, undone_at, user_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw friendly(error);
  return (data ?? []) as ProjectBatch[];
}

/**
 * Tareas del proyecto con su checklist, en la forma que usan la exportación, el diff
 * y la vista previa de correr fechas.
 */
export async function getProjectTasksForBulk(projectId: string): Promise<ExistingTask[]> {
  const { data: tasks, error } = await supabase
    .from('project_tasks')
    .select('id, title, description, status, assignee_id, start_at, due_at, position')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  if (error) throw friendly(error);
  const ids = (tasks ?? []).map((t: { id: string }) => t.id);
  const stepsByTask = new Map<string, { text: string; done: boolean }[]>();
  if (ids.length) {
    const { data: steps, error: e2 } = await supabase
      .from('project_task_steps')
      .select('task_id, title, done, position')
      .in('task_id', ids)
      .order('position', { ascending: true });
    if (e2) throw friendly(e2);
    (steps ?? []).forEach((s: { task_id: string; title: string; done: boolean }) => {
      const list = stepsByTask.get(s.task_id) ?? [];
      list.push({ text: s.title, done: s.done });
      stepsByTask.set(s.task_id, list);
    });
  }
  return (tasks ?? []).map((t: Record<string, unknown>) => ({
    id: String(t.id),
    title: String(t.title ?? ''),
    description: (t.description as string | null) ?? null,
    status: statusFromDb(String(t.status ?? '')),
    assignee_id: (t.assignee_id as string | null) ?? null,
    start_at: (t.start_at as string | null) ?? null,
    due_at: (t.due_at as string | null) ?? null,
    checklist: stepsByTask.get(String(t.id)) ?? [],
  }));
}
