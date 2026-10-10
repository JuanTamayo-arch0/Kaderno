import type { ColumnMapping, Field } from './types';

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
  id: ['id', 'id tarea', 'task id'],
  title: ['titulo', 'title', 'tarea', 'nombre', 'name', 'task'],
  description: ['descripcion', 'description', 'detalle', 'detalles', 'notas', 'notes'],
  status: ['estado', 'status', 'columna', 'column', 'state'],
  assignee: ['responsable', 'assignee', 'asignado', 'asignado a', 'assigned to', 'encargado', 'owner'],
  start: ['inicio', 'start', 'fecha inicio', 'fecha de inicio', 'start date', 'start at', 'desde'],
  due: ['entrega', 'due', 'fecha', 'fecha entrega', 'fecha de entrega', 'due date', 'due at', 'vence', 'deadline', 'hasta'],
  checklist: ['checklist', 'steps', 'subtareas', 'microtareas', 'lista', 'items', 'pasos'],
  delete: ['eliminar', 'delete', 'borrar', 'remove'],
};

/** Encabezados que escribe la exportación y las plantillas, en orden. */
export const EXPORT_HEADERS: { field: Field; header: string }[] = [
  { field: 'id', header: 'id' },
  { field: 'title', header: 'titulo' },
  { field: 'description', header: 'descripcion' },
  { field: 'status', header: 'estado' },
  { field: 'assignee', header: 'responsable' },
  { field: 'start', header: 'inicio' },
  { field: 'due', header: 'entrega' },
  { field: 'checklist', header: 'checklist' },
];

export const FIELD_LABELS: Record<Field, string> = {
  id: 'ID',
  title: 'Título',
  description: 'Descripción',
  status: 'Estado',
  assignee: 'Responsable',
  start: 'Inicio',
  due: 'Entrega',
  checklist: 'Checklist',
  delete: 'Eliminar',
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
