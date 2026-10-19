import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from './theme';
import { getTaskTypes, type TaskTypeRow } from './db';

// ============================================================
//  Tipos de tarea: cinco por defecto (con Repaso, v20) + los que cree el usuario.
//
//  Restricción de diseño: taskTypeMeta() se llama DENTRO del render en varios
//  archivos, así que no puede ser async. La solución es un registro en memoria:
//  loadTaskTypes() trae los tipos del usuario al arrancar y los fusiona con los
//  por defecto; taskTypeMeta() sigue siendo sincrónica y sólo lee el registro.
//  En web además se guarda una copia en localStorage y se lee de forma síncrona
//  al importar el módulo, así los tipos propios ya están listos en el primer
//  render (sin parpadeo) aunque la consulta a la base tarde.
// ============================================================

export type TaskType = string;
export type TypeMeta = {
  key: string;
  label: string;
  icon: string;
  color: string;
  position: number;
  builtin: boolean;
};

// Los cuatro de siempre. El color se guarda como "tono" de la paleta, no como
// hex fijo: así siguen al tema activo (claro/oscuro) en vez de quedar pegados
// al color que tuviera C en el momento de importar el módulo.
type Tone = 'brand' | 'brand2' | 'good' | 'warn' | 'bad';
const BUILTIN: { key: string; label: string; icon: string; tone: Tone }[] = [
  { key: 'tarea', label: 'Tarea', icon: '📝', tone: 'brand' },
  { key: 'examen', label: 'Examen', icon: '📕', tone: 'bad' },
  { key: 'quiz', label: 'Quiz', icon: '✍️', tone: 'warn' },
  { key: 'proyecto', label: 'Proyecto', icon: '📦', tone: 'brand2' },
  // v20: sesiones del plan de repaso de un examen.
  { key: 'repaso', label: 'Repaso', icon: '🔁', tone: 'good' },
];
export const BUILTIN_KEYS = BUILTIN.map((b) => b.key);

// Registro interno. `color: null` = usar el tono de la paleta (sólo builtins).
type Entry = { label: string; icon: string; color: string | null; tone: Tone | null; position: number; builtin: boolean };

const REGISTRY = new Map<string, Entry>();

function resetToBuiltins(): void {
  REGISTRY.clear();
  BUILTIN.forEach((b, i) => {
    REGISTRY.set(b.key, { label: b.label, icon: b.icon, color: null, tone: b.tone, position: i, builtin: true });
  });
}
resetToBuiltins();

function colorOf(e: Entry): string {
  if (e.color) return e.color;
  return (e.tone ? C[e.tone] : C.brand) ?? C.brand;
}

// ---------- Lectura sincrónica (lo que usa el render) ----------
export function taskTypeMeta(t?: string | null): TypeMeta {
  const key = (t ?? '').trim() || 'tarea';
  const e = REGISTRY.get(key) ?? REGISTRY.get('tarea')!;
  const k = REGISTRY.has(key) ? key : 'tarea';
  return { key: k, label: e.label, icon: e.icon, color: colorOf(e), position: e.position, builtin: e.builtin };
}

export function taskTypeList(): TypeMeta[] {
  return [...REGISTRY.entries()]
    .map(([key, e]) => ({ key, label: e.label, icon: e.icon, color: colorOf(e), position: e.position, builtin: e.builtin }))
    .sort((a, b) => (a.position - b.position) || a.label.localeCompare(b.label, 'es'));
}

// Compatibilidad con el código que esperaba las constantes viejas.
export const TASK_TYPE_LIST = BUILTIN_KEYS;
export function taskTypeExists(key: string): boolean { return REGISTRY.has(key); }

// ---------- Registro <-> filas de la base ----------
const STORE_KEY = 'kaderno.tasktypes';

function applyRows(rows: TaskTypeRow[]): void {
  resetToBuiltins();
  for (const r of rows) {
    const builtin = BUILTIN_KEYS.includes(r.key);
    const prev = REGISTRY.get(r.key);
    REGISTRY.set(r.key, {
      label: r.label || prev?.label || r.key,
      icon: r.icon || prev?.icon || '📌',
      color: r.color || null,
      tone: builtin ? (prev?.tone ?? null) : null,
      position: typeof r.position === 'number' ? r.position : (prev?.position ?? 100),
      builtin,
    });
  }
}

function cacheRows(rows: TaskTypeRow[]): void {
  const raw = JSON.stringify(rows);
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, raw);
    else void AsyncStorage.setItem(STORE_KEY, raw);
  } catch { /* noop */ }
}

// Copia en caché leída de forma síncrona en web al importar.
if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) applyRows(JSON.parse(raw) as TaskTypeRow[]);
  } catch { /* noop */ }
}

// Se llama al iniciar sesión (y al guardar cambios en /tipos).
export async function loadTaskTypes(): Promise<TypeMeta[]> {
  if (Platform.OS !== 'web') {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) applyRows(JSON.parse(raw) as TaskTypeRow[]);
    } catch { /* noop */ }
  }
  try {
    const rows = await getTaskTypes();
    applyRows(rows);
    cacheRows(rows);
  } catch { /* sin conexión: se queda con la caché o los por defecto */ }
  return taskTypeList();
}

export function clearTaskTypesCache(): void {
  resetToBuiltins();
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.removeItem(STORE_KEY);
    else void AsyncStorage.removeItem(STORE_KEY);
  } catch { /* noop */ }
}

// ---------- Utilidades para la pantalla de tipos ----------
// Convierte "Laboratorio de Física" -> "laboratorio-de-fisica"
export function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function uniqueTypeKey(label: string): string {
  const base = slugify(label) || 'tipo';
  if (!REGISTRY.has(base)) return base;
  let i = 2;
  while (REGISTRY.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
