// ============================================================
//  Planes y pagos (schema_v23). El plan de la persona, la prueba gratis
//  y el uso de la IA de hoy. Los pagos pasan por la función "billing".
// ============================================================
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { MyPlan } from './billing';

const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42883' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V23 = 'Para los planes falta correr schema_v23.sql en Supabase.';

let memo: { at: number; value: MyPlan | null } | null = null;
const listeners = new Set<(p: MyPlan | null) => void>();
function publish(p: MyPlan | null) { memo = { at: Date.now(), value: p }; listeners.forEach((f) => f(p)); }

/** El plan de hoy. null si la base todavía no tiene schema_v23. */
export async function getMyPlan(force = false): Promise<MyPlan | null> {
  if (!force && memo && Date.now() - memo.at < 30_000) return memo.value;
  const { data, error } = await supabase.rpc('my_plan');
  if (error) { if (missing(error)) { publish(null); return null; } throw error; }
  const p = data as MyPlan;
  publish(p);
  return p;
}
export function forgetPlan() { memo = null; }

/** Hook: el plan (se actualiza cuando cambia en cualquier pantalla). */
export function usePlan(): { plan: MyPlan | null; loading: boolean; reload: () => Promise<void> } {
  const [plan, setPlan] = useState<MyPlan | null>(memo?.value ?? null);
  const [loading, setLoading] = useState(!memo);
  useEffect(() => {
    listeners.add(setPlan);
    getMyPlan().then(setPlan).catch(() => {}).finally(() => setLoading(false));
    return () => { listeners.delete(setPlan); };
  }, []);
  return { plan, loading, reload: async () => { setPlan(await getMyPlan(true)); } };
}

export async function startTrial(): Promise<MyPlan> {
  const { data, error } = await supabase.rpc('start_trial');
  if (error) { if (missing(error)) throw new Error(NEEDS_V23); throw new Error(String(error.message)); }
  publish(data as MyPlan);
  return data as MyPlan;
}

/** Usos de la IA de hoy por tarea (de ai_usage, schema_v19). */
export async function usageToday(): Promise<Record<string, number>> {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase.from('ai_usage').select('task, n').eq('day', day);
  if (error) return {};
  return Object.fromEntries(((data as { task: string; n: number }[]) ?? []).map((r) => [r.task, r.n]));
}
