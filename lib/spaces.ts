// ============================================================
//  Espacios (v26, fase 2): qué materia o área es de Estudio y cuál de
//  Trabajo. Puro, con pruebas.
//
//  subjects.space puede venir vacío (antes de schema_v25 o en cuentas de
//  un solo modo): entonces cuenta como el modo de la persona. Solo quien
//  tiene "Los dos" ve filtrado por espacio; con un modo se ve todo.
// ============================================================
import type { Mode, Space } from './mode';

type S = { id: string; space?: string | null; credits?: number | null; default_template?: string | null };

export function spaceOf(s: { space?: string | null }, setting: Mode): Space {
  if (s.space === 'estudio' || s.space === 'trabajo') return s.space;
  return setting === 'trabajo' ? 'trabajo' : 'estudio';
}

/** Las materias o áreas del espacio abierto (todas si la persona tiene un solo modo). */
export function filterSubjects<X extends S>(subjects: X[], space: Space, setting: Mode): X[] {
  if (setting !== 'ambos') return subjects;
  return subjects.filter((s) => spaceOf(s, setting) === space);
}

/**
 * Tareas del espacio: las de sus materias o áreas, y las que no tienen
 * ninguna (esas se ven en los dos).
 */
export function filterBySubject<X extends { subject_id?: string | null }>(items: X[], visible: { id: string }[], all: { id: string }[], setting: Mode): X[] {
  if (setting !== 'ambos') return items;
  const vis = new Set(visible.map((s) => s.id));
  const known = new Set(all.map((s) => s.id));
  return items.filter((t) => !t.subject_id || vis.has(t.subject_id) || !known.has(t.subject_id));
}

/** Para ordenar la primera vez: créditos o plantilla de clase es Estudio; tarifa, cliente o acta es Trabajo. */
export function suggestSpace(s: S, hints: { rated?: boolean; client?: boolean; grades?: number } = {}): Space {
  if (hints.rated || hints.client || s.default_template === 'acta' || s.default_template === 'uno-a-uno') return 'trabajo';
  if ((s.credits ?? 0) > 0 || (hints.grades ?? 0) > 0) return 'estudio';
  return 'estudio';
}

/** ¿Falta ordenar? Solo con "Los dos" y alguna materia o área sin espacio. */
export function needsSorting(subjects: S[], setting: Mode): boolean {
  return setting === 'ambos' && subjects.some((s) => s.space !== 'estudio' && s.space !== 'trabajo');
}

/** Línea de Hoy: cuánto del otro espacio vence hoy o está vencido. */
export function otherSpaceLine(n: number, other: Space): string | null {
  if (!n) return null;
  return `En ${other === 'trabajo' ? 'Trabajo' : 'Estudio'}: ${n} ${n === 1 ? 'cosa' : 'cosas'} para hoy`;
}
