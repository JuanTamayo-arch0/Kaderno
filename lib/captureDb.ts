// ============================================================
//  Capturar (v22, fase 4): leer una página y guardar la nota (nueva o
//  agregada a otra), con los dibujos y las fotos.
// ============================================================
import { supabase } from './supabase';
import { addNote, addNoteImage, uploadPhoto, indexNote } from './db';
import { appendToNote } from './highlightsDb';
import type { Figure } from './capture';

export type ReadResult = { markdown: string; figures: Figure[]; title: string | null };

export async function readPage(base64: string, mode: 'notes' | 'board' | 'plain'): Promise<ReadResult> {
  const { data, error } = await supabase.functions.invoke('ocr', { body: { imageBase64: base64, mediaType: 'image/jpeg', mode } });
  if (error) {
    let msg = '';
    try { const ctx: any = (error as any).context; const j = ctx?.json ? await ctx.json() : null; msg = j?.error ?? ''; } catch { /* noop */ }
    throw new Error(msg || 'No se pudo leer la foto.');
  }
  const d = data as any;
  return { markdown: String(d?.markdown ?? d?.text ?? ''), figures: Array.isArray(d?.figures) ? d.figures : [], title: d?.title ?? null };
}

/** Guarda: nota nueva (con la primera foto como original y las demás adjuntas) o al final de otra nota. */
export async function saveCapture(o: {
  dest: { kind: 'new' } | { kind: 'note'; id: string };
  title: string; subjectId: string | null; markdown: string; photos: string[]; keepPhotos: boolean;
}): Promise<string> {
  if (o.dest.kind === 'new') {
    const path = o.keepPhotos && o.photos[0] ? await uploadPhoto(o.photos[0]) : null;
    const id = await addNote({ subject_id: o.subjectId, title: o.title.trim() || 'Nota sin título', content: o.markdown, image_path: path });
    if (o.keepPhotos) for (const p of o.photos.slice(1)) { try { await addNoteImage(id, p); } catch { /* la nota ya quedó */ } }
    indexNote(id, o.markdown, o.subjectId);
    return id;
  }
  await appendToNote(o.dest.id, o.markdown);
  if (o.keepPhotos) for (const p of o.photos) { try { await addNoteImage(o.dest.id, p); } catch { /* noop */ } }
  return o.dest.id;
}

export { uploadPhoto };
