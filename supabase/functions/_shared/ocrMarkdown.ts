// ============================================================
//  Lectura de fotos (v22, fase 4). TypeScript puro: lo usan la función
//  "ocr" y las pruebas de la app. Pide Markdown fiel (títulos, listas,
//  tablas y fórmulas en LaTeX) y la ubicación aproximada de los dibujos.
// ============================================================

export type OcrMode = 'notes' | 'board' | 'plain';
export type OcrFigure = { id: number; x: number; y: number; w: number; h: number; caption: string };
export type OcrResult = { markdown: string; figures: OcrFigure[]; title: string | null };

export function ocrPrompt(mode: OcrMode): string {
  if (mode === 'plain') {
    return 'Transcribe fielmente el texto de esta imagen (un cronograma, un enunciado o apuntes). ' +
      'Devuelve SOLO el texto, conservando el orden, los saltos de línea, las fechas y las viñetas. ' +
      'No inventes contenido ilegible; marca lo dudoso con [?]. No agregues comentarios.';
  }
  const what = mode === 'board' ? 'una foto de un tablero o pizarra de clase' : 'una foto de apuntes universitarios (a mano o impresos)';
  return [
    `Esta imagen es ${what}. Transcríbela a Markdown fiel al original, en el idioma original.`,
    'Reglas:',
    '- Títulos con #, ## o ### según su jerarquía visual. Listas con - o 1. Negrita con ** si está resaltado o subrayado.',
    '- Tablas en formato de tabla Markdown.',
    '- Fórmulas y ecuaciones en LaTeX: en línea con $...$ y aparte con $$...$$ (por ejemplo $$F = m a$$). No uses LaTeX para texto normal.',
    '- Lo ilegible o dudoso márcalo con [?] justo después de la palabra. No inventes nada.',
    '- Si hay dibujos, diagramas, gráficas o esquemas que no son texto, NO los describas en el texto: pon en su lugar ![descripción corta](figura:N) y agrégalo a "figures" con su caja aproximada en proporciones de la imagen (x, y, w, h entre 0 y 1; x,y es la esquina superior izquierda).',
    '- "title": el título principal de la página si lo hay (máximo 80 caracteres), o null.',
    '',
    'Devuelve SOLO un objeto JSON, sin texto antes ni después, con esta forma:',
    '{"markdown": "...", "figures": [{"id": 1, "x": 0.1, "y": 0.4, "w": 0.5, "h": 0.3, "caption": "..."}], "title": "..."}',
  ].join('\n');
}

const clamp01 = (n: unknown) => Math.min(1, Math.max(0, Number(n) || 0));

export function cleanFigures(raw: unknown): OcrFigure[] {
  if (!Array.isArray(raw)) return [];
  const out: OcrFigure[] = [];
  for (const f of raw.slice(0, 8)) {
    const id = Math.round(Number((f as any)?.id));
    if (!Number.isFinite(id) || id < 1 || id > 50 || out.some((o) => o.id === id)) continue;
    const x = clamp01((f as any).x), y = clamp01((f as any).y);
    const w = Math.min(1 - x, clamp01((f as any).w)), h = Math.min(1 - y, clamp01((f as any).h));
    if (w < 0.04 || h < 0.04) continue;
    out.push({ id, x, y, w, h, caption: String((f as any).caption ?? '').replace(/[\[\]\n]/g, ' ').trim().slice(0, 120) });
  }
  return out;
}

/** Lee la respuesta del modelo. Si no vino JSON, el texto entero es el Markdown. */
export function parseOcr(text: string, mode: OcrMode): OcrResult {
  const raw = (text ?? '').trim();
  if (mode === 'plain') return { markdown: raw, figures: [], title: null };
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (typeof j.markdown === 'string') {
        const figures = cleanFigures(j.figures);
        const ids = new Set(figures.map((f) => f.id));
        // Marcadores de dibujos sin caja válida: fuera.
        const markdown = j.markdown.replace(/!\[([^\]\n]*)\]\(figura:(\d+)\)/g, (all: string, cap: string, n: string) => (ids.has(Number(n)) ? all : '')).replace(/\n{3,}/g, '\n\n').trim();
        const title = typeof j.title === 'string' && j.title.trim() ? j.title.trim().slice(0, 80) : null;
        return { markdown, figures: figures.filter((f) => markdown.includes(`(figura:${f.id})`)), title };
      }
    } catch { /* se usa el texto tal cual */ }
  }
  return { markdown: raw.replace(/^```(?:markdown|md)?\s*|\s*```$/g, '').trim(), figures: [], title: null };
}
