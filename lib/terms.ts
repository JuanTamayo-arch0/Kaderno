// ============================================================
//  Semestres e historial académico (v26, fase 3). Puro, con pruebas.
//  El servidor (term_close, term_add_past) vuelve a calcular el promedio;
//  aquí se calcula igual para mostrarlo antes de cerrar.
// ============================================================
import { docFooter } from './brand';
import { t, trn, monthsLong } from './i18n';

export type GradeScale = { max: number; pass: number; decimals: 1 | 2 };
export const DEFAULT_SCALE: GradeScale = { max: 5, pass: 3, decimals: 1 };

/** Limpia la escala que la persona escribió (por ejemplo 0 a 100 con 60 para aprobar). */
export function cleanScale(x: any): GradeScale {
  const max = Number(x?.max);
  const okMax = Number.isFinite(max) && max > 0 && max <= 1000 ? max : DEFAULT_SCALE.max;
  const pass = Number(x?.pass);
  const okPass = Number.isFinite(pass) && pass > 0 && pass <= okMax ? pass : Math.round(okMax * 0.6 * 100) / 100;
  return { max: okMax, pass: okPass, decimals: x?.decimals === 2 ? 2 : 1 };
}

export const TERM_STATUS = ['aprobada', 'reprobada', 'homologada', 'retirada'] as const;
export type TermStatus = typeof TERM_STATUS[number];
export const STATUS_LABEL: Record<TermStatus, string> = { aprobada: t('Aprobada'), reprobada: t('Reprobada'), homologada: t('Homologada'), retirada: t('Retirada') };

export type TermSubject = { name: string; credits: number; grade: number | null; status: TermStatus; hours?: number; color?: string };
export type TermSummary = {
  subjects: TermSubject[]; avg: number | null; credits: number; credits_graded?: number; max: number; pass?: number | null;
  focus_minutes?: number; cards?: number; best_streak?: number; manual?: boolean;
};
export type Term = {
  id: string; name: string; starts_on: string | null; ends_on: string | null; status: 'open' | 'closed';
  closed_at: string | null; summary: TermSummary | null; reflection: string | null; created_at: string;
};

