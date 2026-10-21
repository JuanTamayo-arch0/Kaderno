// ============================================================
//  Resaltados de PDF (schema_v21, fase 2) y enviar a una nota.
// ============================================================
import { supabase } from './supabase';
import { signedUrl, addNote } from './db';
import { fileUrl } from './projectFiles';
import type { FileKind, HlColor, HlRect } from './highlights';

export type Highlight = { id: string; file_kind: FileKind; file_id: string; page: number; rects: HlRect[]; text: string; color: HlColor; comment: string | null; created_at: string };

const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V21_2 = 'Para resaltar PDFs falta correr schema_v21.sql (fase 2) en Supabase.';

export async function getHighlights(kind: FileKind, fileId: string): Promise<Highlight[]> {
  const { data, error } = await supabase.from('file_highlights').select('*').eq('file_kind', kind).eq('file_id', fileId).order('page').limit(2000);
  if (error) return [];
  return (data as Highlight[]) ?? [];
}

export async function addHighlight(h: { file_kind: FileKind; file_id: string; page: number; rects: HlRect[]; text: string; color: HlColor; comment?: string | null }): Promise<Highlight> {
  const { data, error } = await supabase.from('file_highlights').insert({ ...h, text: h.text.slice(0, 5000), comment: h.comment?.slice(0, 2000) ?? null }).select('*').single();
  if (error) {
    if (missing(error)) throw new Error(NEEDS_V21_2);
    if (/Máximo 2000/.test(String(error.message))) throw new Error('Este archivo ya tiene 2000 resaltados.');
    throw error;
  }
  return data as Highlight;
}

export async function updateHighlight(id: string, patch: { color?: HlColor; comment?: string | null }): Promise<void> {
  const { error } = await supabase.from('file_highlights').update({ ...patch, ...(patch.comment !== undefined ? { comment: patch.comment?.trim().slice(0, 2000) || null } : {}) }).eq('id', id);
  if (error) throw error;
}

export async function deleteHighlight(id: string): Promise<void> {
  const { error } = await supabase.from('file_highlights').delete().eq('id', id);
  if (error) throw error;
}

/** Dirección para abrir un archivo desde un enlace de una nota. */
export async function openUrlFor(kind: FileKind, id: string): Promise<{ url: string; name: string; subjectId: string | null } | null> {
  if (kind === 'subject') {
    const { data } = await supabase.from('subject_files').select('path, name, subject_id').eq('id', id).maybeSingle();
    const f = data as { path: string; name: string; subject_id: string } | null;
    if (!f) return null;
    const url = await signedUrl(f.path);
    return url ? { url, name: f.name, subjectId: f.subject_id } : null;
  }
  const { data } = await supabase.from('project_files').select('path, name').eq('id', id).maybeSingle();
  const f = data as { path: string; name: string } | null;
  if (!f) return null;
  return { url: await fileUrl(f.path), name: f.name, subjectId: null };
}

/** Agrega Markdown al final de una nota. */
export async function appendToNote(noteId: string, md: string): Promise<void> {
  const { data, error } = await supabase.from('notes').select('content').eq('id', noteId).maybeSingle();
  if (error || !data) throw error ?? new Error('No encontré la nota.');
  const cur = String((data as { content: string | null }).content ?? '').trimEnd();
  const { error: e2 } = await supabase.from('notes').update({ content: cur ? `${cur}\n\n${md}` : md }).eq('id', noteId);
  if (e2) throw e2;
}

export async function newNoteWith(md: string, title: string, subjectId: string | null): Promise<string> {
  return addNote({ subject_id: subjectId, title: title.slice(0, 120) || 'Citas', content: md, image_path: null });
}
