// Utilidades de color puras (sin React Native) para poder probarlas con node.

export type BasePalette = {
  bg: string; surface: string; surface2: string; line: string;
  text: string; muted: string; brand: string; brand2: string;
  good: string; warn: string; bad: string;
};
// Colores derivados que se calculan del tema (ver derive()):
//  onBrand / onBad: texto encima de un relleno de marca o de peligro.
//  goodText / warnText / badText: versiones de verde, amarillo y rojo que se
//  leen como TEXTO sobre las tarjetas (en temas claros hay que oscurecerlas).
//  focus: anillo de foco del teclado.
export type Palette = BasePalette & {
  onBrand: string; onBad: string; goodText: string; warnText: string; badText: string; focus: string;
};

// ---------- Contraste (WCAG) ----------
// Se usan para derivar los colores de texto de cada tema y en las pruebas, que
// exigen al menos 4.5 en todos los pares importantes.
function rgbOf(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function luminance(hex: string): number {
  const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const INK = '#0f1115';
const WHITE = '#ffffff';
/** Texto (blanco o casi negro) que mejor se lee sobre `fill`. */
export function inkOn(fill: string): string { return contrast(WHITE, fill) >= contrast(INK, fill) ? WHITE : INK; }

/** Oscurece (fondo claro) o aclara (fondo oscuro) `color` hasta leerse sobre `bg`. */
export function readableOn(color: string, bg: string, need = 4.5): string {
  const lightBg = luminance(bg) > 0.4;
  let [r, g, b] = rgbOf(color);
  for (let i = 0; i < 60 && contrast(toHex(r, g, b), bg) < need; i++) {
    if (lightBg) { r *= 0.95; g *= 0.95; b *= 0.95; }
    else { r += (255 - r) * 0.06; g += (255 - g) * 0.06; b += (255 - b) * 0.06; }
  }
  return toHex(r, g, b);
}
function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function derive(p: BasePalette): Palette {
  return {
    ...p,
    onBrand: inkOn(p.brand),
    onBad: inkOn(p.bad),
    goodText: readableOn(p.good, p.surface),
    warnText: readableOn(p.warn, p.surface),
    badText: readableOn(p.bad, p.surface),
    focus: p.brand,
  };
}

