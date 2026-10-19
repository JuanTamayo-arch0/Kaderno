// ============================================================
//  Leer un calendario .ics (Google Calendar, Outlook) sin dependencias,
//  para la función "ical-import". TypeScript puro: también lo usan las
//  pruebas de la app. Expande repeticiones simples (RRULE diaria, semanal
//  y mensual con INTERVAL, BYDAY, UNTIL, COUNT y EXDATE) dentro de una ventana.
// ============================================================

export type IcsEvent = { uid: string; title: string; start: string; end: string; allDay: boolean };

/** Une las líneas partidas (las que empiezan con espacio o tab continúan la anterior). */
export function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').reduce<string[]>((acc, l) => {
    if ((l.startsWith(' ') || l.startsWith('\t')) && acc.length) acc[acc.length - 1] += l.slice(1);
    else acc.push(l);
    return acc;
  }, []);
}

function unescape(s: string): string {
  return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

/** Desfase (minutos) de una zona horaria en un instante, con Intl. */
export function tzOffsetMin(tz: string, at: Date): number {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch { return 0; }
}

/** Hora local de una zona → instante UTC. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string | null): Date {
  const guess = new Date(Date.UTC(y, mo, d, h, mi, s));
  if (!tz) return guess;
  const off1 = tzOffsetMin(tz, guess);
  const first = new Date(guess.getTime() - off1 * 60000);
  const off2 = tzOffsetMin(tz, first);
  return off2 === off1 ? first : new Date(guess.getTime() - off2 * 60000);
}

type Prop = { name: string; params: Record<string, string>; value: string };
function parseProp(line: string): Prop | null {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const head = line.slice(0, i), value = line.slice(i + 1);
  const [name, ...ps] = head.split(';');
  const params: Record<string, string> = {};
  ps.forEach((p) => { const [k, v] = p.split('='); if (k && v) params[k.toUpperCase()] = v.replace(/^"|"$/g, ''); });
  return { name: name.toUpperCase(), params, value };
}

/** Fecha de una propiedad: { date, allDay }. Sin zona ni Z se usa `defaultTz`. */
export function parseDate(p: Prop, defaultTz: string | null): { date: Date; allDay: boolean } | null {
  const v = p.value.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m || p.params.VALUE === 'DATE') {
    m = m ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), allDay: true };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  if (m[7] === 'Z') return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])), allDay: false };
  return { date: zonedToUtc(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], p.params.TZID ?? defaultTz), allDay: false };
}

const DAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Ocurrencias de un evento repetido dentro de [from, to). Trabaja en la hora local de `tz`. */
export function expandRule(rule: string, start: Date, durMs: number, from: Date, to: Date, tz: string | null, exdates: number[] = [], allDay = false): Date[] {
  const r = Object.fromEntries(rule.split(';').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
  const freq = r.FREQ;
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) return start < to && start.getTime() + durMs > from.getTime() ? [start] : [];
  const interval = Math.max(1, parseInt(r.INTERVAL ?? '1', 10) || 1);
  const count = r.COUNT ? parseInt(r.COUNT, 10) : Infinity;
  let until = Infinity;
  if (r.UNTIL) { const u = parseDate({ name: 'UNTIL', params: {}, value: r.UNTIL }, tz); if (u) until = u.date.getTime() + (u.allDay ? 86_400_000 - 1 : 0); }
  const byday = (r.BYDAY ?? '').split(',').map((x) => DAYS[x.replace(/^[+-]?\d+/, '')]).filter((x) => x !== undefined);
  // Hora local del inicio (para repetir la misma hora en días con otro desfase).
  const off = allDay || !tz ? 0 : tzOffsetMin(tz, start);
  const local = new Date(start.getTime() + off * 60000);
  const [h, mi, s] = [local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()];
  const at = (y: number, mo: number, d: number) => (allDay ? new Date(Date.UTC(y, mo, d)) : zonedToUtc(y, mo, d, h, mi, s, tz));
  const out: Date[] = [];
  let n = 0;
  const startDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const push = (d: Date) => {
    if (d.getTime() < start.getTime()) return true;
    if (d.getTime() > until || n >= count) return false;
    n++;
    if (!exdates.includes(d.getTime()) && d < to && d.getTime() + durMs > from.getTime()) out.push(d);
    return d < to;
  };
  for (let k = 0; k < 2000; k++) {
    if (freq === 'DAILY') {
      const day = new Date(startDay + k * interval * 86_400_000);
      if (!push(at(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()))) break;
    } else if (freq === 'WEEKLY') {
      const weekStart = startDay - ((new Date(startDay).getUTCDay() + 6) % 7) * 86_400_000 + k * interval * 7 * 86_400_000;
      const days = byday.length ? byday : [new Date(startDay).getUTCDay()];
      let go = true;
      for (const wd of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
        const day = new Date(weekStart + ((wd + 6) % 7) * 86_400_000);
        if (!push(at(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()))) { go = false; break; }
      }
      if (!go) break;
    } else {
      const y = local.getUTCFullYear(), mo = local.getUTCMonth() + k * interval;
      const d = new Date(Date.UTC(y, mo, local.getUTCDate()));
      if (d.getUTCDate() !== local.getUTCDate()) continue; // el 31 en meses cortos se salta (como Google)
      if (!push(at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))) break;
    }
  }
  return out;
}

