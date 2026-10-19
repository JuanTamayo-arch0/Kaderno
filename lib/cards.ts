// ============================================================
//  Tarjetas de repaso: lógica pura (duplicados, completar, cola del día,
//  pronóstico y estadísticas). Probada en tests/v20.test.ts.
// ============================================================
import { dueOf, stateOf, localISODate, type FsrsRow } from './fsrs';

export type CardKind = 'basic' | 'cloze';
export type CardLike = FsrsRow & {
  id: string; front: string; back: string; kind?: CardKind | null; subject_id: string | null; note_id?: string | null;
  suspended?: boolean | null; created_at?: string | null; lapses?: number | null;
};
export type Draft = { key: string; kind: CardKind; front: string; back: string; keep: boolean; similarTo?: { id: string; front: string } | null };

// ---------- Duplicados ----------
export function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\{\{|\}\}/g, ' ')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function words(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter((w) => w.length > 1));
}
export function jaccard(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return normalize(a) === normalize(b) && normalize(a) ? 1 : 0;
  let inter = 0;
  A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}
/** La tarjeta existente más parecida (Jaccard ≥ 0,7 sobre el anverso), o null. */
export function similarCard<T extends { id: string; front: string }>(front: string, existing: T[], threshold = 0.7): T | null {
  let best: T | null = null, score = 0;
  for (const c of existing) {
    const j = jaccard(front, c.front);
    if (j >= threshold && j > score) { best = c; score = j; }
  }
  return best;
}

// ---------- Completar ({{respuesta}}) ----------
const CLOZE = /\{\{([^{}]+)\}\}/g;
export function clozeCount(text: string): number { return (text.match(CLOZE) ?? []).length; }
/** Partes de una tarjeta de completar con un solo espacio. */
export function clozeParts(text: string): { before: string; answer: string; after: string } | null {
  if (clozeCount(text) !== 1) return null;
  const m = /\{\{([^{}]+)\}\}/.exec(text)!;
  return { before: text.slice(0, m.index), answer: m[1].trim(), after: text.slice(m.index + m[0].length) };
}
/** Texto a mostrar: con el espacio "[ … ]" o con la respuesta marcada. */
export function clozeText(text: string, reveal: boolean): string {
  const p = clozeParts(text);
  if (!p) return text;
  // ¿El espacio está dentro de una fórmula ($...$)? Ahí no sirve el Markdown: se usa un recuadro de LaTeX.
  const dollars = (p.before.replace(/\\\$/g, '').match(/\$/g) ?? []).length;
  if (dollars % 2 === 1) return `${p.before}${reveal ? `\\boxed{${p.answer}}` : '\\boxed{\\;?\\;}'}${p.after}`;
  return `${p.before}${reveal ? `**${p.answer}**` : '[ … ]'}${p.after}`;
}
/** Valida una tarjeta antes de guardarla. Devuelve el error o null. */
export function cardError(d: { kind: CardKind; front: string; back: string }): string | null {
  const f = d.front.trim(), b = d.back.trim();
  if (!f) return 'Falta el anverso.';
  if (f.length > 400 || b.length > 400) return 'Máximo 400 letras por lado.';
  if (d.kind === 'cloze') {
    const n = clozeCount(f);
    if (n !== 1) return n === 0 ? 'Marca la palabra que se oculta con {{ }}.' : 'Solo un espacio {{ }} por tarjeta.';
    return null;
  }
  if (!b) return 'Falta la respuesta.';
  return null;
}
/** Pasar de pregunta a completar (y al revés) sin perder lo escrito. */
export function convertKind(d: { kind: CardKind; front: string; back: string }, to: CardKind): { kind: CardKind; front: string; back: string } {
  if (d.kind === to) return d;
  if (to === 'cloze') {
    const back = d.back.trim();
    if (back && d.front.includes(back)) return { kind: 'cloze', front: d.front.replace(back, `{{${back}}}`), back: '' };
    return { kind: 'cloze', front: back ? `${d.front.trim()} {{${back}}}` : d.front, back: '' };
  }
  const p = clozeParts(d.front);
  return p ? { kind: 'basic', front: `${p.before}___${p.after}`.trim(), back: p.answer } : { kind: 'basic', front: d.front, back: d.back };
}

