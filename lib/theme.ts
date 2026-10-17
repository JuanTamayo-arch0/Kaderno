import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { derive, type BasePalette, type Palette } from './color';
import { THEMES, type Theme } from './palettes';
export * from './color';
export { THEMES, type Theme } from './palettes';

// ============================================================
//  Paleta activa (C) — objeto MUTABLE. Se reasigna al cambiar de tema.
//  Los componentes leen C.xxx en cada render, así que al mutarlo + recargar
//  (web) o re-render (nativo) toda la app toma los nuevos colores.
// ============================================================
export const C: Palette = {
  bg: '#0f1115', surface: '#181b22', surface2: '#20242e', line: '#2a2f3a',
  text: '#e8eaf0', muted: '#9aa3b2', brand: '#6c8cff', brand2: '#8b6cff',
  good: '#37c98b', warn: '#f5b64c', bad: '#f56c6c',
  onBrand: '#0f1115', onBad: '#0f1115', goodText: '#37c98b', warnText: '#f5b64c', badText: '#f56c6c', focus: '#6c8cff',
};

export const DARK_THEMES = Object.values(THEMES).filter((t) => t.scheme === 'dark');
export const LIGHT_THEMES = Object.values(THEMES).filter((t) => t.scheme === 'light');

// ---------- Fondos de pantalla por defecto (degradados) ----------
// En web se pintan con CSS; en nativo se usa el color sólido de respaldo.
export type Background = { id: string; name: string; css: string; solid: string };
export const BACKGROUNDS: Background[] = [
  { id: 'aurora', name: 'Aurora', css: 'linear-gradient(160deg,#0f2027,#203a43,#2c5364)', solid: '#1b3a44' },
  { id: 'ciruela', name: 'Ciruela', css: 'linear-gradient(160deg,#41295a,#2f0743)', solid: '#3a1f52' },
  { id: 'durazno', name: 'Durazno', css: 'linear-gradient(160deg,#3a1c71,#d76d77,#ffaf7b)', solid: '#7a3d63' },
  { id: 'esmeralda', name: 'Esmeralda', css: 'linear-gradient(160deg,#134e5e,#71b280)', solid: '#2f6f5e' },
  { id: 'nocturno', name: 'Nocturno', css: 'linear-gradient(160deg,#232526,#414345)', solid: '#2c2e30' },
  { id: 'cosmico', name: 'Cósmico', css: 'radial-gradient(circle at 30% 20%,#3b2f63,#0b1020 60%)', solid: '#171433' },
  { id: 'amanecer', name: 'Amanecer', css: 'linear-gradient(160deg,#ff9a9e,#fad0c4,#fbc2eb)', solid: '#f2b3c1' },
  { id: 'brisa', name: 'Brisa', css: 'linear-gradient(160deg,#a1c4fd,#c2e9fb)', solid: '#aed3f7' },
];
export function backgroundOf(id: string): Background | undefined { return BACKGROUNDS.find((b) => b.id === id); }

