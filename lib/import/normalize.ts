import { parseDateTime } from './dates';
import { normalizeKey } from './fields';
import {
  MAX_DESCRIPTION,
  MAX_TITLE,
  UUID_RE,
  cleanText,
  parseChecklistCell,
  parseChecklistJson,
  parseStatus,
  parseYes,
} from './values';
import type {
  ColumnMapping,
  ExistingTask,
  Field,
  Member,
  NormalizedTask,
  ParsedFile,
  RowIssue,
} from './types';

// ---------- Responsables ----------

export type AssigneeMatch =
  | { kind: 'none' }
  | { kind: 'found'; user_id: string }
  | { kind: 'ambiguous'; candidates: Member[] }
  | { kind: 'unknown' };

/**
 * Busca un integrante por lo que venga escrito en la columna responsable:
 * correo exacto, nombre completo, la parte del correo antes de la @, o el comienzo
 * del nombre si solo hay un integrante que coincide ("Juan" → "Juan José Tamayo").
 */
export function resolveAssignee(input: unknown, members: Member[]): AssigneeMatch {
  const raw = cleanText(input);
  if (!raw) return { kind: 'none' };
  const q = normalizeKey(raw);
  const byEmail = members.filter((m) => m.email && m.email.trim().toLowerCase() === raw.toLowerCase());
  if (byEmail.length === 1) return { kind: 'found', user_id: byEmail[0].user_id };

  const byName = members.filter((m) => m.name && normalizeKey(m.name) === q);
  if (byName.length === 1) return { kind: 'found', user_id: byName[0].user_id };
  if (byName.length > 1) return { kind: 'ambiguous', candidates: byName };

  const byLocal = members.filter((m) => m.email && normalizeKey(m.email.split('@')[0]) === q);
  if (byLocal.length === 1) return { kind: 'found', user_id: byLocal[0].user_id };

  const byPrefix = members.filter((m) => {
    if (!m.name) return false;
    const n = normalizeKey(m.name);
    return n.startsWith(q + ' ');
  });
  if (byPrefix.length === 1) return { kind: 'found', user_id: byPrefix[0].user_id };
  if (byPrefix.length > 1) return { kind: 'ambiguous', candidates: byPrefix };
  return { kind: 'unknown' };
}

// ---------- Filas ----------

export interface NormalizeResult {
  tasks: NormalizedTask[];
  issues: RowIssue[];
  /** 'update' cuando el archivo trae ids (viene de una exportación). */
  mode: 'import' | 'update';
}

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Convierte las filas del archivo a tareas de Kaderno y junta los errores y avisos.
 * Una celda vacía significa "sin dato": al crear, el campo queda vacío; al actualizar,
 * el campo no se toca.
 */
