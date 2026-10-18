// ============================================================
//  Estado de las mascotas en la app: lo que hay en la base (schema_v16),
//  los ajustes del usuario y un canal de eventos para que la mascota
//  reaccione a lo que pasa (tarea hecha, enfoque, etc.).
//
//  Las monedas las suma la base con disparadores. Después de algo que
//  puede pagar, la app vuelve a leer el saldo y la diferencia se muestra
//  como "+5" sobre la mascota.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { supabase, currentUserId } from '../supabase';
import { fetchPrefs, savePrefs } from '../db';
import type { ItemId, Outfit, Slot, Species } from './art';
import type { Home, HomeItemId } from './home';
import type { PetEvent, TalkMode } from './brain';
import { ACHIEVEMENTS, type AchievementRow } from './achievements';

export type Pet = {
  id: string; species: Species; name: string; outfit: Outfit;
  coins: number; xp: number; active: boolean; created_at: string;
  /** La casa (schema_v17). Puede faltar si la migración no se ha corrido. */
  home?: Home;
};
export type PetPrefs = {
  /** Mostrar la mascota en pantalla. */
  enabled: boolean;
  /** "Pasea" por la pantalla o se queda "quieta" en su esquina. */
  move: 'pasea' | 'quieta';
  talk: TalkMode;
  /** Día (AAAA-MM-DD) en que se silenció; ese día no habla sola. */
  mutedDay: string | null;
  /** Ver las mascotas de los compañeros de sala también fuera de la pantalla de la sala. */
  friendsEverywhere: boolean;
};
export const DEFAULT_PET_PREFS: PetPrefs = { enabled: true, move: 'pasea', talk: 'importa', mutedDay: null, friendsEverywhere: false };

export type PetsState = {
  /** null = todavía no se sabe; false = falta correr schema_v16.sql. */
  available: boolean | null;
  loaded: boolean;
  pets: Pet[];
  items: Record<string, string[]>;
  earnedToday: number;
  prefs: PetPrefs;
  /** null = todavía no se han pedido. */
  achievements: AchievementRow[] | null;
};

let state: PetsState = { available: null, loaded: false, pets: [], items: {}, earnedToday: 0, prefs: DEFAULT_PET_PREFS, achievements: null };
const ls = new Set<(s: PetsState) => void>();
function emit() { ls.forEach((l) => l(state)); }
function set(patch: Partial<PetsState>) { state = { ...state, ...patch }; emit(); }

export function getPets(): PetsState { return state; }
export function activePet(s: PetsState = state): Pet | null { return s.pets.find((p) => p.active) ?? null; }
export function subscribePets(fn: (s: PetsState) => void): () => void { ls.add(fn); fn(state); return () => { ls.delete(fn); }; }
export function usePets(): PetsState {
  const [s, setS] = useState(state);
  useEffect(() => subscribePets(setS), []);
  return s;
}

// ---------- Eventos ----------
export type PetSignal = PetEvent | { type: 'ganancia'; amount: number } | { type: 'accion' };
const evs = new Set<(e: PetSignal) => void>();
export function onPetEvent(fn: (e: PetSignal) => void): () => void { evs.add(fn); return () => { evs.delete(fn); }; }
export function emitPetEvent(e: PetSignal) { evs.forEach((f) => { try { f(e); } catch { /* noop */ } }); }

// ---------- Lectura ----------
function isMissingTable(err: any): boolean {
  const m = String(err?.message ?? '');
  return err?.code === '42P01' || err?.code === 'PGRST205' || err?.code === 'PGRST202' || /relation .* does not exist|Could not find the (table|function)/i.test(m);
}

function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PREFS_KEY = 'pet_prefs';
let loading: Promise<void> | null = null;

/** Trae mascotas, prendas y lo ganado hoy. */
export function loadPets(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    const uid = await currentUserId();
    if (!uid) { set({ loaded: true, pets: [], items: {} }); return; }
    const [p, it, d] = await Promise.all([
      supabase.from('pets').select('*').order('created_at'),
      supabase.from('pet_items').select('pet_id, item'),
      supabase.from('pet_daily').select('earned').eq('day', localDay()).maybeSingle(),
    ]);
    if (p.error) {
      if (isMissingTable(p.error)) { set({ available: false, loaded: true }); return; }
      throw p.error;
    }
    const items: Record<string, string[]> = {};
    for (const r of (it.data ?? []) as { pet_id: string; item: string }[]) (items[r.pet_id] ??= []).push(r.item);
    set({ available: true, loaded: true, pets: (p.data ?? []) as Pet[], items, earnedToday: (d.data as any)?.earned ?? 0 });
  })().finally(() => { loading = null; });
  return loading;
}

