import { Platform } from 'react-native';

// ============================================================
//  Última foto de una pantalla, para pintarla al instante.
//
//  Al abrir Hoy o un proyecto se muestra lo que había la vez anterior
//  mientras llega lo nuevo de Supabase (y se reemplaza en cuanto llega).
//  Así la app no arranca en blanco ni con esqueletos cada vez.
//
//  Vive en memoria y, en web, en localStorage del propio dispositivo. Las
//  claves llevan el id del usuario y se borran al cerrar sesión. Si algo
//  falla (modo privado, sin espacio), simplemente no hay foto.
// ============================================================

const PREFIX = 'kd:snap:';
const MAX_CHARS = 400_000;
const mem = new Map<string, any>();
const web = Platform.OS === 'web' && typeof window !== 'undefined';

export function readSnap<T>(key: string | null | undefined): T | null {
  if (!key) return null;
  if (mem.has(key)) return mem.get(key) as T;
  if (!web) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    mem.set(key, v);
    return v as T;
  } catch { return null; }
}

export function writeSnap(key: string | null | undefined, value: unknown): void {
  if (!key) return;
  mem.set(key, value);
  if (!web) return;
  try {
    const raw = JSON.stringify(value);
    if (raw.length > MAX_CHARS) { window.localStorage.removeItem(PREFIX + key); return; }
    window.localStorage.setItem(PREFIX + key, raw);
  } catch { /* sin espacio o modo privado: queda solo en memoria */ }
}

/** Al cerrar sesión: que la siguiente persona en este navegador no vea nada. */
export function clearSnaps(): void {
  mem.clear();
  if (!web) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch { /* */ }
}

/** Atajo para pantallas: lo guardado la vez anterior (o null) y una función para guardar lo nuevo. */
export function snapshotFor<T>(key: string | null | undefined): { initial: T | null; save: (v: T) => void } {
  return { initial: readSnap<T>(key), save: (v: T) => writeSnap(key, v) };
}
