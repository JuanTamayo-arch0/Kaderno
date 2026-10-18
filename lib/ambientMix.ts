// ============================================================
//  Sonidos de fondo del Enfoque: catálogo y lógica de la mezcla.
//  Puro (sin React ni Web Audio) para poder probarlo. El motor que
//  suena está en lib/ambient.ts.
// ============================================================

export type SoundId = 'lluvia' | 'mar' | 'bosque' | 'rio' | 'viento' | 'fuego' | 'rosa' | 'cafe' | 'pajaros';
export type OnBreak = 'silencio' | 'pajaros' | 'igual';
export type Mix = Partial<Record<SoundId, number>>; // 0..1 por sonido
export type Preset = { name: string; mix: Mix };
export type AmbientPrefs = {
  mix: Mix;
  master: number;      // 0..1
  onBreak: OnBreak;
  presets: Preset[];   // hasta 3
  muted: boolean;      // silencio rápido desde la barra lateral
};

export const SOUNDS: { id: SoundId; label: string; hint: string }[] = [
  { id: 'lluvia', label: 'Lluvia', hint: 'Lluvia suave, sin truenos' },
  { id: 'mar', label: 'Mar', hint: 'Olas lejanas' },
  { id: 'bosque', label: 'Bosque', hint: 'Viento en las hojas y pájaros' },
  { id: 'rio', label: 'Río', hint: 'Arroyo continuo' },
  { id: 'viento', label: 'Viento', hint: 'Ráfagas suaves' },
  { id: 'fuego', label: 'Fuego', hint: 'Chimenea que crepita' },
  { id: 'rosa', label: 'Ruido rosa', hint: 'Parejo y suave' },
  { id: 'cafe', label: 'Ruido café', hint: 'Grave, como un motor lejano' },
];
/** Los que salen como chips en la tarjeta del reloj (Viento queda en el mezclador). */
export const CHIP_SOUNDS: SoundId[] = ['lluvia', 'mar', 'bosque', 'rio', 'fuego', 'rosa', 'cafe'];
const ALL: SoundId[] = [...SOUNDS.map((s) => s.id), 'pajaros'];

export const DEFAULT_LEVEL = 0.6;
export const DEFAULT_PREFS: AmbientPrefs = { mix: {}, master: 0.35, onBreak: 'silencio', presets: [], muted: false };
export const MAX_PRESETS = 3;

const clamp01 = (n: unknown, d: number) => (typeof n === 'number' && isFinite(n) ? Math.min(1, Math.max(0, n)) : d);

export function cleanMix(m: unknown): Mix {
  const out: Mix = {};
  if (!m || typeof m !== 'object') return out;
  for (const id of ALL) {
    const v = clamp01((m as any)[id], 0);
    if (v > 0.001) out[id] = Math.round(v * 100) / 100;
  }
  return out;
}

/** Acepta lo guardado (local o en la nube) aunque venga incompleto o de otra versión. */
export function sanitizePrefs(raw: unknown): AmbientPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as any;
  const onBreak: OnBreak = r.onBreak === 'pajaros' || r.onBreak === 'igual' ? r.onBreak : 'silencio';
  const presets: Preset[] = Array.isArray(r.presets)
    ? r.presets
      .filter((p: any) => p && typeof p.name === 'string' && p.name.trim())
      .slice(0, MAX_PRESETS)
      .map((p: any) => ({ name: String(p.name).trim().slice(0, 30), mix: cleanMix(p.mix) }))
    : [];
  return { mix: cleanMix(r.mix), master: clamp01(r.master, DEFAULT_PREFS.master), onBreak, presets, muted: r.muted === true };
}

export function activeIds(mix: Mix): SoundId[] {
  return ALL.filter((id) => (mix[id] ?? 0) > 0);
}
export function isSilent(mix: Mix): boolean { return activeIds(mix).length === 0; }

/**
 * Tocar un chip: si ese sonido es el único que suena, se apaga; si no,
 * queda solo ese (un toque = un sonido; para mezclar está el mezclador).
 */
export function tapChip(mix: Mix, id: SoundId | 'silencio'): Mix {
  if (id === 'silencio') return {};
  const act = activeIds(mix);
  if (act.length === 1 && act[0] === id) return {};
  return { [id]: mix[id] && act.length === 1 ? mix[id] : DEFAULT_LEVEL };
}

export function setLevel(mix: Mix, id: SoundId, v: number): Mix {
  const next = { ...mix };
  const c = clamp01(v, 0);
  if (c <= 0.001) delete next[id]; else next[id] = Math.round(c * 100) / 100;
  return next;
}

export function soundLabel(id: SoundId): string {
  return id === 'pajaros' ? 'Pájaros' : (SOUNDS.find((s) => s.id === id)?.label ?? id);
}

/** "Lluvia", "Lluvia y bosque", "Lluvia, mar y fuego", o "Silencio". Ordena por volumen. */
export function mixLabel(mix: Mix): string {
  const ids = activeIds(mix).sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0));
  if (!ids.length) return 'Silencio';
  const names = ids.map((id, i) => (i === 0 ? soundLabel(id) : soundLabel(id).toLowerCase()));
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
}

export function savePreset(prefs: AmbientPrefs, name: string): AmbientPrefs {
  const n = name.trim().slice(0, 30);
  if (!n || isSilent(prefs.mix)) return prefs;
  const rest = prefs.presets.filter((p) => p.name.toLowerCase() !== n.toLowerCase());
  return { ...prefs, presets: [{ name: n, mix: { ...prefs.mix } }, ...rest].slice(0, MAX_PRESETS) };
}
export function removePreset(prefs: AmbientPrefs, name: string): AmbientPrefs {
  return { ...prefs, presets: prefs.presets.filter((p) => p.name !== name) };
}

/** Qué debe sonar según el reloj. null = nada. */
export function targetMix(
  focus: { running: boolean; mode: 'work' | 'break' },
  prefs: AmbientPrefs,
): Mix | null {
  if (prefs.muted || !focus.running) return null;
  if (focus.mode === 'work') return isSilent(prefs.mix) ? null : prefs.mix;
  if (prefs.onBreak === 'silencio') return null;
  if (prefs.onBreak === 'pajaros') return { pajaros: 0.7 };
  return isSilent(prefs.mix) ? null : prefs.mix;
}
