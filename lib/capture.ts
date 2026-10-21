// ============================================================
//  Capturar nueva (v22, fase 4). Puro, con pruebas: materia y título
//  sugeridos, armar el Markdown de varias páginas con sus dibujos, el
//  filtro de escáner y el recorte.
// ============================================================
import { classesOf, type AgendaBlock, type AgendaSlot, type AgendaSubject } from './agenda';
import { classNoteTitle } from './noteLinks';

export type CaptureMode = 'notes' | 'board' | 'pdf' | 'schedule';
export type Figure = { id: number; x: number; y: number; w: number; h: number; caption: string };

/** La materia de la clase de ahora (o la que acaba de terminar hace menos de 20 min), si no la última usada. */
export function suggestSubject(now: Date, slots: AgendaSlot[], blocks: AgendaBlock[], subjects: AgendaSubject[], lastUsed: string | null): string | null {
  const m = now.getHours() * 60 + now.getMinutes();
  const cls = classesOf(now, slots, blocks, subjects).find((c) => c.start - 10 <= m && (c.end ?? c.start) + 20 >= m);
  if (cls?.subjectId) return cls.subjectId;
  if (lastUsed && subjects.some((s) => s.id === lastUsed)) return lastUsed;
  return subjects[0]?.id ?? null;
}

/** El primer título de lo leído; si no hay, "Clase del 20 oct". */
export function suggestTitle(markdown: string, now: Date, ocrTitle?: string | null): string {
  if (ocrTitle?.trim()) return ocrTitle.trim().slice(0, 80);
  const h = /^#{1,3}\s+(.+)$/m.exec(markdown ?? '');
  const t = h?.[1].replace(/[*_`$]/g, '').replace(/\[\?\]/g, '').trim();
  return t ? t.slice(0, 80) : classNoteTitle(now);
}

/** Cuántas partes quedaron marcadas como dudosas. */
export function uncertainCount(md: string): number {
  return ((md ?? '').match(/\[\?\]/g) ?? []).length;
}

/**
 * Junta las páginas. Los dibujos de cada página se renumeran para que no
 * choquen: devuelve el Markdown y la lista (página, número nuevo, caja).
 */
export function mergePages(pages: { markdown: string; figures: Figure[] }[]): { markdown: string; figures: (Figure & { page: number; key: string })[] } {
  const out: string[] = [];
  const figs: (Figure & { page: number; key: string })[] = [];
  pages.forEach((p, i) => {
    let md = (p.markdown ?? '').trim();
    for (const f of p.figures) {
      const key = `p${i + 1}f${f.id}`;
      if (!md.includes(`(figura:${f.id})`)) continue;
      md = md.split(`(figura:${f.id})`).join(`(figura:${key})`);
      figs.push({ ...f, page: i, key });
    }
    if (md) out.push(md);
  });
  return { markdown: out.join('\n\n'), figures: figs };
}

/** Pone la imagen guardada en el lugar del dibujo, o lo quita si no se quiso. */
export function resolveFigures(md: string, paths: Record<string, string | null>): string {
  return (md ?? '')
    .replace(/!\[([^\]\n]*)\]\(figura:([a-z0-9]+)\)/g, (_all, cap, key) => (paths[key] ? `![${cap}](kd-img:${paths[key]})` : ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Pizarra: cada foto como imagen, con el texto leído debajo si se quiere. */
export function boardMarkdown(paths: string[], texts: string[], withText: boolean): string {
  return paths.map((p, i) => {
    const img = `![Pizarra${paths.length > 1 ? ` ${i + 1}` : ''}](kd-img:${p})`;
    const t = (texts[i] ?? '').replace(/!\[[^\]\n]*\]\(figura:[^)]+\)/g, '').trim();
    return withText && t ? `${img}\n\n${t}` : img;
  }).join('\n\n');
}

/** Primera línea útil de un texto (título para una tarea desde un enunciado). */
export function firstLine(text: string): string {
  const l = (text ?? '').split('\n').map((x) => x.replace(/^#+\s*|^[-*]\s+|\*\*/g, '').trim()).find((x) => x.length > 2) ?? '';
  return l.slice(0, 120);
}

// ---------- Foto ----------
export type Crop = { x: number; y: number; w: number; h: number };

/** Recorte dentro de la imagen y de un tamaño mínimo (en proporciones). */
export function clampCrop(c: Crop): Crop {
  const min = 0.08;
  const x = Math.min(Math.max(0, c.x), 1 - min), y = Math.min(Math.max(0, c.y), 1 - min);
  const w = Math.min(Math.max(min, c.w), 1 - x), h = Math.min(Math.max(min, c.h), 1 - y);
  return { x, y, w, h };
}

/**
 * Modo escáner sobre los píxeles RGBA (en el lugar): gris; si el fondo es
 * oscuro (tablero verde o negro) se invierte para que quede tinta oscura
 * sobre blanco; el papel pasa a blanco y el trazo se oscurece. Las manchas
 * apenas más oscuras que el papel no se vuelven negras.
 */
export function scanFilter(data: Uint8ClampedArray | number[], width: number, height: number): void {
  const n = width * height;
  if (!n) return;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const g = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    gray[i] = g; hist[g]++;
  }
  const pct = (p: number) => { let acc = 0; const lim = n * p; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lim) return v; } return 255; };
  const invert = pct(0.5) < 110;
  if (invert) { for (let i = 0; i < n; i++) gray[i] = 255 - gray[i]; hist.fill(0); for (let i = 0; i < n; i++) hist[gray[i]]++; }
  const paper = pct(0.5);
  const white = Math.max(1, paper - 28);              // lo que está cerca del papel queda blanco
  const black = Math.max(0, Math.min(pct(0.004), white - 100)); // tinta
  for (let i = 0; i < n; i++) {
    let v = (gray[i] - black) / (white - black);
    v = Math.min(1, Math.max(0, v));
    v = Math.pow(v, 1.8);
    const out = Math.round(v * 255);
    data[i * 4] = out; data[i * 4 + 1] = out; data[i * 4 + 2] = out;
  }
}
