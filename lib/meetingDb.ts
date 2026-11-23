// ============================================================
//  Reuniones encadenadas (v25, fase 5): la reunión anterior de la misma
//  área y cómo quiere la persona sus actas.
// ============================================================
import { supabase } from './supabase';
import { fetchPrefs, savePrefs } from './db';
import { isMeeting, cleanMinutesStyle, DEFAULT_MINUTES_STYLE, openItemsFromNote, type MeetingMinutes, type MinutesStyle } from './meeting';

export type PrevMeeting = { minutes: MeetingMinutes | null; noteMd: string | null; date: Date; noteId: string };

/**
 * La reunión anterior del área: la última nota creada antes de "before" que
 * tenga acta, o si ninguna la tiene, la última con algo abierto.
 */
export async function previousMeeting(subjectId: string, before: Date, excludeNote?: string | null): Promise<PrevMeeting | null> {
  let q = supabase.from('notes').select('id, content, created_at').eq('subject_id', subjectId).is('deleted_at', null)
    .lt('created_at', before.toISOString()).order('created_at', { ascending: false }).limit(6);
  if (excludeNote) q = q.neq('id', excludeNote);
  const { data: notes, error } = await q;
  if (error || !notes?.length) return null;
  const list = notes as { id: string; content: string | null; created_at: string }[];
  const { data: trs } = await supabase.from('note_transcripts').select('note_id, started_at, summary')
    .in('note_id', list.map((n) => n.id)).not('summary', 'is', null).order('started_at', { ascending: false }).limit(20);
  const byNote = new Map<string, { minutes: MeetingMinutes; at: string }>();
  for (const t of (trs as { note_id: string; started_at: string; summary: unknown }[] | null) ?? []) {
    if (isMeeting(t.summary) && !byNote.has(t.note_id)) byNote.set(t.note_id, { minutes: t.summary, at: t.started_at });
  }
  // La más reciente con acta o con algo abierto (en ese orden de notas).
  for (const n of list) {
    const m = byNote.get(n.id);
    if (m) return { minutes: m.minutes, noteMd: n.content, date: new Date(m.at), noteId: n.id };
    if (openItemsFromNote(n.content ?? '').length) return { minutes: null, noteMd: n.content, date: new Date(n.created_at), noteId: n.id };
  }
  return null;
}

/** Los pendientes de la reunión anterior a esta nota (para que la IA diga cuáles se cerraron). */
export async function previousOpenFor(noteId: string): Promise<string[]> {
  const { data } = await supabase.from('notes').select('subject_id, created_at').eq('id', noteId).maybeSingle();
  const n = data as { subject_id: string | null; created_at: string } | null;
  if (!n?.subject_id) return [];
  const prev = await previousMeeting(n.subject_id, new Date(n.created_at), noteId).catch(() => null);
  if (!prev) return [];
  const out = [...(prev.minutes?.tasks.map((t) => t.title) ?? []), ...(prev.minutes?.open ?? [])];
  if (prev.noteMd) out.push(...openItemsFromNote(prev.noteMd));
  return Array.from(new Set(out)).slice(0, 15);
}

let styleCache: MinutesStyle | null = null;
export async function getMinutesStyle(): Promise<MinutesStyle> {
  if (styleCache) return styleCache;
  try { const p = await fetchPrefs(); styleCache = cleanMinutesStyle(p?.minutes ?? {}); } catch { /* sin conexión */ }
  return styleCache ?? DEFAULT_MINUTES_STYLE;
}
export async function saveMinutesStyle(s: Partial<MinutesStyle>): Promise<MinutesStyle> {
  const next = cleanMinutesStyle({ ...(styleCache ?? DEFAULT_MINUTES_STYLE), ...s });
  await savePrefs({ minutes: next });
  styleCache = next;
  return next;
}
