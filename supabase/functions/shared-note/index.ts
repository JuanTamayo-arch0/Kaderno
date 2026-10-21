// ============================================================
//  Edge Function: shared-note (v21, "Compartir una nota")
//  Devuelve la nota de un enlace compartido (título, contenido y fecha),
//  con las imágenes como direcciones firmadas por una hora. Nada del dueño.
//  Desplegar:  npx supabase functions deploy shared-note --no-verify-jwt
// ============================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
  const token = new URL(req.url).searchParams.get('t') ?? (await req.json().catch(() => ({})))?.t ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(String(token))) return json({ error: 'Enlace no válido' }, 400);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('get_shared_note', { p_token: token });
  const note = (data as any[] | null)?.[0];
  if (error || !note) return json({ error: 'Este enlace ya no funciona.' }, 404);
  let content: string = note.content ?? '';
  const paths = Array.from(new Set(Array.from(content.matchAll(/\]\(kd-img:([^)\s]+)\)/g)).map((m) => m[1]))).slice(0, 30);
  for (const p of paths) {
    const { data: s } = await db.storage.from('notes').createSignedUrl(p, 3600);
    content = content.split(`](kd-img:${p})`).join(`](${s?.signedUrl ?? ''})`);
  }
  // Los enlaces a otras notas privadas se dejan como texto.
  content = content.replace(/\[([^\]\n]*)\]\(kd-note:[0-9a-fA-F-]{36}\)/g, '$1').replace(/\[([^\]\n]*)\]\(kd-file:[^)\s]+\)/g, '$1');
  return json({ title: note.title ?? 'Nota', content, updated_at: note.updated_at });
});
