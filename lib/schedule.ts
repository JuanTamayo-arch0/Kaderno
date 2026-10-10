import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { savePrefs } from './db';

// ============================================================
//  Configuración del horario (bloques de hora personalizables)
//
//  Antes los siete bloques ('6–8 am', '8–10 am', …) estaban escritos a mano en
//  la pantalla y el índice del arreglo era la columna `slot` de la base. Eso
//  sirve para nuestra universidad, pero no para quien maneja otros rangos.
//
//  Ahora la configuración vive aquí: cada bloque tiene un id ESTABLE, así que
//  cuando el usuario agrega, borra o reordena bloques se puede calcular el
//  mapeo viejo-índice -> nuevo-índice y mover las clases ya guardadas con
//  remapSlots() en vez de perderlas.
//
//  Se persiste igual que la personalización: local (síncrono en web) + en
//  user_prefs.settings.schedule para que viaje entre dispositivos.
// ============================================================

export type TimeBlock = { id: string; start: string; end: string }; // 'HH:MM' 24h
export type ScheduleCfg = { blocks: TimeBlock[]; days: number; fmt24: boolean };

export const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DAY_NAMES_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Los siete de siempre, para que nadie note el cambio si no lo toca.
export const DEFAULT_BLOCKS: TimeBlock[] = [
  { id: 'b1', start: '06:00', end: '08:00' },
  { id: 'b2', start: '08:00', end: '10:00' },
  { id: 'b3', start: '10:00', end: '12:00' },
  { id: 'b4', start: '12:00', end: '14:00' },
  { id: 'b5', start: '14:00', end: '16:00' },
  { id: 'b6', start: '16:00', end: '18:00' },
  { id: 'b7', start: '18:00', end: '20:00' },
];

export const DEFAULT_SCHEDULE: ScheduleCfg = { blocks: DEFAULT_BLOCKS, days: 5, fmt24: false };

export let SCHEDULE: ScheduleCfg = { ...DEFAULT_SCHEDULE, blocks: DEFAULT_BLOCKS.map((b) => ({ ...b })) };
const STORE_KEY = 'kaderno.schedule';

// ---------- Ids estables ----------
let seq = 0;
export function newBlockId(): string {
  seq += 1;
  return `b${Date.now().toString(36)}${seq.toString(36)}`;
}

