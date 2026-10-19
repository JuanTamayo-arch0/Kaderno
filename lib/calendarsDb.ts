// ============================================================
//  Calendarios externos (schema_v20, fase 3): Google Calendar u Outlook
//  por su dirección iCal secreta. Solo lectura: Kaderno nunca escribe allá.
//  Y compartir una nota con un enlace de solo lectura.
// ============================================================
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import type { ExtEvent } from '../components/day/Timeline';

const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V20_3 = 'Para esto falta correr schema_v20.sql (fase 3) en Supabase.';

export type ExtCalendar = { id: string; name: string; color: string; last_sync: string | null; last_error: string | null };
export const CAL_COLORS = ['#8a93a6', '#4f8cff', '#2bb673', '#f5a524', '#e5484d', '#a855f7'];

export async function getCalendars(): Promise<ExtCalendar[]> {
  const { data, error } = await supabase.from('external_calendars').select('id, name, color, last_sync, last_error').order('created_at');
  if (error) return [];
  return (data as ExtCalendar[]) ?? [];
}

async function invokeError(error: any): Promise<string> {
  try { const ctx = error?.context; const j = ctx?.json ? await ctx.json() : null; if (j?.error) return j.error; } catch { /* noop */ }
  return 'No se pudo leer el calendario. Intenta de nuevo.';
}

/** Lee el calendario ahora. Devuelve cuántos eventos trajo. */
export async function syncCalendar(id: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke('ical-import', { body: { calendar_id: id } });
  if (error) throw new Error(await invokeError(error));
  return Number((data as any)?.events ?? 0);
}

export function looksLikeCalendarUrl(url: string): boolean {
  return /^(https|webcals?):\/\/[^\s/]+\.[^\s/]+\/\S+/i.test(url.trim());
}

export async function addCalendar(name: string, url: string, color: string): Promise<{ id: string; events: number | null; error: string | null }> {
  const clean = url.trim();
  if (!looksLikeCalendarUrl(clean)) throw new Error('Pega la dirección completa (empieza con https:// o webcal://).');
  const { data, error } = await supabase.from('external_calendars').insert({ name: name.trim().slice(0, 60) || 'Mi calendario', url: clean, color }).select('id').single();
  if (error) {
    if (missing(error)) throw new Error(NEEDS_V20_3);
    if (/(hasta|Máximo) 5/i.test(String(error.message))) throw new Error('Puedes conectar hasta 5 calendarios.');
    throw error;
  }
  const id = (data as { id: string }).id;
  try { return { id, events: await syncCalendar(id), error: null }; }
  catch (e) { return { id, events: null, error: (e as Error).message }; }
}

export async function updateCalendar(id: string, patch: { name?: string; color?: string }): Promise<void> {
  const { error } = await supabase.from('external_calendars').update(patch).eq('id', id);
  if (error) throw error;
}

export async function removeCalendar(id: string): Promise<void> {
  const { error } = await supabase.from('external_calendars').delete().eq('id', id);
  if (error) throw error;
}

/** Eventos entre dos fechas, con el color de su calendario. */
export async function getEvents(from: Date, to: Date): Promise<ExtEvent[]> {
  const { data, error } = await supabase.from('external_events').select('uid, calendar_id, title, start_at, end_at, all_day, external_calendars(color, name)')
    .lt('start_at', to.toISOString()).gt('end_at', from.toISOString()).order('start_at').limit(400);
  if (error) return [];
  return ((data as any[]) ?? []).map((e) => ({
    id: `${e.calendar_id}:${e.uid}`, title: e.title, start: e.start_at, end: e.end_at, all_day: !!e.all_day,
    color: e.external_calendars?.color ?? null,
  }));
}

// ---------- Compartir una nota ----------
export function sharedNoteUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://kaderno.app');
  return `${base}/compartida/${token}`;
}

export async function getShareToken(noteId: string): Promise<string | null> {
  const { data, error } = await supabase.from('notes').select('share_token').eq('id', noteId).maybeSingle();
  if (error) return null;
  return (data as { share_token?: string | null } | null)?.share_token ?? null;
}

function uuid(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16); c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Activa el enlace (o lo cambia por uno nuevo). */
export async function enableShare(noteId: string): Promise<string> {
  const token = uuid();
  const { error } = await supabase.from('notes').update({ share_token: token }).eq('id', noteId);
  if (error) { if (missing(error)) throw new Error(NEEDS_V20_3); throw error; }
  return token;
}

export async function disableShare(noteId: string): Promise<void> {
  const { error } = await supabase.from('notes').update({ share_token: null }).eq('id', noteId);
  if (error && !missing(error)) throw error;
}

export type SharedNote = { title: string; content: string; updated_at: string | null };
/** La nota pública de un enlace (sin sesión). */
export async function fetchSharedNote(token: string): Promise<SharedNote> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/shared-note?t=${encodeURIComponent(token)}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error ?? 'Este enlace ya no funciona.');
  return j as SharedNote;
}