/** Ajustes: copia local para arrancar al instante y la nube como fuente. */
export async function loadPetPrefs(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) set({ prefs: { ...DEFAULT_PET_PREFS, ...JSON.parse(raw) } });
  } catch { /* noop */ }
  try {
    const remote = await fetchPrefs();
    if (remote?.pet) {
      const prefs = { ...DEFAULT_PET_PREFS, ...remote.pet };
      set({ prefs });
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
    }
  } catch { /* noop */ }
}

export async function savePetPrefs(patch: Partial<PetPrefs>): Promise<void> {
  const prefs = { ...state.prefs, ...patch };
  set({ prefs });
  AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  await savePrefs({ pet: prefs });
}

export function isMutedToday(p: PetPrefs = state.prefs): boolean { return p.mutedDay === localDay(); }
export function muteToday(on = true) { return savePetPrefs({ mutedDay: on ? localDay() : null }); }

// ---------- Saldo después de una acción ----------
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Vuelve a leer el saldo un momento después (la base paga con un disparador)
 * y avisa la diferencia a la mascota.
 */
export function refreshCoinsSoon(delay = 900) {
  if (state.available === false || !activePet()) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    const before = activePet();
    try { await loadPets(true); } catch { return; }
    const after = activePet();
    if (before && after && before.id === after.id && after.coins > before.coins) {
      emitPetEvent({ type: 'ganancia', amount: after.coins - before.coins });
    }
    checkAchievements().catch(() => {});
  }, delay);
}

// ---------- Logros ----------
let checking: Promise<AchievementRow[]> | null = null;
/**
 * Pide los logros a la base (que paga los nuevos) y avisa a la mascota de
 * cada uno que se acaba de conseguir.
 */
export function checkAchievements(): Promise<AchievementRow[]> {
  if (state.available !== true || !activePet()) return Promise.resolve(state.achievements ?? []);
  if (checking) return checking;
  checking = (async () => {
    const { data, error } = await supabase.rpc('pet_achievements');
    if (error) throw error;
    const rows = (data ?? []) as AchievementRow[];
    set({ achievements: rows });
    const fresh = rows.filter((r) => r.is_new && ACHIEVEMENTS[r.id]);
    if (fresh.length) {
      await loadPets(true).catch(() => {});
      fresh.forEach((r, i) => setTimeout(() => emitPetEvent({ type: 'logro', title: ACHIEVEMENTS[r.id].title, reward: r.reward }), i * 4500));
    }
    return rows;
  })().finally(() => { checking = null; });
  return checking;
}

// ---------- Acciones (funciones de la base) ----------
function replacePet(p: Pet) {
  const others = state.pets.filter((x) => x.id !== p.id).map((x) => (p.active ? { ...x, active: false } : x));
  set({ pets: [...others, p].sort((a, b) => a.created_at.localeCompare(b.created_at)) });
}

async function rpc(fn: string, args: Record<string, any>): Promise<Pet> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as Pet;
}

export async function adoptPet(species: Species, name: string): Promise<Pet> {
  const p = await rpc('pet_adopt', { p_species: species, p_name: name });
  await loadPets(true);
  emitPetEvent({ type: 'adoptada', name: p.name });
  setTimeout(() => { checkAchievements().catch(() => {}); }, 6500);
  return p;
}

export async function buyItem(item: ItemId | HomeItemId): Promise<Pet> {
  const p = await rpc('pet_buy', { p_item: item });
  set({ items: { ...state.items, [p.id]: [...(state.items[p.id] ?? []), item] } });
  replacePet(p);
  emitPetEvent({ type: 'compra' });
  setTimeout(() => { checkAchievements().catch(() => {}); }, 3500);
  return p;
}

export async function wearItem(petId: string, slot: Slot, item: ItemId | null): Promise<Pet> {
  const p = await rpc('pet_wear', { p_pet: petId, p_slot: slot, p_item: item });
  replacePet(p);
  return p;
}

/** Poner o quitar algo de la casa (schema_v17). */
export async function setHome(petId: string, slot: 'papel' | 'piso' | 'vista' | 'mueble', item: HomeItemId | null, on = true): Promise<Pet> {
  const { data, error } = await supabase.rpc('pet_home', { p_pet: petId, p_slot: slot, p_item: item, p_on: on });
  if (error) {
    if (isMissingTable(error)) throw new Error('Falta activar la casa en la base: hay que correr supabase/schema_v17.sql.');
    throw error;
  }
  replacePet(data as Pet);
  return data as Pet;
}

export async function activatePet(petId: string): Promise<Pet> {
  const p = await rpc('pet_activate', { p_pet: petId });
  replacePet(p);
  return p;
}

export async function renamePet(petId: string, name: string): Promise<Pet> {
  const p = await rpc('pet_rename', { p_pet: petId, p_name: name });
  replacePet(p);
  return p;
}

/** Al cerrar sesión. */
export function resetPets() {
  state = { available: null, loaded: false, pets: [], items: {}, earnedToday: 0, prefs: DEFAULT_PET_PREFS, achievements: null };
  emit();
}
