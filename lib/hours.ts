// ============================================================
//  Registro de horas (v24, fase 5). Puro, con pruebas: periodos, sumas por
//  área, proyecto o día, valor con tarifa por hora, CSV e informe en HTML.
// ============================================================

export type HourSession = {
  id: string; minutes: number; created_at: string; subject_id: string | null; project_id: string | null;
  assignment_id?: string | null; note?: string | null; source?: 'focus' | 'manual' | 'timer' | null; project_task_id?: string | null;
};
export type Named = { name: string; color?: string };
export type GroupBy = 'subject' | 'project' | 'day';
export type Rates = Record<string, number>;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Semana (lunes a domingo) o mes, movido `offset` hacia atrás (-1) o adelante. `to` no se incluye. */
export function periodRange(kind: 'week' | 'month', offset = 0, now = new Date()): { from: Date; to: Date; label: string } {
  if (kind === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    return { from, to, label: `${MONTHS[from.getMonth()][0].toUpperCase()}${MONTHS[from.getMonth()].slice(1)} ${from.getFullYear()}` };
  }
  const d0 = startOfDay(now);
  const from = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - ((d0.getDay() + 6) % 7) + offset * 7);
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1);
  const label = from.getMonth() === last.getMonth()
    ? `${from.getDate()} al ${last.getDate()} de ${MONTHS[last.getMonth()]}`
    : `${from.getDate()} de ${MONTHS[from.getMonth()]} al ${last.getDate()} de ${MONTHS[last.getMonth()]}`;
  return { from, to, label };
}

/** "3 h 20 min", "45 min", "2 h". */
export function fmtHours(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}
/** "3,33" (para hojas de cálculo en español). */
export const decHours = (min: number) => (Math.round((min / 60) * 100) / 100).toFixed(2).replace('.', ',');
/** Valor en pesos con la tarifa por hora. */
export const amountOf = (min: number, rate: number | null | undefined) => (rate && rate > 0 ? Math.round((min / 60) * rate) : 0);

export type HourRow = { key: string; name: string; color?: string; minutes: number; sessions: number; amount: number };

