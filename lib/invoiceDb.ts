// ============================================================
//  Cobrar (schema_v24, fase 1): tus datos, clientes, cuentas de cobro y
//  presupuesto de horas de los proyectos.
// ============================================================
import { supabase } from './supabase';
import type { BillingProfile, Client, Invoice, InvoiceItem } from './invoice';
import { t } from './i18n';

const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42883' || e.code === '42703' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V24 = t('Para cobrar falta correr schema_v24.sql en Supabase.');
const fail = (e: any): never => { throw new Error(missing(e) ? NEEDS_V24 : String(e?.message ?? e)); };
const me = async () => (await supabase.auth.getUser()).data.user?.id ?? null;

export async function getProfile(): Promise<BillingProfile | null> {
  const { data, error } = await supabase.from('billing_profile').select('*').maybeSingle();
  if (error) fail(error);
  return (data as BillingProfile) ?? null;
}
export async function saveProfile(p: Partial<BillingProfile>): Promise<void> {
  const user_id = await me();
  const clean: Record<string, unknown> = { user_id, updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(p)) clean[k] = typeof v === 'string' ? (v.trim() || null) : v;
  if (typeof clean.prefix !== 'string') clean.prefix = (p.prefix ?? 'CC');
  const { error } = await supabase.from('billing_profile').upsert(clean);
  if (error) fail(error);
}

export async function getClients(): Promise<Client[]> {
  const { data, error } = await supabase.from('clients').select('*').order('archived').order('name');
  if (error) { if (missing(error)) return []; fail(error); }
  return (data as Client[]) ?? [];
}
export async function saveClient(c: Partial<Client> & { name: string }): Promise<Client> {
  const row: Record<string, unknown> = {
    name: c.name.trim(), tax_id: c.tax_id?.trim() || null, email: c.email?.trim() || null, phone: c.phone?.trim() || null,
    address: c.address?.trim() || null, rate: c.rate && c.rate > 0 ? Math.round(c.rate) : null,
    project_ids: c.project_ids ?? [], subject_ids: c.subject_ids ?? [], archived: !!c.archived,
  };
  const q = c.id ? supabase.from('clients').update(row).eq('id', c.id) : supabase.from('clients').insert({ ...row, user_id: await me() });
  const { data, error } = await q.select('*').single();
  if (error) fail(error);
  return data as Client;
}
export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) fail(error);
}

export async function getInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) { if (missing(error)) return []; fail(error); }
  return (data as Invoice[]) ?? [];
}
export async function createInvoice(o: { client_id: string; items: InvoiceItem[]; period_from?: string | null; period_to?: string | null; issued_on?: string; note?: string }): Promise<Invoice> {
  const { data, error } = await supabase.rpc('invoice_create', { p: o });
  if (error) fail(error);
  return data as Invoice;
}
export async function setInvoiceStatus(id: string, status: Invoice['status']): Promise<Invoice> {
  const { data, error } = await supabase.rpc('invoice_set_status', { p_id: id, p_status: status });
  if (error) fail(error);
  return data as Invoice;
}

export type Budget = { budget_minutes: number | null; used_minutes: number };
export async function getBudget(projectId: string): Promise<Budget | null> {
  const { data, error } = await supabase.rpc('project_budget', { p_project: projectId });
  if (error) { if (missing(error)) return null; fail(error); }
  return data as Budget;
}
export async function setBudget(projectId: string, minutes: number | null): Promise<void> {
  const { error } = await supabase.rpc('project_set_budget', { p_project: projectId, p_minutes: minutes });
  if (error) fail(error);
}
