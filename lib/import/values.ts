import { normalizeKey } from './fields';
import type { BoardColumnRef, ChecklistItem, ProjectStatus } from './types';

// ---------- Columnas (estado) ----------

/** Columnas por defecto de un proyecto nuevo (iguales a DEFAULT_COLUMNS de lib/projects). */
export const DEFAULT_BOARD: BoardColumnRef[] = [
  { key: 'todo', label: 'Por hacer' },
  { key: 'doing', label: 'En curso' },
  { key: 'review', label: 'En revisión' },
  { key: 'done', label: 'Hecho', done: true },
];

// Palabras comunes que se entienden aunque el tablero tenga otros nombres.
const GENERIC: Record<string, 'first' | 'doing' | 'review' | 'done'> = {
  'por hacer': 'first', 'pendiente': 'first', 'pendientes': 'first', 'todo': 'first', 'to do': 'first',
  'backlog': 'first', 'nuevo': 'first', 'nueva': 'first', 'sin empezar': 'first',
  'en curso': 'doing', 'en progreso': 'doing', 'haciendo': 'doing', 'doing': 'doing',
  'in progress': 'doing', 'progreso': 'doing', 'trabajando': 'doing',
  'en revision': 'review', 'revision': 'review', 'review': 'review', 'in review': 'review',
  'por revisar': 'review', 'revisar': 'review',
  'hecho': 'done', 'hecha': 'done', 'terminado': 'done', 'terminada': 'done', 'listo': 'done', 'lista': 'done',
  'done': 'done', 'completado': 'done', 'completada': 'done', 'completed': 'done', 'finalizado': 'done',
  'entregado': 'done', 'entregada': 'done',
};

export function columnLabel(columns: BoardColumnRef[], key: string | null): string {
  if (!key) return columns[0]?.label ?? '';
  return columns.find((c) => c.key === key)?.label ?? columns[0]?.label ?? key;
}

/**
 * Busca la columna del tablero que corresponde a lo que venga escrito en "estado":
 * el nombre de una columna del proyecto, su clave interna, o una palabra común
 * ("Hecho" va a la columna marcada como final, "Por hacer" a la primera).
 */
export function parseStatus(
  input: unknown,
  columns: BoardColumnRef[],
): { ok: true; value: ProjectStatus | null } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, value: null };
  const raw = String(input).trim();
  const s = normalizeKey(raw);
  if (s === '') return { ok: true, value: null };
  const cols = columns.length ? columns : DEFAULT_BOARD;

  const byLabel = cols.find((c) => normalizeKey(c.label) === s);
  if (byLabel) return { ok: true, value: byLabel.key };
  const byKey = cols.find((c) => c.key === raw || normalizeKey(c.key) === s);
  if (byKey) return { ok: true, value: byKey.key };

  const g = GENERIC[s];
  if (g === 'first') return { ok: true, value: cols[0].key };
  if (g === 'done') {
    const d = cols.find((c) => c.done);
    if (d) return { ok: true, value: d.key };
  }
  if (g === 'doing' || g === 'review') {
    const k = cols.find((c) => c.key === g);
    if (k) return { ok: true, value: k.key };
  }
  return {
    ok: false,
    error: `"${raw}" no es una columna de este proyecto (${cols.map((c) => c.label).join(', ')})`,
  };
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
