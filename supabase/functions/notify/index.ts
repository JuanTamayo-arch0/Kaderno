// ============================================================
//  Edge Function: notify
//  Cada 10 minutos (pg_cron, ver RUNBOOK.md):
//   1. Llena la bandeja: recordatorios, resúmenes y tareas de proyecto
//      (función SQL enqueue_all de schema_v14).
//   2. Envía como notificación push lo que esté pendiente.
//   3. Borra las suscripciones que el navegador ya no acepta.
//
//  Secretos (Supabase > Edge Functions > Secrets):
//    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:tu@correo)
//    NOTIFY_CRON_SECRET (cualquier texto largo; el cron lo manda en x-cron-secret)
//
//  Desplegar:  npx supabase functions deploy notify --no-verify-jwt
// ============================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type Item = { id: number; user_id: string; kind: string; title: string; body: string | null; url: string | null };
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOTIFY_CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('No autorizado', { status: 401 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:kaderno@example.com';

  const { data: enq, error: e1 } = await db.rpc('enqueue_all', {});
  if (e1) return json({ error: 'enqueue_all: ' + e1.message }, 500);

  const { data: items, error: e2 } = await db.from('notification_queue')
    .select('id, user_id, kind, title, body, url').is('sent_at', null).order('created_at').limit(500);
  if (e2) return json({ error: e2.message }, 500);
  const queue = (items ?? []) as Item[];
  if (!queue.length) return json({ enqueued: enq, sent: 0 });

  const users = [...new Set(queue.map((q) => q.user_id))];
  const { data: subsData } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', users);
  const subs = (subsData ?? []) as Sub[];

  let sent = 0, failed = 0;
  const dead: string[] = [];
  const ok: string[] = [];
  if (pub && priv) {
    webpush.setVapidDetails(subject, pub, priv);
    for (const item of queue) {
      // Los avisos de plan traen el botón "Empezar enfoque" (abre Enfoque con la tarea elegida).
      const actions = item.kind === 'plan' ? [{ action: 'focus', title: 'Empezar enfoque' }] : undefined;
      const payload = JSON.stringify({ title: item.title, body: item.body ?? '', url: item.url ?? '/', tag: `${item.kind}-${item.id}`, actions });
      for (const s of subs.filter((x) => x.user_id === item.user_id)) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 6, urgency: item.kind === 'reminder' || item.kind === 'plan' ? 'high' : 'normal' });
          sent++; ok.push(s.id);
        } catch (err: any) {
          failed++;
          if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.id);
        }
      }
    }
  }
  // Todo lo revisado queda como enviado (también si la persona no tiene
  // notificaciones activas): sigue visible en la campana de la app.
  await db.from('notification_queue').update({ sent_at: new Date().toISOString() }).in('id', queue.map((q) => q.id));
  if (dead.length) await db.from('push_subscriptions').delete().in('id', [...new Set(dead)]);
  if (ok.length) await db.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).in('id', [...new Set(ok)]);

  return json({ enqueued: enq, items: queue.length, sent, failed, removed: dead.length, push: !!(pub && priv) });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
