import { addMinutes, formatHuman } from './dates';
import type { ExistingTask, ShiftTarget } from './types';

export interface ShiftPreviewItem {
  id: string;
  title: string;
  start_before: string | null;
  start_after: string | null;
  due_before: string | null;
  due_after: string | null;
  /** true si queda después de la entrega final del proyecto. */
  overDeadline: boolean;
  /** true si con "solo entrega" la entrega queda antes del inicio. */
  invalid: boolean;
}

export interface ShiftPreview {
  items: ShiftPreviewItem[];
  /** Tareas seleccionadas que no tienen fechas que mover. */
  withoutDates: number;
  latestBefore: string | null;
  latestAfter: string | null;
  overDeadlineCount: number;
  invalidCount: number;
  summary: string;
}

/**
 * Calcula cómo quedan las fechas al correrlas N días. La hora se conserva.
 * "ambas" mueve inicio y entrega (la tarea conserva su duración); "entrega" solo la entrega.
 */
export function previewShift(
  tasks: ExistingTask[],
  days: number,
  target: ShiftTarget,
  projectDeadline: string | null = null,
): ShiftPreview {
  const minutes = Math.round(days * 1440);
  const deadline = projectDeadline ? Date.parse(projectDeadline) : null;
  const items: ShiftPreviewItem[] = [];
  let withoutDates = 0;
  let latestBefore: number | null = null;
  let latestAfter: number | null = null;

  for (const t of tasks) {
    const moveStart = target === 'ambas' && t.start_at !== null;
    const moveDue = t.due_at !== null;
    if (!moveStart && !moveDue) {
      withoutDates++;
      continue;
    }
    const start_after = moveStart ? addMinutes(t.start_at!, minutes) : t.start_at;
    const due_after = moveDue ? addMinutes(t.due_at!, minutes) : t.due_at;
    const invalid = !!(start_after && due_after && Date.parse(start_after) > Date.parse(due_after));
    const overDeadline = !!(deadline !== null && due_after && Date.parse(due_after) > deadline);
    if (t.due_at) latestBefore = Math.max(latestBefore ?? -Infinity, Date.parse(t.due_at));
    if (due_after) latestAfter = Math.max(latestAfter ?? -Infinity, Date.parse(due_after));
    items.push({
      id: t.id,
      title: t.title,
      start_before: t.start_at,
      start_after,
      due_before: t.due_at,
      due_after,
      overDeadline,
      invalid,
    });
  }

  const lb = latestBefore !== null ? new Date(latestBefore).toISOString() : null;
  const la = latestAfter !== null ? new Date(latestAfter).toISOString() : null;
  const n = items.length;
  let summary = `${n} ${n === 1 ? 'tarea' : 'tareas'}`;
  if (lb && la) summary += `. La última entrega pasa del ${formatHuman(lb, false)} al ${formatHuman(la, false)}`;
  return {
    items,
    withoutDates,
    latestBefore: lb,
    latestAfter: la,
    overDeadlineCount: items.filter((i) => i.overDeadline).length,
    invalidCount: items.filter((i) => i.invalid).length,
    summary,
  };
}

/** Tareas pendientes (no hechas) que se moverían al correr la entrega final del proyecto. */
export function pendingForProjectShift(tasks: ExistingTask[]): ExistingTask[] {
  return tasks.filter((t) => !t.done && (t.start_at || t.due_at));
}

/** Diferencia en días (con decimales) entre la entrega final vieja y la nueva. */
export function deadlineDeltaDays(oldIso: string, newIso: string): number {
  return (Date.parse(newIso) - Date.parse(oldIso)) / 86400000;
}