/** "2026-2" en el segundo semestre del año, "2026-1" en el primero. */
export function suggestTermName(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() < 6 ? 1 : 2}`;
}
/** El siguiente: 2026-2 pasa a 2027-1; si no sigue ese patrón, nada. */
export function nextTermName(name: string): string {
  const m = name.trim().match(/^(\d{4})\s*-\s*([12])$/);
  if (!m) return '';
  const y = Number(m[1]);
  return m[2] === '1' ? `${y}-2` : `${y + 1}-1`;
}

/** Estado sugerido por la nota: aprobada si llega a la nota para aprobar. */
export function statusFor(grade: number | null, scale: GradeScale): TermStatus {
  return grade == null || grade >= scale.pass ? 'aprobada' : 'reprobada';
}

/** Igual que el servidor: promedio por créditos con aprobadas y reprobadas; créditos aprobados con aprobadas y homologadas. */
export function termAverage(subjects: TermSubject[]): { avg: number | null; credits: number; graded: number } {
  let w = 0, c = 0, passed = 0;
  for (const s of subjects) {
    const cr = Math.max(0, Number(s.credits) || 0);
    if (s.grade != null && (s.status === 'aprobada' || s.status === 'reprobada')) { w += s.grade * cr; c += cr; }
    if (s.status === 'aprobada' || s.status === 'homologada') passed += cr;
  }
  return { avg: c > 0 ? Math.round((w / c) * 1000) / 1000 : null, credits: passed, graded: c };
}

/**
 * Promedio acumulado de los semestres cerrados. Si las escalas son distintas
 * (un semestre en 0 a 100 y otro en 0 a 5), cada promedio se lleva a la escala
 * de la persona antes de ponderar.
 */
export function cumulative(terms: Pick<Term, 'status' | 'summary'>[], scale: GradeScale): { avg: number | null; credits: number; terms: number } {
  let w = 0, c = 0, passed = 0, n = 0;
  for (const t of terms) {
    const s = t.summary;
    if (t.status !== 'closed' || !s) continue;
    n++;
    passed += Number(s.credits) || 0;
    const g = Number(s.credits_graded ?? 0);
    if (s.avg != null && g > 0) { w += (s.avg / (s.max || scale.max)) * scale.max * g; c += g; }
  }
  return { avg: c > 0 ? w / c : null, credits: passed, terms: n };
}

export function fmtGrade(v: number | null | undefined, scale: Pick<GradeScale, 'decimals'>): string {
  if (v == null || !Number.isFinite(v)) return '–';
  return v.toFixed(scale.decimals).replace('.', ',');
}
/** Lee "4,3" o "4.3". null si está vacío o no es número. */
export function parseGrade(s: string): number | null {
  const t = (s ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** La mejor materia (mayor nota entre aprobadas con nota). */
export function bestSubject(subjects: TermSubject[]): TermSubject | null {
  return subjects.filter((s) => s.grade != null && s.status === 'aprobada').sort((a, b) => (b.grade as number) - (a.grade as number))[0] ?? null;
}

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const MONTHS = monthsLong();
const longDate = (iso: string | null) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return t('{d} de {v} de {y}', { d, v: MONTHS[m - 1], y }); };

/** Historial en PDF: sobrio, Times New Roman, todo en negro. */
export function historyHtml(o: { who: string; terms: Term[]; scale: GradeScale; today?: Date }): string {
  const closed = o.terms.filter((t) => t.status === 'closed' && t.summary).sort((a, b) => a.name.localeCompare(b.name));
  const cum = cumulative(closed, o.scale);
  const f = (v: number | null | undefined, max?: number) => fmtGrade(v == null ? null : max && max !== o.scale.max ? (v / max) * o.scale.max : v, o.scale);
  const blocks = closed.map((t) => {
    const s = t.summary as TermSummary;
    const rows = s.subjects.map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${x.credits}</td><td class="n">${f(x.grade, s.max)}</td><td>${STATUS_LABEL[x.status] ?? esc(x.status)}</td></tr>`).join('');
    return `<h2>Semestre ${esc(t.name)}</h2>
      <p class="meta">${[t.starts_on && t.ends_on ? trn('Del {starts_on} al {ends_on}', { starts_on: longDate(t.starts_on), ends_on: longDate(t.ends_on) }) : '', s.manual ? trn('Agregado a mano') : ''].filter(Boolean).join(' · ')}</p>
      <table><thead><tr><th>Materia</th><th class="n">Créditos</th><th class="n">Nota final</th><th>Estado</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>Promedio del semestre</td><td class="n">${s.credits}</td><td class="n">${f(s.avg, s.max)}</td><td></td></tr></tfoot></table>`;
  }).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Historial académico</title><style>
    body{font-family:'Times New Roman',Times,serif;color:#000;margin:40px;font-size:12pt}
    h1{font-size:18pt;margin:0 0 4px} h2{font-size:14pt;margin:26px 0 2px} .meta{margin:0 0 8px;font-size:11pt}
    table{width:100%;border-collapse:collapse;margin-top:6px} th,td{border-bottom:1px solid #000;padding:5px 6px;text-align:left}
    th{font-weight:bold} .n{text-align:right} tfoot td{font-weight:bold;border-bottom:none}
    .resumen{margin:10px 0 0} @media print{body{margin:18mm}}
  </style></head><body>
    <h1>Historial académico</h1>
    <p class="meta">${esc(o.who)} · Generado el ${longDate((o.today ?? new Date()).toISOString())}</p>
    <p class="resumen">Promedio acumulado: <b>${fmtGrade(cum.avg, o.scale)}</b> (escala de 0 a ${o.scale.max}) · Créditos aprobados: <b>${cum.credits}</b> · Semestres: <b>${cum.terms}</b></p>
    ${blocks || '<p>Aún no hay semestres cerrados.</p>'}
    ${docFooter()}
  </body></html>`;
}

/** Racha más larga: días seguidos con algo de estudio (fechas AAAA-MM-DD, en cualquier orden). */
export function longestRun(days: string[]): number {
  const set = [...new Set(days)].sort();
  let best = 0, run = 0, prev: number | null = null;
  for (const d of set) {
    const [y, m, dd] = d.split('-').map(Number);
    const t = Date.UTC(y, m - 1, dd) / 86_400_000;
    run = prev != null && t - prev === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/** ¿Ofrecer cerrar el semestre? Cuando pasó su fecha de fin, o en junio y diciembre si no tiene. */
export function shouldOfferClose(t: Pick<Term, 'status' | 'ends_on' | 'starts_on'> | null, now = new Date()): boolean {
  if (!t || t.status !== 'open') return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (t.ends_on) return t.ends_on <= today;
  const m = now.getMonth();
  return (m === 5 && now.getDate() >= 10) || (m === 11 && now.getDate() >= 1) || m === 6 || m === 0;
}
