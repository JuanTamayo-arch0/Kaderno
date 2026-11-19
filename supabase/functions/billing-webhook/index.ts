// ============================================================
//  Edge Function: billing-webhook (v24, fase 2)
//  Wompi avisa aquí cada cambio de una transacción (transaction.updated).
//  Se verifica la firma con el secreto de eventos antes de tocar nada, se
//  guarda el evento y se aplica el pago (billing_settle es idempotente: si
//  Wompi reintenta, no se cobra ni se alarga el plan dos veces).
//
//  En Wompi > Desarrolladores > URL de eventos:
//    https://<tu-proyecto>.supabase.co/functions/v1/billing-webhook
//  (una para sandbox y otra para producción)
//
//  Desplegar:  npx supabase functions deploy billing-webhook --no-verify-jwt
// ============================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyEvent } from '../_shared/wompi.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const secret = Deno.env.get('WOMPI_EVENTS_SECRET') ?? '';
  const raw = await req.text();
  let ev: any = null;
  try { ev = JSON.parse(raw); } catch { return new Response('JSON inválido', { status: 400 }); }
  const ok = await verifyEvent(ev, secret, req.headers.get('x-event-checksum'));
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const tx = ev?.data?.transaction ?? null;
  const log = { event: String(ev?.event ?? ''), reference: tx?.reference ?? null, tx_id: tx?.id ? String(tx.id) : null, status: tx?.status ?? null, ok };
  if (!ok) {
    await db.from('billing_events').insert({ ...log, result: 'firma inválida', body: null });
    return new Response('Firma inválida', { status: 401 });
  }
  let result = 'ignorado';
  if (ev.event === 'transaction.updated' && tx?.reference && String(tx.currency ?? 'COP') === 'COP') {
    const { data, error } = await db.rpc('billing_settle', {
      p_reference: String(tx.reference), p_status: String(tx.status), p_tx_id: String(tx.id),
      p_amount: Number(tx.amount_in_cents), p_method: tx.payment_method_type ?? null, p_error: tx.status_message ?? null,
    });
    if (error) {
      await db.from('billing_events').insert({ ...log, result: 'error: ' + error.message, body: ev });
      return new Response('Error', { status: 500 }); // Wompi reintenta
    }
    result = String(data);
  }
  await db.from('billing_events').insert({ ...log, result, body: ev });
  return new Response('ok');
});
