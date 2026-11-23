// ============================================================
//  Marca de Kaderno (v26, fase 1): "Margen".
//
//  La raya roja del margen del cuaderno junto a una K. Este archivo es puro
//  (sin React Native) para poder probarlo y para generar los íconos de la app
//  con el mismo dibujo que se ve en pantalla (scripts/brand-icons.mjs).
//
//  Lo que la marca fija: la forma y los colores del logo, la tinta del texto
//  y la letra por defecto. Lo que cada quien elige en Personalizar: claro u
//  oscuro, el color de acento, la letra, el fondo y el tamaño.
//  Guía completa: docs/marca.md.
// ============================================================
import type { BasePalette } from './color';

export const BRAND = {
  /** Tinta: el azul casi negro del texto y del logo. */
  ink: '#1B1D3A',
  /** Papel: el fondo claro, un blanco cálido. */
  paper: '#F7F4EE',
  /** Margen: el coral del logo (sobre fondos oscuros y en el logo). */
  margin: '#F2674E',
  /** Margen hondo: el coral cuando va como relleno con texto blanco. */
  marginDeep: '#C93F28',
  /** Lápiz: el azul de apoyo. */
  pencil: '#2F6FE0',
  /** Trabajo (fase 2): grafito, hueso, cobre y terracota. */
  graphite: '#0F1014',
  bone: '#F5F4F1',
  copper: '#D98A6A',
  terracotta: '#A9472F',
} as const;

export const BRAND_FONT = 'Plus Jakarta Sans';
export const BRAND_FONT_URL = '/fonts/plus-jakarta-sans.woff2';

// ---------- Logo ----------
/** Trazos en una caja de 48 x 48. */
export const LOGO = {
  size: 48,
  radius: 12,
  margin: 'M13 10v28',
  marginWidth: 3,
  k: 'M21 12v24M22 25l11-13M25 23l9 13',
  kWidth: 4.5,
} as const;

/**
 * Variantes del logo:
 *  - tinta: cuadro de tinta, K de papel (sobre fondos claros y en los íconos).
 *  - papel: cuadro claro, K de tinta (sobre fondos oscuros).
 *  - una-tinta: todo negro y blanco (documentos e impresos).
 *  - silueta: solo la K y el margen en blanco, sin cuadro (insignia de avisos).
 */
export type LogoTone = 'tinta' | 'papel' | 'una-tinta' | 'silueta';
export type LogoSpace = 'estudio' | 'trabajo';
export type LogoColors = { tile: string | null; k: string; margin: string };

export function logoColors(tone: LogoTone, space: LogoSpace = 'estudio'): LogoColors {
  const work = space === 'trabajo';
  switch (tone) {
    case 'papel': return { tile: work ? '#E9E8E4' : '#ECEBF4', k: work ? '#16171C' : BRAND.ink, margin: work ? BRAND.terracotta : BRAND.margin };
    case 'una-tinta': return { tile: '#111111', k: '#FFFFFF', margin: '#FFFFFF' };
    case 'silueta': return { tile: null, k: '#FFFFFF', margin: '#FFFFFF' };
    default: return { tile: work ? '#16171C' : BRAND.ink, k: work ? BRAND.bone : BRAND.paper, margin: work ? BRAND.copper : BRAND.margin };
  }
}

/** La variante que se lee sobre un fondo: tinta sobre claro, papel sobre oscuro. */
export function logoToneFor(scheme: 'light' | 'dark'): LogoTone {
  return scheme === 'light' ? 'tinta' : 'papel';
}

/**
 * El logo como SVG (texto). `bleed` pinta el fondo hasta el borde y achica la
 * marca a esa fracción: es el ícono "maskable" de Android y el de iOS, que
 * recortan las esquinas por su cuenta.
 */
