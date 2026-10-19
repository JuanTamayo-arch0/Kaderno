// ============================================================
//  Notas conectadas (v21, secciones 6 a 8). Puro, con pruebas.
//  Enlaces [[entre notas]], tarjetas escritas con "::" y plantillas.
// ============================================================

export const KD_NOTE = 'kd-note:';
const LINK_RE = /\[([^\]\n]*)\]\(kd-note:([0-9a-fA-F-]{36})\)/g;

/** Ids de las notas enlazadas (sin repetir, en orden). */
export function extractLinks(md: string): string[] {
  const out: string[] = [];
  for (const m of (md ?? '').matchAll(LINK_RE)) if (!out.includes(m[2])) out.push(m[2]);
  return out;
}

/** Cambia el texto de cada enlace por el título actual de la nota (si se conoce). */
export function refreshLinkTitles(md: string, titles: Record<string, string>): string {
  return (md ?? '').replace(LINK_RE, (all, text, id) => (titles[id] && titles[id] !== text ? `[${titles[id].replace(/[\[\]]/g, '')}](${KD_NOTE}${id})` : all));
}

export function linkMarkdown(id: string, title: string): string {
  return `[${(title || 'Nota').replace(/[\[\]]/g, '')}](${KD_NOTE}${id})`;
}

// ---------- Tarjetas desde la nota ----------
export type NoteCard = { line: string; kind: 'basic' | 'cloze'; front: string; back: string };

const CARD_RE = /^\s*(?:[-*+]\s+|\d+\.\s+)?(.+?)\s+::\s+(.+?)\s*$/;
const strip = (s: string) => s.replace(/^\*\*(.+)\*\*$/, '$1').replace(/\\([:{}])/g, '$1').trim();

/** Líneas "pregunta :: respuesta" y líneas con {{completar}} (fuera de bloques de código). */
export function parseCardLines(md: string): NoteCard[] {
  const out: NoteCard[] = [];
  let inCode = false;
  for (const raw of (md ?? '').split('\n')) {
    if (/^\s*```/.test(raw)) { inCode = !inCode; continue; }
    if (inCode || /^\s*(#|>|\|)/.test(raw)) continue;
    const line = raw.trim();
    const m = CARD_RE.exec(raw);
    if (m && !/^https?:$/.test(m[1])) {
      const front = strip(m[1]), back = strip(m[2]);
      if (front && back && front.length <= 400 && back.length <= 400) out.push({ line, kind: 'basic', front, back });
      continue;
    }
    const clean = line.replace(/^(?:[-*+]\s+|\d+\.\s+)/, '').replace(/\\([{}])/g, '$1');
    if ((clean.match(/\{\{[^{}]+\}\}/g) ?? []).length === 1 && clean.length <= 400) out.push({ line, kind: 'cloze', front: clean, back: '' });
  }
  return out;
}

const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Compara las tarjetas escritas en la nota con las que ya existen de esa
 * nota: nuevas (para revisar antes de guardar) y cambios (se actualizan solos).
 * Una línea se reconoce por su línea guardada, por el frente o por la respuesta.
 */
export function diffNoteCards(lines: NoteCard[], existing: { id: string; front: string; back: string; note_line?: string | null }[]): {
  create: NoteCard[]; update: { id: string; front: string; back: string; line: string }[];
} {
  const free = [...existing];
  const take = (pred: (e: (typeof existing)[number]) => boolean) => { const i = free.findIndex(pred); return i >= 0 ? free.splice(i, 1)[0] : null; };
  const create: NoteCard[] = [], update: { id: string; front: string; back: string; line: string }[] = [];
  const pending: NoteCard[] = [];
  for (const l of lines) {
    const same = take((e) => e.note_line === l.line) ?? take((e) => norm(e.front) === norm(l.front) && norm(e.back) === norm(l.back));
    if (!same) pending.push(l);
  }
  for (const l of pending) {
    const e = take((x) => norm(x.front) === norm(l.front)) ?? (l.kind === 'basic' ? take((x) => norm(x.back) === norm(l.back) && !!x.note_line) : null);
    if (e) update.push({ id: e.id, front: l.front, back: l.back, line: l.line });
    else create.push(l);
  }
  return { create, update };
}

// ---------- Plantillas ----------
export type Template = { key: string; name: string; hint: string; content: string };
export const TEMPLATES: Template[] = [
  { key: 'cornell', name: 'Apuntes de clase', hint: 'Ideas clave, notas, preguntas y resumen (Cornell)', content: '## Ideas clave\n\n- \n\n## Notas\n\n\n\n## Preguntas\n\n- \n\n## Resumen\n\n' },
  { key: 'lab', name: 'Laboratorio', hint: 'Objetivo, materiales, procedimiento, datos, análisis y conclusiones', content: '## Objetivo\n\n\n\n## Materiales\n\n- \n\n## Procedimiento\n\n1. \n\n## Datos\n\n| Medida | Valor | Unidad |\n| --- | --- | --- |\n|  |  |  |\n\n## Análisis\n\n\n\n## Conclusiones\n\n' },
  { key: 'capitulo', name: 'Capítulo de libro', hint: 'Conceptos, fórmulas, ejemplos y dudas', content: '## Conceptos\n\n- \n\n## Fórmulas\n\n\n\n## Ejemplos\n\n\n\n## Dudas\n\n- \n' },
  { key: 'ejercicio', name: 'Ejercicio resuelto', hint: 'Enunciado, datos, planteamiento, solución y verificación', content: '## Enunciado\n\n\n\n## Datos\n\n- \n\n## Planteamiento\n\n\n\n## Solución\n\n\n\n## Verificación\n\n' },
];
export function builtinTemplate(key: string | null | undefined): Template | null {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "Clase del 23 oct". */
export function classNoteTitle(d: Date): string { return `Clase del ${d.getDate()} ${MONTHS[d.getMonth()]}`; }

// ---------- Compartir ----------
/** La nota como Markdown para fuera de Kaderno: sin imágenes privadas ni enlaces internos. */
export function noteForExport(title: string, md: string): string {
  const body = (md ?? '')
    .replace(/!\[([^\]\n]*)\]\(kd-img:[^)\s]+\)/g, (_a, alt) => `*(imagen${alt ? `: ${alt}` : ''})*`)
    .replace(/\[([^\]\n]*)\]\(kd-note:[0-9a-fA-F-]{36}\)/g, '$1');
  return `# ${title || 'Nota'}\n\n${body.trim()}\n`;
}
