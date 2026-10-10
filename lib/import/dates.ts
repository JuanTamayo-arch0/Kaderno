// Fechas y horas del importador.
//
// Todo lo que no trae zona horaria se interpreta en hora de Bogotá. Colombia no tiene
// horario de verano, así que el desfase es fijo (UTC-5) y no hace falta una librería.

export const BOGOTA_OFFSET_MIN = -5 * 60;

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export type DateKind = 'start' | 'due';

export type DateResult = { ok: true; iso: string | null } | { ok: false; error: string };

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

function toIso(y: number, mo: number, d: number, h: number, mi: number, s: number, offsetMin: number): string {
  const utc = Date.UTC(y, mo - 1, d, h, mi, s) - offsetMin * 60000;
  return new Date(utc).toISOString();
}

function parseOffset(z: string | undefined): number | null {
  if (!z) return null;
  if (z.toUpperCase() === 'Z') return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(z);
  if (!m) return null;
  const v = parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  return m[1] === '-' ? -v : v;
}

/** Convierte "a. m.", "p.m.", "AM" y similares a "am" / "pm". */
function normalizeMeridiem(s: string): string {
  return s
    .replace(/(\d|\s)([ap])\s*\.?\s*m\s*\.?(?=$|\s)/gi, (_m, pre: string, ap: string) => pre + ap.toLowerCase() + 'm')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyMeridiem(h: number, mer: string | undefined): number | null {
  if (!mer) return h >= 0 && h <= 23 ? h : null;
  if (h < 1 || h > 12) return null;
  const pm = mer.toLowerCase() === 'pm';
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

/**
 * Lee una fecha, con o sin hora, en los formatos que acepta Kaderno:
 * 2026-10-15 · 2026-10-15 14:30 · 2026-10-15T14:30 · 2026-10-15T14:30-05:00 ·
 * 15/10/2026 · 15/10/2026 14:30 · 15/10/2026 2:30 pm · 15-10-26 · número de serie de Excel.
 * Las fechas con barras se leen como día/mes/año.
 * Sin hora: el inicio queda a las 00:00 y la entrega a las 23:59.
 */
export function parseDateTime(input: unknown, kind: DateKind): DateResult {
  if (input === null || input === undefined) return { ok: true, iso: null };
  if (typeof input === 'number') {
    return parseExcelSerial(input, kind) ?? { ok: false, error: 'No es una fecha' };
  }
  if (typeof input !== 'string') return { ok: false, error: 'No es una fecha' };

  const raw = input.trim();
  if (raw === '') return { ok: true, iso: null };

  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    return parseExcelSerial(parseFloat(raw), kind) ?? { ok: false, error: `"${raw}" no es una fecha` };
  }

  const s = normalizeMeridiem(raw);
  const defH = kind === 'due' ? 23 : 0;
  const defM = kind === 'due' ? 59 : 0;

  // Año primero: 2026-10-15, 2026/10/15, con hora y zona opcionales.
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2})(?::(\d{2}))?(?::(\d{2})(?:\.\d+)?)?\s*(am|pm)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    return build(raw, y, mo, d, m[4], m[5], m[6], m[7], m[8], defH, defM);
  }

  // Día primero: 15/10/2026, 15-10-2026, 15.10.26, con hora opcional.
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?:[\sT,]+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?$/i.exec(s);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += 2000;
    return build(raw, y, +m[2], +m[1], m[4], m[5], m[6], m[7], undefined, defH, defM);
  }

  return { ok: false, error: `"${raw}" no es una fecha válida` };
}

function build(
  raw: string,
  y: number, mo: number, d: number,
  hS: string | undefined, miS: string | undefined, sS: string | undefined,
  mer: string | undefined, zone: string | undefined,
  defH: number, defM: number,
): DateResult {
  if (!isValidYMD(y, mo, d)) return { ok: false, error: `"${raw}" no es una fecha que exista` };
  let h = defH, mi = defM, sec = 0;
  if (hS !== undefined) {
    // "15/10/2026 14" sin minutos y sin am/pm es ambiguo: lo rechazamos.
    if (miS === undefined && !mer) return { ok: false, error: `"${raw}": falta la hora completa (por ejemplo 14:00)` };
    const hh = applyMeridiem(+hS, mer);
    if (hh === null) return { ok: false, error: `"${raw}": la hora no es válida` };
    h = hh;
    mi = miS !== undefined ? +miS : 0;
    sec = sS !== undefined ? +sS : 0;
    if (mi > 59 || sec > 59) return { ok: false, error: `"${raw}": la hora no es válida` };
  }
  const off = zone ? parseOffset(zone) : BOGOTA_OFFSET_MIN;
  if (off === null) return { ok: false, error: `"${raw}": zona horaria no válida` };
  return { ok: true, iso: toIso(y, mo, d, h, mi, sec, off) };
}

/** Excel guarda fechas como días desde el 30/12/1899. La parte decimal es la hora. */
function parseExcelSerial(n: number, kind: DateKind): DateResult | null {
  if (!isFinite(n) || n < 30000 || n > 80000) return null;
  const days = Math.floor(n);
  const frac = n - days;
  const base = Date.UTC(1899, 11, 30) + days * 86400000;
  const dt = new Date(base);
  let h: number, mi: number;
  if (frac > 0) {
    const mins = Math.round(frac * 1440);
    h = Math.floor(mins / 60);
    mi = mins % 60;
  } else {
    h = kind === 'due' ? 23 : 0;
    mi = kind === 'due' ? 59 : 0;
  }
  return { ok: true, iso: toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), h, mi, 0, BOGOTA_OFFSET_MIN) };
}

/** Partes de una fecha ISO en hora de Bogotá. */
export function bogotaParts(iso: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const t = new Date(Date.parse(iso) + BOGOTA_OFFSET_MIN * 60000);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}

/** "2026-10-15 14:30" en hora de Bogotá. Es lo que escribe la exportación. */
export function formatForFile(iso: string | null): string {
  if (!iso) return '';
  const p = bogotaParts(iso);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}`;
}

/** "2026-10-15T14:30" para el prompt de IA y el JSON exportado. */
export function formatForJson(iso: string | null): string | null {
  if (!iso) return null;
  const p = bogotaParts(iso);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** "15 oct · 2:30 p. m." para mostrar en pantalla. */
export function formatHuman(iso: string | null, withTime = true): string {
  if (!iso) return 'Sin fecha';
  const p = bogotaParts(iso);
  const date = `${p.d} ${MONTHS_ES[p.mo - 1]}`;
  if (!withTime) return date;
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const mer = p.h < 12 ? 'a. m.' : 'p. m.';
  return `${date} · ${h12}:${pad(p.mi)} ${mer}`;
}

/** "09/10/2026" para el prompt de IA. */
export function formatDMY(iso: string): string {
  const p = bogotaParts(iso);
  return `${pad(p.d)}/${pad(p.mo)}/${p.y}`;
}

/** Suma minutos a una fecha ISO. */
export function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60000).toISOString();
}

export function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}