export function logoSvg(o: { size: number; tone?: LogoTone; space?: LogoSpace; bleed?: number; background?: string }): string {
  const c = logoColors(o.tone ?? 'tinta', o.space);
  const s = LOGO.size;
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${o.size}" height="${o.size}" viewBox="0 0 ${s} ${s}">`];
  let inner = '';
  if (o.bleed) {
    parts.push(`<rect width="${s}" height="${s}" fill="${o.background ?? c.tile ?? BRAND.ink}"/>`);
    const k = o.bleed;
    const off = (s * (1 - k)) / 2;
    inner = ` transform="translate(${off} ${off}) scale(${k})"`;
  } else if (c.tile) {
    parts.push(`<rect width="${s}" height="${s}" rx="${LOGO.radius}" fill="${c.tile}"/>`);
  }
  parts.push(`<g${inner} fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  parts.push(`<path d="${LOGO.margin}" stroke="${c.margin}" stroke-width="${LOGO.marginWidth}"/>`);
  parts.push(`<path d="${LOGO.k}" stroke="${c.k}" stroke-width="${LOGO.kWidth}"/>`);
  parts.push('</g></svg>');
  return parts.join('');
}

// ---------- Temas de la marca y acentos ----------
export const KADERNO_THEME_IDS = ['kaderno-oscuro', 'kaderno-claro'] as const;
export const isKadernoTheme = (id: string | null | undefined) => id === 'kaderno-oscuro' || id === 'kaderno-claro';

/** Un color de acento con su versión para tema oscuro y para tema claro. */
export type Accent = {
  id: string; name: string;
  dark: { brand: string; brand2: string };
  light: { brand: string; brand2: string };
};

/**
 * Acentos de Estudio. El primero es el de la marca. Cada par está revisado:
 * texto encima del acento y acento sobre la tarjeta (ver tests/v26.test.ts).
 */
export const STUDY_ACCENTS: Accent[] = [
  { id: 'coral', name: 'Coral', dark: { brand: '#F2674E', brand2: '#7FB5FF' }, light: { brand: '#C93F28', brand2: '#2F6FE0' } },
  { id: 'lapiz', name: 'Lápiz azul', dark: { brand: '#7FA8FF', brand2: '#B48CFF' }, light: { brand: '#2F5FD0', brand2: '#7A3FC8' } },
  { id: 'hoja', name: 'Hoja verde', dark: { brand: '#4FD08E', brand2: '#7FA8FF' }, light: { brand: '#1E7A4B', brand2: '#2F5FD0' } },
  { id: 'uva', name: 'Uva', dark: { brand: '#B48CFF', brand2: '#FF7FB0' }, light: { brand: '#7A3FC8', brand2: '#C0306E' } },
  { id: 'mostaza', name: 'Mostaza', dark: { brand: '#F0C44C', brand2: '#F2674E' }, light: { brand: '#8A6200', brand2: '#C93F28' } },
  { id: 'rosa', name: 'Rosa', dark: { brand: '#FF7FB0', brand2: '#B48CFF' }, light: { brand: '#C0306E', brand2: '#7A3FC8' } },
];
export const DEFAULT_ACCENT = 'coral';
export function accentOf(id: string | null | undefined): Accent {
  return STUDY_ACCENTS.find((a) => a.id === id) ?? STUDY_ACCENTS[0];
}

/** La paleta del tema con el acento elegido (solo cambia en los temas Kaderno). */
export function withAccent(themeId: string, scheme: 'dark' | 'light', base: BasePalette, accentId: string | null | undefined): BasePalette {
  if (!isKadernoTheme(themeId)) return base;
  const a = accentOf(accentId)[scheme];
  return { ...base, brand: a.brand, brand2: a.brand2 };
}

// ---------- Llegada de la marca a quien ya usaba Kaderno ----------
export const BRAND_VERSION = 26;
type Persisted = { themeId: string; fontId: string; accentId?: string; brandV?: number };

/**
 * Una sola vez: quien tenía los valores de fábrica de antes (tema Medianoche,
 * letra del sistema) pasa a los de la marca. Quien había escogido otro tema u
 * otra letra los conserva.
 */
export function migrateBrand<T extends Persisted>(s: T): T & { accentId?: string; brandV?: number } {
  if ((s.brandV ?? 0) >= BRAND_VERSION) return s;
  return {
    ...s,
    themeId: s.themeId === 'medianoche' || !s.themeId ? 'kaderno-oscuro' : s.themeId,
    fontId: s.fontId === 'system' || !s.fontId ? 'marca' : s.fontId,
    accentId: s.accentId ?? DEFAULT_ACCENT,
    brandV: BRAND_VERSION,
  };
}
