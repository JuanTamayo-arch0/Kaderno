// ============================================================
//  Precarga de pantallas (web).
//
//  Cada pantalla se descarga la primera vez que se abre. Un rato después de
//  arrancar, cuando el navegador está libre, se bajan las más usadas por
//  detrás: al cambiar de pantalla ya están y el cambio es inmediato.
// ============================================================
import { Platform } from 'react-native';

let started = false;

export function preloadScreens(): void {
  if (started || Platform.OS !== 'web' || typeof window === 'undefined') return;
  started = true;
  const loaders: (() => Promise<unknown>)[] = [
    () => import('../app/(tabs)/materias'),
    () => import('../app/(tabs)/estudiar'),
    () => import('../app/(tabs)/proyectos'),
    () => import('../app/(tabs)/enfoque'),
    () => import('../app/(tabs)/oraculo'),
    () => import('../app/(tabs)/horario'),
    () => import('../app/materia/[id]'),
    () => import('../app/proyectos/[id]'),
    () => import('../app/repaso'),
    () => import('../app/mascota'),
    () => import('../app/ajustes'),
    () => import('../app/nota/[id]'),
  ];
  const idle = (fn: () => void) => ((window as any).requestIdleCallback ? (window as any).requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 300));
  const next = (i: number) => {
    if (i >= loaders.length) return;
    // import() de Metro devuelve una promesa sin .catch: se envuelve.
    idle(() => { Promise.resolve().then(loaders[i]).catch(() => {}).then(() => next(i + 1)); });
  };
  // Primero que cargue lo que se ve; luego, de a una.
  setTimeout(() => next(0), 4000);
}
