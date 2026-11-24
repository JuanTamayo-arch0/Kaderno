// ============================================================
//  Comentarios en tareas de proyecto (schema_v22, fase 2).
// ============================================================
import { supabase } from './supabase';
import { countByTask } from './comments';
import { t } from './i18n';

export type TaskComment = { id: string; project_id: string; task_id: string; author_id: string; body: string; mentions: string[]; created_at: string; edited_at: string | null };

const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V22_2 = t('Para los comentarios falta correr schema_v22.sql (fase 2) en Supabase.');

let AVAILABLE: boolean | null = null;
export const commentsAvailable = () => AVAILABLE !== false;

export async function getComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at').limit(500);
  if (error) { if (missing(error)) AVAILABLE = false; return []; }
  AVAILABLE = true;
  return (data as TaskComment[]) ?? [];
}

/** Cuántos comentarios tiene cada tarea del proyecto (para las tarjetas). */
export async function getCommentCounts(projectId: string): Promise<Record<string, number>> {
  if (AVAILABLE === false) return {};
  const { data, error } = await supabase.from('task_comments').select('task_id').eq('project_id', projectId).limit(5000);
  if (error) { if (missing(error)) AVAILABLE = false; return {}; }
  AVAILABLE = true;
  return countByTask((data as { task_id: string }[]) ?? []);
}

export async function addComment(projectId: string, taskId: string, body: string, mentions: string[]): Promise<TaskComment> {
  const { data, error } = await supabase.from('task_comments')
    .insert({ project_id: projectId, task_id: taskId, body: body.trim().slice(0, 4000), mentions: mentions.slice(0, 20) })
    .select('*').single();
  if (error) {
    if (missing(error)) throw new Error(NEEDS_V22_2);
    if (/Máximo 500/.test(String(error.message))) throw new Error(t('Esta tarea ya tiene 500 comentarios.'));
    throw error;
  }
  return data as TaskComment;
}

export async function editComment(id: string, body: string, mentions: string[]): Promise<void> {
  const { error } = await supabase.from('task_comments').update({ body: body.trim().slice(0, 4000), mentions: mentions.slice(0, 20) }).eq('id', id);
  if (error) throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from('task_comments').delete().eq('id', id);
  if (error) throw error;
}
