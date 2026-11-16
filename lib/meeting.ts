// ============================================================
//  Grabar la reunión (v24, fase 4). Puro, con pruebas: quién es el
//  responsable de cada tarea, el acta en Markdown y su archivo.
// ============================================================
export type { MeetingMinutes, MeetingTask } from '../supabase/functions/_shared/meeting';
import type { MeetingMinutes, MeetingTask } from '../supabase/functions/_shared/meeting';

export const isMeeting = (s: unknown): s is MeetingMinutes => !!s && (s as any).kind === 'meeting';

const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * El integrante que corresponde al nombre que dijo la IA: igual completo,
 * o el único cuyo nombre empieza igual o tiene esa palabra. null si hay duda.
 */
export function matchOwner(owner: string | null | undefined, people: { user_id: string; name: string }[]): string | null {
  const o = norm(owner ?? '');
  if (!o) return null;
  const P = people.map((p) => ({ id: p.user_id, n: norm(p.name), words: norm(p.name).split(' ') }));
  const exact = P.filter((p) => p.n === o);
  if (exact.length === 1) return exact[0].id;
  const ow = o.split(' ');
  const starts = P.filter((p) => p.n.startsWith(o) || o.startsWith(p.n));
  if (starts.length === 1) return starts[0].id;
  const byWord = P.filter((p) => ow.every((w) => p.words.includes(w)));
  if (byWord.length === 1) return byWord[0].id;
  const first = P.filter((p) => p.words[0] === ow[0]);
  return first.length === 1 ? first[0].id : null;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortIso = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`; };
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');

/** El acta en Markdown (para la nota o para el archivo del proyecto). */
export function minutesMarkdown(m: MeetingMinutes, dateLabel: string, heading = true): string {
  const out: string[] = [];
  if (heading) out.push(`## Acta${m.title ? `: ${m.title}` : ''} · ${dateLabel}`, '');
  if (m.attendees.length) out.push(`**Asistentes:** ${m.attendees.join(', ')}`, '');
  if (m.summary.length) out.push('### Resumen', '', ...m.summary.map((x) => `- ${x}`), '');
  if (m.decisions.length) out.push('### Decisiones', '', ...m.decisions.map((x) => `- ${x}`), '');
  if (m.tasks.length) {
    out.push('### Tareas', '', '| Tarea | Responsable | Fecha |', '| --- | --- | --- |');
    for (const t of m.tasks) out.push(`| ${cell(t.title)} | ${cell(t.owner ?? 'Sin asignar')} | ${t.due ? shortIso(t.due) : cell(t.when ?? '')} |`);
    out.push('');
  }
  if (m.open.length) out.push('### Pendientes para la próxima', '', ...m.open.map((x) => `- [ ] ${x}`), '');
  return out.join('\n').trim() + '\n';
}

/** "Acta 23 nov - Revisión del lanzamiento.md" */
export function minutesFileName(m: MeetingMinutes, d: Date): string {
  const t = (m.title || 'Reunión').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `Acta ${d.getDate()} ${MONTHS[d.getMonth()]} - ${t}.md`;
}

/** Texto para el "Agregar" rápido (tarea personal). */
export function meetingTaskQuick(t: MeetingTask): string {
  return t.when && !t.title.toLowerCase().includes(t.when.toLowerCase()) ? `${t.title} ${t.when}` : t.title;
}
