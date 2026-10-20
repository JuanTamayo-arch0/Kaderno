// ============================================================
//  Resumen de una clase transcrita (v22, fase 1). TypeScript puro: lo usan
//  la función "ai" y las pruebas de la app.
// ============================================================

export type ClassSummary = { ideas: string[]; formulas: string[]; tasks: { title: string; when: string | null }[]; questions: string[] };

export function classSummaryPrompt(transcript: string, notes: string, subject: string | null): string {
  return [
    'Eres un asistente de estudio universitario. Abajo está la transcripción automática de una clase' + (subject ? ` de ${subject}` : '') + ',',
    'hecha por el reconocimiento de voz del navegador: puede tener palabras mal entendidas; corrígelas por contexto sin inventar.',
    'También están los apuntes que el estudiante escribió durante la clase.',
    '',
    'Devuelve SOLO un objeto JSON, sin texto antes ni después, con esta forma:',
    '{"ideas": ["..."], "formulas": ["..."], "tasks": [{"title": "...", "when": "..."}], "questions": ["..."]}',
    '- ideas: de 4 a 8 ideas principales de la clase, en español, una frase cada una, sin repetir lo obvio.',
    '- formulas: las fórmulas o ecuaciones que se dijeron, en LaTeX sin signos $ (vacío si no hubo).',
    '- tasks: tareas, entregas, quices o lecturas que el profesor dejó o anunció. "title" corto empezando por el tipo (Taller, Quiz, Leer...) y "when" con la fecha tal como se dijo ("el viernes", "15 de noviembre") o null.',
    '- questions: de 2 a 4 preguntas para repasar lo más importante.',
    'Si algo no aparece, deja la lista vacía. No incluyas nada que no esté en la clase.',
    '',
    'APUNTES DEL ESTUDIANTE:',
    notes.slice(0, 8000) || '(sin apuntes)',
    '',
    'TRANSCRIPCIÓN:',
    transcript.slice(0, 60000),
  ].join('\n');
}

const str = (x: unknown, max: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseClassSummary(text: string): ClassSummary | null {
  const m = (text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
  const tasks = Array.isArray(j.tasks) ? j.tasks.map((t: any) => ({ title: str(t?.title, 120), when: t?.when ? str(t.when, 60) : null })).filter((t: { title: string }) => t.title).slice(0, 8) : [];
  const out: ClassSummary = { ideas: list(j.ideas, 10, 300), formulas: list(j.formulas, 10, 300), tasks, questions: list(j.questions, 6, 200) };
  return out.ideas.length || out.formulas.length || out.tasks.length ? out : null;
}
