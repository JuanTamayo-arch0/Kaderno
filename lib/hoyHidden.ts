// ============================================================
//  Tareas de proyecto ocultas en "Hoy".
//  Se guardan en user_prefs.settings.hoyOcultas = { tasks: [...], projects: [...] }
//  para que viajen entre dispositivos. Ocultar no cambia nada del proyecto:
//  la tarea sigue en el tablero para todo el equipo.
// ============================================================
import { fetchPrefs, savePrefs } from './db';

export type HoyHidden = { tasks: string[]; projects: string[] };
let cache: HoyHidden | null = null;

export async function loadHoyHidden(): Promise<HoyHidden> {
  if (cache) return cache;
  const p = await fetchPrefs().catch(() => null);
  const raw = (p as any)?.hoyOcultas ?? {};
  cache = { tasks: Array.isArray(raw.tasks) ? raw.tasks : [], projects: Array.isArray(raw.projects) ? raw.projects : [] };
  return cache;
}
async function save(next: HoyHidden) {
  // Máximo 300 por lista para que la preferencia no crezca sin límite.
  cache = { tasks: next.tasks.slice(-300), projects: next.projects.slice(-100) };
  await savePrefs({ hoyOcultas: cache });
}
export async function setTaskHidden(id: string, hidden: boolean) {
  const h = await loadHoyHidden();
  await save({ ...h, tasks: hidden ? [...h.tasks.filter((x) => x !== id), id] : h.tasks.filter((x) => x !== id) });
}
export async function setProjectHidden(id: string, hidden: boolean) {
  const h = await loadHoyHidden();
  await save({ ...h, projects: hidden ? [...h.projects.filter((x) => x !== id), id] : h.projects.filter((x) => x !== id) });
}
export async function clearHoyHidden() { await save({ tasks: [], projects: [] }); }
/** Quita de la lista las tareas que ya no están pendientes (terminadas o borradas). */
export async function pruneHiddenTasks(pendingIds: string[]) {
  const h = await loadHoyHidden();
  const keep = h.tasks.filter((id) => pendingIds.includes(id));
  if (keep.length !== h.tasks.length) await save({ ...h, tasks: keep });
}
export function resetHoyHiddenCache() { cache = null; }

// ---------- Qué mostrar en Hoy: todo, solo materias o solo proyectos ----------
export type HoyVista = 'todo' | 'materias' | 'proyectos';
/** Lee la vista guardada. Respeta el ajuste viejo "Tareas de proyectos en Hoy" apagado. */
export function vistaFromPrefs(prefs: any): HoyVista {
  const v = prefs?.hoyVista;
  if (v === 'todo' || v === 'materias' || v === 'proyectos') return v;
  return prefs?.hoyProyectos === false ? 'materias' : 'todo';
}
/** Guarda la vista y deja el ajuste viejo coherente (Ajustes lo sigue mostrando). */
export async function saveHoyVista(v: HoyVista) {
  await savePrefs({ hoyVista: v, hoyProyectos: v !== 'materias' });
}
