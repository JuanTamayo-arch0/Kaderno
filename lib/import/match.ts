import { normalizeKey } from './fields';
import type { ExistingTask } from './types';

// ============================================================
//  Reconocer una tarea que ya está en el tablero aunque el archivo no
//  traiga su id.
//
//  Pasaba que una IA devolvía el plan completo sin ids y cada importación
//  volvía a crear todo. Ahora una fila sin id se compara con lo que ya hay:
//    1. por código al inicio del título ("H-009 · ...", "HU12: ...", "T-3 -"),
//       si ese código es único en el tablero;
//    2. si no, por el título completo (sin tildes, mayúsculas ni signos).
// ============================================================

export type MatchKind = 'id' | 'codigo' | 'titulo';

/** "H-009 · Descubrimiento" -> "H9". null si el título no empieza con un código. */
export function taskCode(title: string | null | undefined): string | null {
  if (!title) return null;
  // Mayúsculas pegadas al número o con guion: "H-009", "HU12", "T_3", "[RF-2]".
  // "Tarea 1" o "Parcial 2" no cuentan como código (son títulos comunes).
  const m = /^\s*\[?([A-Z]{1,5})[-_]?(\d{1,5})\]?(?=\s|[·:.\-–—)|]|$)/.exec(title);
  if (!m) return null;
  return `${m[1].toUpperCase()}${parseInt(m[2], 10)}`;
}

/** Título comparable: sin tildes, mayúsculas, puntos medios ni signos repetidos. */
export function titleKey(title: string | null | undefined): string {
  return normalizeKey(String(title ?? '').replace(/[·•|:–—()[\]"'“”]/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function buildMatcher(existing: ExistingTask[]) {
  const codeCount = new Map<string, number>();
  const byCode = new Map<string, ExistingTask>();
  const byTitle = new Map<string, ExistingTask>();
  for (const e of existing) {
    const c = taskCode(e.title);
    if (c) { codeCount.set(c, (codeCount.get(c) ?? 0) + 1); if (!byCode.has(c)) byCode.set(c, e); }
    const k = titleKey(e.title);
    if (k && !byTitle.has(k)) byTitle.set(k, e);
  }
  return (title: string | null | undefined): { task: ExistingTask; by: MatchKind } | null => {
    const c = taskCode(title);
    if (c && codeCount.get(c) === 1) return { task: byCode.get(c)!, by: 'codigo' };
    const k = titleKey(title);
    const t = k ? byTitle.get(k) : undefined;
    if (t) return { task: t, by: 'titulo' };
    if (c && byCode.has(c)) return { task: byCode.get(c)!, by: 'codigo' };
    return null;
  };
}

/** Filas sin id que coinciden con una tarea existente: número de fila -> coincidencia. */
export function matchRows(
  rows: { row: number; id: string | null; title: string | null; skip?: boolean }[],
  existing: ExistingTask[],
): Map<number, { id: string; by: MatchKind }> {
  const match = buildMatcher(existing);
  const claimed = new Set(rows.filter((r) => r.id).map((r) => r.id!.toLowerCase()));
  const out = new Map<number, { id: string; by: MatchKind }>();
  for (const r of rows) {
    if (r.skip || r.id || !r.title) continue;
    const m = match(r.title);
    if (!m || claimed.has(m.task.id.toLowerCase())) continue;
    claimed.add(m.task.id.toLowerCase());
    out.set(r.row, { id: m.task.id, by: m.by });
  }
  return out;
}

// ---------- Tareas repetidas ya en el tablero ----------

export type RepeatGroup = { key: string; keep: ExistingTask; remove: ExistingTask[] };

/** Qué tan "trabajada" está una tarea: se conserva la que más información tiene. */
function richness(t: ExistingTask): number {
  const doneSteps = t.checklist.filter((c) => c.done).length;
  return (t.done ? 4 : 0) + (t.assignee_id ? 2 : 0) + (t.description ? 1 : 0) + (t.due_at ? 1 : 0)
    + (t.start_at ? 0.5 : 0) + t.checklist.length * 0.1 + doneSteps * 0.3;
}

/**
 * Agrupa tareas repetidas (mismo código o mismo título). En cada grupo se queda
 * la más completa (terminada, con responsable, checklist avanzado...); si
 * empatan, la que estaba primero en el tablero.
 */
export function findRepeated(existing: (ExistingTask & { position?: number })[]): RepeatGroup[] {
  const groups = new Map<string, (ExistingTask & { position?: number })[]>();
  for (const t of existing) {
    const c = taskCode(t.title);
    const key = c ? `c:${c}` : `t:${titleKey(t.title)}`;
    if (key === 't:') continue;
    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
  }
  const out: RepeatGroup[] = [];
  groups.forEach((list, key) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => richness(b) - richness(a) || (a.position ?? 0) - (b.position ?? 0));
    out.push({ key, keep: sorted[0], remove: sorted.slice(1) });
  });
  return out.sort((a, b) => a.keep.title.localeCompare(b.keep.title));
}