/** Eventos del calendario dentro de la ventana [from, to), ordenados. */
export function parseIcs(text: string, from: Date, to: Date, max = 2000): IcsEvent[] {
  const lines = unfold(text);
  const calTz = lines.map(parseProp).find((p) => p?.name === 'X-WR-TIMEZONE')?.value?.trim() ?? null;
  const out: IcsEvent[] = [];
  const overrides = new Map<string, Set<number>>();
  const blocks: Prop[][] = [];
  let cur: Prop[] | null = null;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') { cur = []; continue; }
    if (l === 'END:VEVENT') { if (cur) blocks.push(cur); cur = null; continue; }
    if (cur) { const p = parseProp(l); if (p) cur.push(p); }
  }
  // Las ediciones de una sola ocurrencia (RECURRENCE-ID) reemplazan a la original.
  for (const b of blocks) {
    const rid = b.find((p) => p.name === 'RECURRENCE-ID');
    const uid = b.find((p) => p.name === 'UID')?.value ?? '';
    if (rid) { const d = parseDate(rid, calTz); if (d) { const set = overrides.get(uid) ?? new Set(); set.add(d.date.getTime()); overrides.set(uid, set); } }
  }
  for (const b of blocks) {
    const get = (n: string) => b.find((p) => p.name === n);
    if ((get('STATUS')?.value ?? '').toUpperCase() === 'CANCELLED') continue;
    const ds = get('DTSTART');
    const st = ds ? parseDate(ds, calTz) : null;
    if (!st) continue;
    const de = get('DTEND');
    let en = de ? parseDate(de, calTz)?.date ?? null : null;
    if (!en) {
      const dur = /^P(?:T?(\d+)H)?(?:(\d+)M)?/.exec(get('DURATION')?.value ?? '');
      en = new Date(st.date.getTime() + (st.allDay ? 86_400_000 : ((+(dur?.[1] ?? 1) * 60) + +(dur?.[2] ?? 0)) * 60000));
    }
    const uid = get('UID')?.value ?? `${st.date.getTime()}`;
    const title = unescape(get('SUMMARY')?.value ?? 'Evento') || 'Evento';
    const durMs = Math.max(0, en.getTime() - st.date.getTime());
    const tz = ds?.params.TZID ?? calTz;
    const rrule = get('RRULE')?.value;
    const isOverride = !!get('RECURRENCE-ID');
    const ex = b.filter((p) => p.name === 'EXDATE').flatMap((p) => p.value.split(',').map((v) => parseDate({ ...p, value: v }, tz)?.date.getTime() ?? 0));
    const starts = rrule && !isOverride
      ? expandRule(rrule, st.date, durMs, from, to, st.allDay ? null : tz, [...ex, ...(overrides.get(uid) ?? [])], st.allDay)
      : (st.date < to && st.date.getTime() + durMs > from.getTime() ? [st.date] : []);
    for (const s of starts) {
      out.push({ uid: `${uid}#${s.getTime()}`, title: title.slice(0, 200), start: s.toISOString(), end: new Date(s.getTime() + durMs).toISOString(), allDay: st.allDay });
      if (out.length >= max) break;
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** ¿Se puede leer esta dirección? Solo https (webcal se pasa a https) y nunca direcciones internas. */
export function safeCalendarUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://')); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return null;
  }
  if (h.startsWith('[') || h.includes(':')) return null;
  return u.toString();
}
