// ============================================================
//  Tarjetas con IA: instrucciones y validación, sin dependencias.
//  Lo usa la función "ai" y también las pruebas de la app.
// ============================================================

export type AiCard = { kind: 'basic' | 'cloze'; front: string; back: string };

export function flashcardPrompt(content: string, count: number, existing: string[], mode: 'note' | 'selection'): string {
  const n = Math.max(1, Math.min(12, Math.round(count) || 6));
  const ex = existing.filter(Boolean).slice(0, 60).map((e) => `- ${e.slice(0, 160)}`).join('\n');
  return [
    `Eres un profesor que hace tarjetas de estudio (flashcards) en español a partir de ${mode === 'selection' ? 'un fragmento de' : ''} unos apuntes universitarios.`,
    `Haz exactamente ${n} ${n === 1 ? 'tarjeta' : 'tarjetas'}. Reglas:`,
    '- Una sola idea por tarjeta. Preguntas que obliguen a recordar (nunca de sí o no).',
    '- Respuestas de máximo 25 palabras.',
    '- Mezcla dos tipos: "basic" (pregunta y respuesta) y "cloze" (una frase con UN solo espacio marcado así: {{palabra}}).',
    '- Usa "cloze" solo para definiciones, términos y fórmulas; en "cloze" el campo back va vacío.',
    '- Escribe las fórmulas con LaTeX entre $...$ (por ejemplo $F = P \\cdot A$).',
    ex ? `- NO repitas ninguna de estas tarjetas que ya existen:\n${ex}` : '',
    'Devuelve SOLO un arreglo JSON, sin texto antes ni después, con este formato:',
    '[{"kind":"basic","front":"¿...?","back":"..."},{"kind":"cloze","front":"La unidad {{FRL}} filtra, regula y lubrica el aire","back":""}]',
    '',
    'Apuntes:',
    content.slice(0, 24000),
  ].filter((l) => l !== '').join('\n');
}

const CLOZE = /\{\{[^{}]+\}\}/g;

/** Saca el arreglo JSON de la respuesta del modelo y descarta lo inválido. */
export function parseCards(text: string, max = 12): AiCard[] {
  const m = text.match(/\[[\s\S]*\]/);
  let raw: unknown;
  try { raw = JSON.parse(m ? m[0] : text); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const out: AiCard[] = [];
  for (const x of raw as any[]) {
    if (!x || typeof x !== 'object') continue;
    const kind = x.kind === 'cloze' ? 'cloze' : x.kind === 'basic' || x.kind === undefined ? 'basic' : null;
    const front = typeof x.front === 'string' ? x.front.trim() : '';
    const back = typeof x.back === 'string' ? x.back.trim() : '';
    if (!kind || !front || front.length > 400 || back.length > 400) continue;
    if (kind === 'cloze' && (front.match(CLOZE) ?? []).length !== 1) continue;
    if (kind === 'basic' && !back) continue;
    out.push({ kind, front, back: kind === 'cloze' ? '' : back });
    if (out.length >= max) break;
  }
  return out;
}
