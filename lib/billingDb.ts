// ============================================================
//  Planes y pagos (schema_v23). El plan de la persona, la prueba gratis
//  y el uso de la IA de hoy. Los pagos pasan por la función "billing".
// ============================================================
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { cardPayload, digits, type CardInput, type MyPlan, type Period } from './billing';
import { t } from './i18n';

const missing = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42883' || /does not exist|Could not find/i.test(String(e.message ?? '')));
export const NEEDS_V23 = t('Para los planes falta correr schema_v23.sql en Supabase.');

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

// ---------- Fase 2: pagos con Wompi ----------
async function fnError(error: any, fallback: string): Promise<string> {
  try { const ctx = error?.context; const j = ctx?.json ? await ctx.json() : null; if (j?.error) return j.error; } catch { /* noop */ }
  return fallback;
}
async function billing<T = any>(body: Record<string, unknown>, fallback = t('No se pudo completar el pago. Intenta de nuevo.')): Promise<T> {
  const { data, error } = await supabase.functions.invoke('billing', { body });
  if (error) throw new Error(await fnError(error, fallback));
  return data as T;
}

export type BillingConfig = { publicKey: string; env: 'sandbox' | 'production'; acceptance: { terms: { token: string; url: string }; data: { token: string; url: string } | null } };
let cfgMemo: { at: number; v: BillingConfig } | null = null;
export async function billingConfig(): Promise<BillingConfig> {
  if (cfgMemo && Date.now() - cfgMemo.at < 5 * 60_000) return cfgMemo.v;
  const v = await billing<BillingConfig>({ action: 'config' }, t('Los pagos no están disponibles en este momento.'));
  cfgMemo = { at: Date.now(), v };
  return v;
}
const wompiApi = (env: 'sandbox' | 'production') => (env === 'production' ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1');

/** Pago de un periodo por el checkout web de Wompi: devuelve a dónde ir. */
export async function startCheckout(o: { plan: 'pro' | 'team'; period: Period; seats?: number; kind?: 'checkout' | 'seats' }): Promise<{ url: string; reference: string; amount_in_cents: number }> {
  const redirect = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return billing({ action: 'checkout', ...o, redirect });
}

/** La tarjeta va directo de la app a Wompi (con la llave pública); aquí solo vuelve el token. */
export async function tokenizeCard(cfg: BillingConfig, card: CardInput): Promise<{ token: string; brand: string; last4: string }> {
  const res = await fetch(wompiApi(cfg.env) + '/tokens/cards', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.publicKey}` }, body: JSON.stringify(cardPayload(card)),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.status !== 'CREATED' || !j?.data?.id) {
    const msgs = j?.error?.messages ? Object.values(j.error.messages).flat().join(' ') : '';
    throw new Error(msgs ? t('Wompi no aceptó la tarjeta: {msgs}', { msgs }) : t('Wompi no aceptó la tarjeta. Revisa los datos.'));
  }
  return { token: j.data.id, brand: j.data.brand ?? '', last4: j.data.last_four ?? digits(card.number).slice(-4) };
}

/** Nequi: manda la solicitud al celular. La persona la acepta en la app de Nequi. */
export async function tokenizeNequi(cfg: BillingConfig, phone: string): Promise<string> {
  const res = await fetch(wompiApi(cfg.env) + '/tokens/nequi', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.publicKey}` }, body: JSON.stringify({ phone_number: digits(phone) }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.data?.id) throw new Error(t('Nequi no recibió la solicitud. Revisa el número.'));
  return j.data.id as string;
}
export async function nequiTokenStatus(cfg: BillingConfig, id: string): Promise<'PENDING' | 'APPROVED' | 'DECLINED' | string> {
  const res = await fetch(wompiApi(cfg.env) + '/tokens/nequi/' + encodeURIComponent(id), { headers: { authorization: `Bearer ${cfg.publicKey}` } });
  const j = await res.json().catch(() => null);
  return String(j?.data?.status ?? 'PENDING');
}

/** Guarda el medio y hace el primer cobro (renovación automática). */
export async function subscribe(o: { plan: 'pro' | 'team'; period: Period; seats?: number; type: 'CARD' | 'NEQUI'; token: string; acceptance_token: string; accept_personal_auth?: string | null; brand?: string; last4?: string; phone?: string }): Promise<{ reference: string; status: string; label: string }> {
  return billing({ action: 'subscribe', ...o });
}

/** Cambia el medio de la renovación (sin cobrar) y la deja prendida. */
export async function updateSource(o: { type: 'CARD' | 'NEQUI'; token: string; acceptance_token: string; accept_personal_auth?: string | null; brand?: string; last4?: string; phone?: string }): Promise<string> {
  const r = await billing<{ label: string; plan: MyPlan | null }>({ action: 'update_source', ...o });
  if (r.plan) publish(r.plan); else forgetPlan();
  return r.label;
}

export type PaymentInfo = { reference: string; status: string; kind: string; plan: string; period: string; seats: number; amount_in_cents: number; method: string | null; error: string | null };
export async function paymentStatus(q: { reference?: string; id?: string }): Promise<PaymentInfo> {
  const r = await billing<{ payment: PaymentInfo }>({ action: 'status', ...q }, t('No pudimos revisar el pago.'));
  return r.payment;
}
/** Espera hasta que el pago termine (máximo `ms`). */
export async function waitPayment(q: { reference?: string; id?: string }, ms = 90_000, onTick?: (p: PaymentInfo) => void): Promise<PaymentInfo> {
  const t0 = Date.now();
  let p = await paymentStatus(q);
  while (p.status === 'PENDING' && Date.now() - t0 < ms) {
    onTick?.(p);
    await new Promise((r) => setTimeout(r, 3000));
    p = await paymentStatus({ reference: p.reference });
  }
  return p;
}

export async function cancelRenewal(): Promise<void> { const r = await billing<{ plan: MyPlan }>({ action: 'cancel' }); publish(r.plan); }
export async function resumeRenewal(): Promise<void> { const r = await billing<{ plan: MyPlan }>({ action: 'resume' }); publish(r.plan); }

export type PaymentRow = PaymentInfo & { id: string; created_at: string; settled_at: string | null };
export async function getPayments(): Promise<PaymentRow[]> {
  const { data, error } = await supabase.from('billing_payments').select('id, reference, status, kind, plan, period, seats, amount_in_cents, method, error, created_at, settled_at')
    .order('created_at', { ascending: false }).limit(50);
  if (error) return [];
  return ((data as PaymentRow[]) ?? []).filter((p) => p.status !== 'PENDING' || Date.now() - new Date(p.created_at).getTime() < 86_400_000);
}

export async function getSeats(): Promise<string[]> {
  const { data, error } = await supabase.from('team_seats').select('email').order('added_at');
  if (error) return [];
  return ((data as { email: string }[]) ?? []).map((r) => r.email);
}
export async function addSeat(email: string): Promise<void> {
  const { error } = await supabase.rpc('team_seat_add', { p_email: email.trim() });
  if (error) throw new Error(String(error.message));
  forgetPlan();
}
export async function removeSeat(email: string): Promise<void> {
  const { error } = await supabase.rpc('team_seat_remove', { p_email: email });
  if (error) throw new Error(String(error.message));
  forgetPlan();
}
