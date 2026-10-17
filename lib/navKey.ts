// Secciones de la navegación y cuál corresponde a cada ruta (sin dependencias de React).
export type NavKey =
  | 'index' | 'materias' | 'horario' | 'proyectos' | 'estudiar'
  | 'enfoque' | 'repaso' | 'oraculo' | 'capturar'
  | 'buscar' | 'ajustes' | 'tipos' | 'personalizar' | 'papelera' | 'mascota';

/** Qué entrada de la barra corresponde a la ruta actual. */
export function navKeyOf(path: string): NavKey | null {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/index') return 'index';
  if (p.startsWith('/materia') || p.startsWith('/nota')) return 'materias';
  if (p.startsWith('/importar')) return 'index';
  const first = p.split('/')[1] as NavKey;
  const known: NavKey[] = ['horario', 'proyectos', 'estudiar', 'enfoque', 'repaso', 'oraculo', 'capturar', 'mascota', 'buscar', 'ajustes', 'tipos', 'personalizar', 'papelera'];
  return known.includes(first) ? first : null;
}

