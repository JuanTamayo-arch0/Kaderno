// ============================================================
//  Entradas y clientes (v25, fase 4): el formulario de solicitudes y la
//  vista del avance, públicos y sin cuenta (schema_v24, fase 4).
// ============================================================
import { Linking, Platform } from 'react-native';
import { supabase } from './supabase';

export type LinkKind = 'form' | 'view';
export type ProjectLink = { project_id: string; kind: LinkKind; token: string; enabled: boolean; intro: string | null };
const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42883' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V24_4 = 'Para los enlaces del cliente falta correr schema_v24.sql (fase 4) en Supabase.';

export function linkUrl(kind: LinkKind, token: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' && window.location ? window.location.origin : 'https://kaderno.app');
  return `${base}/${kind === 'form' ? 'solicitar' : 'avance'}/${token}`;
}

export async function getLinks(projectId: string): Promise<ProjectLink[] | null> {
  const { data, error } = await supabase.from('project_links').select('*').eq('project_id', projectId);
  if (error) { if (missing(error)) return null; throw new Error(String(error.message)); }
  return (data as ProjectLink[]) ?? [];
}
export async function setLink(projectId: string, kind: LinkKind, enabled: boolean, opts: { rotate?: boolean; intro?: string | null } = {}): Promise<ProjectLink> {
  const { data, error } = await supabase.rpc('project_link_set', { p_project: projectId, p_kind: kind, p_enabled: enabled, p_rotate: !!opts.rotate, p_intro: opts.intro ?? null });
  if (error) { if (missing(error)) throw new Error(NEEDS_V24_4); throw new Error(String(error.message)); }
  return data as ProjectLink;
}

export type FormInfo = { name: string; icon: string; color: string; intro: string | null };
export async function publicFormInfo(token: string): Promise<FormInfo | null> {
  const { data, error } = await supabase.rpc('public_form_info', { p_token: token });
  if (error) throw new Error('No pudimos abrir el formulario.');
  return (data as FormInfo) ?? null;
}
export async function submitRequest(token: string, o: { name: string; email: string; title: string; detail: string; due: string | null; trap: string }): Promise<void> {
  const { error } = await supabase.rpc('public_form_submit', { p_token: token, p_name: o.name, p_email: o.email, p_title: o.title, p_detail: o.detail, p_due: o.due, p_trap: o.trap });
  if (error) throw new Error(String(error.message || 'No se pudo enviar. Intenta de nuevo.'));
}

export type PublicView = {
  name: string; icon: string; color: string; intro: string | null; today: string; total: number; done: number;
  columns: { label: string; color: string; done: boolean; count: number }[];
  next: { title: string; due: string }[]; delivered: { title: string; at: string }[];
  update: { health: 'en_curso' | 'en_riesgo' | 'atrasado'; body: string; at: string } | null;
};
export async function publicView(token: string): Promise<PublicView | null> {
  const { data, error } = await supabase.rpc('public_project_view', { p_token: token });
  if (error) throw new Error('No pudimos abrir el avance.');
  return (data as PublicView) ?? null;
}

/** Abre WhatsApp con el texto listo (sin número: la persona escoge el chat). */
export function openWhatsApp(text: string) {
  const url = Platform.OS === 'web' ? 'https://wa.me/?text=' + encodeURIComponent(text) : 'whatsapp://send?text=' + encodeURIComponent(text);
  Linking.openURL(url).catch(() => Linking.openURL('https://wa.me/?text=' + encodeURIComponent(text)));
}
