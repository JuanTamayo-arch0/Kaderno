import Papa from 'papaparse';
import { decodeText } from './encoding';
import type { FileFormat, ParsedFile } from './types';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 500;

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

function detectFormat(name: string | undefined, text: string): FileFormat {
  const ext = (name ?? '').toLowerCase().split('.').pop() ?? '';
  if (ext === 'json') return 'json';
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    // Un .txt con JSON adentro (lo que guardan algunos celulares al copiar de una IA).
    const first = stripFences(text).trimStart()[0];
    if (ext === 'txt' && (first === '{' || first === '[')) return 'json';
    return 'csv';
  }
  const first = stripFences(text).trimStart()[0];
  return first === '{' || first === '[' ? 'json' : 'csv';
}

/** Quita los bloques ```json ... ``` con los que las IA suelen envolver la respuesta. */
export function stripFences(text: string): string {
  const t = text.replace(/^﻿/, '').trim();
  const m = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/.exec(t);
  if (m) return m[1];
  // Texto antes o después del bloque: tomar el primer bloque.
  const inner = /```(?:json)?\s*\n([\s\S]*?)\n?```/.exec(t);
  return inner ? inner[1] : t;
}

/** Lee un archivo elegido por el usuario. */
export function parseImportFile(file: { name?: string; bytes: Uint8Array }): ParsedFile {
  if (file.bytes.length === 0) throw new ImportError('El archivo está vacío');
  if (file.bytes.length > MAX_FILE_BYTES) throw new ImportError('El archivo pesa más de 2 MB');
  const { text, encoding } = decodeText(file.bytes);
  const format = detectFormat(file.name, text);
  const parsed = format === 'json' ? parseJsonText(text) : parseCsvText(text);
  if (format === 'csv') parsed.encoding = encoding;
  return parsed;
}

/** Lee texto pegado directamente (por ejemplo, la respuesta de una IA). */
export function parseImportText(text: string): ParsedFile {
  if (!text.trim()) throw new ImportError('No hay nada para importar');
  if (text.length > MAX_FILE_BYTES) throw new ImportError('El texto es demasiado largo');
  return detectFormat(undefined, text) === 'json' ? parseJsonText(text) : parseCsvText(text);
}

// ---------- JSON ----------

export function parseJsonText(text: string): ParsedFile {
  let data: unknown;
  try {
    data = JSON.parse(stripFences(text));
  } catch (e) {
    throw new ImportError('El JSON no es válido. Revisa que esté completo y sin texto extra');
  }
  let list: unknown;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    list = o.tareas ?? o.tasks ?? o.items ?? o.data;
  }
  if (!Array.isArray(list)) {
    throw new ImportError('El JSON debe ser una lista de tareas o un objeto con la clave "tareas"');
  }
  const headers: string[] = [];
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  const rowNumbers: number[] = [];
  const warnings: string[] = [];
  list.forEach((item, idx) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push(`El elemento ${idx + 1} no es una tarea y se ignoró`);
      return;
    }
    const obj = item as Record<string, unknown>;
    Object.keys(obj).forEach((k) => {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    });
    rows.push(obj);
    rowNumbers.push(idx + 1);
  });
  if (rows.length === 0) throw new ImportError('El archivo no tiene tareas');
  if (rows.length > MAX_ROWS) throw new ImportError(`Máximo ${MAX_ROWS} tareas por archivo (este tiene ${rows.length})`);
  return { format: 'json', headers, rows, rowNumbers, warnings };
}

// ---------- CSV ----------

/** Cuenta separadores en la primera línea, ignorando lo que está entre comillas. */
export function detectDelimiter(text: string): string {
  const candidates = [',', ';', '\t'];
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && (c === '\n' || c === '\r')) {
      break;
    } else if (!inQuotes && c in counts) {
      counts[c]++;
    }
  }
  let best = ',';
  for (const d of candidates) if (counts[d] > counts[best]) best = d;
  return best;
}

export function parseCsvText(text: string): ParsedFile {
  const clean = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(clean);
  const result = Papa.parse<string[]>(clean, { delimiter, skipEmptyLines: false });
  const warnings: string[] = [];
  const data = result.data as string[][];
  if (result.errors.length) {
    const quoteErr = result.errors.find((e) => e.type === 'Quotes');
    if (quoteErr) throw new ImportError(`Hay comillas sin cerrar cerca de la fila ${(quoteErr.row ?? 0) + 1}`);
  }
  const isEmpty = (r: string[]) => r.every((c) => (c ?? '').trim() === '');
  const headerIdx = data.findIndex((r) => !isEmpty(r));
  if (headerIdx < 0) throw new ImportError('El archivo está vacío');

  const headers: string[] = [];
  const counts = new Map<string, number>();
  data[headerIdx].forEach((h, i) => {
    let name = (h ?? '').trim() || `Columna ${i + 1}`;
    const c = (counts.get(name) ?? 0) + 1;
    counts.set(name, c);
    if (c > 1) name = `${name} (${c})`;
    headers.push(name);
  });

  const rows: Record<string, unknown>[] = [];
  const rowNumbers: number[] = [];
  for (let i = headerIdx + 1; i < data.length; i++) {
    const r = data[i];
    if (isEmpty(r)) continue;
    if (r.length > headers.length && r.slice(headers.length).some((c) => (c ?? '').trim() !== '')) {
      warnings.push(`La fila ${i + 1} tiene más columnas que el encabezado; se ignoró lo que sobra`);
    }
    const obj: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      obj[h] = r[j] ?? '';
    });
    rows.push(obj);
    rowNumbers.push(i + 1);
  }
  if (rows.length === 0) throw new ImportError('El archivo solo tiene encabezados, no hay tareas');
  if (rows.length > MAX_ROWS) throw new ImportError(`Máximo ${MAX_ROWS} tareas por archivo (este tiene ${rows.length})`);
  return { format: 'csv', headers, rows, rowNumbers, delimiter, warnings };
}