export function normalizeRows(parsed: ParsedFile, mapping: ColumnMapping, members: Member[]): NormalizeResult {
  const issues: RowIssue[] = [];
  const tasks: NormalizedTask[] = [];
  const colFor = new Map<Field, string>();
  Object.entries(mapping).forEach(([h, f]) => {
    if (f && !colFor.has(f)) colFor.set(f, h);
  });
  const get = (row: Record<string, unknown>, f: Field): unknown => {
    const h = colFor.get(f);
    return h === undefined ? undefined : row[h];
  };

  const seenIds = new Set<string>();
  const seenKeys = new Map<string, number>();
  let anyId = false;

  parsed.rows.forEach((row, i) => {
    const rowNo = parsed.rowNumbers[i] ?? i + 1;
    const issue = (field: Field | 'row', level: 'error' | 'warning', message: string) =>
      issues.push({ row: rowNo, field, level, message });
    const present: Field[] = [];
    const t: NormalizedTask = {
      row: rowNo,
      present,
      id: null,
      title: null,
      description: null,
      status: null,
      assignee_id: null,
      assignee_input: null,
      start_at: null,
      due_at: null,
      checklist: null,
      delete: false,
    };

    // id
    const idRaw = get(row, 'id');
    if (!isBlank(idRaw)) {
      const id = String(idRaw).trim();
      if (!UUID_RE.test(id)) {
        issue('id', 'error', `El id "${id}" no es válido. No lo edites: viene de la exportación`);
      } else if (seenIds.has(id.toLowerCase())) {
        issue('id', 'error', 'Este id está repetido en el archivo');
      } else {
        seenIds.add(id.toLowerCase());
        t.id = id.toLowerCase();
        present.push('id');
        anyId = true;
      }
    }
    const isUpdate = t.id !== null;

    // eliminar
    const delRaw = get(row, 'delete');
    if (!isBlank(delRaw) && parseYes(delRaw)) {
      if (isUpdate) {
        t.delete = true;
        present.push('delete');
      } else {
        issue('delete', 'warning', 'Solo se puede eliminar una tarea que ya existe (con id). Esta fila se ignorará');
        t.skip = true;
      }
    }

    // título
    const title = cleanText(get(row, 'title'));
    if (title) {
      const oneLine = title.replace(/\s*\n\s*/g, ' ');
      if (oneLine.length > MAX_TITLE) issue('title', 'warning', `El título se recortó a ${MAX_TITLE} caracteres`);
      t.title = oneLine.slice(0, MAX_TITLE);
      present.push('title');
    } else if (!isUpdate && !t.skip) {
      issue('title', 'error', 'Falta el título');
    }

    // descripción
    const desc = cleanText(get(row, 'description'));
    if (desc) {
      if (desc.length > MAX_DESCRIPTION) issue('description', 'warning', `La descripción se recortó a ${MAX_DESCRIPTION} caracteres`);
      t.description = desc.slice(0, MAX_DESCRIPTION);
      present.push('description');
    }

    // estado
    const stRaw = get(row, 'status');
    if (!isBlank(stRaw)) {
      const st = parseStatus(stRaw);
      if (st.ok && st.value) {
        t.status = st.value;
        present.push('status');
      } else if (!st.ok) {
        issue('status', 'warning', isUpdate ? `${st.error}. El estado no se cambiará` : `${st.error}. Quedará en Por hacer`);
      }
    }

    // responsable
    const asRaw = get(row, 'assignee');
    if (!isBlank(asRaw)) {
      t.assignee_input = String(asRaw).trim();
      const m = resolveAssignee(asRaw, members);
      if (m.kind === 'found') {
        t.assignee_id = m.user_id;
        present.push('assignee');
      } else if (m.kind === 'ambiguous') {
        issue('assignee', 'warning', `"${t.assignee_input}" coincide con varios integrantes. Usa el correo. ${isUpdate ? 'No se cambiará' : 'Quedará sin asignar'}`);
      } else if (m.kind === 'unknown') {
        issue('assignee', 'warning', `"${t.assignee_input}" no es integrante del proyecto. ${isUpdate ? 'No se cambiará' : 'Quedará sin asignar'}`);
      }
    }

    // fechas
    const stDate = parseDateTime(get(row, 'start'), 'start');
    if (!stDate.ok) issue('start', 'error', stDate.error);
    else if (stDate.iso) {
      t.start_at = stDate.iso;
      present.push('start');
    }
    const dueDate = parseDateTime(get(row, 'due'), 'due');
    if (!dueDate.ok) issue('due', 'error', dueDate.error);
    else if (dueDate.iso) {
      t.due_at = dueDate.iso;
      present.push('due');
    }
    if (t.start_at && t.due_at && Date.parse(t.start_at) > Date.parse(t.due_at)) {
      issue('start', 'error', 'El inicio queda después de la entrega');
    }

    // checklist
    const clRaw = get(row, 'checklist');
    if (!isBlank(clRaw)) {
      const items = Array.isArray(clRaw) ? parseChecklistJson(clRaw) : parseChecklistCell(clRaw);
      if (items && items.length) {
        t.checklist = items;
        present.push('checklist');
      }
    }

    // duplicados dentro del mismo archivo (solo filas nuevas)
    if (!isUpdate && t.title && !t.skip) {
      const key = normalizeKey(t.title) + '|' + (t.due_at ?? '');
      const prev = seenKeys.get(key);
      if (prev !== undefined) issue('row', 'warning', `Parece repetida con la fila ${prev}`);
      else seenKeys.set(key, rowNo);
    }

    tasks.push(t);
  });

  return { tasks, issues, mode: anyId ? 'update' : 'import' };
}

// ---------- Utilidades para la vista previa ----------

export function issuesForRow(issues: RowIssue[], row: number): RowIssue[] {
  return issues.filter((i) => i.row === row);
}

export function rowHasErrors(issues: RowIssue[], row: number): boolean {
  return issues.some((i) => i.row === row && i.level === 'error');
}

/** Filas que se van a enviar: sin errores y no omitidas. */
export function importableTasks(tasks: NormalizedTask[], issues: RowIssue[]): NormalizedTask[] {
  const bad = new Set(issues.filter((i) => i.level === 'error').map((i) => i.row));
  return tasks.filter((t) => !t.skip && !bad.has(t.row));
}

export function summarizeIssues(tasks: NormalizedTask[], issues: RowIssue[]) {
  const errorRows = new Set(issues.filter((i) => i.level === 'error').map((i) => i.row));
  const warnRows = new Set(issues.filter((i) => i.level === 'warning').map((i) => i.row));
  const skipped = tasks.filter((t) => t.skip).length;
  const ok = tasks.filter((t) => !t.skip && !errorRows.has(t.row)).length;
  return { total: tasks.length, ok, withErrors: errorRows.size, withWarnings: warnRows.size, skipped };
}

/**
 * Filas nuevas que coinciden con una tarea existente (mismo título sin tildes ni
 * mayúsculas y misma entrega). Devuelve fila → id de la tarea existente.
 */
export function findDuplicates(tasks: NormalizedTask[], existing: ExistingTask[]): Map<number, string> {
  const idx = new Map<string, string>();
  existing.forEach((e) => {
    const k = normalizeKey(e.title) + '|' + (e.due_at ? new Date(e.due_at).toISOString() : '');
    if (!idx.has(k)) idx.set(k, e.id);
  });
  const out = new Map<number, string>();
  tasks.forEach((t) => {
    if (t.id || !t.title) return;
    const k = normalizeKey(t.title) + '|' + (t.due_at ?? '');
    const hit = idx.get(k);
    if (hit) out.set(t.row, hit);
  });
  return out;
}
