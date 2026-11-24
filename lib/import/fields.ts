import type { ColumnMapping, Field } from './types';
import { t, lang } from '../i18n';

/** Quita tildes, pasa a minúsculas y colapsa espacios, guiones y guiones bajos. */
export function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_\-.]+/g, ' ')
    .trim();
}

/** Encabezados aceptados por campo, ya normalizados. El primero es el que usa la exportación. */
export const FIELD_ALIASES: Record<Field, string[]> = {
  id: ['id', 'id tarea', 'task id'], // i18n-ok
  title: ['titulo', 'title', 'tarea', 'nombre', 'name', 'task'], // i18n-ok
  description: ['descripcion', 'description', 'detalle', 'detalles', 'notas', 'notes'], // i18n-ok
  status: ['estado', 'status', 'columna', 'column', 'state'], // i18n-ok
  assignee: ['responsable', 'assignee', 'asignado', 'asignado a', 'assigned to', 'encargado', 'owner'], // i18n-ok
  start: ['inicio', 'start', 'fecha inicio', 'fecha de inicio', 'start date', 'start at', 'desde'], // i18n-ok
  due: ['entrega', 'due', 'fecha', 'fecha entrega', 'fecha de entrega', 'due date', 'due at', 'vence', 'deadline', 'hasta'], // i18n-ok
  checklist: ['checklist', 'steps', 'subtareas', 'microtareas', 'lista', 'items', 'pasos'], // i18n-ok
  delete: ['eliminar', 'delete', 'borrar', 'remove'], // i18n-ok
};

/** Encabezados que escribe la exportación y las plantillas, en orden. */
// v30: en inglés se exporta con encabezados en inglés; el importador entiende los dos.
const HEADERS_ES = ['id', 'titulo', 'descripcion', 'estado', 'responsable', 'inicio', 'entrega', 'checklist']; // i18n-ok
const HEADERS_EN = ['id', 'title', 'description', 'status', 'assignee', 'start', 'due', 'checklist'];
const EXPORT_FIELDS: Field[] = ['id', 'title', 'description', 'status', 'assignee', 'start', 'due', 'checklist'];
export const EXPORT_HEADERS: { field: Field; header: string }[] = EXPORT_FIELDS.map((field, i) => ({ field, header: (lang() === 'en' ? HEADERS_EN : HEADERS_ES)[i] }));

export const FIELD_LABELS: Record<Field, string> = {
  id: 'ID',
  title: t('Título'),
  description: t('Descripción'),
  status: t('Estado'),
  assignee: t('Responsable'),
  start: t('Inicio'),
  due: t('Entrega'),
  checklist: t('Checklist'),
  delete: t('Eliminar'),
};

const ALIAS_INDEX: Map<string, Field> = (() => {
  const m = new Map<string, Field>();
  (Object.keys(FIELD_ALIASES) as Field[]).forEach((f) => {
    FIELD_ALIASES[f].forEach((a) => m.set(a, f));
  });
  return m;
})();

export function fieldForHeader(header: string): Field | null {
  return ALIAS_INDEX.get(normalizeKey(header)) ?? null;
}

/**
 * Asigna cada encabezado a un campo. Si dos encabezados apuntan al mismo campo,
 * gana el primero y el otro queda sin asignar (el usuario lo puede cambiar).
 */
export function autoMap(headers: string[]): ColumnMapping {
  const used = new Set<Field>();
  const mapping: ColumnMapping = {};
  for (const h of headers) {
    const f = fieldForHeader(h);
    if (f && !used.has(f)) {
      mapping[h] = f;
      used.add(f);
    } else {
      mapping[h] = null;
    }
  }
  return mapping;
}

/** Encabezados que no se pudieron asignar, para mostrarlos en la vista previa. */
export function unmappedHeaders(mapping: ColumnMapping): string[] {
  return Object.keys(mapping).filter((h) => mapping[h] === null);
}

export function hasTitleColumn(mapping: ColumnMapping): boolean {
  return Object.values(mapping).includes('title');
}

export function hasIdColumn(mapping: ColumnMapping): boolean {
  return Object.values(mapping).includes('id');
}
