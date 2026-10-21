// ============================================================
//  Capturar (v22, fase 4): fotos en el navegador. Girar, recortar, modo
//  escáner, recortar los dibujos que encontró la lectura y pasar un PDF a
//  páginas (texto si lo trae, imagen si es escaneado). Solo web.
// ============================================================
import { scanFilter, clampCrop, type Crop, type Figure } from './capture';
import { openPdf } from './pdfjs';

export type Img = { uri: string; base64: string; width: number; height: number };

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new (window as any).Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

const toImg = (canvas: HTMLCanvasElement, q = 0.8): Img => {
  const uri = canvas.toDataURL('image/jpeg', q);
  return { uri, base64: uri.split(',')[1], width: canvas.width, height: canvas.height };
};

/** Gira (0, 90, 180, 270), recorta, aplica el modo escáner y reduce a `max` px. */
export async function processImage(src: string, o: { rotate?: number; crop?: Crop | null; scan?: boolean; max?: number } = {}): Promise<Img> {
  const img = await loadImage(src);
  const rot = (((o.rotate ?? 0) % 360) + 360) % 360;
  const c = clampCrop(o.crop ?? { x: 0, y: 0, w: 1, h: 1 });
  // Recorte en el sistema de la imagen ya girada.
  const rw = rot % 180 === 0 ? img.width : img.height, rh = rot % 180 === 0 ? img.height : img.width;
  const cw = Math.max(1, Math.round(c.w * rw)), ch = Math.max(1, Math.round(c.h * rh));
  const scale = Math.min(1, (o.max ?? 2000) / Math.max(cw, ch));
  const out = document.createElement('canvas');
  out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-c.x * rw, -c.y * rh);
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
  if (o.scan) {
    const d = ctx.getImageData(0, 0, out.width, out.height);
    scanFilter(d.data, out.width, out.height);
    ctx.putImageData(d, 0, 0);
  }
  return toImg(out, o.scan ? 0.85 : 0.78);
}

/** Recorta un dibujo de la página (con un poco de margen). */
export async function cropFigure(src: string, f: Figure, pad = 0.015): Promise<Img> {
  return processImage(src, { crop: { x: f.x - pad, y: f.y - pad, w: f.w + pad * 2, h: f.h + pad * 2 }, max: 1400 });
}

/** Un archivo de imagen (arrastrado, pegado o elegido) a JPEG reducido. */
export async function fileToImg(file: Blob, scan = false): Promise<Img> {
  const url = URL.createObjectURL(file);
  try { return await processImage(url, { scan }); } finally { URL.revokeObjectURL(url); }
}

export type PdfPage = { page: number; text: string | null; img: Img | null };

/** PDF a páginas: si una página trae texto se usa tal cual (sin IA); si no, se dibuja para leerla. */
export async function pdfToPages(file: Blob, max = 20, onPage?: (p: PdfPage, total: number) => void): Promise<PdfPage[]> {
  const url = URL.createObjectURL(file);
  try {
    const doc = await openPdf(url);
    const total = Math.min(doc.numPages, max);
    const out: PdfPage[] = [];
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const text = textOf(tc.items as any[]);
      let img: Img | null = null;
      if (text.replace(/\s/g, '').length < 80) {
        const v1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(2.2, 1700 / Math.max(v1.width, v1.height)) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        img = toImg(canvas, 0.8);
      }
      const p = { page: i, text: img ? null : text, img };
      out.push(p);
      onPage?.(p, total);
    }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

/** Texto de una página de PDF con sus saltos de línea. */
export function textOf(items: { str?: string; transform?: number[]; hasEOL?: boolean }[]): string {
  let text = '', line = '', lastY: number | null = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const y = it.transform?.[5] ?? 0;
    if (lastY != null && Math.abs(y - lastY) > 2 && line.trim()) { text += line.trim() + '\n'; line = ''; }
    line += it.str;
    if (it.hasEOL) { text += line.trim() + '\n'; line = ''; }
    lastY = y;
  }
  text += line.trim();
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
