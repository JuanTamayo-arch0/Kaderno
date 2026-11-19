// ============================================================
//  Wompi (v24, fase 2). TypeScript puro: lo usan las funciones "billing",
//  "billing-webhook" y "billing-charge", y las pruebas de la app.
//  Documentación: docs.wompi.co (Colombia): widget y checkout web, fuentes
//  de pago, tokens de aceptación, eventos y datos de prueba en sandbox.
// ============================================================

export type WompiEnv = 'sandbox' | 'production';
export const apiBase = (env: WompiEnv) => (env === 'production' ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1');
export const CHECKOUT_URL = 'https://checkout.wompi.co/p/';
export const envOfKey = (publicKey: string): WompiEnv => (/^pub_prod_/.test(publicKey) ? 'production' : 'sandbox');

export type TxStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR';
export const FINAL: TxStatus[] = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'];
export const isFinal = (s: string | null | undefined) => FINAL.includes(String(s) as TxStatus);

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Firma de integridad: SHA256 de referencia + monto en centavos + moneda (+ vencimiento) + secreto de integridad. */
export function integritySignature(reference: string, amountInCents: number, currency: string, secret: string, expirationTime?: string): Promise<string> {
  return sha256Hex(`${reference}${amountInCents}${currency}${expirationTime ?? ''}${secret}`);
}

/** Lee "transaction.id" dentro de data. */
function pick(obj: any, path: string): unknown {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Suma de verificación de un evento: los valores de data que nombra
 * signature.properties, en orden, más el timestamp y el secreto de eventos.
 */
export function eventChecksum(event: any, secret: string): Promise<string> {
  const props: string[] = Array.isArray(event?.signature?.properties) ? event.signature.properties : [];
  const values = props.map((p) => { const v = pick(event?.data, p); return v == null ? '' : String(v); }).join('');
  return sha256Hex(`${values}${event?.timestamp ?? ''}${secret}`);
}

/** ¿El evento viene de Wompi? Compara con el checksum del cuerpo o el de la cabecera X-Event-Checksum. */
export async function verifyEvent(event: any, secret: string, headerChecksum?: string | null): Promise<boolean> {
  if (!secret || !event?.signature?.properties?.length || event?.timestamp == null) return false;
  const got = String(headerChecksum || event?.signature?.checksum || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(got)) return false;
  const want = await eventChecksum(event, secret);
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/** Dirección del checkout web de Wompi (todos los medios de pago). */
export function checkoutUrl(o: { publicKey: string; amountInCents: number; reference: string; signature: string; redirectUrl?: string | null; email?: string | null; fullName?: string | null; currency?: string }): string {
  const q: [string, string][] = [
    ['public-key', o.publicKey], ['currency', o.currency ?? 'COP'], ['amount-in-cents', String(o.amountInCents)],
    ['reference', o.reference], ['signature:integrity', o.signature],
  ];
  if (o.redirectUrl) q.push(['redirect-url', o.redirectUrl]);
  if (o.email) q.push(['customer-data:email', o.email]);
  if (o.fullName) q.push(['customer-data:full-name', o.fullName]);
  return CHECKOUT_URL + '?' + q.map(([k, v]) => `${encodeURIComponent(k).replace('%3A', ':')}=${encodeURIComponent(v)}`).join('&');
}

/** Referencia única y corta: KD-<tipo>-<tiempo>-<azar>. */
export function newReference(kind: 'checkout' | 'first' | 'renewal' | 'seats', now = Date.now()): string {
  const k = { checkout: 'C', first: 'F', renewal: 'R', seats: 'S' }[kind];
  const rnd = [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8).toUpperCase();
  return `KD-${k}-${now.toString(36).toUpperCase()}-${rnd}`;
}

/** "Visa •••• 4242" o "Nequi •••• 1111". */
export function sourceLabel(kind: 'CARD' | 'NEQUI', o: { brand?: string | null; last4?: string | null; phone?: string | null }): string {
  if (kind === 'NEQUI') return `Nequi •••• ${String(o.phone ?? '').replace(/\D/g, '').slice(-4)}`;
  const b = String(o.brand ?? '').toUpperCase();
  const name = b === 'VISA' ? 'Visa' : b === 'MASTERCARD' ? 'Mastercard' : b === 'AMEX' ? 'American Express' : b ? b[0] + b.slice(1).toLowerCase() : 'Tarjeta';
  return `${name} •••• ${String(o.last4 ?? '').replace(/\D/g, '').slice(-4)}`.slice(0, 60);
}

/** Reintentos de una renovación que falla: 1, 2 y 4 días después (los 3 caben en 7 días). */
export const RETRY_DAYS = [1, 2, 4];

// ---------- Llamadas a la API (las usan las funciones del servidor) ----------
export type WompiCfg = { env: WompiEnv; publicKey: string; privateKey: string; integrity: string; events: string };

/** Lee las llaves de los secretos. null si falta alguna. */
export function cfgFromEnv(get: (k: string) => string | undefined): WompiCfg | null {
  const publicKey = get('WOMPI_PUBLIC_KEY') ?? '', privateKey = get('WOMPI_PRIVATE_KEY') ?? '';
  const integrity = get('WOMPI_INTEGRITY_SECRET') ?? '', events = get('WOMPI_EVENTS_SECRET') ?? '';
  if (!publicKey || !privateKey || !integrity) return null;
  const env = (get('WOMPI_ENV') as WompiEnv) || envOfKey(publicKey);
  return { env: env === 'production' ? 'production' : 'sandbox', publicKey, privateKey, integrity, events };
}

export async function wompiFetch(cfg: WompiCfg, method: 'GET' | 'POST', path: string, body?: unknown, key: 'public' | 'private' = 'private'): Promise<any> {
  const res = await fetch(apiBase(cfg.env) + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key === 'public' ? cfg.publicKey : cfg.privateKey}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let j: any = null;
  try { j = text ? JSON.parse(text) : null; } catch { j = null; }
  if (!res.ok) {
    const msgs = j?.error?.messages ? Object.values(j.error.messages).flat().join(' ') : '';
    throw new Error(`Wompi ${res.status}: ${j?.error?.reason ?? j?.error?.type ?? ''} ${msgs}`.trim());
  }
  return j?.data ?? j;
}

/** Los contratos que la persona debe aceptar (términos y datos personales). */
export async function acceptanceTokens(cfg: WompiCfg): Promise<{ terms: { token: string; url: string }; data: { token: string; url: string } | null }> {
  const d = await wompiFetch(cfg, 'GET', `/merchants/${cfg.publicKey}`, undefined, 'public');
  const pa = d?.presigned_acceptance, pd = d?.presigned_personal_data_auth;
  return { terms: { token: pa?.acceptance_token, url: pa?.permalink }, data: pd ? { token: pd.acceptance_token, url: pd.permalink } : null };
}

/** Guarda la tarjeta o el Nequi en Wompi para cobrar después. */
export async function createPaymentSource(cfg: WompiCfg, o: { type: 'CARD' | 'NEQUI'; token: string; email: string; acceptance: string; personal?: string | null }): Promise<{ id: number; status: string; public_data?: any }> {
  return await wompiFetch(cfg, 'POST', '/payment_sources', {
    type: o.type, token: o.token, customer_email: o.email, acceptance_token: o.acceptance,
    ...(o.personal ? { accept_personal_auth: o.personal } : {}),
  });
}

/** Cobra a una fuente de pago guardada. */
export async function chargeSource(cfg: WompiCfg, o: { reference: string; amountInCents: number; email: string; sourceId: number; kind: 'CARD' | 'NEQUI' }): Promise<{ id: string; status: TxStatus; status_message?: string; payment_method_type?: string }> {
  const signature = await integritySignature(o.reference, o.amountInCents, 'COP', cfg.integrity);
  return await wompiFetch(cfg, 'POST', '/transactions', {
    amount_in_cents: o.amountInCents, currency: 'COP', signature, customer_email: o.email, reference: o.reference,
    payment_source_id: o.sourceId, ...(o.kind === 'CARD' ? { payment_method: { installments: 1 }, recurrent: true } : {}),
  });
}

export async function getTransaction(cfg: WompiCfg, id: string): Promise<{ id: string; reference: string; status: TxStatus; amount_in_cents: number; currency: string; payment_method_type?: string; status_message?: string }> {
  return await wompiFetch(cfg, 'GET', `/transactions/${encodeURIComponent(id)}`);
}