// ---------- Horas ----------
export function clampHHMM(s: string): string {
  const m = /^(\d{1,2}):?(\d{2})?$/.exec((s ?? '').trim());
  if (!m) return '00:00';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10) || 0));
  const mi = Math.min(59, Math.max(0, parseInt(m[2] ?? '0', 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = clampHHMM(hhmm).split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  const t = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// '14:30' -> '2:30 pm' (o '14:30' si fmt24)
export function fmtHour(hhmm: string, fmt24 = SCHEDULE.fmt24): string {
  const [h, m] = clampHHMM(hhmm).split(':').map((n) => parseInt(n, 10));
  if (fmt24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ap = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${ap}` : `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

// Etiqueta corta de un bloque: '8–10 am', '10 am–12 pm', '08:00–10:00'
export function blockLabel(b: TimeBlock, fmt24 = SCHEDULE.fmt24): string {
  if (fmt24) return `${clampHHMM(b.start)}–${clampHHMM(b.end)}`;
  const a = fmtHour(b.start, false);
  const z = fmtHour(b.end, false);
  const half = (s: string) => (s.endsWith('pm') ? 'pm' : 'am');
  // Si ambos extremos caen en la misma mitad del día, el 'am/pm' se dice una vez.
  if (half(a) === half(z)) return `${a.replace(/ ?(am|pm)$/, '')}–${z}`;
  return `${a}–${z}`;
}

export function blockLabelLong(b: TimeBlock, fmt24 = SCHEDULE.fmt24): string {
  return `${fmtHour(b.start, fmt24)} – ${fmtHour(b.end, fmt24)}`;
}

export function blockDuration(b: TimeBlock): number {
  const d = toMinutes(b.end) - toMinutes(b.start);
  return d > 0 ? d : d + 1440;
}

// ---------- Generador (hora inicio / hora fin / duración) ----------
export function generateBlocks(startHHMM: string, endHHMM: string, minutes: number): TimeBlock[] {
  const step = Math.max(15, Math.min(600, Math.round(minutes || 60)));
  let cur = toMinutes(startHHMM);
  const end = toMinutes(endHHMM);
  const out: TimeBlock[] = [];
  let guard = 0;
  while (cur + step <= end && guard < 48) {
    out.push({ id: newBlockId(), start: fromMinutes(cur), end: fromMinutes(cur + step) });
    cur += step;
    guard += 1;
  }
  // Si el rango no alcanza para un bloque completo, deja al menos uno.
  if (!out.length) out.push({ id: newBlockId(), start: fromMinutes(toMinutes(startHHMM)), end: fromMinutes(toMinutes(startHHMM) + step) });
  return out;
}

export function sortBlocks(blocks: TimeBlock[]): TimeBlock[] {
  return [...blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

// Solapamientos: se avisa, no se bloquea (alguien puede querer bloques paralelos).
export function overlappingIds(blocks: TimeBlock[]): string[] {
  const s = sortBlocks(blocks);
  const bad = new Set<string>();
  for (let i = 1; i < s.length; i++) {
    if (toMinutes(s[i].start) < toMinutes(s[i - 1].end)) { bad.add(s[i].id); bad.add(s[i - 1].id); }
  }
  return [...bad];
}

// ---------- Normalizar / validar lo que venga de la nube ----------
export function normalizeCfg(raw: any): ScheduleCfg {
  const blocksIn = Array.isArray(raw?.blocks) ? raw.blocks : null;
  const seen = new Set<string>();
  const blocks: TimeBlock[] = (blocksIn ?? DEFAULT_BLOCKS)
    .map((b: any, i: number) => {
      let id = typeof b?.id === 'string' && b.id ? b.id : `b${i + 1}`;
      while (seen.has(id)) id = `${id}x`;
      seen.add(id);
      return { id, start: clampHHMM(String(b?.start ?? '06:00')), end: clampHHMM(String(b?.end ?? '08:00')) };
    })
    .slice(0, 24);
  const days = Math.min(7, Math.max(1, Number(raw?.days) || 5));
  return { blocks: blocks.length ? blocks : DEFAULT_BLOCKS.map((b) => ({ ...b })), days, fmt24: !!raw?.fmt24 };
}

// ---------- Estado ----------
export function applySchedule(cfg: ScheduleCfg): void {
  SCHEDULE = normalizeCfg(cfg);
}

export function currentBlocks(): TimeBlock[] { return SCHEDULE.blocks; }
export function currentDays(): string[] { return DAY_NAMES.slice(0, SCHEDULE.days); }

// Etiqueta de un slot guardado en la base (índice). Si el usuario redujo los
// bloques y quedó una clase colgando, no se rompe: devuelve un texto neutro.
export function slotLabel(slot: number, fmt24 = SCHEDULE.fmt24): string {
  const b = SCHEDULE.blocks[slot];
  return b ? blockLabel(b, fmt24) : `Bloque ${slot + 1}`;
}

// Lectura SÍNCRONA en web para que el horario se pinte bien en el primer render.
if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) SCHEDULE = normalizeCfg(JSON.parse(raw));
  } catch { /* noop */ }
}

export async function loadScheduleNative(): Promise<ScheduleCfg> {
  if (Platform.OS === 'web') return SCHEDULE;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) applySchedule(JSON.parse(raw));
  } catch { /* noop */ }
  return SCHEDULE;
}

function persistLocal(cfg: ScheduleCfg): void {
  try {
    const raw = JSON.stringify(cfg);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, raw);
    else void AsyncStorage.setItem(STORE_KEY, raw);
  } catch { /* noop */ }
}

// Guarda local + en la nube. savePrefs() fusiona, así que no pisa la
// personalización que vive en el mismo jsonb.
export async function saveSchedule(cfg: ScheduleCfg): Promise<void> {
  applySchedule(cfg);
  persistLocal(SCHEDULE);
  try { await savePrefs({ schedule: SCHEDULE }); } catch { /* sin conexión: queda local */ }
}

// Aplica lo que venga de la nube al iniciar sesión (sin volver a subirlo).
export function applyRemoteSchedule(remote: any): void {
  if (!remote) return;
  applySchedule(remote);
  persistLocal(SCHEDULE);
}

// ============================================================
//  Remapeo de slots al cambiar los bloques
//  Se compara por ID: los bloques que sobreviven llevan sus clases al nuevo
//  índice; los que desaparecen devuelven las clases que se van a borrar para
//  poder avisar antes de confirmar.
// ============================================================
export type RemapPlan = {
  moves: { fromSlot: number; toSlot: number }[];
  removedSlots: number[];
};

export function planRemap(oldBlocks: TimeBlock[], newBlocks: TimeBlock[]): RemapPlan {
  const newIndexById = new Map<string, number>();
  newBlocks.forEach((b, i) => newIndexById.set(b.id, i));
  const moves: { fromSlot: number; toSlot: number }[] = [];
  const removedSlots: number[] = [];
  oldBlocks.forEach((b, i) => {
    const ni = newIndexById.get(b.id);
    if (ni === undefined) removedSlots.push(i);
    else if (ni !== i) moves.push({ fromSlot: i, toSlot: ni });
  });
  return { moves, removedSlots };
}