/** Propuestas de la IA → borradores, marcando las repetidas. */
export function toDrafts(proposed: { kind?: string; front: string; back?: string }[], existing: { id: string; front: string }[]): Draft[] {
  const seen: { id: string; front: string }[] = [...existing];
  return proposed.map((p, i) => {
    const kind: CardKind = p.kind === 'cloze' ? 'cloze' : 'basic';
    const sim = similarCard(p.front, seen);
    const d: Draft = { key: `d${i}-${Math.floor(Math.random() * 1e6)}`, kind, front: (p.front ?? '').trim(), back: (p.back ?? '').trim(), keep: !sim && !cardError({ kind, front: p.front ?? '', back: p.back ?? '' }), similarTo: sim ? { id: sim.id, front: sim.front } : null };
    seen.push({ id: `nueva-${i}`, front: d.front }); // dos iguales en la misma tanda: la segunda sale desmarcada
    return d;
  });
}

/** Cuántas pedir a la IA según el largo del texto. */
export function cardsWanted(text: string, selection = false): number {
  const n = Math.round(normalize(text).split(' ').filter(Boolean).length / 80);
  return selection ? Math.min(4, Math.max(1, n)) : Math.min(12, Math.max(4, n));
}

// ---------- La cola del día ----------
export type QueueInput<T extends CardLike = CardLike> = {
  cards: T[];
  now: Date;
  newPerDay: number;
  newDoneToday: number;
  /** Días que faltan para el examen más cercano de cada materia. */
  examDays?: Record<string, number>;
  subjectId?: string | null;   // solo un mazo
};
export type Queue<T extends CardLike = CardLike> = { due: T[]; learning: T[]; fresh: T[]; counts: { fresh: number; due: number; learning: number } };

