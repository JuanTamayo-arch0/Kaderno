import { t } from './i18n';
// ============================================================
//  Informe semanal del proyecto (v24, fase 5). Puro, con pruebas: lo hecho
//  en los últimos 7 días, lo que viene en los próximos 7, lo atrasado y la
//  carga de cada quien, listo para mandarle al jefe o al cliente.
// ============================================================

export type ReportTask = { id: string; title: string; done: boolean; done_at: string | null; due_date: string | null; due_at?: string | null; assignee_id: string | null };
export type ReportPerson = { user_id: string; name: string };

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAY = 86_400_000;
const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dueOf = (t: ReportTask): Date | null => {
  if (t.due_at) { const d = new Date(t.due_at); if (!isNaN(d.getTime())) return start(d); }
  if (t.due_date) { const [y, m, d] = t.due_date.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  return null;
};
const short = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

export type WeeklyReport = {
  from: Date; to: Date; done: ReportTask[]; next: ReportTask[]; late: ReportTask[];
  load: { name: string; pending: number; late: number }[]; unassigned: number; total: number; doneTotal: number;
};

export function weeklyReport(tasks: ReportTask[], people: ReportPerson[], today = new Date()): WeeklyReport {
  const t0 = start(today), from = new Date(t0.getTime() - 6 * DAY), next7 = new Date(t0.getTime() + 7 * DAY);
  const done = tasks.filter((t) => t.done && t.done_at && new Date(t.done_at) >= from).sort((a, b) => (a.done_at! < b.done_at! ? -1 : 1));
  const pending = tasks.filter((t) => !t.done);
  const byDue = (a: ReportTask, b: ReportTask) => dueOf(a)!.getTime() - dueOf(b)!.getTime();
  const late = pending.filter((t) => { const d = dueOf(t); return !!d && d < t0; }).sort(byDue);
  const next = pending.filter((t) => { const d = dueOf(t); return !!d && d >= t0 && d <= next7; }).sort(byDue);
  const load = people.map((p) => ({
    name: p.name,
    pending: pending.filter((t) => t.assignee_id === p.user_id).length,
    late: late.filter((t) => t.assignee_id === p.user_id).length,
  })).filter((x) => x.pending > 0).sort((a, b) => b.pending - a.pending);
  return { from, to: t0, done, next, late, load, unassigned: pending.filter((t) => !t.assignee_id).length, total: tasks.length, doneTotal: tasks.filter((t) => t.done).length };
}

/** El informe como texto (Markdown sencillo, se lee bien también pegado en un correo). */
export function weeklyReportMarkdown(projectName: string, r: WeeklyReport, people: ReportPerson[]): string {
  const who = (id: string | null) => (id ? people.find((p) => p.user_id === id)?.name ?? '' : '');
  const line = (t: ReportTask, date?: boolean) => {
    const d = dueOf(t);
    const bits = [who(t.assignee_id), date && d ? short(d) : ''].filter(Boolean).join(', ');
    return `- ${t.title}${bits ? ` (${bits})` : ''}`;
  };
  const pct = r.total ? Math.round((r.doneTotal / r.total) * 100) : 0;
  const out = [
    `# Informe semanal: ${projectName}`, '',
    t('Del {from} al {to}. Avance total: {doneTotal} de {total} tareas ({pct} %).', { from: short(r.from), to: short(r.to), doneTotal: r.doneTotal, total: r.total, pct }), '',
    `## Lo hecho esta semana (${r.done.length})`, '', ...(r.done.length ? r.done.map((t) => line(t)) : [t('- Nada terminado esta semana.')]), '',
    `## Lo que viene en los próximos 7 días (${r.next.length})`, '', ...(r.next.length ? r.next.map((t) => line(t, true)) : [t('- Nada con fecha en los próximos 7 días.')]), '',
  ];
  if (r.late.length) out.push(`## Atrasado (${r.late.length})`, '', ...r.late.map((t) => line(t, true)), '');
  if (r.load.length || r.unassigned) {
    out.push('## Carga del equipo', '', ...r.load.map((l) => `- ${l.name}: ${l.pending} ${l.pending === 1 ? 'pendiente' : 'pendientes'}${l.late ? `, ${l.late} ${l.late === 1 ? 'atrasada' : 'atrasadas'}` : ''}`));
    if (r.unassigned) out.push(`- Sin responsable: ${r.unassigned}`);
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}
