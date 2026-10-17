// ============================================================
//  Reglas de la economía de la mascota (las mismas de schema_v16.sql).
//  La base es la que cobra y paga; esto sirve para mostrar precios,
//  niveles y si algo alcanza, sin preguntarle al servidor.
// ============================================================
import type { ItemId, Slot, Species } from './art';

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
};

/** Nombre corto para las tarjetas de la tienda. */
export const ITEM_SHORT: Record<ItemId, string> = {
  gorro: 'Gorro', corbatin: 'Corbatín', collar: 'Collar', gafas: 'Gafas', bufanda: 'Bufanda',
  boina: 'Boina', audifonos: 'Audífonos', gafas_sol: 'Gafas de sol', birrete: 'Birrete', corona: 'Corona',
};

/** Orden de la tienda: por precio. */
export const SHOP_ORDER = (Object.keys(ITEM_RULES) as ItemId[]).sort((a, b) => ITEM_RULES[a].price - ITEM_RULES[b].price);

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

export type ItemState = 'puesta' | 'tuya' | 'comprable' | 'cara' | 'bloqueada';

/** Cómo se ve una prenda en la tienda para una mascota. */
export function itemState(id: ItemId, pet: { xp: number; coins: number; outfit: Partial<Record<Slot, ItemId | null>> }, owned: Set<string>): ItemState {
  const r = ITEM_RULES[id];
  if (pet.outfit[r.slot] === id) return 'puesta';
  if (owned.has(id)) return 'tuya';
  if (levelOf(pet.xp) < r.level) return 'bloqueada';
  return pet.coins >= r.price ? 'comprable' : 'cara';
}

export const DEFAULT_NAMES: Record<Species, string> = { pinguino: 'Pingu', gato: 'Michi', perro: 'Toby', loro: 'Kiwi' };

/** Plural correcto de la moneda: "1 pescado", "5 pescados". */
export function coinLabel(n: number, coin: { one: string; many: string }): string {
  return `${n.toLocaleString('es-CO')} ${n === 1 ? coin.one : coin.many}`;
}
