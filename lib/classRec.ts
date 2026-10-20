// ============================================================
//  Grabar la clase (v22, fase 1). Puro, con pruebas.
//  La transcripción son frases con su segundo desde el inicio; las marcas
//  son las líneas de la nota con el segundo en que se escribieron. El audio
//  nunca se guarda.
// ============================================================

export type Segment = { t: number; text: string };
export type Mark = { t: number; line: string };
export type MarkMap = Record<string, number>;

export const MAX_SECONDS = 4 * 3600;
export const MAX_CHARS = 300_000;

const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** "12:05" o "1:02:10". */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}

/** Frase limpia: espacios, mayúscula inicial y punto final. */
export function cleanSentence(text: string): string {
  let s = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s[0].toLocaleUpperCase('es') + s.slice(1);
  if (!/[.!?…:;]$/.test(s)) s += '.';
  return s;
}

/**
 * Agrega una frase final. Algunos navegadores (Chrome en Android) repiten la
 * frase anterior alargada: si la nueva empieza igual que la última (y es de
 * hace poco), se reemplaza en vez de duplicar.
 */
export function addSegment(segs: Segment[], t: number, text: string): Segment[] {
  const s = cleanSentence(text);
  if (!s) return segs;
  const used = segs.reduce((a, x) => a + x.text.length + 1, 0);
  if (used + s.length > MAX_CHARS) return segs;
  const last = segs[segs.length - 1];
  if (last && t - last.t < 30) {
    const a = norm(last.text), b = norm(s);
    if (a === b) return segs;
    if (b.startsWith(a)) return [...segs.slice(0, -1), { t: last.t, text: s }];
  }
  return [...segs, { t: Math.max(0, Math.round(t)), text: s }];
}

/** Líneas con contenido de la nota (sin viñetas, sin imágenes, sin líneas vacías). */
export function noteLines(md: string): string[] {
  const out: string[] = [];
  let code = false;
  for (const raw of (md ?? '').split('\n')) {
    if (/^\s*```/.test(raw)) { code = !code; continue; }
    if (code) continue;
    const l = raw.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|>\s*)/, '').trim();
    if (!l || /^!\[[^\]]*\]\([^)]*\)$/.test(l) || /^(-{3,}|\*{3,}|\|[\s|:-]*\|)$/.test(l)) continue;
    out.push(l);
  }
  return out;
}

/** Marcas al empezar: lo que ya estaba escrito no cuenta (−1). */
export function startMarks(md: string): MarkMap {
  const m: MarkMap = {};
  for (const l of noteLines(md)) m[l] = -1;
  return m;
}

/**
 * Actualiza las marcas al cambiar la nota en el segundo `t`. Una línea que
 * se alarga o se corrige conserva el segundo en que se empezó a escribir.
 */
export function updateMarks(marks: MarkMap, prevMd: string, nextMd: string, t: number): MarkMap {
  const prev = noteLines(prevMd), next = noteLines(nextMd);
  const nextSet = new Set(next);
  const gone = prev.filter((l) => !nextSet.has(l));
  const out: MarkMap = {};
  for (const l of next) {
    if (l in marks) { out[l] = marks[l]; continue; }
    const nl = norm(l);
    const from = gone.find((p) => { const np = norm(p); return !!np && (nl.startsWith(np) || np.startsWith(nl)); });
    out[l] = from != null && from in marks ? marks[from] : Math.max(0, Math.round(t));
  }
  // Las de antes que siguen existiendo en otro lugar no se pierden.
  for (const [l, v] of Object.entries(marks)) if (!(l in out) && nextSet.has(l)) out[l] = v;
  return out;
}

export function marksList(m: MarkMap): Mark[] {
  return Object.entries(m).filter(([, t]) => t >= 0).map(([line, t]) => ({ t, line: line.slice(0, 300) })).sort((a, b) => a.t - b.t);
}

/** La marca de la línea que contiene lo seleccionado (o que está dentro de ello). */
export function findMark(marks: Mark[], selected: string): Mark | null {
  const s = norm(selected);
  if (!s) return null;
  return marks.find((m) => norm(m.line) === s)
    ?? marks.find((m) => norm(m.line).includes(s))
    ?? marks.find((m) => { const n = norm(m.line); return n.length >= 8 && s.includes(n); })
    ?? null;
}

/** Índice de la frase que se decía en el segundo `t`. */
export function segmentAt(segs: Segment[], t: number): number {
  let i = -1;
  for (let k = 0; k < segs.length; k++) { if (segs[k].t <= t) i = k; else break; }
  return Math.max(0, i);
}

export type TimelineItem = { kind: 'said'; t: number; text: string; i: number } | { kind: 'wrote'; t: number; text: string };
/** Lo que se dijo con lo que escribiste intercalado por tiempo. */
export function timeline(segs: Segment[], marks: Mark[]): TimelineItem[] {
  const out: TimelineItem[] = segs.map((s, i) => ({ kind: 'said' as const, t: s.t, text: s.text, i }));
  for (const m of marks) out.push({ kind: 'wrote', t: m.t, text: m.line });
  return out.sort((a, b) => a.t - b.t || (a.kind === b.kind ? (a.kind === 'said' && b.kind === 'said' ? a.i - b.i : 0) : a.kind === 'said' ? -1 : 1));
}

/** Texto plano para la IA, con minutos cada tanto, cortado a `max` caracteres. */
export function transcriptText(segs: Segment[], max = 60_000, stamps = true): string {
  let out = '', lastStamp = -Infinity;
  for (const s of segs) {
    const stamp = stamps && s.t - lastStamp >= 300 ? `[${fmtClock(s.t)}] ` : '';
    if (stamp) lastStamp = s.t;
    const piece = `${stamp}${s.text} `;
    if (out.length + piece.length > max) break;
    out += piece;
  }
  return out.trim();
}

/** Busca en la transcripción: índices de las frases que contienen todas las palabras. */
export function searchSegments(segs: Segment[], q: string): number[] {
  const words = norm(q).split(' ').filter((w) => w.length > 1);
  if (!words.length) return [];
  return segs.map((s, i) => [norm(s.text), i] as const).filter(([n]) => words.every((w) => n.includes(w))).map(([, i]) => i);
}

// ---------- Resumen con IA ----------
export type ClassSummary = { ideas: string[]; formulas: string[]; tasks: { title: string; when: string | null }[]; questions: string[] };

/** El resumen como sección de la nota. */
export function summaryMarkdown(s: ClassSummary, dateLabel: string): string {
  const parts = [`## Resumen de la clase (${dateLabel})`, ''];
  if (s.ideas.length) parts.push(...s.ideas.map((x) => `- ${x}`), '');
  if (s.formulas.length) parts.push('**Fórmulas**', '', ...s.formulas.map((f) => `$$${f.replace(/^\$+|\$+$/g, '').trim()}$$`), '');
  if (s.tasks.length) parts.push('**Lo que dejó el profesor**', '', ...s.tasks.map((t) => `- [ ] ${t.title}${t.when ? ` (${t.when})` : ''}`), '');
  if (s.questions.length) parts.push('**Para repasar**', '', ...s.questions.map((q) => `- ${q}`), '');
  return parts.join('\n').trim() + '\n';
}

/** Textos para el campo "Agregar" (fecha en lenguaje natural). */
export function taskQuickText(t: { title: string; when: string | null }): string {
  return `${t.title}${t.when ? ` ${t.when}` : ''}`.replace(/\s+/g, ' ').trim();
}
