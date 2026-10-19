// ============================================================
//  Cierre del día (schema_v20, fase 1): lo hecho, lo movido y una línea.
// ============================================================
import { supabase, currentUserId } from './supabase';

export type DayReview = { day: string; done: { tasks?: number; focus?: number; cards?: number }; moved: { id: string; to: string }[]; note: string | null };
const missingTable = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(String(e.message ?? '')));
let DAY_DB: boolean | null = null;
export function hasDayDb(): boolean { return DAY_DB !== false; }

export async function getDayReview(day: string): Promise<DayReview | null> {
  if (DAY_DB === false) return null;
  const { data, error } = await supabase.from('day_reviews').select('day, done, moved, note').eq('day', day).maybeSingle();
  if (error) { if (missingTable(error)) DAY_DB = false; return null; }
  DAY_DB = true;
  return (data as DayReview | null) ?? null;
}

export async function saveDayReview(r: DayReview): Promise<void> {
  const u = await currentUserId();
  if (!u) return;
  const { error } = await supabase.from('day_reviews').upsert({ user_id: u, ...r, note: r.note?.trim() ? r.note.trim().slice(0, 500) : null }, { onConflict: 'user_id,day' });
  if (error) {
    if (missingTable(error)) { DAY_DB = false; throw new Error('Para cerrar el día falta correr schema_v20.sql en Supabase.'); }
    throw error;
  }
}

/** Las líneas del diario de unos días (para el ritual del lunes). */
export async function getDiary(from: string, to: string): Promise<{ day: string; note: string }[]> {
  if (DAY_DB === false) return [];
  const { data, error } = await supabase.from('day_reviews').select('day, note').gte('day', from).lt('day', to).not('note', 'is', null).order('day');
  if (error) return [];
  return ((data as { day: string; note: string }[]) ?? []).filter((r) => r.note);
}
