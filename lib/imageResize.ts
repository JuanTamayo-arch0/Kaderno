import { Platform } from 'react-native';

// ============================================================
//  Achicar imágenes antes de guardarlas (web).
//
//  La foto de una materia se guarda dentro de la fila de la materia (como
//  data URL). Una foto del celular, aun recortada, podía pesar 200 a 600 KB, y
//  como las materias se piden al abrir casi cualquier pantalla, cada foto se
//  descargaba una y otra vez. A 160 x 160 en JPEG queda en unos 6 a 10 KB y se
//  ve igual de nítida en el tamaño en que se muestra.
// ============================================================

export const ICON_PX = 160;
export const BIG_ICON_CHARS = 40_000;

/** Recorta al centro en cuadrado y lo deja de `px` x `px` en JPEG. En nativo devuelve lo mismo. */
export async function shrinkToSquare(src: string, px = ICON_PX, quality = 0.82): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return src;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('No se pudo leer la imagen'));
    i.src = src;
  });
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) return src;
  const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, px, px);
  const out = canvas.toDataURL('image/jpeg', quality);
  return out.length < src.length ? out : src;
}
