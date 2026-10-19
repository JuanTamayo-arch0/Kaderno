// ============================================================
//  Tareas que se repiten (v21, sección 1). Puro, con pruebas.
//  Texto en español → regla, regla → siguiente fecha, regla → texto.
//  La base (schema_v20.sql) calcula la siguiente fecha con las mismas reglas.
// ============================================================

export type RepeatRule = {
  freq: 'day' | 'week' | 'month';
  interval: number;
  /** Días de la semana (0 = domingo … 6 = sábado). Solo para 'week'. */
  days?: number[];
  /** Día del mes (1 a 31). Solo para 'month'. */
  monthDay?: number;
  /** Última fecha posible (YYYY-MM-DD). */
  until?: string | null;
  /** Contar desde que la terminas (como "cada!" en Todoist). */
  fromDone?: boolean;
};

const DAYS: Record<string, number> = {
  domingo: 0, domingos: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, sabados: 6,
  dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6,
};
const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  ene: 0, feb: 1, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11,
};
const DAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[(\["'¿¡]+|[)\]"',;.:?]+$/g, '');

// ---------- Fechas (YYYY-MM-DD, sin zonas horarias) ----------
function toDate(iso: string): Date { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function toISO(d: Date): string { return d.toISOString().slice(0, 10); }
export function addDaysISO(iso: string, n: number): string { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
function dow(iso: string): number { return toDate(iso).getUTCDay(); }
function daysInMonth(y: number, m: number): number { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
function addMonthsISO(iso: string, n: number, monthDay: number): string {
  const d = toDate(iso);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const y = Math.floor(total / 12), m = total % 12;
  return toISO(new Date(Date.UTC(y, m, Math.min(monthDay, daysInMonth(y, m)))));
}
function mondayOf(iso: string): string { return addDaysISO(iso, -((dow(iso) + 6) % 7)); }

/** Un paso de la regla desde `base` (sin mirar "hasta" ni hoy). `anchor` fija las semanas cuando el intervalo es mayor que 1. */
function step(rule: RepeatRule, base: string, anchor: string): string {
  const n = Math.max(1, Math.round(rule.interval || 1));
  if (rule.freq === 'day') return addDaysISO(base, n);
  if (rule.freq === 'month') return addMonthsISO(base, n, rule.monthDay ?? toDate(anchor).getUTCDate());
  const days = rule.days?.length ? [...rule.days].sort() : null;
  if (!days) return addDaysISO(base, 7 * n);
  const a = mondayOf(anchor);
  for (let k = 1; k <= 7 * n + 7; k++) {
    const c = addDaysISO(base, k);
    const weeks = Math.round((toDate(mondayOf(c)).getTime() - toDate(a).getTime()) / (7 * 86_400_000));
    if (days.includes(dow(c)) && weeks % n === 0) return c;
  }
  return addDaysISO(base, 7 * n);
}

/**
 * Siguiente fecha al completar la de `due` el día `done`. Nunca nace vencida:
 * si queda antes de `today`, sigue avanzando. null si pasa de "hasta".
 */
export function nextDate(rule: RepeatRule, due: string | null, done: string, today: string): string | null {
  const anchor = due ?? done;
  let d = step(rule, rule.fromDone ? done : anchor, anchor);
  for (let i = 0; d < today && i < 1000; i++) d = step(rule, d, anchor);
  if (rule.until && d > rule.until) return null;
  return d;
}

/** Primera fecha de una regla nueva (sin fecha escrita): hoy si cuadra, si no la siguiente. */
export function firstDate(rule: RepeatRule, today: string): string {
  if (rule.freq === 'week' && rule.days?.length) {
    for (let k = 0; k < 7; k++) { const c = addDaysISO(today, k); if (rule.days.includes(dow(c))) return c; }
  }
  if (rule.freq === 'month' && rule.monthDay) {
    const d = toDate(today);
    const thisMonth = toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(rule.monthDay, daysInMonth(d.getUTCFullYear(), d.getUTCMonth())))));
    return thisMonth >= today ? thisMonth : addMonthsISO(today, 1, rule.monthDay);
  }
  return today;
}

export function cleanRule(x: any): RepeatRule | null {
  if (!x || typeof x !== 'object' || !['day', 'week', 'month'].includes(x.freq)) return null;
  const r: RepeatRule = { freq: x.freq, interval: Math.max(1, Math.min(99, Math.round(Number(x.interval) || 1))) };
  if (x.freq === 'week' && Array.isArray(x.days)) {
    const days = [...new Set(x.days.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() as number[];
    if (days.length) r.days = days;
  }
  if (x.freq === 'month' && Number.isInteger(Number(x.monthDay)) && x.monthDay >= 1 && x.monthDay <= 31) r.monthDay = Number(x.monthDay);
  if (typeof x.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.until)) r.until = x.until;
  if (x.fromDone) r.fromDone = true;
  return r;
}

// ---------- Regla → texto ----------
function joinY(xs: string[]): string { return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`; }

export function ruleText(rule: RepeatRule | null | undefined): string {
  if (!rule) return '';
  const n = Math.max(1, rule.interval || 1);
  let t: string;
  if (rule.freq === 'day') t = n === 1 ? 'cada día' : `cada ${n} días`;
  else if (rule.freq === 'month') t = (n === 1 ? 'cada mes' : `cada ${n} meses`) + (rule.monthDay ? ` el ${rule.monthDay}` : '');
  else if (rule.days?.length) {
    const d = [...rule.days].sort();
    if (n === 1 && d.join() === '1,2,3,4,5') t = 'cada día hábil';
    else t = (n === 1 ? 'cada ' : `cada ${n} semanas: `) + joinY(d.map((x) => DAY_NAME[x]));
  } else t = n === 1 ? 'cada semana' : `cada ${n} semanas`;
  if (rule.until) { const u = toDate(rule.until); t += ` hasta el ${u.getUTCDate()} ${MONTH_SHORT[u.getUTCMonth()]}`; }
  if (rule.fromDone) t += ' (desde que la terminas)';
  return t;
}

// ---------- Texto → regla ----------
function parseDate(toks: string[], i: number, today: string): { iso: string; len: number } | null {
  const w = toks[i] ?? '';
  let m = w.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { iso: w, len: 1 };
  m = w.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  const year = Number(today.slice(0, 4));
  const fix = (y: number, mo: number, d: number, explicitYear: boolean) => {
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    let iso = toISO(new Date(Date.UTC(y, mo, Math.min(d, daysInMonth(y, mo)))));
    if (!explicitYear && iso < today) iso = toISO(new Date(Date.UTC(y + 1, mo, Math.min(d, daysInMonth(y + 1, mo)))));
    return iso;
  };
  if (m) {
    let y = m[3] ? Number(m[3]) : year; if (y < 100) y += 2000;
    const iso = fix(y, Number(m[2]) - 1, Number(m[1]), !!m[3]);
    return iso ? { iso, len: 1 } : null;
  }
  if (/^\d{1,2}$/.test(w)) {
    const mi = toks[i + 1] === 'de' ? i + 2 : i + 1;
    if ((toks[mi] ?? '') in MONTHS) {
      const iso = fix(year, MONTHS[toks[mi]], Number(w), false);
      return iso ? { iso, len: mi - i + 1 } : null;
    }
  }
  return null;
}

/**
 * Busca una repetición en el texto ("cada martes", "cada! 3 días", "todos los
 * días hasta el 5 dic") y devuelve la regla y el texto sin esa parte.
 */
export function parseRepeat(input: string, today: string): { rule: RepeatRule; rest: string } | null {
  const raw = input.trim().split(/\s+/).filter(Boolean);
  const toks = raw.map(norm);
  const used = new Set<number>();
  let rule: RepeatRule | null = null;
  let i = 0;
  const dayList = (j: number): { days: number[]; end: number } | null => {
    const days: number[] = [];
    let k = j;
    while (k < toks.length) {
      const w = toks[k].replace(/,$/, '');
      if (w in DAYS && !(w === 'mar' && k > 0 && /^\d/.test(toks[k - 1]))) { days.push(DAYS[w]); k++; continue; }
      if ((w === 'y' || w === 'e') && days.length && (toks[k + 1] ?? '').replace(/,$/, '') in DAYS) { k++; continue; }
      break;
    }
    return days.length ? { days: [...new Set(days)].sort(), end: k } : null;
  };
  for (; i < toks.length && !rule; i++) {
    const w = toks[i];
    const bang = /^cada!$/.test(raw[i].toLowerCase()) || (w === 'cada' && raw[i + 1] === '!');
    if (w === 'cada' || bang) {
      let j = i + 1 + (raw[i + 1] === '!' ? 1 : 0);
      let n = 1;
      if (/^\d{1,2}$/.test(toks[j] ?? '')) { n = Number(toks[j]); j++; }
      else if (toks[j] === 'otro' || toks[j] === 'otra') { n = 2; j++; }
      const u = toks[j] ?? '';
      if (/^dias?$/.test(u)) {
        if (/^(habil|habiles)$/.test(toks[j + 1] ?? '')) { rule = { freq: 'week', interval: 1, days: [1, 2, 3, 4, 5] }; j += 2; }
        else { rule = { freq: 'day', interval: n }; j++; }
      } else if (/^semanas?$/.test(u)) { rule = { freq: 'week', interval: n }; j++; }
      else if (/^mes(es)?$/.test(u)) {
        rule = { freq: 'month', interval: n }; j++;
        if (toks[j] === 'el' && /^\d{1,2}$/.test(toks[j + 1] ?? '')) { rule.monthDay = Math.min(31, Number(toks[j + 1])); j += 2; }
      } else {
        const dl = dayList(j);
        if (dl) { rule = { freq: 'week', interval: n, days: dl.days }; j = dl.end; }
      }
      if (rule) { if (bang) rule.fromDone = true; for (let k = i; k < j; k++) used.add(k); i = j - 1; }
    } else if ((w === 'todos' || w === 'todas') && (toks[i + 1] === 'los' || toks[i + 1] === 'las')) {
      const u = toks[i + 2] ?? '';
      if (/^dias$/.test(u)) { rule = { freq: 'day', interval: 1 }; [i, i + 1, i + 2].forEach((k) => used.add(k)); i += 2; }
      else if (/^semanas$/.test(u)) { rule = { freq: 'week', interval: 1 }; [i, i + 1, i + 2].forEach((k) => used.add(k)); i += 2; }
      else if (/^meses$/.test(u)) { rule = { freq: 'month', interval: 1 }; [i, i + 1, i + 2].forEach((k) => used.add(k)); i += 2; }
      else { const dl = dayList(i + 2); if (dl) { rule = { freq: 'week', interval: 1, days: dl.days }; for (let k = i; k < dl.end; k++) used.add(k); i = dl.end - 1; } }
    } else if (w === 'diario' || w === 'diariamente') { rule = { freq: 'day', interval: 1 }; used.add(i); }
    else if (w === 'semanal' || w === 'semanalmente') { rule = { freq: 'week', interval: 1 }; used.add(i); }
    else if (w === 'mensual' || w === 'mensualmente') { rule = { freq: 'month', interval: 1 }; used.add(i); }
    else if (w === 'entre' && toks[i + 1] === 'semana') { rule = { freq: 'week', interval: 1, days: [1, 2, 3, 4, 5] }; used.add(i); used.add(i + 1); }
  }
  if (!rule) return null;
  // "hasta (el) 5 dic"
  for (let k = 0; k < toks.length; k++) {
    if (toks[k] !== 'hasta' || used.has(k)) continue;
    const j = toks[k + 1] === 'el' ? k + 2 : k + 1;
    const d = parseDate(toks, j, today);
    if (d) { rule.until = d.iso; for (let x = k; x < j + d.len; x++) used.add(x); break; }
  }
  const rest = raw.filter((_, k) => !used.has(k)).join(' ').replace(/\s+/g, ' ').trim();
  return { rule, rest };
}
