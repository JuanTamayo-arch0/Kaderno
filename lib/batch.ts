// ============================================================
//  Tandas (v27, fase 4): juntar tareas cortas parecidas en un solo bloque.
//  Puro, con pruebas.
//
//  "Parecidas" = el mismo tipo (correos, trámites, lecturas: los tipos que
//  crea cada quien) o, si son tareas comunes, la misma materia o área.
//  Cortas = 30 minutos o menos. Una tanda necesita al menos 2.
// ============================================================
import { freeGaps, type Suggested } from './day';
import { trn } from './i18n';

export const BATCH_MAX_EACH = 30;
export type Batch = { key: string; label: string; ids: string[]; minutes: number };

type T = { id: string; type?: string | null; subject_id?: string | null; status?: string | null; parent_id?: string | null };

export function findBatches<X extends T>(
  tasks: X[], minutesOf: (t: X) => number,
  names: { type: (k: string) => string; subject: (id: string) => string | null },
  maxEach = BATCH_MAX_EACH,
): Batch[] {
  const groups = new Map<string, { label: string; items: X[] }>();
  for (const t of tasks) {
    if (t.status === 'done' || t.parent_id || minutesOf(t) > maxEach) continue;
    const type = t.type && t.type !== 'tarea' ? t.type : null;
    const key = type ? `tipo:${type}` : t.subject_id ? `materia:${t.subject_id}` : null;
    if (!key) continue;
    const label = type ? names.type(type) : names.subject(t.subject_id!) ?? trn('Sin nombre');
    const g = groups.get(key) ?? { label, items: [] };
    g.items.push(t);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.items.length >= 2)
    .map(([key, g]) => ({ key, label: g.label, ids: g.items.map((x) => x.id), minutes: g.items.reduce((a, x) => a + minutesOf(x), 0) }))
    .sort((a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label));
}

/** Pone la tanda seguida en el primer hueco donde quepa entera (null si no cabe). */
export function placeBatch(ids: string[], minutesOf: (id: string) => number, busy: { start: number; end: number }[], from: number, to: number): Suggested[] | null {
  const total = ids.reduce((a, id) => a + minutesOf(id), 0);
  const gap = freeGaps(from, to, busy).find((g) => g.end - g.start >= total);
  if (!gap) return null;
  let at = gap.start;
  return ids.map((id) => { const s = { id, start: at, end: at + minutesOf(id) }; at = s.end; return s; });
}
