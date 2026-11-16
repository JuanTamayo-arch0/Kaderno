// ============================================================
//  Edge Function: billing (v24, fase 2)
//  Pagos con Wompi para la persona que llama (con su sesión):
//    config     → llave pública, ambiente y los contratos de Wompi
//    checkout   → crea el pago y devuelve la dirección del checkout web
//                 (Nequi, tarjeta, PSE, Bancolombia, Daviplata)
//    subscribe  → guarda tarjeta o Nequi (ya tokenizados en Wompi desde la
//                 app) y hace el primer cobro con renovación automática
//    status     → consulta un pago (por referencia o por el id que Wompi
//                 manda al volver del checkout) y lo aplica si ya terminó
//    update_source → cambiar la tarjeta o el Nequi de la renovación (sin cobrar)
//    cancel / resume → apagar o prender la renovación
//
//  Los datos de la tarjeta nunca pasan por aquí: la app los manda directo a
//  Wompi y aquí solo llega el token.
//
//  Secretos (Supabase > Edge Functions > Secrets):
//    WOMPI_PUBLIC_KEY, WOMPI_PRIVATE_KEY, WOMPI_INTEGRITY_SECRET, WOMPI_EVENTS_SECRET
//    WOMPI_ENV (sandbox o production; si falta, sale de la llave pública)
//    APP_URL (por ejemplo https://kaderno.app, para volver del checkout)
//
//  Desplegar:  npx supabase functions deploy billing
// ============================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { acceptanceTokens, cfgFromEnv, chargeSource, checkoutUrl, createPaymentSource, getTransaction, integritySignature, isFinal, newReference, sourceLabel, type WompiCfg } from '../_shared/wompi.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
let acceptanceCache: { at: number; v: Awaited<ReturnType<typeof acceptanceTokens>> } | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: who } = await user.auth.getUser();
    const me = who?.user;
    if (!me) return json({ error: 'Inicia sesión para pagar.' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const cfg = cfgFromEnv((k) => Deno.env.get(k));
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');

    if (action === 'cancel' || action === 'resume') {
      const { data, error } = await user.rpc(action === 'cancel' ? 'billing_cancel' : 'billing_resume');
      if (error) return json({ error: error.message }, 400);
      return json({ plan: data });
    }
    if (!cfg) return json({ error: 'Los pagos todavía no están configurados (faltan las llaves de Wompi).', code: 'no_keys' }, 503);

    if (action === 'config') {
      if (!acceptanceCache || Date.now() - acceptanceCache.at > 10 * 60_000) acceptanceCache = { at: Date.now(), v: await acceptanceTokens(cfg) };
      return json({ publicKey: cfg.publicKey, env: cfg.env, acceptance: acceptanceCache.v });
    }

    if (action === 'checkout') {
      const kind = body.kind === 'seats' ? 'seats' : 'checkout';
      const reference = newReference(kind);
      const { data: pay, error } = await db.rpc('billing_new_payment', {
        p_user: me.id, p_plan: plan(body.plan), p_period: period(body.period), p_seats: Number(body.seats ?? 1), p_kind: kind, p_reference: reference,
      });
      if (error) return json({ error: error.message }, 400);
      const p = pay as any;
      const signature = await integritySignature(reference, Number(p.amount_in_cents), 'COP', cfg.integrity);
      const url = checkoutUrl({
        publicKey: cfg.publicKey, amountInCents: Number(p.amount_in_cents), reference, signature,
        redirectUrl: redirectFor(String(body.redirect ?? ''), reference), email: me.email ?? null,
        fullName: (me.user_metadata?.full_name as string | undefined) ?? null,
      });
      return json({ reference, amount_in_cents: p.amount_in_cents, url });
    }

    if (action === 'subscribe') {
      const type = body.type === 'NEQUI' ? 'NEQUI' : 'CARD';
      const token = String(body.token ?? '');
      if (!/^[\w-]{6,120}$/.test(token)) return json({ error: 'Falta el medio de pago.' }, 400);
      if (!body.acceptance_token) return json({ error: 'Acepta los términos de Wompi para guardar el medio de pago.' }, 400);
      // Antes de guardar nada: ¿se puede comprar ese plan?
      const reference = newReference('first');
      const { data: pay, error: e1 } = await db.rpc('billing_new_payment', {
        p_user: me.id, p_plan: plan(body.plan), p_period: period(body.period), p_seats: Number(body.seats ?? 1), p_kind: 'first', p_reference: reference,
      });
      if (e1) return json({ error: e1.message }, 400);
      const p = pay as any;
      let src;
      try {
        src = await createPaymentSource(cfg, { type, token, email: me.email!, acceptance: String(body.acceptance_token), personal: body.accept_personal_auth ? String(body.accept_personal_auth) : null });
      } catch (e) {
        await db.rpc('billing_settle', { p_reference: reference, p_status: 'ERROR', p_error: 'No se guardó el medio de pago' });
        return json({ error: 'Wompi no aceptó ese medio de pago. Revisa los datos o prueba con otro.', detail: String(e) }, 400);
      }
      const pd = src.public_data ?? {};
      const label = type === 'NEQUI' ? sourceLabel('NEQUI', { phone: pd.phone_number ?? body.phone ?? '' }) : sourceLabel('CARD', { brand: pd.brand ?? body.brand, last4: pd.last_four ?? body.last4 });
      await db.rpc('billing_set_source', { p_user: me.id, p_source_id: Number(src.id), p_kind: type, p_label: label });
      let tx;
      try {
        tx = await chargeSource(cfg, { reference, amountInCents: Number(p.amount_in_cents), email: me.email!, sourceId: Number(src.id), kind: type });
      } catch (e) {
        await db.rpc('billing_settle', { p_reference: reference, p_status: 'ERROR', p_error: 'Wompi no recibió el cobro' });
        return json({ error: 'No se pudo hacer el cobro. Intenta de nuevo en un momento.', detail: String(e) }, 502);
      }
      await db.rpc('billing_attach_tx', { p_reference: reference, p_tx_id: String(tx.id), p_method: tx.payment_method_type ?? type });
      let status = tx.status;
      if (isFinal(status)) await db.rpc('billing_settle', { p_reference: reference, p_status: status, p_tx_id: String(tx.id), p_amount: Number(p.amount_in_cents), p_method: type, p_error: tx.status_message ?? null });
      return json({ reference, status, label });
    }

    if (action === 'update_source') {
      // Cambiar la tarjeta o el Nequi de la renovación, sin cobrar.
      const type = body.type === 'NEQUI' ? 'NEQUI' : 'CARD';
      const token = String(body.token ?? '');
      if (!/^[\w-]{6,120}$/.test(token) || !body.acceptance_token) return json({ error: 'Falta el medio de pago.' }, 400);
      const { data: sub } = await db.from('subscriptions').select('plan, current_period_end').eq('user_id', me.id).maybeSingle();
      if (!sub || (sub as any).plan === 'free' || new Date((sub as any).current_period_end) <= new Date()) return json({ error: 'No tienes un plan pagado para renovar.' }, 400);
      let src;
      try { src = await createPaymentSource(cfg, { type, token, email: me.email!, acceptance: String(body.acceptance_token), personal: body.accept_personal_auth ? String(body.accept_personal_auth) : null }); }
      catch (e) { return json({ error: 'Wompi no aceptó ese medio de pago. Revisa los datos o prueba con otro.', detail: String(e) }, 400); }
      const pd = src.public_data ?? {};
      const label = type === 'NEQUI' ? sourceLabel('NEQUI', { phone: pd.phone_number ?? body.phone ?? '' }) : sourceLabel('CARD', { brand: pd.brand ?? body.brand, last4: pd.last_four ?? body.last4 });
      await db.rpc('billing_set_source', { p_user: me.id, p_source_id: Number(src.id), p_kind: type, p_label: label });
      const { data: plan2 } = await user.rpc('billing_resume');
      return json({ label, plan: plan2 });
    }

    if (action === 'status') {
      let q = db.from('billing_payments').select('*').eq('user_id', me.id);
      if (body.id) q = q.eq('wompi_tx_id', String(body.id));
      else q = q.eq('reference', String(body.reference ?? ''));
      let { data: rows } = await q.limit(1);
      let pay = (rows ?? [])[0] as any;
      // Al volver del checkout, Wompi manda el id de la transacción: se busca su referencia.
      let tx: Awaited<ReturnType<typeof getTransaction>> | null = null;
      if (!pay && body.id) {
        tx = await getTransaction(cfg, String(body.id)).catch(() => null);
        if (tx) {
          const r2 = await db.from('billing_payments').select('*').eq('user_id', me.id).eq('reference', tx.reference).limit(1);
          pay = (r2.data ?? [])[0];
        }
      }
      if (!pay) return json({ error: 'No encontramos ese pago.' }, 404);
      if (pay.status === 'PENDING') {
        const txId = tx?.id ?? pay.wompi_tx_id ?? (body.id ? String(body.id) : null);
        if (txId) {
          tx = tx ?? await getTransaction(cfg, txId).catch(() => null);
          if (tx && tx.reference === pay.reference) {
            await db.rpc('billing_settle', { p_reference: pay.reference, p_status: tx.status, p_tx_id: tx.id, p_amount: tx.amount_in_cents, p_method: tx.payment_method_type ?? null, p_error: tx.status_message ?? null });
            const r3 = await db.from('billing_payments').select('*').eq('id', pay.id).single();
            pay = r3.data;
          }
        }
      }
      return json({ payment: { reference: pay.reference, status: pay.status, kind: pay.kind, plan: pay.plan, period: pay.period, seats: pay.seats, amount_in_cents: pay.amount_in_cents, method: pay.method, error: pay.error } });
    }

    return json({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    return json({ error: 'No se pudo completar el pago. Intenta de nuevo.', detail: String(e) }, 500);
  }
});

const plan = (x: unknown) => (x === 'team' ? 'team' : 'pro');
const period = (x: unknown) => (x === 'month' ? 'month' : 'year');

/** Solo se vuelve a la app (APP_URL o el mismo sitio desde donde se pagó, si es https). */
function redirectFor(from: string, reference: string): string | null {
  const allowed = (Deno.env.get('APP_URL') ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  let origin: string | null = null;
  try { const u = new URL(from); origin = u.origin; } catch { origin = null; }
  const ok = origin && (allowed.length ? allowed.includes(origin) : origin.startsWith('https://'));
  const base = ok ? origin : allowed[0] ?? null;
  return base ? `${base}/plan?ref=${encodeURIComponent(reference)}` : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
