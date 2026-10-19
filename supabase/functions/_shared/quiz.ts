// ============================================================
//  Simulacro, corrección y "Ponme a prueba": instrucciones para el modelo
//  y validación de lo que responde. Sin dependencias: lo usa la función
//  "ai" y también las pruebas de la app.
// ============================================================

export const NOTES_BUDGET = 12000;

export type QuizType = 'mc' | 'short' | 'num';
export type QuizQuestion = { type: QuizType; q: string; options?: string[]; answer: number | string; explain: string; note: number | null };
export type GradeVerdict = 'ok' | 'partial' | 'wrong';
export type GradeResult = { verdict: GradeVerdict; why: string } | null;
export type RecallResult = {
  recalled: string[];
  missing: { point: string; heading: string | null }[];
  wrong: { point: string; fix: string }[];
  score: number;
};

/** Junta las notas con su número, sin pasar del presupuesto de caracteres. */
export function notesBlock(notes: { title?: string | null; content?: string | null }[], budget = NOTES_BUDGET): string {
  let left = budget;
  const parts: string[] = [];
  notes.forEach((n, i) => {
    if (left <= 200) return;
    const body = String(n.content ?? '').trim().slice(0, left);
    left -= body.length;
    parts.push(`[Nota ${i + 1}: ${String(n.title ?? 'Sin título').slice(0, 120)}]\n${body}`);
  });
  return parts.join('\n\n');
}

export function quizPrompt(notes: { title?: string | null; content?: string | null }[], count: number, subject?: string | null): string {
  const n = Math.max(1, Math.min(20, Math.round(count) || 10));
  return [
    `Eres profesor universitario${subject ? ` de ${String(subject).slice(0, 80)}` : ''}. Con base SOLO en estas notas de clase, arma un simulacro de examen de exactamente ${n} ${n === 1 ? 'pregunta' : 'preguntas'} en español.`,
    'Reglas:',
    '- Mezcla tipos: cerca de la mitad de opción múltiple ("mc": 4 opciones, una sola correcta, distractores creíbles), respuesta corta ("short") y, solo si el tema tiene cálculos, problemas numéricos ("num", respuesta con número y unidades).',
    '- Reparte las preguntas entre las notas. Nada que no esté en las notas.',
    '- Preguntas claras, de nivel de parcial. Fórmulas con LaTeX entre $...$.',
    '- "explain": una o dos frases que expliquen la respuesta correcta.',
    '- "note": el número de la nota de donde sale la pregunta.',
    'Devuelve SOLO un arreglo JSON, sin texto antes ni después, con este formato:',
    '[{"type":"mc","q":"¿...?","options":["...","...","...","..."],"answer":2,"explain":"...","note":1},{"type":"short","q":"...","answer":"respuesta esperada breve","explain":"...","note":2},{"type":"num","q":"...","answer":"12,5 m/s","explain":"...","note":1}]',
    '',
    'Notas:',
    notesBlock(notes),
  ].join('\n');
}

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/** Saca el arreglo de preguntas y descarta lo inválido. `note` queda desde 0. */
export function parseQuiz(text: string, max = 20, noteCount = 1): QuizQuestion[] {
  const m = text.match(/\[[\s\S]*\]/);
  let raw: unknown;
  try { raw = JSON.parse(m ? m[0] : text); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const out: QuizQuestion[] = [];
  for (const x of raw as any[]) {
    if (!x || typeof x !== 'object') continue;
    const type: QuizType | null = x.type === 'mc' || x.type === 'short' || x.type === 'num' ? x.type : null;
    const q = str(x.q, 600);
    const explain = str(x.explain, 600);
    if (!type || !q) continue;
    const nn = Number(x.note);
    const note = Number.isInteger(nn) && nn >= 1 && nn <= noteCount ? nn - 1 : null;
    if (type === 'mc') {
      const options = Array.isArray(x.options) ? x.options.map((o: unknown) => str(o, 300)).filter(Boolean) : [];
      const a = Number(x.answer);
      if (options.length !== 4 || !Number.isInteger(a) || a < 0 || a > 3) continue;
      if (new Set(options.map((o: string) => o.toLowerCase())).size !== 4) continue;
      out.push({ type, q, options, answer: a, explain, note });
    } else {
      const answer = typeof x.answer === 'number' ? String(x.answer) : str(x.answer, 300);
      if (!answer) continue;
      out.push({ type, q, answer, explain, note });
    }
    if (out.length >= max) break;
  }
  return out;
}

export function gradePrompt(items: { q: string; expected: string; given: string }[]): string {
  const list = items.slice(0, 25).map((it, i) => [
    `${i + 1}. Pregunta: ${it.q.slice(0, 600)}`,
    `   Respuesta esperada: ${it.expected.slice(0, 400)}`,
    `   Respuesta del estudiante: ${(it.given || '(en blanco)').slice(0, 800)}`,
  ].join('\n')).join('\n');
  return [
    'Corrige estas respuestas de un estudiante universitario. Para cada una decide "ok" (correcta), "partial" (le falta algo o tiene un error menor) o "wrong" (incorrecta o en blanco).',
    'Sé justo: acepta sinónimos, otra redacción y valores numéricos equivalentes con redondeo razonable o unidades equivalentes.',
    '"why": una frase corta en español dirigida al estudiante (de tú) que diga qué estuvo bien o qué faltó.',
    `Devuelve SOLO un arreglo JSON con ${Math.min(items.length, 25)} elementos en el mismo orden, por ejemplo: [{"verdict":"ok","why":"..."}]`,
    '',
    list,
  ].join('\n');
}

export function parseGrades(text: string, n: number): GradeResult[] {
  const m = text.match(/\[[\s\S]*\]/);
  let raw: unknown;
  try { raw = JSON.parse(m ? m[0] : text); } catch { raw = []; }
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: n }, (_, i) => {
    const x = arr[i] as any;
    const v = x?.verdict;
    if (v !== 'ok' && v !== 'partial' && v !== 'wrong') return null;
    return { verdict: v, why: str(x.why, 300) };
  });
}

