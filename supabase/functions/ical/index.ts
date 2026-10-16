// ============================================================
//  Edge Function: ical
//  Calendario privado (.ics) con las entregas, las tareas de proyecto
//  asignadas y las clases del horario. Se suscribe desde Google Calendar
//  o el iPhone con la URL que muestra Ajustes > Calendario:
//    https://<proyecto>.supabase.co/functions/v1/ical?token=<token>
//    https://<proyecto>.supabase.co/functions/v1/ical/<token>.ics
//  o, con el proxy de Nginx (RUNBOOK, versión 13):
//    https://<tu-dominio>/calendario/<token>.ics
//
//  Desplegar (sin verificación de JWT, el token va en la URL):
//    npx supabase functions deploy ical --no-verify-jwt
//  supabase/config.toml ya lo deja así para que un despliegue sin la
//  bandera no la vuelva a activar. Si la verificación queda activa, Supabase
//  responde 401 y el iPhone lo muestra como "No se puede conectar mediante SSL".
// ============================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildIcs, classesFromSchedule, DEFAULT_ICS_BLOCKS, type IcsTask } from '../_shared/ics.ts';

// Permite que Ajustes pruebe el enlace desde el navegador.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
};
const text = (body: string, status: number) =>
  new Response(body, { status, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('Método no permitido', 405);
  const url = new URL(req.url);
  // El token puede venir como ?token=... o al final de la ruta (/ical/<token>.ics).
  const fromPath = /([a-f0-9]{40,80})(?:\.ics)?\/?$/.exec(url.pathname)?.[1];
  const token = (url.searchParams.get('token') ?? fromPath ?? '').trim();
  if (!/^[a-f0-9]{40,80}$/.test(token)) return text('Enlace no válido', 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: tok } = await db.from('calendar_tokens').select('user_id').eq('token', token).maybeSingle();
  if (!tok) return text('Enlace no válido o ya reemplazado', 404);
  const uid = tok.user_id as string;

  const [subs, tasks, ptasks, slots, prefs] = await Promise.all([
    db.from('subjects').select('id, name').eq('user_id', uid),
    db.from('assignments').select('id, title, description, due_date, due_at, status, subject_id').eq('user_id', uid).is('deleted_at', null).neq('status', 'done'),
    db.from('project_tasks').select('id, title, due_date, due_at, done, project_id, projects(name)').eq('assignee_id', uid).eq('done', false),
    db.from('schedule').select('id, day, slot, subject_id').eq('user_id', uid),
    db.from('user_prefs').select('settings').eq('user_id', uid).maybeSingle(),
  ]);
  const names: Record<string, string> = {};
  (subs.data ?? []).forEach((s: any) => { names[s.id] = s.name; });

  const list: IcsTask[] = [
    ...(tasks.data ?? []).map((t: any) => ({ id: t.id, title: t.title, description: t.description, due_date: t.due_date, due_at: t.due_at, subject: names[t.subject_id] ?? null })),
    ...(ptasks.data ?? []).map((t: any) => ({ id: t.id, title: t.title, due_date: t.due_date, due_at: t.due_at, kind: 'project' as const, project: t.projects?.name ?? null })),
  ];
  const saved = (prefs.data?.settings?.schedule?.blocks ?? []) as { start: string; end: string }[];
  const blocks = saved.length ? saved : DEFAULT_ICS_BLOCKS;   // quien nunca cambió el horario usa los de siempre
  const classes = classesFromSchedule((slots.data ?? []) as any[], blocks, names);
  const tz = prefs.data?.settings?.notif?.tz as string | undefined;

  const body = buildIcs({ name: 'Kaderno', tasks: list, classes, now: new Date(), tz, appUrl: Deno.env.get('KADERNO_APP_URL') ?? undefined });
  return new Response(req.method === 'HEAD' ? null : body, {
    headers: {
      ...CORS,
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="kaderno.ics"',
      'cache-control': 'private, max-age=900',
    },
  });
});
