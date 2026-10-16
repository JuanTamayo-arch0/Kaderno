// ============================================================
//  Calendario .ics (RFC 5545) sin dependencias, para la función "ical".
//  Es TypeScript puro: también lo usan las pruebas de la app.
// ============================================================

export type IcsTask = { id: string; title: string; description?: string | null; due_date?: string | null; due_at?: string | null; subject?: string | null; kind?: 'task' | 'project'; project?: string | null; done?: boolean };
export type IcsClass = { id: string; subject: string; day: number; start: string; end: string }; // day 0 = lunes, HH:MM
export type IcsInput = { name: string; tasks: IcsTask[]; classes: IcsClass[]; now: Date; weeks?: number; appUrl?: string; tz?: string };

/** Bloques del horario por defecto (los mismos de lib/schedule.ts) para quien nunca los cambió. */
export const DEFAULT_ICS_BLOCKS: { start: string; end: string }[] = [
  { start: '06:00', end: '08:00' }, { start: '08:00', end: '10:00' }, { start: '10:00', end: '12:00' },
  { start: '12:00', end: '14:00' }, { start: '14:00', end: '16:00' }, { start: '16:00', end: '18:00' },
  { start: '18:00', end: '20:00' },
];

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Corta líneas a 75 octetos como pide el estándar (continuación con espacio). */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out.join('\r\n ');
}

const pad = (n: number) => String(n).padStart(2, '0');
function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function dateOnly(iso: string): string { return iso.slice(0, 10).replace(/-/g, ''); }
function nextDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + 1));
  return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}`;
}

export function buildIcs(inp: IcsInput): string {
  const L: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kaderno//Calendario//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(inp.name)}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  // Las clases van en hora local "flotante"; esto le dice al calendario cuál es esa zona.
  if (inp.tz && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(inp.tz)) L.push(`X-WR-TIMEZONE:${inp.tz}`);
  const stamp = utcStamp(inp.now);

  for (const t of inp.tasks) {
    if (t.done || (!t.due_at && !t.due_date)) continue;
    const summary = (t.kind === 'project' ? `[${t.project ?? 'Proyecto'}] ` : t.subject ? `[${t.subject}] ` : '') + t.title;
    L.push('BEGIN:VEVENT', `UID:${t.kind === 'project' ? 'p' : 't'}-${t.id}@kaderno`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(summary)}`);
    if (t.due_at) {
      const end = new Date(t.due_at);
      const start = new Date(end.getTime() - 30 * 60000);
      L.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${dateOnly(t.due_date!)}`, `DTEND;VALUE=DATE:${nextDay(t.due_date!)}`, 'TRANSP:TRANSPARENT');
    }
    if (t.description) L.push(`DESCRIPTION:${escapeText(t.description)}`);
    if (inp.appUrl) L.push(`URL:${inp.appUrl}`);
    L.push('CATEGORIES:Entregas', 'END:VEVENT');
  }

  // Clases: se repiten cada semana desde la semana actual (hora local, sin zona).
  const weeks = inp.weeks ?? 20;
  const monday = new Date(inp.now);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  for (const c of inp.classes) {
    const d = new Date(monday); d.setUTCDate(d.getUTCDate() + c.day);
    const ymd = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
    const hm = (s: string) => s.replace(':', '') + '00';
    L.push('BEGIN:VEVENT', `UID:c-${c.id}@kaderno`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(c.subject)}`,
      `DTSTART:${ymd}T${hm(c.start)}`, `DTEND:${ymd}T${hm(c.end)}`, `RRULE:FREQ=WEEKLY;COUNT=${weeks}`, 'CATEGORIES:Clases', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

/** Une bloques seguidos de la misma materia, igual que la agenda de la app. */
export function classesFromSchedule(slots: { id: string; day: number; slot: number; subject_id: string }[], blocks: { start: string; end: string }[], names: Record<string, string>): IcsClass[] {
  const sorted = [...slots].filter((s) => blocks[s.slot] && names[s.subject_id]).sort((a, b) => a.day - b.day || a.slot - b.slot);
  const out: IcsClass[] = [];
  for (const s of sorted) {
    const b = blocks[s.slot];
    const last = out[out.length - 1];
    if (last && last.day === s.day && last.subject === names[s.subject_id] && last.end === b.start) { last.end = b.end; continue; }
    out.push({ id: s.id, subject: names[s.subject_id], day: s.day, start: b.start, end: b.end });
  }
  return out;
}
