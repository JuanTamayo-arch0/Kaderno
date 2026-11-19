// ============================================================
//  Ropa de temporada de las mascotas (v23, fase 4). Puro, con pruebas.
//  Cada temporada vende sus prendas solo en sus fechas; lo que compras se
//  queda contigo y lo puedes poner todo el año. Las mismas fechas están en
//  schema_v22.sql (_pet_season_ok), que es la que cobra.
// ============================================================
import type { ItemId } from './art';

export type SeasonId = 'carnaval' | 'vacaciones' | 'amor_amistad' | 'halloween' | 'navidad';
export type Season = {
  id: SeasonId; name: string;
  /** Desde y hasta (mes 1-12, día), inclusive. Si `to` es antes que `from`, cruza el año. */
  from: [number, number]; to: [number, number];
  items: ItemId[];
};

export const SEASONS: Season[] = [
  { id: 'carnaval', name: 'Carnaval', from: [1, 20], to: [3, 10], items: ['antifaz'] },
  { id: 'vacaciones', name: 'Vacaciones de mitad de año', from: [6, 15], to: [7, 31], items: ['sombrero_vueltiao'] },
  { id: 'amor_amistad', name: 'Amor y Amistad', from: [9, 1], to: [9, 30], items: ['gafas_corazon'] },
  { id: 'halloween', name: 'Halloween', from: [10, 1], to: [11, 2], items: ['sombrero_bruja'] },
  { id: 'navidad', name: 'Navidad', from: [12, 1], to: [1, 6], items: ['gorro_navidad', 'cuernos_reno', 'luces'] },
];

const key = (m: number, d: number) => m * 100 + d;

/** ¿La fecha (día local) cae en la temporada? */
export function inSeason(s: Season, date: Date): boolean {
  const k = key(date.getMonth() + 1, date.getDate());
  const a = key(...s.from), b = key(...s.to);
  return a <= b ? k >= a && k <= b : k >= a || k <= b;
}

/** Temporada activa en esa fecha, o null. */
export function seasonOn(date: Date): Season | null {
  return SEASONS.find((s) => inSeason(s, date)) ?? null;
}

/** La temporada de una prenda, o null si se vende todo el año. */
export function seasonOfItem(id: ItemId): Season | null {
  return SEASONS.find((s) => s.items.includes(id)) ?? null;
}
export const isSeasonal = (id: ItemId) => !!seasonOfItem(id);

/** Cuándo empieza la próxima vez (hoy si ya está activa). */
export function nextStart(s: Season, date: Date): Date {
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (inSeason(s, d0)) return d0;
  const y = d0.getFullYear();
  const start = new Date(y, s.from[0] - 1, s.from[1]);
  return start >= d0 ? start : new Date(y + 1, s.from[0] - 1, s.from[1]);
}

/** Última fecha de la temporada activa que contiene `date`. */
export function seasonEnd(s: Season, date: Date): Date {
  const y = date.getFullYear();
  const end = new Date(y, s.to[0] - 1, s.to[1]);
  const d0 = new Date(y, date.getMonth(), date.getDate());
  return end >= d0 ? end : new Date(y + 1, s.to[0] - 1, s.to[1]);
}

/** La que sigue (la activa, si hay) y cuántos días faltan. */
export function upcomingSeason(date: Date): { season: Season; starts: Date; days: number } {
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const list = SEASONS.map((s) => ({ season: s, starts: nextStart(s, d0) })).sort((a, b) => a.starts.getTime() - b.starts.getTime());
  const n = list[0];
  return { ...n, days: Math.round((n.starts.getTime() - d0.getTime()) / 86_400_000) };
}
