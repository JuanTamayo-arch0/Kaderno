// ============================================================
//  Reglas de la economía de la mascota (las mismas de schema_v16.sql).
//  La base es la que cobra y paga; esto sirve para mostrar precios,
//  niveles y si algo alcanza, sin preguntarle al servidor.
// ============================================================
import type { ItemId, Slot, Species } from './art';
import { HOME_ITEMS, homeHas, type Home, type HomeItemId } from './home';
import { isSeasonal, seasonOfItem, inSeason } from './seasons';

export const ITEM_RULES: Record<ItemId, { price: number; level: number; slot: Slot }> = {
  gorro: { price: 60, level: 1, slot: 'cabeza' },
  corbatin: { price: 80, level: 1, slot: 'cuello' },
  collar: { price: 100, level: 1, slot: 'cuello' },
  gafas: { price: 120, level: 1, slot: 'ojos' },
  bufanda: { price: 150, level: 2, slot: 'cuello' },
  boina: { price: 200, level: 2, slot: 'cabeza' },
  audifonos: { price: 250, level: 3, slot: 'cabeza' },
  gafas_sol: { price: 300, level: 4, slot: 'ojos' },
  birrete: { price: 500, level: 6, slot: 'cabeza' },
  corona: { price: 1000, level: 10, slot: 'cabeza' },
  // De temporada: solo se compran en sus fechas (lib/pets/seasons.ts).
  luces: { price: 120, level: 1, slot: 'cuello' },
  gorro_navidad: { price: 150, level: 1, slot: 'cabeza' },
  gafas_corazon: { price: 160, level: 1, slot: 'ojos' },
  antifaz: { price: 180, level: 1, slot: 'ojos' },
  cuernos_reno: { price: 200, level: 2, slot: 'cabeza' },
  sombrero_bruja: { price: 200, level: 2, slot: 'cabeza' },
  sombrero_vueltiao: { price: 220, level: 2, slot: 'cabeza' },
  // v26: juegos de Estudio y de Trabajo, y la capa.
  lapiz: { price: 50, level: 1, slot: 'mano' },
  lapiz_oreja: { price: 70, level: 1, slot: 'cabeza' },
  taza: { price: 70, level: 1, slot: 'mano' },
  carne: { price: 80, level: 1, slot: 'cuello' },
  lentes: { price: 90, level: 1, slot: 'ojos' },
  corbata: { price: 90, level: 1, slot: 'cuello' },
  mochila: { price: 140, level: 2, slot: 'espalda' },
  maletin: { price: 180, level: 2, slot: 'mano' },
  diadema: { price: 260, level: 3, slot: 'cabeza' },
  capa: { price: 350, level: 5, slot: 'espalda' },
};

/** Juegos de la tienda. Lo que no está en ninguno va en "Para lucirse". */
export type ItemSet = 'estudio' | 'trabajo' | 'lucirse';
export const ITEM_SETS: Record<Exclude<ItemSet, 'lucirse'>, ItemId[]> = {
  estudio: ['lapiz', 'lapiz_oreja', 'lentes', 'gafas', 'mochila', 'birrete'],
  trabajo: ['taza', 'carne', 'corbata', 'corbatin', 'maletin', 'diadema'],
};
export const SET_LABEL: Record<ItemSet, string> = { estudio: 'Para estudiar', trabajo: 'Para trabajar', lucirse: 'Para lucirse' };
export function setOf(id: ItemId): ItemSet {
  if (ITEM_SETS.estudio.includes(id)) return 'estudio';
  if (ITEM_SETS.trabajo.includes(id)) return 'trabajo';
  return 'lucirse';
}
/** Nombre de cada lugar, para la tienda. */
export const SLOT_LABEL: Record<Slot, string> = { cabeza: 'Cabeza', ojos: 'Ojos', cuello: 'Cuello', espalda: 'Espalda', mano: 'Mano' };

