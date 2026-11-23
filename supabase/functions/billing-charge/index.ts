// ============================================================
//  Edge Function: billing-charge (v24, fase 2)
//  Cada hora (pg_cron, ver RUNBOOK.md, versión 24):
//   1. Cobra las renovaciones que vencen (un día antes del fin del periodo)
//      con la tarjeta o el Nequi guardado. Si falla, se reintenta 1, 2 y 4
//      días después (billing_settle); al tercer fallo se apaga la renovación.
//   2. Revisa en Wompi los pagos que siguen pendientes hace más de 15 minutos
//      (por si el webhook no llegó).
//   3. Avisa cuando la prueba termina mañana o un plan sin renovación termina
//      en 3 días.
//   4. (v25) Avisa las tareas de proyecto vencidas según sus reglas.
//
//  Secretos: los de "billing" y NOTIFY_CRON_SECRET (el mismo de "notify").
//  Desplegar:  npx supabase functions deploy billing-charge --no-verify-jwt
// ============================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cfgFromEnv, chargeSource, getTransaction, isFinal, newReference } from '../_shared/wompi.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOTIFY_CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('No autorizado', { status: 401 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const cfg = cfgFromEnv((k) => Deno.env.get(k));
  const out = { charged: 0, approved: 0, failed: 0, checked: 0, reminders: 0, errors: [] as string[] };

  if (cfg) {
    const { data: due, error } = await db.rpc('billing_due', { p_limit: 50 });
    if (error) out.errors.push('billing_due: ' + error.message);
    for (const s of (due ?? []) as any[]) {
      const reference = newReference('renewal');
      const { data: pay, error: e1 } = await db.rpc('billing_new_payment', { p_user: s.user_id, p_plan: s.plan, p_period: s.period, p_seats: s.seats, p_kind: 'renewal', p_reference: reference });
      if (e1) { out.errors.push(e1.message); continue; }
      const { data: sub } = await db.from('subscriptions').select('payment_source_kind').eq('user_id', s.user_id).single();
      out.charged++;
      try {
        const tx = await chargeSource(cfg, { reference, amountInCents: Number((pay as any).amount_in_cents), email: s.email, sourceId: Number(s.payment_source_id), kind: (sub as any)?.payment_source_kind === 'NEQUI' ? 'NEQUI' : 'CARD' });
        await db.rpc('billing_attach_tx', { p_reference: reference, p_tx_id: String(tx.id), p_method: tx.payment_method_type ?? null });
        if (isFinal(tx.status)) {
          const { data: r } = await db.rpc('billing_settle', { p_reference: reference, p_status: tx.status, p_tx_id: String(tx.id), p_amount: Number((pay as any).amount_in_cents), p_method: tx.payment_method_type ?? null, p_error: tx.status_message ?? null });
          if (r === 'approved') out.approved++; else out.failed++;
        }
      } catch (e) {
        await db.rpc('billing_settle', { p_reference: reference, p_status: 'ERROR', p_error: String(e).slice(0, 200) });
        out.failed++;
      }
    }

    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { data: pend } = await db.from('billing_payments').select('reference, wompi_tx_id').eq('status', 'PENDING').not('wompi_tx_id', 'is', null).lt('created_at', since).gt('created_at', old).limit(100);
    for (const p of (pend ?? []) as any[]) {
      const tx = await getTransaction(cfg, p.wompi_tx_id).catch(() => null);
      if (!tx || tx.reference !== p.reference) continue;
      out.checked++;
      if (isFinal(tx.status)) await db.rpc('billing_settle', { p_reference: p.reference, p_status: tx.status, p_tx_id: tx.id, p_amount: tx.amount_in_cents, p_method: tx.payment_method_type ?? null, p_error: tx.status_message ?? null });
    }
  }

  const { data: n } = await db.rpc('billing_reminders');
  out.reminders = Number(n ?? 0);
  // v25: reglas de proyecto "cuando se venza, avisar" (schema_v24, fase 3).
  const { data: od, error: odErr } = await db.rpc('project_rules_tick');
  (out as any).overdue = odErr ? null : Number(od ?? 0);
  return new Response(JSON.stringify({ ...out, wompi: !!cfg }), { headers: { 'content-type': 'application/json' } });
});
