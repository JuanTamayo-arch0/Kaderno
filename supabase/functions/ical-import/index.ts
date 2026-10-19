// ============================================================
//  Edge Function: ical-import (v21, "Tu calendario en Hoy")
//  Lee los calendarios externos (dirección iCal secreta de Google Calendar
//  u Outlook) y guarda sus eventos de los próximos 45 días.
//   · Cada 15 minutos (pg_cron, ver RUNBOOK.md) con x-cron-secret: los que
//     llevan más de 15 minutos sin leerse.
//   · Desde la app (con la sesión del usuario) y { calendar_id }: ese
//     calendario, al agregarlo o con "Actualizar ahora".
//  La dirección nunca sale del servidor ni se manda a otros usuarios.
//
//  Secretos: usa NOTIFY_CRON_SECRET (el mismo de "notify").
//  Desplegar:  npx supabase functions deploy ical-import --no-verify-jwt
// ============================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseIcs, safeCalendarUrl } from '../_shared/icsParse.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const MAX_BYTES = 3_000_000;
type Cal = { id: string; user_id: string; url: string };

async function fetchIcs(raw: string): Promise<string> {
  let url = safeCalendarUrl(raw);
  if (!url) throw new Error('La dirección no es válida (debe ser https).');
  for (let hop = 0; hop < 4; hop++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    const res = await fetch(url, { redirect: 'manual', signal: ctl.signal, headers: { accept: 'text/calendar, text/plain, */*' } }).finally(() => clearTimeout(t));
    if (res.status >= 300 && res.status < 400) {
      const next = safeCalendarUrl(new URL(res.headers.get('location') ?? '', url).toString());
      if (!next) throw new Error('El calendario redirige a una dirección no permitida.');
      url = next; continue;
    }
    if (!res.ok) throw new Error(res.status === 404 ? 'No se encontró el calendario (¿cambió la dirección secreta?).' : `El calendario respondió ${res.status}.`);
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { reader.cancel(); throw new Error('El calendario es demasiado grande.'); }
      chunks.push(value);
    }
    const all = new Uint8Array(size); let off = 0;
    chunks.forEach((c) => { all.set(c, off); off += c.length; });
    const text = new TextDecoder().decode(all);
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('La dirección no es un calendario iCal.');
    return text;
  }
  throw new Error('Demasiadas redirecciones.');
}

async function sync(db: any, cal: Cal): Promise<{ id: string; events?: number; error?: string }> {
  try {
    const text = await fetchIcs(cal.url);
    const now = Date.now();
    const seen = new Set<string>();
    const events = parseIcs(text, new Date(now - 2 * 86_400_000), new Date(now + 45 * 86_400_000))
      .filter((e) => (seen.has(e.uid.slice(0, 300)) ? false : (seen.add(e.uid.slice(0, 300)), true)));
    await db.from('external_events').delete().eq('calendar_id', cal.id);
    for (let i = 0; i < events.length; i += 500) {
      const rows = events.slice(i, i + 500).map((e) => ({ calendar_id: cal.id, user_id: cal.user_id, uid: e.uid.slice(0, 300), start_at: e.start, end_at: e.end, title: e.title, all_day: e.allDay }));
      const { error } = await db.from('external_events').upsert(rows, { onConflict: 'calendar_id,uid' });
      if (error) throw new Error(error.message);
    }
    await db.from('external_calendars').update({ last_sync: new Date().toISOString(), last_error: null }).eq('id', cal.id);
    return { id: cal.id, events: events.length };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 200);
    await db.from('external_calendars').update({ last_sync: new Date().toISOString(), last_error: msg }).eq('id', cal.id);
    return { id: cal.id, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'content-type': 'application/json' } });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const secret = Deno.env.get('NOTIFY_CRON_SECRET');
  try {
    if (secret && req.headers.get('x-cron-secret') === secret) {
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const { data } = await db.from('external_calendars').select('id, user_id, url').or(`last_sync.is.null,last_sync.lt.${since}`).order('last_sync', { ascending: true, nullsFirst: true }).limit(40);
      const out = [];
      for (const c of (data as Cal[]) ?? []) out.push(await sync(db, c));
      return json({ synced: out.length, results: out });
    }
    // Desde la app: solo un calendario propio (se verifica con la sesión del usuario).
    const auth = req.headers.get('Authorization') ?? '';
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const body = await req.json().catch(() => ({}));
    const id = String(body?.calendar_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Falta el calendario' }, 400);
    const { data: mine } = await user.from('external_calendars').select('id, user_id, url').eq('id', id).maybeSingle();
    if (!mine) return json({ error: 'No encontré ese calendario' }, 404);
    const r = await sync(db, mine as Cal);
    return r.error ? json({ error: r.error }, 502) : json(r);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