export function buildQueue<T extends CardLike>({ cards, now, newPerDay, newDoneToday, examDays = {}, subjectId }: QueueInput<T>): Queue<T> {
  const t = now.getTime();
  const pool = cards.filter((c) => !c.suspended && (subjectId === undefined || subjectId === null ? true : c.subject_id === subjectId));
  const due: T[] = [], learning: T[] = [], news: T[] = [];
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  for (const c of pool) {
    const s = stateOf(c);
    if (s === 0) { news.push(c); continue; }
    const d = dueOf(c)!.getTime();
    if (s === 1 || s === 3) { if (d <= endOfDay.getTime()) learning.push(c); }
    else if (d <= t) due.push(c);
  }
  // Repasos: primero los más atrasados.
  due.sort((a, b) => dueOf(a)!.getTime() - dueOf(b)!.getTime());
  learning.sort((a, b) => dueOf(a)!.getTime() - dueOf(b)!.getTime());
  // Nuevas: primero las de materias con examen en 14 días, luego las más antiguas.
  const exam = (c: CardLike) => { const d = c.subject_id ? examDays[c.subject_id] : undefined; return d !== undefined && d >= 0 && d <= 14 ? d : 999; };
  news.sort((a, b) => exam(a) - exam(b) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  const room = Math.max(0, newPerDay - newDoneToday);
  const fresh = news.slice(0, room);
  return { due, learning, fresh, counts: { fresh: fresh.length, due: due.length, learning: learning.length } };
}

/** Repaso intensivo antes del examen: todas las de la materia, las más débiles primero. */
export function cramQueue<T extends CardLike>(cards: T[], subjectId: string): T[] {
  return cards
    .filter((c) => !c.suspended && c.subject_id === subjectId)
    .sort((a, b) => {
      const sa = stateOf(a), sb = stateOf(b);
      if ((sa === 0) !== (sb === 0)) return sa === 0 ? 1 : -1;
      return (a.stability ?? 0) - (b.stability ?? 0) || (dueOf(a)?.getTime() ?? 0) - (dueOf(b)?.getTime() ?? 0);
    });
}

// ---------- Estadísticas ----------
export type ReviewStat = { reviewed_at: string; rating: number; duration_ms?: number | null; state_before?: number | null; card_id?: string };

/** Segundos por tarjeta (mediana de los últimos 200 repasos; 10 s si no hay datos). */
export function secondsPerCard(reviews: ReviewStat[]): number {
  const xs = reviews.slice(-200).map((r) => (r.duration_ms ?? 0) / 1000).filter((s) => s >= 1 && s <= 120).sort((a, b) => a - b);
  if (xs.length < 5) return 10;
  const m = xs[Math.floor(xs.length / 2)];
  return Math.round(m);
}
/** "unos 4 min" para N tarjetas. */
export function estimateLabel(n: number, secs: number): string {
  if (n <= 0) return '';
  const min = Math.max(1, Math.round((n * secs) / 60));
  return `unos ${min} min`;
}
/** Porcentaje recordado (Bien o Fácil o Difícil sobre los repasos de tarjetas ya aprendidas). */
export function retentionPct(reviews: ReviewStat[], sinceMs: number): number | null {
  const xs = reviews.filter((r) => Date.parse(r.reviewed_at) >= sinceMs && r.state_before === 2);
  if (xs.length < 3) return null;
  return Math.round((xs.filter((r) => r.rating > 1).length / xs.length) * 100);
}
/** Cuántas vencen cada día de los próximos `days` (hoy incluye lo atrasado). */
export function forecast(cards: CardLike[], now: Date, days: number): { day: string; n: number }[] {
  const out: { day: string; n: number }[] = [];
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(d.getDate() + i); out.push({ day: localISODate(d), n: 0 }); }
  for (const c of cards) {
    if (c.suspended) continue;
    const due = dueOf(c);
    if (!due) continue;
    const idx = Math.max(0, Math.floor((new Date(due).setHours(0, 0, 0, 0) - start.getTime()) / 86_400_000));
    if (idx < days) out[idx].n++;
  }
  return out;
}
/** Repasos por día (para el mapa de calor). */
export function reviewsByDay(reviews: ReviewStat[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reviews) { const k = localISODate(new Date(r.reviewed_at)); out[k] = (out[k] ?? 0) + 1; }
  return out;
}
/** "Difíciles": falladas 3 o más veces. */
export function isHard(c: CardLike): boolean { return (c.lapses ?? 0) >= 3; }

/** El título (# ...) más cercano antes de un fragmento de la nota, para "Ver en la nota". */
export function headingBefore(markdown: string, snippet: string): string | null {
  const md = markdown ?? '';
  const probe = snippet.trim().split('\n')[0].slice(0, 60);
  let idx = probe ? md.indexOf(probe) : -1;
  if (idx < 0) {
    // El editor puede devolver el texto sin el formato: se busca por palabras.
    const w = normalize(probe).split(' ').slice(0, 5).join(' ');
    const lines = md.split('\n');
    let pos = 0;
    for (const l of lines) { if (w && normalize(l).includes(w)) { idx = pos; break; } pos += l.length + 1; }
  }
  if (idx < 0) return null;
  const before = md.slice(0, idx).split('\n').reverse();
  const h = before.find((l) => /^#{1,4}\s+\S/.test(l));
  return h ? h.replace(/^#{1,4}\s+/, '').trim().slice(0, 160) : null;
}

/** Mezcla repasos y nuevas: una nueva cada 3 repasos (las nuevas que sobren, al final). */
export function interleave<T>(due: T[], fresh: T[], every = 3): T[] {
  const out: T[] = [];
  let f = 0;
  due.forEach((d, i) => { out.push(d); if ((i + 1) % every === 0 && f < fresh.length) out.push(fresh[f++]); });
  while (f < fresh.length) out.push(fresh[f++]);
  return out;
}