// ---------- Fuentes (Google Fonts, se cargan en web) ----------
export type FontOpt = { id: string; name: string; family?: string };
export const FONTS: FontOpt[] = [
  { id: 'system', name: 'Sistema', family: undefined },
  { id: 'inter', name: 'Inter', family: 'Inter' },
  { id: 'nunito', name: 'Nunito', family: 'Nunito' },
  { id: 'poppins', name: 'Poppins', family: 'Poppins' },
  { id: 'grotesk', name: 'Space Grotesk', family: 'Space Grotesk' },
  { id: 'lora', name: 'Lora (serif)', family: 'Lora' },
];
export function fontFamilyOf(id: string): string | undefined { return FONTS.find((f) => f.id === id)?.family; }
// Letra para LEER las notas (puede ser distinta a la de la app).
export const NOTE_FONTS: FontOpt[] = [
  { id: 'serif', name: 'Source Serif (lectura)', family: 'Source Serif 4' },
  { id: 'app', name: 'La misma de la app', family: undefined },
  { id: 'plex', name: 'IBM Plex Sans', family: 'IBM Plex Sans' },
  { id: 'lora', name: 'Lora', family: 'Lora' },
];
/** Cadena CSS de la letra de las notas según los ajustes. */
export function noteFontStack(s: { noteFontId?: string; fontId: string } = PERSONALIZE): string {
  const fam = NOTE_FONTS.find((f) => f.id === (s.noteFontId ?? 'serif'))?.family ?? fontFamilyOf(s.fontId);
  const serif = fam === 'Source Serif 4' || fam === 'Lora';
  return fam ? `'${fam}', ${serif ? 'Georgia, serif' : 'system-ui, sans-serif'}` : 'system-ui, sans-serif';
}
export function noteFontFamily(s: { noteFontId?: string; fontId: string } = PERSONALIZE): string | undefined {
  return NOTE_FONTS.find((f) => f.id === (s.noteFontId ?? 'serif'))?.family ?? fontFamilyOf(s.fontId);
}
// URL de Google Fonts para inyectar en web.
const FONT_QUERY: Record<string, string> = {
  Inter: 'Inter:wght@400;500;600;700;800', Nunito: 'Nunito:wght@400;600;700;800',
  Poppins: 'Poppins:wght@400;500;600;700;800', 'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
  Lora: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400',
  'Source Serif 4': 'Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400',
  'IBM Plex Sans': 'IBM+Plex+Sans:wght@400;600;700',
};
/**
 * Carga de Google Fonts SOLO la fuente elegida (o todas, para la vista previa
 * de Personalizar). Con "Sistema" no se pide nada: antes se descargaba siempre
 * la hoja de las cinco familias al abrir la app.
 */
