// ============================================================
//  Transcripciones de clase (schema_v21, fase 1).
// ============================================================
import { supabase } from './supabase';
import type { ClassSummary, Mark, Segment } from './classRec';

export type Transcript = {
  id: string; note_id: string; started_at: string; duration_s: number; lang: string;
  segments: Segment[]; marks: Mark[]; summary: ClassSummary | null;
};

const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V21_1 = 'Para grabar la clase falta correr schema_v21.sql (fase 1) en Supabase.';

export async function getTranscripts(noteId: string): Promise<Transcript[]> {
  const { data, error } = await supabase.from('note_transcripts').select('id, note_id, started_at, duration_s, lang, segments, marks, summary')
    .eq('note_id', noteId).order('started_at', { ascending: false });
  if (error) return [];
  return (data as Transcript[]) ?? [];
}

export async function createTranscript(noteId: string, lang: string): Promise<string> {
  const { data, error } = await supabase.from('note_transcripts').insert({ note_id: noteId, lang }).select('id').single();
  if (error) {
    if (missing(error)) throw new Error(NEEDS_V21_1);
    if (/Máximo 10/.test(String(error.message))) throw new Error('Esta nota ya tiene 10 grabaciones. Borra alguna o usa otra nota.');
    throw error;
  }
  return (data as { id: string }).id;
}

export async function saveTranscript(id: string, patch: { segments?: Segment[]; marks?: Mark[]; duration_s?: number; summary?: ClassSummary | null }): Promise<void> {
  const clean = { ...patch, ...(patch.duration_s != null ? { duration_s: Math.min(14400, Math.max(0, Math.round(patch.duration_s))) } : {}) };
  const { error } = await supabase.from('note_transcripts').update(clean).eq('id', id);
  if (error) throw error;
}

export async function deleteTranscript(id: string): Promise<void> {
  const { error } = await supabase.from('note_transcripts').delete().eq('id', id);
  if (error) throw error;
}

export async function summarizeClass(transcript: string, notesMd: string, subject: string | null): Promise<ClassSummary> {
  const { data, error } = await supabase.functions.invoke('ai', { body: { task: 'class_summary', content: transcript, notes_md: notesMd, subject } });
  if (error) {
    let msg = '';
    try { const ctx: any = (error as any).context; const j = ctx?.json ? await ctx.json() : null; msg = j?.error ?? ''; } catch { /* noop */ }
    throw new Error(msg || 'No se pudo resumir la clase. Intenta de nuevo.');
  }
  return (data as { summary: ClassSummary }).summary;
}
