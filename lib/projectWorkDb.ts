// ============================================================
//  Proyectos de trabajo (schema_v24, fase 3): reglas y estado del proyecto.
// ============================================================
import { supabase } from './supabase';
import type { Health, Rule } from './projectWork';

const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V24_3 = 'Para las reglas y el estado del proyecto falta correr schema_v24.sql (fase 3) en Supabase.';
const fail = (e: any): never => { throw new Error(missing(e) ? NEEDS_V24_3 : String(e?.message ?? e)); };

export async function getRules(projectId: string): Promise<Rule[] | null> {
  const { data, error } = await supabase.from('project_rules').select('*').eq('project_id', projectId).order('created_at');
  if (error) { if (missing(error)) return null; fail(error); }
  return (data as Rule[]) ?? [];
}
export async function addRule(r: Omit<Rule, 'id' | 'enabled'>): Promise<Rule> {
  const { data, error } = await supabase.from('project_rules').insert({ ...r, enabled: true }).select('*').single();
  if (error) fail(error);
  return data as Rule;
}
export async function setRuleEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('project_rules').update({ enabled }).eq('id', id);
  if (error) fail(error);
}
export async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.from('project_rules').delete().eq('id', id);
  if (error) fail(error);
}

export type ProjectUpdate = { id: string; project_id: string; author_id: string; health: Health; body: string; created_at: string };
export async function getUpdates(projectId: string): Promise<ProjectUpdate[] | null> {
  const { data, error } = await supabase.from('project_updates').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(30);
  if (error) { if (missing(error)) return null; fail(error); }
  return (data as ProjectUpdate[]) ?? [];
}
export async function addUpdate(projectId: string, health: Health, body: string): Promise<ProjectUpdate> {
  const { data, error } = await supabase.from('project_updates').insert({ project_id: projectId, health, body: body.trim().slice(0, 2000) }).select('*').single();
  if (error) fail(error);
  return data as ProjectUpdate;
}
export async function deleteUpdate(id: string): Promise<void> {
  const { error } = await supabase.from('project_updates').delete().eq('id', id);
  if (error) fail(error);
}
/** La IA redacta el estado con el informe semanal (usa el cupo de resúmenes). */
export async function draftUpdate(reportMd: string): Promise<{ health: Health | null; body: string }> {
  const { data, error } = await supabase.functions.invoke('ai', { body: { task: 'project_update', content: reportMd } });
  if (error) {
    let msg = '';
    try { const ctx: any = (error as any).context; const j = ctx?.json ? await ctx.json() : null; msg = j?.error ?? ''; } catch { /* noop */ }
    throw new Error(msg || 'No se pudo redactar el estado. Intenta de nuevo.');
  }
  return data as { health: Health | null; body: string };
}