/** Suma por área o materia, por proyecto o por día. */
export function groupHours(list: HourSession[], by: GroupBy, names: Record<string, Named>, rates: Rates = {}): HourRow[] {
  const map = new Map<string, HourRow>();
  for (const s of list) {
    const key = by === 'day' ? isoDay(new Date(s.created_at)) : (by === 'subject' ? s.subject_id : s.project_id) ?? '';
    let r = map.get(key);
    if (!r) {
      const n = key ? names[key] : null;
      const d = by === 'day' ? new Date(key + 'T12:00:00') : null;
      r = { key, name: d ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}` : n?.name ?? (by === 'project' ? 'Sin proyecto' : 'Sin área'), color: n?.color, minutes: 0, sessions: 0, amount: 0 };
      map.set(key, r);
    }
    r.minutes += s.minutes; r.sessions++;
  }
  // El valor se calcula por sesión con la tarifa de su proyecto o, si no tiene, la de su área.
  for (const s of list) {
    const key = by === 'day' ? isoDay(new Date(s.created_at)) : (by === 'subject' ? s.subject_id : s.project_id) ?? '';
    map.get(key)!.amount += amountOf(s.minutes, rateFor(s, rates));
  }
  const rows = [...map.values()];
  return by === 'day' ? rows.sort((a, b) => a.key.localeCompare(b.key)) : rows.sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
}
export const rateFor = (s: Pick<HourSession, 'project_id' | 'subject_id'>, rates: Rates) =>
  (s.project_id && rates[s.project_id]) || (s.subject_id && rates[s.subject_id]) || 0;

export function totals(list: HourSession[], rates: Rates = {}): { minutes: number; amount: number; days: number } {
  return {
    minutes: list.reduce((a, s) => a + s.minutes, 0),
    amount: list.reduce((a, s) => a + amountOf(s.minutes, rateFor(s, rates)), 0),
    days: new Set(list.map((s) => isoDay(new Date(s.created_at)))).size,
  };
}

const csvCell = (v: string | number) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** CSV con punto y coma (Excel en español lo abre en columnas). */
export function hoursCsv(list: HourSession[], names: Record<string, Named>, rates: Rates = {}): string {
  const head = ['Fecha', 'Hora', 'Minutos', 'Horas', 'Área o materia', 'Proyecto', 'Nota', 'Origen', 'Tarifa por hora', 'Valor'];
  const rows = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((s) => {
    const d = new Date(s.created_at), rate = rateFor(s, rates);
    return [isoDay(d), `${pad(d.getHours())}:${pad(d.getMinutes())}`, s.minutes, decHours(s.minutes),
      s.subject_id ? names[s.subject_id]?.name ?? '' : '', s.project_id ? names[s.project_id]?.name ?? '' : '', s.note ?? '',
      s.source === 'manual' ? 'A mano' : s.source === 'timer' ? 'Cronómetro' : 'Enfoque', rate || '', rate ? amountOf(s.minutes, rate) : ''];
  });
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pesos = (n: number) => '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Informe de horas para imprimir o guardar en PDF: sobrio, en Times New Roman y en negro. */
export function hoursReportHtml(o: { who: string; period: string; list: HourSession[]; names: Record<string, Named>; rates?: Rates; by?: GroupBy }): string {
  const rates = o.rates ?? {};
  const t = totals(o.list, rates);
  const money = t.amount > 0;
  const groups = groupHours(o.list, o.by ?? 'project', o.names, rates);
  const detail = [...o.list].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Informe de horas</title>
<style>
  body { font-family: "Times New Roman", Times, serif; color: #000; margin: 32px; font-size: 12pt; line-height: 1.4; }
  h1 { font-size: 18pt; margin: 0 0 4px; } h2 { font-size: 13pt; margin: 22px 0 6px; }
  p { margin: 2px 0; } table { border-collapse: collapse; width: 100%; margin-top: 6px; }
  th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; vertical-align: top; font-size: 11pt; }
  th { font-weight: bold; } td.n, th.n { text-align: right; }
</style></head><body>
<h1>Informe de horas</h1>
<p>${esc(o.who)}</p>
<p>Periodo: ${esc(o.period)}</p>
<p>Total: ${esc(fmtHours(t.minutes))} (${decHours(t.minutes)} horas) en ${t.days} ${t.days === 1 ? 'día' : 'días'}${money ? `. Valor: ${pesos(t.amount)}` : ''}.</p>
<h2>Resumen</h2>
<table><thead><tr><th>${o.by === 'subject' ? 'Área o materia' : o.by === 'day' ? 'Día' : 'Proyecto'}</th><th class="n">Horas</th>${money ? '<th class="n">Valor</th>' : ''}</tr></thead><tbody>
${groups.map((g) => `<tr><td>${esc(g.name)}</td><td class="n">${decHours(g.minutes)}</td>${money ? `<td class="n">${g.amount ? pesos(g.amount) : ''}</td>` : ''}</tr>`).join('\n')}
</tbody></table>
<h2>Detalle</h2>
<table><thead><tr><th>Fecha</th><th>Área o materia</th><th>Proyecto</th><th>Nota</th><th class="n">Horas</th>${money ? '<th class="n">Valor</th>' : ''}</tr></thead><tbody>
${detail.map((s) => {
    const d = new Date(s.created_at); const rate = rateFor(s, rates);
    return `<tr><td>${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}</td><td>${esc(s.subject_id ? o.names[s.subject_id]?.name ?? '' : '')}</td>`
      + `<td>${esc(s.project_id ? o.names[s.project_id]?.name ?? '' : '')}</td><td>${esc(s.note ?? (s.source === 'manual' ? '' : 'Enfoque'))}</td>`
      + `<td class="n">${decHours(s.minutes)}</td>${money ? `<td class="n">${rate ? pesos(amountOf(s.minutes, rate)) : ''}</td>` : ''}</tr>`;
  }).join('\n')}
</tbody></table>
<p style="margin-top:18px">Generado con Kaderno el ${new Date().toLocaleDateString('es-CO')}.</p>
</body></html>`;
}

/** Minutos de "1:30", "1,5", "90", "1h 30", "45m". null si no se entiende. */
export function parseDuration(s: string): number | null {
  const t = String(s ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{1,2}):(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = t.match(/^(\d{1,2})h(?:oras?)?(\d{1,2})?(?:m(?:in)?)?$/))) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  if ((m = t.match(/^(\d{1,3})m(?:in)?$/))) return Number(m[1]);
  if ((m = t.match(/^(\d{1,2})[.,](\d{1,2})$/))) return Math.round(Number(`${m[1]}.${m[2]}`) * 60);
  if ((m = t.match(/^(\d{1,3})$/))) { const n = Number(m[1]); return n <= 12 ? n * 60 : n; }
  return null;
}

// ---------- v25, fase 2: hoja semanal ----------
export type WeekRow = { key: string; name: string; color?: string; days: number[]; total: number };
const dayIndex = (iso: string, from: Date) => Math.floor((new Date(iso).getTime() - from.getTime()) / 86_400_000);

/** Filas de la hoja semanal: proyecto (o área si no hay) por día, de lunes a domingo. */
export function weekGrid(list: HourSession[], from: Date, names: Record<string, Named>): WeekRow[] {
  const map = new Map<string, WeekRow>();
  for (const s of list) {
    const i = dayIndex(s.created_at, from);
    if (i < 0 || i > 6) continue;
    const key = s.project_id ? `p:${s.project_id}` : s.subject_id ? `s:${s.subject_id}` : 'none';
    const id = key.slice(2);
    const r = map.get(key) ?? { key, name: key === 'none' ? 'Sin proyecto ni área' : names[id]?.name ?? '…', color: key === 'none' ? undefined : names[id]?.color, days: [0, 0, 0, 0, 0, 0, 0], total: 0 };
    r.days[i] += s.minutes; r.total += s.minutes;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
/** Totales por día de la hoja. */
export const weekTotals = (rows: WeekRow[]) => [0, 1, 2, 3, 4, 5, 6].map((i) => rows.reduce((a, r) => a + r.days[i], 0));

/**
 * Cómo dejar una casilla de la hoja en `target` minutos: si sube, se anota la
 * diferencia a mano; si baja, se recortan primero los registros a mano (los
 * del enfoque y el cronómetro no se tocan desde la hoja).
 */
export function planCellEdit(cell: HourSession[], target: number): { add: number; updates: { id: string; minutes: number }[]; deletes: string[]; blocked: number } {
  const cur = cell.reduce((a, s) => a + s.minutes, 0);
  const t = Math.max(0, Math.round(target));
  if (t >= cur) return { add: t - cur, updates: [], deletes: [], blocked: 0 };
  let cut = cur - t;
  const updates: { id: string; minutes: number }[] = [], deletes: string[] = [];
  for (const s of [...cell].filter((x) => x.source === 'manual').sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (cut <= 0) break;
    if (s.minutes <= cut) { deletes.push(s.id); cut -= s.minutes; }
    else { updates.push({ id: s.id, minutes: s.minutes - cut }); cut = 0; }
  }
  return { add: 0, updates, deletes, blocked: cut };
}