export function recallPrompt(title: string, content: string, headings: string[], recalled: string): string {
  return [
    'Un estudiante escribió de memoria todo lo que recuerda de una nota de clase. Compáralo con la nota.',
    'Devuelve SOLO un objeto JSON, sin texto antes ni después, con este formato:',
    '{"recalled":["idea importante que sí recordó"],"missing":[{"point":"idea importante que faltó","heading":"título de la lista donde está, copiado tal cual, o null"}],"wrong":[{"point":"lo que escribió mal","fix":"lo correcto"}],"score":70}',
    'Reglas: frases cortas en español, máximo 8 elementos por lista, solo ideas importantes (no detalles menores). "score" de 0 a 100: qué tanto de lo importante recordó.',
    headings.length ? `Títulos de la nota: ${headings.slice(0, 40).map((h) => `"${h.slice(0, 100)}"`).join(', ')}` : '',
    '',
    `Nota "${title.slice(0, 120)}":`,
    content.slice(0, NOTES_BUDGET),
    '',
    'Lo que recordó el estudiante:',
    (recalled || '(no escribió nada)').slice(0, 6000),
  ].filter((l) => l !== '').join('\n');
}

export function parseRecall(text: string, headings: string[] = []): RecallResult | null {
  const m = text.match(/\{[\s\S]*\}/);
  let x: any;
  try { x = JSON.parse(m ? m[0] : text); } catch { return null; }
  if (!x || typeof x !== 'object') return null;
  const list = (a: unknown) => (Array.isArray(a) ? a : []).slice(0, 8);
  const byLow = new Map(headings.map((h) => [h.trim().toLowerCase(), h]));
  const recalled = list(x.recalled).map((s) => str(s, 300)).filter(Boolean);
  const missing = list(x.missing).map((it: any) => {
    const point = str(typeof it === 'string' ? it : it?.point, 300);
    const h = typeof it?.heading === 'string' ? byLow.get(it.heading.trim().toLowerCase()) ?? null : null;
    return { point, heading: h };
  }).filter((it) => it.point);
  const wrong = list(x.wrong).map((it: any) => ({ point: str(it?.point, 300), fix: str(it?.fix, 300) })).filter((it) => it.point);
  const sc = Number(x.score);
  if (!Number.isFinite(sc)) return null;
  return { recalled, missing, wrong, score: Math.max(0, Math.min(100, Math.round(sc))) };
}