export function loadWebFont(which: string | 'all' | undefined): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !which) return;
  const fams = which === 'all' ? Object.keys(FONT_QUERY) : [which].filter((f) => FONT_QUERY[f]);
  fams.forEach((f) => {
    const id = 'kd-font-' + f.replace(/\s+/g, '-');
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${FONT_QUERY[f]}&display=swap`;
    document.head.appendChild(link);
  });
}
export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Nunito:wght@400;600;700;800&family=Poppins:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Lora:wght@400;500;600;700&display=swap';

// ---------- Tamaño de interfaz ----------
export type SizeOpt = { id: string; name: string; scale: number };
export const SIZES: SizeOpt[] = [
  { id: 'sm', name: 'Pequeño', scale: 0.9 },
  { id: 'md', name: 'Normal', scale: 1 },
  { id: 'lg', name: 'Grande', scale: 1.12 },
  { id: 'xl', name: 'Muy grande', scale: 1.25 },
];
export function scaleOf(id: string): number { return SIZES.find((s) => s.id === id)?.scale ?? 1; }

// ============================================================
//  Ajustes de personalización (persistidos por dispositivo)
// ============================================================
export type PSettings = { themeId: string; bgId: string; bgCustom: string | null; fontId: string; sizeId: string; noteFontId?: string };
export const DEFAULTS: PSettings = { themeId: 'medianoche', bgId: 'none', bgCustom: null, fontId: 'system', sizeId: 'md', noteFontId: 'serif' };
export let PERSONALIZE: PSettings = { ...DEFAULTS };
const STORE_KEY = 'kaderno.personalize';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// La foto propia sólo cuenta cuando está elegida (bgId === 'custom'): así se
// puede conservar guardada aunque ahora mismo esté puesto un degradado.
export function hasWallpaper(s: PSettings = PERSONALIZE): boolean {
  return (s.bgId === 'custom' && !!s.bgCustom) || (s.bgId !== 'none' && !!backgroundOf(s.bgId));
}

// Aplica la fuente en WEB inyectando CSS. Es lo robusto: react-native-web compila
// los estilos a clases, así que parchear componentes es frágil. La cadena de
// respaldo incluye las fuentes de íconos: sus glifos viven en área de uso privado,
// que las fuentes de texto no cubren, así que los íconos siguen intactos.
function applyWebFont(family: string | undefined): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const ID = 'kaderno-font-css';
  const prev = document.getElementById(ID);
  if (prev) prev.remove();
  if (!family) return;
  const stack = `'${family}', 'Ionicons', 'ionicons', 'MaterialIcons', 'MaterialCommunityIcons', 'FontAwesome', system-ui, sans-serif`;
  const styleEl = document.createElement('style');
  styleEl.id = ID;
  styleEl.textContent = `
    #root div[dir="auto"], #root span, #root p, body input, body textarea, body select, body button, body div[dir="auto"] {
      font-family: ${stack};
    }
  `;
  document.head.appendChild(styleEl);
}

// Aplica un conjunto de ajustes: muta C (con transparencia si hay fondo) y fija la fuente.
export function applyAll(s: PSettings): void {
  const theme = THEMES[s.themeId] ?? THEMES.medianoche;
  const pal: Palette = derive(theme.palette);
  if (hasWallpaper(s)) pal.bg = hexToRgba(theme.palette.bg, theme.scheme === 'light' ? 0.82 : 0.76);
  Object.assign(C, pal);
  applyWebFont(fontFamilyOf(s.fontId));
  loadWebFont(fontFamilyOf(s.fontId));
  PERSONALIZE = s;
}

/**
 * Fondo de una pantalla completa. Con fondo de pantalla es transparente: el velo
 * oscuro lo pone AppBackground una sola vez, así no desaparece al cambiar de
 * pantalla mientras la siguiente termina de cargar.
 */
export function screenBg(): string { return hasWallpaper() ? 'transparent' : C.bg; }

export function currentTheme(): Theme { return THEMES[PERSONALIZE.themeId] ?? THEMES.medianoche; }

// Lectura SÍNCRONA en web (localStorage) para que todos los estilos tomen el tema correcto desde el primer render.
if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) PERSONALIZE = { ...DEFAULTS, ...JSON.parse(raw) }; } catch { /* noop */ }
}
applyAll(PERSONALIZE);

// Carga asíncrona en nativo (se llama desde el layout raíz).
export async function loadPersonalizeNative(): Promise<PSettings> {
  if (Platform.OS === 'web') return PERSONALIZE;
  try { const raw = await AsyncStorage.getItem(STORE_KEY); if (raw) { applyAll({ ...DEFAULTS, ...JSON.parse(raw) }); } } catch { /* noop */ }
  return PERSONALIZE;
}

export async function savePersonalize(s: PSettings): Promise<void> {
  applyAll(s);
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else await AsyncStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch { /* noop */ }
}

// ---------- Colores e íconos disponibles al crear una materia ----------
export const SUBJECT_COLORS = ['#6c8cff', '#37c98b', '#f5b64c', '#f56c6c', '#8b6cff', '#22c1c3', '#ff8fab', '#b0bec5'];
export const SUBJECT_ICONS = ['📐', '🧪', '📖', '🌍', '💻', '🎨', '🎵', '⚗️', '🧬', '📊', '🏛️', '🗣️'];

// --- Tokens de diseño ---
// ¿El tema activo es claro u oscuro? Se calcula del brillo del fondo, así que
// funciona con cualquier tema nuevo sin tener que anotarlo en una lista.
// Se usa para el `color-scheme` de los <input> nativos del navegador (fecha,
// hora): con el valor equivocado el texto del selector queda ilegible.
export function uiScheme(): 'light' | 'dark' {
  let hex = String(C.bg ?? '#000').replace('#', '').trim();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex.slice(0, 6) || '0', 16);
  if (!Number.isFinite(n)) return 'dark';
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? 'light' : 'dark';
}

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const R = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
export const shadow = {
  shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4,
} as const;

// Formatea una fecha ISO (YYYY-MM-DD) de forma relativa y amable
export function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff < 0) return `Hace ${-diff} días`;
  if (diff < 7) return `En ${diff} días`;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

export function dueTone(iso: string, done: boolean): string {
  if (done || !iso) return C.muted;
  const d = new Date(iso + 'T00:00:00');
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff < 0) return C.bad;
  if (diff === 0) return C.warn;
  return C.muted;
}
