import Papa from 'papaparse';
import { formatForFile, formatForJson } from './dates';
import { encodeUtf8 } from './encoding';
import { EXPORT_HEADERS } from './fields';
import { STATUS_LABEL, checklistToCell } from './values';
import type { ExistingTask, Member } from './types';

function memberRef(members: Member[], id: string | null): string {
  if (!id) return '';
  const m = members.find((x) => x.user_id === id);
  return m?.email || m?.name || '';
}

/**
 * Evita que Excel interprete una celda como fórmula (inyección de fórmulas en CSV).
 * Se antepone un apóstrofo, que Excel oculta al mostrar la celda.
 */
export function escapeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Quita el apóstrofo que agrega `escapeFormula`, al volver a importar. */
export function unescapeFormula(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/**
 * CSV con ";" y BOM UTF-8, que es lo que Excel en español abre bien con doble clic.
 * Incluye la columna id para poder volver a subirlo y actualizar.
 */
export function tasksToCsv(tasks: ExistingTask[], members: Member[], opts: { includeId?: boolean } = {}): string {
  const includeId = opts.includeId ?? true;
  const cols = EXPORT_HEADERS.filter((c) => includeId || c.field !== 'id');
  const rows = tasks.map((t) =>
    cols.map(({ field }) => {
      switch (field) {
        case 'id': return t.id;
        case 'title': return escapeFormula(t.title);
        case 'description': return escapeFormula(t.description ?? '');
        case 'status': return STATUS_LABEL[t.status];
        case 'assignee': return memberRef(members, t.assignee_id);
        case 'start': return formatForFile(t.start_at);
        case 'due': return formatForFile(t.due_at);
        case 'checklist': return escapeFormula(checklistToCell(t.checklist));
        default: return '';
      }
    }),
  );
  return Papa.unparse({ fields: cols.map((c) => c.header), data: rows }, { delimiter: ';', newline: '\r\n', quotes: false });
}

export function tasksToCsvBytes(tasks: ExistingTask[], members: Member[]): Uint8Array {
  return encodeUtf8(tasksToCsv(tasks, members), true);
}

/** JSON con el mismo formato que acepta el importador. */
export function tasksToJson(tasks: ExistingTask[], members: Member[], opts: { includeId?: boolean } = {}): string {
  const includeId = opts.includeId ?? true;
  const out = tasks.map((t) => {
    const o: Record<string, unknown> = {};
    if (includeId) o.id = t.id;
    o.titulo = t.title;
    o.descripcion = t.description ?? '';
    o.estado = STATUS_LABEL[t.status];
    o.responsable = memberRef(members, t.assignee_id);
    o.inicio = formatForJson(t.start_at);
    o.entrega = formatForJson(t.due_at);
    o.checklist = t.checklist.map((c) => ({ texto: c.text, hecho: c.done }));
    return o;
  });
  return JSON.stringify({ tareas: out }, null, 2);
}

/** Nombre de archivo para exportar: "kaderno-proyecto-final-2026-10-09.csv". */
export function exportFileName(projectName: string, ext: 'csv' | 'json', now = new Date()): string {
  const slug = projectName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'proyecto';
  const d = formatForFile(now.toISOString()).slice(0, 10);
  return `kaderno-${slug}-${d}.${ext}`;
}
