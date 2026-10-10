import { normalizeKey } from './fields';
import type { ChecklistItem, ProjectStatus } from './types';

// ---------- Estados ----------

/**
 * Valor de `project_tasks.status` en la base de datos para cada columna.
 * AJUSTAR al conectar con el código real de la Entrega B si usa otros valores.
 */
export const STATUS_DB: Record<ProjectStatus, string> = {
  todo: 'todo',
  doing: 'doing',
  review: 'review',
  done: 'done',
};

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  todo: 'Por hacer',
  doing: 'En curso',
  review: 'En revisión',
  done: 'Hecho',
};

const STATUS_ALIASES: Record<string, ProjectStatus> = {
  'por hacer': 'todo', 'pendiente': 'todo', 'pendientes': 'todo', 'todo': 'todo', 'to do': 'todo',
  'backlog': 'todo', 'nuevo': 'todo', 'nueva': 'todo', 'sin empezar': 'todo',
  'en curso': 'doing', 'en progreso': 'doing', 'haciendo': 'doing', 'doing': 'doing',
  'in progress': 'doing', 'progreso': 'doing', 'trabajando': 'doing',
  'en revision': 'review', 'revision': 'review', 'review': 'review', 'in review': 'review',
  'por revisar': 'review', 'revisar': 'review',
  'hecho': 'done', 'hecha': 'done', 'terminado': 'done', 'terminada': 'done', 'listo': 'done', 'lista': 'done',
  'done': 'done', 'completado': 'done', 'completada': 'done', 'completed': 'done', 'finalizado': 'done',
};

export function parseStatus(input: unknown): { ok: true; value: ProjectStatus | null } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, value: null };
  const s = normalizeKey(String(input));
  if (s === '') return { ok: true, value: null };
  const v = STATUS_ALIASES[s];
  if (v) return { ok: true, value: v };
  // Valor de la base de datos escrito tal cual.
  const fromDb = (Object.keys(STATUS_DB) as ProjectStatus[]).find((k) => STATUS_DB[k] === String(input).trim());
  if (fromDb) return { ok: true, value: fromDb };
  return { ok: false, error: `Estado "${String(input).trim()}" no reconocido. Usa Por hacer, En curso, En revisión o Hecho` };
}

export function statusFromDb(db: string): ProjectStatus {
  const k = (Object.keys(STATUS_DB) as ProjectStatus[]).find((s) => STATUS_DB[s] === db);
  return k ?? 'todo';
}

// ---------- Sí / No ----------

export function parseYes(input: unknown): boolean {
  if (input === true) return true;
  if (input === null || input === undefined || input === false) return false;
  const s = normalizeKey(String(input));
  return ['si', 's', 'yes', 'y', 'true', '1', 'x', 'eliminar', 'borrar'].includes(s);
}

// ---------- Checklist ----------

export const MAX_CHECKLIST_ITEMS = 50;
export const MAX_CHECKLIST_TEXT = 300;

/** Quita viñetas y marcas de un ítem y devuelve su estado. */
function parseItemText(raw: string): ChecklistItem | null {
  let s = raw.trim();
  // Viñetas y numeración: "-", "*", "•", "1.", "1)", "a)"
  s = s.replace(/^(?:[-*•·]|\d{1,3}[.)]|[a-z][)])\s+/i, '');
  let done: boolean | null = null;
  const mark = /^\[( |x|X|✓|✔)?\]\s*/.exec(s);
  if (mark) {
    done = mark[1] !== undefined && mark[1] !== ' ';
    s = s.slice(mark[0].length);
  } else if (/^[✓✔☑]\s*/.test(s)) {
    done = true;
    s = s.replace(/^[✓✔☑]\s*/, '');
  } else if (/^[☐]\s*/.test(s)) {
    done = false;
    s = s.replace(/^[☐]\s*/, '');
  }
  s = s.trim();
  if (!s) return null;
  return { text: s.slice(0, MAX_CHECKLIST_TEXT), done };
}

/**
 * Checklist en una celda de CSV: ítems separados por "|".
 * También acepta saltos de línea dentro de la celda.
 */
export function parseChecklistCell(input: unknown): ChecklistItem[] | null {
  if (input === null || input === undefined) return null;
  if (Array.isArray(input)) return parseChecklistJson(input);
  const s = stripFormulaGuard(String(input).trim());
  if (s === '') return null;
  const parts = s.includes('|') ? s.split('|') : s.split(/\r?\n/);
  const items = parts.map(parseItemText).filter((x): x is ChecklistItem => x !== null);
  return items.slice(0, MAX_CHECKLIST_ITEMS);
}

/** Checklist en JSON: lista de textos o de objetos { texto, hecho }. */
export function parseChecklistJson(input: unknown): ChecklistItem[] | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'string') return parseChecklistCell(input);
  if (!Array.isArray(input)) return null;
  const out: ChecklistItem[] = [];
  for (const it of input) {
    if (typeof it === 'string') {
      const p = parseItemText(it);
      if (p) out.push(p);
    } else if (it && typeof it === 'object') {
      const o = it as Record<string, unknown>;
      const text = o.texto ?? o.text ?? o.titulo ?? o.title ?? o.item ?? o.nombre;
      if (typeof text !== 'string' || !text.trim()) continue;
      const doneRaw = o.hecho ?? o.done ?? o.completado ?? o.checked;
      const done = doneRaw === undefined || doneRaw === null ? null : parseYes(doneRaw);
      out.push({ text: text.trim().slice(0, MAX_CHECKLIST_TEXT), done });
    }
  }
  return out.slice(0, MAX_CHECKLIST_ITEMS);
}

/**
 * Lista pegada como texto (desde Notion, Obsidian, Keep, WhatsApp o un PDF):
 * una línea por ítem. Se usa en "Pegar checklist" dentro de una tarea.
 */
export function parsePastedChecklist(text: string): ChecklistItem[] {
  return text
    .split(/\r?\n/)
    .map(parseItemText)
    .filter((x): x is ChecklistItem => x !== null)
    .slice(0, MAX_CHECKLIST_ITEMS);
}

/** Checklist para una celda de CSV: "[x] Hecho | Pendiente". */
export function checklistToCell(items: { text: string; done: boolean }[]): string {
  return items.map((i) => (i.done ? `[x] ${i.text}` : i.text)).join(' | ');
}

/**
 * Une el checklist que viene en el archivo con el que ya tiene la tarea.
 * El archivo manda en qué ítems hay y en qué orden. Un ítem sin marca conserva
 * el estado del ítem existente con el mismo texto (sin tildes ni mayúsculas).
 */
export function mergeChecklist(
  existing: { text: string; done: boolean }[],
  incoming: ChecklistItem[],
): { text: string; done: boolean }[] {
  const prev = new Map<string, boolean>();
  existing.forEach((e) => {
    const k = normalizeKey(e.text);
    if (!prev.has(k)) prev.set(k, e.done);
  });
  return incoming.map((i) => ({
    text: i.text,
    done: i.done !== null ? i.done : prev.get(normalizeKey(i.text)) ?? false,
  }));
}

// ---------- Texto ----------

export const MAX_TITLE = 200;
export const MAX_DESCRIPTION = 5000;

/** Quita el apóstrofo que la exportación pone delante de celdas que parecen fórmulas. */
export function stripFormulaGuard(s: string): string {
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

export function cleanText(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = stripFormulaGuard(String(input).replace(/\r\n/g, '\n').trim());
  return s === '' ? null : s;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
