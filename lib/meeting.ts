// ============================================================
//  Grabar la reunión (v24, fase 4). Puro, con pruebas: quién es el
//  responsable de cada tarea, el acta en Markdown y su archivo.
// ============================================================
export type { MeetingMinutes, MeetingTask, MinutesStyle } from '../supabase/functions/_shared/meeting';
export { minutesPlain, cleanMinutesStyle, DEFAULT_MINUTES_STYLE } from '../supabase/functions/_shared/meeting';
import type { MeetingMinutes, MeetingTask } from '../supabase/functions/_shared/meeting';
import { trn, monthsShort } from './i18n';

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

const MONTHS = monthsShort();
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
    for (const t of m.tasks) out.push(`| ${cell(t.title)} | ${cell(t.owner ?? trn('Sin asignar'))} | ${t.due ? shortIso(t.due) : cell(t.when ?? '')} |`);
    out.push('');
  }
  if (m.open.length) out.push('### Pendientes para la próxima', '', ...m.open.map((x) => `- [ ] ${x}`), '');
  return out.join('\n').trim() + '\n';
}

/** "Acta 23 nov - Revisión del lanzamiento.md" */
export function minutesFileName(m: MeetingMinutes, d: Date): string {
  const t = (m.title || trn('Reunión')).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `Acta ${d.getDate()} ${MONTHS[d.getMonth()]} - ${t}.md`;
}

/** Texto para el "Agregar" rápido (tarea personal). */
export function meetingTaskQuick(t: MeetingTask): string {
  return t.when && !t.title.toLowerCase().includes(t.when.toLowerCase()) ? `${t.title} ${t.when}` : t.title;
}

// ---------- v25, fase 5: reuniones encadenadas ----------

/**
 * Lo que quedó abierto en una nota de reunión: casillas sin marcar y viñetas
 * bajo un título de pendientes, tareas o acuerdos (sin las vacías).
 */
export function openItemsFromNote(md: string): string[] {
  const out: string[] = [];
  let inOpen = false;
  for (const raw of (md ?? '').split('\n')) {
    const line = raw.trim();
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { inOpen = /pendiente|acuerdo|pr[oó]xima/i.test(h[1]) && !/viene de/i.test(h[1]); continue; }
    const box = line.match(/^[-*]\s+\[ \]\s+(.+)$/);
    if (box) { out.push(box[1].trim()); continue; }
    if (/^[-*]\s+\[[xX]\]/.test(line)) continue;
    const bullet = inOpen ? line.match(/^[-*]\s+(.+)$/) : null;
    if (bullet) out.push(bullet[1].trim());
  }
  return out;
}

/** La sección "Viene de la reunión del ..." para la nota nueva. '' si no hay nada abierto. */
export function carryOverMarkdown(prev: { minutes: MeetingMinutes | null; noteMd: string | null }, dateLabel: string, max = 15): string {
  const items: string[] = [];
  const seen = new Set<string>();
  const add = (x: string) => {
    const t = x.replace(/\s+/g, ' ').trim();
    const k = norm(t);
    if (!t || !k || seen.has(k) || items.length >= max) return;
    seen.add(k); items.push(t);
  };
  if (prev.minutes) {
    for (const t of prev.minutes.tasks) {
      const who = t.owner ?? trn('sin responsable');
      const when = t.due ? shortIso(t.due) : t.when ?? '';
      if (!seen.has(norm(t.title))) { add(`${t.title} (${who}${when ? `, ${when}` : ''})`); seen.add(norm(t.title)); }
    }
    prev.minutes.open.forEach(add);
  }
  if (prev.noteMd) openItemsFromNote(prev.noteMd).forEach(add);
  if (!items.length) return '';
  return [`## Viene de la reunión del ${dateLabel}`, '', ...items.map((x) => `- [ ] ${x}`), '', ''].join('\n');
}

/** Correo con el acta: mailto con asunto y cuerpo, sin pasar el largo que aguantan los clientes. */
export function mailtoUrl(subject: string, body: string, max = 1800): string {
  const enc = encodeURIComponent;
  const head = `mailto:?subject=${enc(subject)}&body=`;
  if (head.length + enc(body).length <= max) return head + enc(body);
  let b = body;
  while (b.length && head.length + enc(b + '\n...').length > max) b = b.slice(0, Math.floor(b.length * 0.9));
  return head + enc(b.replace(/\s+\S*$/, '') + '\n...');
}
