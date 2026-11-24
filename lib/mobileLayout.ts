// ============================================================
//  v29, fase 2: medidas para el celular (puras, sin react-native).
// ============================================================

/**
 * ¿Las acciones de la derecha del encabezado van debajo del título? Sí cuando
 * el espacio que dejan no alcanza para el título (estimado por su largo) o, si
 * hay subtítulo, para un renglón razonable (42 % de la fila). Así "Hoy"
 * conserva sus íconos al lado y "Tipos de tarea" no se corta en un celular angosto.
 */
export function headerStacks(o: { rowW: number; rightW: number; title: string; titleSize: number; back: boolean; subtitle: boolean }): boolean {
  if (o.rowW <= 0 || o.rightW <= 0) return false;
  const avail = o.rowW - o.rightW - (o.back ? 44 : 0) - 8;
  const titleNeed = o.title.length * o.titleSize * 0.55;
  return avail < Math.max(titleNeed, o.subtitle ? o.rowW * 0.42 : 0);
}

/** "45 min" -> ["45", "min"]: el número grande y la unidad más pequeña. */
export function statParts(value: string): [string, string] {
  const i = value.indexOf(' ');
  return i < 0 ? [value, ''] : [value.slice(0, i), value.slice(i + 1)];
}

/** Ancho de cada resumen en la cuadrícula del celular: 2 columnas (4 en tableta). */
export function tileWidth(winW: number, gap = 10, pad = 16): number {
  const cols = winW >= 600 ? 4 : 2;
  return Math.floor((Math.min(winW, 900) - pad * 2 - gap * (cols - 1)) / cols);
}

/** Tamaño del reloj de Enfoque: más pequeño en celulares bajos para que "Empezar" se vea. */
export function focusRingSize(winW: number, winH: number): number {
  return Math.max(168, Math.min(228, Math.round(winH * 0.3), winW - 96));
}

/** Ancho de una columna del tablero en el celular: casi toda la pantalla, se asoma la siguiente. */
export function boardColumnWidth(winW: number): number {
  return Math.min(320, Math.round(winW * 0.82));
}

// ---------- Hojas que se cierran arrastrando (fase 3) ----------

/** ¿Se cierra al soltar? Más de 110 px hacia abajo o un gesto rápido. */
export function shouldDismiss(dy: number, vy: number): boolean {
  return dy > 110 || vy > 1.1;
}

/** ¿El gesto es de arrastre hacia abajo (y no un toque o un deslizamiento de lado)? */
export function isDownDrag(dy: number, dx: number): boolean {
  return dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.5;
}

/** ¿El gesto empezó en la franja de arriba de la hoja (la rayita y el título)? */
export function inDragZone(y0: number, sheetTop: number | null, zone: number): boolean {
  if (sheetTop == null) return false;
  return y0 >= sheetTop - 8 && y0 <= sheetTop + zone;
}
