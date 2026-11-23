import { useMode } from './mode';
import { filterBySubject, filterSubjects } from './spaces';

/**
 * v26: lo del espacio abierto. Con un solo modo no filtra nada.
 *   const sp = useSpaceFilter();
 *   sp.subjects(all)           materias o áreas del espacio
 *   sp.items(tasks, all)       tareas u horas de esas materias o áreas (y las sin ninguna)
 */
export function useSpaceFilter() {
  const { mode, space } = useMode();
  return {
    space, both: mode === 'ambos',
    subjects: <X extends { id: string; space?: string | null }>(all: X[]): X[] => filterSubjects(all, space, mode),
    items: <X extends { subject_id?: string | null }>(items: X[], all: { id: string; space?: string | null }[]): X[] =>
      filterBySubject(items, filterSubjects(all, space, mode), all, mode),
  };
}