/** Nombre corto para las tarjetas de la tienda. */
export const ITEM_SHORT: Record<ItemId, string> = {
  gorro: 'Gorro', corbatin: 'Corbatín', collar: 'Collar', gafas: 'Gafas', bufanda: 'Bufanda',
  boina: 'Boina', audifonos: 'Audífonos', gafas_sol: 'Gafas de sol', birrete: 'Birrete', corona: 'Corona',
  gorro_navidad: 'Gorro navideño', cuernos_reno: 'Cuernos', luces: 'Luces', antifaz: 'Antifaz',
  gafas_corazon: 'Gafas corazón', sombrero_bruja: 'Bruja', sombrero_vueltiao: 'Vueltiao',
  lapiz: 'Lápiz', lapiz_oreja: 'Lápiz en oreja', taza: 'Taza', carne: 'Carné', lentes: 'Lentes',
  corbata: 'Corbata', mochila: 'Mochila', maletin: 'Maletín', diadema: 'Diadema', capa: 'Capa',
};

/** Orden de la tienda: por precio. Sin las de temporada, que van aparte. */
export const SHOP_ORDER = (Object.keys(ITEM_RULES) as ItemId[]).filter((id) => !isSeasonal(id)).sort((a, b) => ITEM_RULES[a].price - ITEM_RULES[b].price);

/** Precio de adoptar según cuántas mascotas tienes ya. */
export function adoptPrice(owned: number): number {
  return owned <= 0 ? 0 : owned === 1 ? 600 : owned === 2 ? 1000 : 1500;
}

/** Experiencia acumulada que pide el nivel n: 50 * n * (n - 1). */
export function xpForLevel(n: number): number { return 50 * n * (n - 1); }

export function levelOf(xp: number): number {
  let n = 1;
  while (xpForLevel(n + 1) <= Math.max(0, xp)) n++;
  return n;
}

/** Avance dentro del nivel actual, para la barra. */
export function levelProgress(xp: number): { level: number; into: number; span: number; toNext: number; pct: number } {
  const level = levelOf(xp);
  const base = xpForLevel(level), next = xpForLevel(level + 1);
  const into = Math.max(0, xp - base), span = next - base;
  return { level, into, span, toNext: next - Math.max(0, xp), pct: span ? into / span : 0 };
}

export type ItemState = 'puesta' | 'tuya' | 'comprable' | 'cara' | 'bloqueada' | 'fuera';

/** Cómo se ve una cosa de la casa en la tienda. */
export function homeItemState(id: HomeItemId, pet: { xp: number; coins: number; home?: Home }, owned: Set<string>): ItemState {
  const r = HOME_ITEMS[id];
  if (homeHas(pet.home ?? {}, id)) return 'puesta';
  if (owned.has(id)) return 'tuya';
  if (levelOf(pet.xp) < r.level) return 'bloqueada';
  return pet.coins >= r.price ? 'comprable' : 'cara';
}

/** Cómo se ve una prenda en la tienda para una mascota. */
export function itemState(id: ItemId, pet: { xp: number; coins: number; outfit: Partial<Record<Slot, ItemId | null>> }, owned: Set<string>, today: Date = new Date()): ItemState {
  const r = ITEM_RULES[id];
  if (pet.outfit[r.slot] === id) return 'puesta';
  if (owned.has(id)) return 'tuya';
  // De temporada y fuera de sus fechas: no se vende (lo comprado se queda).
  const season = seasonOfItem(id);
  if (season && !inSeason(season, today)) return 'fuera';
  if (levelOf(pet.xp) < r.level) return 'bloqueada';
  return pet.coins >= r.price ? 'comprable' : 'cara';
}

export const DEFAULT_NAMES: Record<Species, string> = { pinguino: 'Pingu', gato: 'Michi', perro: 'Toby', loro: 'Kiwi' };

/** Plural correcto de la moneda: "1 pescado", "5 pescados". */
export function coinLabel(n: number, coin: { one: string; many: string }): string {
  return `${n.toLocaleString('es-CO')} ${n === 1 ? coin.one : coin.many}`;
}
