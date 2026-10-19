// ============================================================
//  Notas conectadas (schema_v20, fase 2): enlaces, "Mencionada en",
//  relacionadas, plantillas, nota de la clase y tarjetas escritas con "::".
// ============================================================
import { supabase, currentUserId } from './supabase';
import { addNote, isMissingColumn } from './db';
import { builtinTemplate, classNoteTitle, diffNoteCards, parseCardLines, type NoteCard } from './noteLinks';

const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || /does not exist|Could not find/i.test(String(e.message ?? '')));

export type NoteRef = { id: string; title: string; subject_id: string | null };

/** Notas cuyo título contiene el texto (para [[ ). */
export async function searchNoteTitles(q: string, exclude?: string | null): Promise<NoteRef[]> {
  let query = supabase.from('notes').select('id, title, subject_id').is('deleted_at', null).order('updated_at', { ascending: false, nullsFirst: false }).limit(8);
  if (q.trim()) query = query.ilike('title', `%${q.trim().replace(/[%_]/g, '')}%`);
  if (exclude) query = query.neq('id', exclude);
  const { data, error } = await query;
  if (error) return [];
  return ((data as NoteRef[]) ?? []).map((n) => ({ ...n, title: n.title || 'Nota sin título' }));
}

/** "Mencionada en": notas que enlazan a esta. */
export async function getBacklinks(noteId: string): Promise<NoteRef[]> {
  const { data, error } = await supabase.from('note_links').select('from_note').eq('to_note', noteId);
  if (error || !data?.length) return [];
  const ids = (data as { from_note: string }[]).map((r) => r.from_note);
  const { data: notes } = await supabase.from('notes').select('id, title, subject_id').in('id', ids).is('deleted_at', null);
  return ((notes as NoteRef[]) ?? []).map((n) => ({ ...n, title: n.title || 'Nota sin título' }));
}

/** Notas parecidas por contenido (vectores del Oráculo). */
export async function getRelated(noteId: string, count = 4): Promise<(NoteRef & { similarity: number })[]> {
  const { data, error } = await supabase.rpc('related_notes', { p_note: noteId, p_count: count + 2 });
  if (error) return [];
  return ((data as any[]) ?? []).filter((r) => r.similarity > 0.55).slice(0, count)
    .map((r) => ({ id: r.note_id, title: r.title || 'Nota sin título', subject_id: r.subject_id, similarity: r.similarity }));
}

// ---------- Plantillas ----------
export type MyTemplate = { id: string; name: string; content: string };
export async function getTemplates(): Promise<MyTemplate[]> {
  const { data, error } = await supabase.from('note_templates').select('id, name, content').order('created_at', { ascending: false });
  if (error) return [];
  return (data as MyTemplate[]) ?? [];
}
export async function saveTemplate(name: string, content: string): Promise<void> {
  const { error } = await supabase.from('note_templates').insert({ name: name.trim().slice(0, 60) || 'Plantilla', content: content.slice(0, 20000) });
  if (error) {
    if (missing(error)) throw new Error('Para las plantillas falta correr schema_v20.sql (fase 2) en Supabase.');
    throw error;
  }
}
export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('note_templates').delete().eq('id', id);
  if (error) throw error;
}
export async function setSubjectTemplate(subjectId: string, key: string | null): Promise<void> {
  const { error } = await supabase.from('subjects').update({ default_template: key }).eq('id', subjectId);
  if (error && !isMissingColumn(error)) throw error;
}
export async function subjectTemplate(subjectId: string): Promise<string | null> {
  const { data, error } = await supabase.from('subjects').select('default_template').eq('id', subjectId).maybeSingle();
  if (error) return null;
  return (data as { default_template?: string | null } | null)?.default_template ?? null;
}
/** Contenido de una plantilla (de fábrica o propia). */
export async function templateContent(key: string | null): Promise<string> {
  if (!key) return '';
  const b = builtinTemplate(key);
  if (b) return b.content;
  const mine = (await getTemplates()).find((t) => t.id === key);
  return mine?.content ?? '';
}

/** Abre (o crea) la nota de la clase de hoy en esa materia, con su plantilla. */
export async function openClassNote(subjectId: string, now = new Date()): Promise<{ id: string; created: boolean }> {
  const title = classNoteTitle(now);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const { data } = await supabase.from('notes').select('id').eq('subject_id', subjectId).eq('title', title).is('deleted_at', null)
    .gte('created_at', start.toISOString()).limit(1);
  const found = (data as { id: string }[] | null)?.[0];
  if (found) return { id: found.id, created: false };
  const key = (await subjectTemplate(subjectId)) ?? 'cornell';
  const id = await addNote({ subject_id: subjectId, title, content: await templateContent(key), image_path: null });
  return { id, created: true };
}

// ---------- Tarjetas escritas en la nota ----------
/** Compara la nota con sus tarjetas: actualiza las cambiadas y devuelve las nuevas para revisar. */
export async function syncNoteCards(noteId: string, md: string): Promise<{ create: NoteCard[]; updated: number }> {
  const lines = parseCardLines(md);
  if (!lines.length) return { create: [], updated: 0 };
  let { data, error } = await supabase.from('flashcards').select('id, front, back, note_line').eq('note_id', noteId);
  if (error && isMissingColumn(error)) ({ data, error } = await supabase.from('flashcards').select('id, front, back').eq('note_id', noteId) as any);
  if (error) return { create: [], updated: 0 };
  const d = diffNoteCards(lines, (data as any[]) ?? []);
  let updated = 0;
  for (const u of d.update) {
    const { error: e } = await supabase.from('flashcards').update({ front: u.front, back: u.back, note_line: u.line }).eq('id', u.id);
    if (!e) updated++;
  }
  return { create: d.create, updated };
}

/** Guarda las tarjetas nuevas de la nota con su línea de origen. */
export async function saveNoteCards(cards: { kind: 'basic' | 'cloze'; front: string; back: string; line?: string }[], noteId: string, subjectId: string | null): Promise<number> {
  const u = await currentUserId();
  if (!u || !cards.length) return 0;
  const rows = cards.map((c) => ({ user_id: u, note_id: noteId, subject_id: subjectId, kind: c.kind, front: c.front, back: c.kind === 'cloze' ? '' : c.back, fsrs_state: 0, created_from: 'note', note_line: c.line ?? null }));
  let { error } = await supabase.from('flashcards').insert(rows);
  if (error && (isMissingColumn(error) || /flashcards_from_chk/.test(String(error.message)))) {
    ({ error } = await supabase.from('flashcards').insert(rows.map(({ note_line, ...r }) => ({ ...r, created_from: 'manual' }))));
  }
  if (error) throw error;
  return rows.length;
}
