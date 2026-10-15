// ============================================================
//  Edge Function: ical
//  Calendario privado (.ics) con las entregas, las tareas de proyecto
//  asignadas y las clases del horario. Se suscribe desde Google Calendar
//  o el iPhone con la URL que muestra Ajustes > Calendario:
//    https://<proyecto>.supabase.co/functions/v1/ical?token=<token>
//
//  Desplegar (sin verificación de JWT, el token va en la URL):
//    npx supabase functions deploy ical --no-verify-jwt
// ============================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildIcs, classesFromSchedule, type IcsTask } from '../_shared/ics.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  if (!/^[a-f0-9]{40,80}$/.test(token)) return new Response('Enlace no válido', { status: 400 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: tok } = await db.from('calendar_tokens').select('user_id').eq('token', token).maybeSingle();
  if (!tok) return new Response('Enlace no válido o ya reemplazado', { status: 404 });
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
  const blocks = (prefs.data?.settings?.schedule?.blocks ?? []) as { start: string; end: string }[];
  const classes = classesFromSchedule((slots.data ?? []) as any[], blocks, names);

  const body = buildIcs({ name: 'Kaderno', tasks: list, classes, now: new Date(), appUrl: Deno.env.get('KADERNO_APP_URL') ?? undefined });
  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="kaderno.ics"',
      'cache-control': 'private, max-age=900',
    },
  });
});
