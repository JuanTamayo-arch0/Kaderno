// ============================================================
//  Registro de horas (schema_v23, fase 5): leer el tiempo del periodo,
//  anotar horas a mano, tarifas por hora y las horas del equipo.
// ============================================================
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { fetchPrefs, savePrefs } from './db';
import type { HourSession, Rates } from './hours';

const missing = (e: any) => !!e && (e.code === '42703' || e.code === 'PGRST204' || e.code === '42883' || e.code === 'PGRST202' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V23_5 = 'Para el registro de horas por proyecto falta correr schema_v23.sql (fase 5) en Supabase.';

/** Sesiones del periodo [from, to). Sin la fase 5, sin proyecto ni nota. */
export async function getHours(from: Date, to: Date): Promise<{ list: HourSession[]; v5: boolean }> {
  const q = (cols: string) => supabase.from('focus_sessions').select(cols).gte('created_at', from.toISOString()).lt('created_at', to.toISOString()).order('created_at').limit(3000);
  let { data, error } = await q('id, minutes, created_at, subject_id, project_id, project_task_id, assignment_id, note, source');
  if (error && missing(error)) ({ data, error } = await q('id, minutes, created_at, subject_id, project_id, assignment_id, note, source')); // sin schema_v24
  if (error && missing(error)) {
    const r = await q('id, minutes, created_at, subject_id, assignment_id');
    if (r.error) throw r.error;
    return { list: ((r.data as any[]) ?? []).map((x) => ({ ...x, project_id: null, note: null, source: 'focus' })), v5: false };
  }
  if (error) throw error;
  return { list: (data as unknown as HourSession[]) ?? [], v5: true };
}

export async function addManualHours(o: { date: Date; minutes: number; subject_id: string | null; project_id: string | null; note: string }): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const at = new Date(o.date); if (at.getHours() === 0 && at.getMinutes() === 0) at.setHours(12);
  const { error } = await supabase.from('focus_sessions').insert({
    user_id: u.user?.id, minutes: Math.round(o.minutes), subject_id: o.subject_id, project_id: o.project_id,
    note: o.note.trim().slice(0, 300) || null, source: 'manual', created_at: at.toISOString(),
  });
  if (error) { if (missing(error)) throw new Error(NEEDS_V23_5); throw new Error(String(error.message)); }
}

export async function deleteHours(id: string): Promise<void> {
  const { error } = await supabase.from('focus_sessions').delete().eq('id', id);
  if (error) throw error;
}

/** Tarifas por hora (por área o proyecto), en las preferencias. */
export async function getRates(): Promise<Rates> {
  const p = await fetchPrefs().catch(() => null);
  const r = p?.work?.rates;
  return r && typeof r === 'object' ? r : {};
}
export async function setRate(id: string, rate: number | null): Promise<Rates> {
  const p = (await fetchPrefs().catch(() => null)) ?? {};
  const rates: Rates = { ...(p.work?.rates ?? {}) };
  if (rate && rate > 0) rates[id] = Math.round(rate); else delete rates[id];
  await savePrefs({ work: { ...(p.work ?? {}), rates } });
  return rates;
}

export type TeamHours = { user_id: string; name: string; minutes: number; sessions: number };
export async function projectHours(projectId: string, from: Date, to: Date): Promise<TeamHours[]> {
  const { data, error } = await supabase.rpc('project_hours', { p_project: projectId, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) { if (missing(error)) throw new Error(NEEDS_V23_5); throw new Error(String(error.message)); }
  return ((data as any[]) ?? []).map((r) => ({ ...r, minutes: Number(r.minutes), sessions: Number(r.sessions) }));
}

/** Abre el informe para imprimir o guardar como PDF. */
export async function printReport(html: string, title: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const w = window.open('', '_blank');
    if (!w) throw new Error('El navegador bloqueó la ventana del informe. Permite las ventanas emergentes para Kaderno.');
    w.document.open(); w.document.write(html); w.document.close(); w.document.title = title;
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* noop */ } }, 300);
    return;
  }
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title });
}

// ---------- v25, fase 2: cronómetro y hoja semanal ----------
/** Guarda un tramo del cronómetro. Sin schema_v24 se guarda como horas a mano de ahora. */
export async function addTimerSession(o: { minutes: number; project_id: string | null; project_task_id: string | null; subject_id: string | null; assignment_id: string | null; note: string }): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const row: Record<string, unknown> = { user_id: u.user?.id, minutes: Math.round(o.minutes), project_id: o.project_id, project_task_id: o.project_task_id,
    subject_id: o.subject_id, assignment_id: o.assignment_id, note: o.note.slice(0, 300) || null, source: 'timer' };
  let { error } = await supabase.from('focus_sessions').insert(row);
  if (error && (missing(error) || error.code === '23514')) {
    delete row.project_task_id; row.source = 'manual'; row.created_at = new Date().toISOString();
    ({ error } = await supabase.from('focus_sessions').insert(row));
  }
  if (error) throw new Error(String(error.message));
}

/** Cambia la duración de un registro (solo los anotados a mano). */
export async function updateHours(id: string, minutes: number): Promise<void> {
  const { error } = await supabase.from('focus_sessions').update({ minutes: Math.round(minutes) }).eq('id', id);
  if (error) throw new Error(String(error.message));
}

export type Timesheet = { project_id: string; user_id: string; week_start: string; status: 'enviada' | 'aprobada' | 'devuelta'; minutes: number; note: string | null; submitted_at: string; decided_at: string | null };
export async function getTimesheets(weekStart: string, projectId?: string): Promise<Timesheet[]> {
  let q = supabase.from('timesheet_weeks').select('*').eq('week_start', weekStart);
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) return [];
  return (data as Timesheet[]) ?? [];
}
export async function submitWeek(projectId: string, weekStart: string, note?: string): Promise<Timesheet> {
  const { data, error } = await supabase.rpc('timesheet_submit', { p_project: projectId, p_week: weekStart, p_note: note ?? null });
  if (error) { if (missing(error)) throw new Error('Para mandar horas falta correr schema_v24.sql en Supabase.'); throw new Error(String(error.message)); }
  return data as Timesheet;
}
export async function decideWeek(projectId: string, userId: string, weekStart: string, status: 'aprobada' | 'devuelta', note?: string): Promise<Timesheet> {
  const { data, error } = await supabase.rpc('timesheet_decide', { p_project: projectId, p_user: userId, p_week: weekStart, p_status: status, p_note: note ?? null });
  if (error) throw new Error(String(error.message));
  return data as Timesheet;
}
