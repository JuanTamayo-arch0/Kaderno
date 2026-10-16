import { supabase } from './supabase';
import { getMyProjectTasks } from './projects';
import { getSchedule, fetchPrefs } from './db';
import { SCHEDULE } from './schedule';
import { buildIcs, classesFromSchedule, type IcsTask } from '../supabase/functions/_shared/ics';

// ============================================================
//  El mismo calendario .ics que arma la función "ical", pero generado en
//  el dispositivo. Sirve para "Descargar .ics" (una foto de hoy que se
//  importa una vez) cuando la suscripción no funciona todavía.
// ============================================================

export async function buildMyIcs(now: Date = new Date()): Promise<string> {
  const [subs, tasks, ptasks, slots, prefs] = await Promise.all([
    supabase.from('subjects').select('id, name'),
    supabase.from('assignments').select('*').neq('status', 'done'),
    getMyProjectTasks().catch(() => []),
    getSchedule().catch(() => []),
    fetchPrefs().catch(() => null),
  ]);
  if (subs.error) throw subs.error;
  if (tasks.error) throw tasks.error;
  const names: Record<string, string> = {};
  ((subs.data as any[]) ?? []).forEach((s) => { names[s.id] = s.name; });

  const list: IcsTask[] = [
    ...((tasks.data as any[]) ?? []).filter((t) => !t.deleted_at)
      .map((t) => ({ id: t.id, title: t.title, description: t.description, due_date: t.due_date, due_at: t.due_at ?? null, subject: names[t.subject_id] ?? null })),
    ...ptasks.map((t: any) => ({ id: t.id, title: t.title, due_date: t.due_date, due_at: t.due_at ?? null, kind: 'project' as const, project: t.project?.name ?? null })),
  ];
  const classes = classesFromSchedule(slots as any[], SCHEDULE.blocks, names);
  const appUrl = typeof window !== 'undefined' && window.location ? window.location.origin : undefined;
  return buildIcs({ name: 'Kaderno', tasks: list, classes, now, tz: prefs?.notif?.tz, appUrl });
}
