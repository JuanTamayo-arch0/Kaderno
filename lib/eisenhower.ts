
import { t } from './i18n';// ============================================================
//  Matriz de Eisenhower (v27, fase 1). Puro, con pruebas.
//
//  Importante lo marca la persona (una estrella); en las tareas de proyecto
//  sale de la prioridad (alta o urgente). Urgente se calcula solo con la
//  fecha: vencida o que vence en los próximos días (2 por defecto).
// ============================================================

export type Quadrant = 'hacer' | 'planear' | 'rapido' | 'soltar';
export const QUADRANT_ORDER: Quadrant[] = ['hacer', 'planear', 'rapido', 'soltar'];
export const DEFAULT_URGENT_DAYS = 2;
export const URGENT_DAY_OPTIONS = [1, 2, 3, 5];

type Dated = { due_date?: string | null; due_at?: string | null };
type Rated = { important?: boolean | null; priority?: string | null };

/** Día de entrega (AAAA-MM-DD, hora local) o null. */
export function dueISO(t: Dated): string | null {
  if (t.due_at) {
    const d = new Date(t.due_at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return t.due_date ?? null;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

export function cleanUrgentDays(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 0 && v <= 14 ? v : DEFAULT_URGENT_DAYS;
}

/** Vencida o vence dentro de `days` días desde hoy. Sin fecha no es urgente. */
export function isUrgent(t: Dated, todayISO: string, days = DEFAULT_URGENT_DAYS): boolean {
  const due = dueISO(t);
  return !!due && due <= addDays(todayISO, days);
}

export function isImportant(t: Rated): boolean {
  return t.important === true || t.priority === 'urgente' || t.priority === 'alta';
}

export function quadrantOf(t: Dated & Rated, todayISO: string, days = DEFAULT_URGENT_DAYS): Quadrant {
  const u = isUrgent(t, todayISO, days), i = isImportant(t);
  return u && i ? 'hacer' : i ? 'planear' : u ? 'rapido' : 'soltar';
}

/** Reparte en cuadrantes; dentro de cada uno, lo que vence antes primero (sin fecha al final). */
export function byQuadrant<X extends Dated & Rated>(items: X[], todayISO: string, days = DEFAULT_URGENT_DAYS): Record<Quadrant, X[]> {
  const out: Record<Quadrant, X[]> = { hacer: [], planear: [], rapido: [], soltar: [] };
  for (const x of items) out[quadrantOf(x, todayISO, days)].push(x);
  const key = (x: X) => dueISO(x) ?? '9999-99-99';
  for (const q of QUADRANT_ORDER) out[q].sort((a, b) => key(a).localeCompare(key(b)));
  return out;
}

/** Nombre y explicación de cada cuadrante. En Trabajo el tercero es "Delegar". */
export function quadrantInfo(q: Quadrant, work: boolean): { title: string; hint: string; empty: string } {
  switch (q) {
    case 'hacer': return { title: t('Hacer ya'), hint: t('Urgente e importante'), empty: t('Nada que apague incendios. Bien.') };
    case 'planear': return { title: t('Planear'), hint: t('Importante, sin afán: ponle día y hora antes de que se vuelva urgente'), empty: t('Marca con la estrella lo que importa aunque no tenga afán.') };
    case 'rapido': return work
      ? { title: t('Delegar'), hint: t('Urgente, no tan importante: ¿alguien más lo puede hacer?'), empty: t('Nada para pasarle a otra persona.') }
      : { title: t('Hacer rápido'), hint: t('Urgente, no tan importante: despáchalo en poco tiempo'), empty: t('Nada urgente de poca importancia.') };
    default: return { title: t('Soltar'), hint: t('Ni urgente ni importante: ¿de verdad hay que hacerlo?'), empty: t('Nada de más. Bien.') };
  }
}

/** Cómo cambia una tarea al soltarla en otro cuadrante. La fecha no se cambia sola: se ofrece. */
export function dropChange(from: Quadrant, to: Quadrant): { important: boolean | null; offer: 'hoy' | 'despues' | null } {
  const imp = (q: Quadrant) => q === 'hacer' || q === 'planear';
  const urg = (q: Quadrant) => q === 'hacer' || q === 'rapido';
  return {
    important: imp(from) === imp(to) ? null : imp(to),
    offer: urg(from) === urg(to) ? null : urg(to) ? 'hoy' : 'despues',
  };
}

type Done = Dated & Rated & { status?: string | null; completed_at?: string | null };

/**
 * Cómo se repartió lo terminado en una semana (lunes `weekStart`): cada tarea
 * en el cuadrante que tenía el día que se terminó. Para el ritual del lunes.
 */
export function weekBalance(tasks: Done[], weekStart: string, days = DEFAULT_URGENT_DAYS): { total: number; counts: Record<Quadrant, number>; urgentOnlyPct: number } {
  const end = addDays(weekStart, 7);
  const counts: Record<Quadrant, number> = { hacer: 0, planear: 0, rapido: 0, soltar: 0 };
  let total = 0;
  for (const t of tasks) {
    if (t.status !== 'done' || !t.completed_at) continue;
    const d = new Date(t.completed_at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (day < weekStart || day >= end) continue;
    counts[quadrantOf(t, day, days)]++;
    total++;
  }
  return { total, counts, urgentOnlyPct: total ? Math.round((counts.rapido / total) * 100) : 0 };
}

/** La línea del ritual del lunes (null si hay muy poco para decir algo). */
export function balanceLine(b: ReturnType<typeof weekBalance>, work: boolean): string | null {
  if (b.total < 5) return null;
  const imp = Math.round(((b.counts.hacer + b.counts.planear) / b.total) * 100);
  if (b.urgentOnlyPct >= 40) return t('La semana pasada el {urgentOnlyPct} % de lo que terminaste era urgente pero no tan importante. {v}', { urgentOnlyPct: b.urgentOnlyPct, v: work ? 'Mira qué se puede delegar.' : 'Esta semana, primero lo que tiene estrella.' });
  if (imp >= 60) return t('La semana pasada el {imp} % de lo que terminaste era importante. Buen enfoque.', { imp });
  return t('La semana pasada terminaste {total} tareas; el {imp} % era importante.', { total: b.total, imp });
}
