// ============================================================
//  Anotar PDFs (v22, fase 2). Puro, con pruebas.
//  Los rectángulos de un resaltado van en proporciones de la página (0 a 1)
//  para que no dependan del zoom ni del tamaño de la pantalla.
// ============================================================

export type HlRect = { x: number; y: number; w: number; h: number };
export type HlColor = 'yellow' | 'green' | 'blue' | 'pink';
export type FileKind = 'subject' | 'project';

export const HL_COLORS: { key: HlColor; label: string; fill: string; dot: string }[] = [
  { key: 'yellow', label: 'Amarillo', fill: 'rgba(250, 204, 21, 0.38)', dot: '#facc15' },
  { key: 'green', label: 'Verde', fill: 'rgba(52, 211, 153, 0.36)', dot: '#34d399' },
  { key: 'blue', label: 'Azul', fill: 'rgba(96, 165, 250, 0.36)', dot: '#60a5fa' },
  { key: 'pink', label: 'Rosado', fill: 'rgba(244, 114, 182, 0.36)', dot: '#f472b6' },
];
export const hlColor = (k: string) => HL_COLORS.find((c) => c.key === k) ?? HL_COLORS[0];

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Rectángulos de la selección (en píxeles de pantalla) a proporciones de la
 * página, juntando los pedazos de una misma línea y quitando los diminutos.
 */
export function toPageRects(rects: { left: number; top: number; width: number; height: number }[], page: { left: number; top: number; width: number; height: number }): HlRect[] {
  if (!page.width || !page.height) return [];
  const inPage = rects
    .filter((r) => r.width > 1 && r.height > 1)
    .map((r) => {
      const x1 = clamp01((r.left - page.left) / page.width), y1 = clamp01((r.top - page.top) / page.height);
      const x2 = clamp01((r.left + r.width - page.left) / page.width), y2 = clamp01((r.top + r.height - page.top) / page.height);
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    })
    .filter((r) => r.w > 0.002 && r.h > 0.002);
  return mergeLines(inPage).slice(0, 200).map((r) => ({ x: r4(r.x), y: r4(r.y), w: r4(r.w), h: r4(r.h) }));
}

/** Junta rectángulos de la misma línea que se tocan o casi. */
export function mergeLines(rects: HlRect[]): HlRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: HlRect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    const sameLine = last && Math.abs((last.y + last.h / 2) - (r.y + r.h / 2)) < Math.min(last.h, r.h) * 0.5;
    if (sameLine && r.x <= last.x + last.w + 0.015) {
      const x = Math.min(last.x, r.x), y = Math.min(last.y, r.y);
      const x2 = Math.max(last.x + last.w, r.x + r.w), y2 = Math.max(last.y + last.h, r.y + r.h);
      out[out.length - 1] = { x, y, w: x2 - x, h: y2 - y };
    } else out.push({ ...r });
  }
  return out;
}

/** Texto copiado de un PDF: une palabras partidas con guion y quita saltos sobrantes. */
export function cleanPdfText(s: string): string {
  return (s ?? '')
    .replace(/­/g, '')
    .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, '$1$2')
    .replace(/(\p{L})-\s*\n\s*(?=\p{Lu})/gu, '$1-')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const KD_FILE = 'kd-file:';
/** Enlace a una página de un archivo: kd-file:subject:<id>#p=4 */
export function fileLink(kind: FileKind, id: string, page: number): string {
  return `${KD_FILE}${kind}:${id}#p=${Math.max(1, Math.round(page))}`;
}
export function parseFileLink(href: string): { kind: FileKind; id: string; page: number } | null {
  const m = /^kd-file:(subject|project):([0-9a-fA-F-]{36})(?:#p=(\d{1,4}))?$/.exec((href ?? '').trim());
  if (!m) return null;
  return { kind: m[1] as FileKind, id: m[2], page: m[3] ? Math.max(1, parseInt(m[3], 10)) : 1 };
}

/** La cita para la nota, con la fuente que abre el PDF en esa página. */
export function quoteMarkdown(text: string, fileName: string, kind: FileKind, fileId: string, page: number, comment?: string | null): string {
  const body = cleanPdfText(text).slice(0, 4000);
  const name = (fileName || 'Archivo').replace(/[\[\]]/g, '');
  const lines = [`> ${body}`, '>', `> [${name}, pág. ${page}](${fileLink(kind, fileId, page)})`];
  if (comment?.trim()) lines.push('', comment.trim());
  return lines.join('\n') + '\n';
}

/** Orden de la lista de resaltados: por página y de arriba abajo. */
export function sortHighlights<T extends { page: number; rects: HlRect[] }>(list: T[]): T[] {
  const top = (h: T) => Math.min(...h.rects.map((r) => r.y), 1);
  return [...list].sort((a, b) => a.page - b.page || top(a) - top(b));
}

/** Página dentro de los límites. */
export function clampPage(p: number, total: number): number {
  if (!Number.isFinite(p)) return 1;
  return Math.min(Math.max(1, Math.round(p)), Math.max(1, total));
}
