// ============================================================
//  Acta de una reunión transcrita (v24, fase 4). TypeScript puro: lo usan la
//  función "ai" y las pruebas de la app.
// ============================================================

export type MeetingTask = { title: string; owner: string | null; due: string | null; when: string | null };
export type MeetingMinutes = {
  kind: 'meeting';
  title: string;
  summary: string[];
  attendees: string[];
  decisions: string[];
  tasks: MeetingTask[];
  open: string[];
};

export function meetingPrompt(transcript: string, notes: string, people: string[], today: string): string {
  return [
    'Eres un asistente que escribe actas de reunión de trabajo en español. Abajo está la transcripción automática de una reunión,',
    'hecha por el reconocimiento de voz del navegador: puede tener palabras mal entendidas; corrígelas por contexto sin inventar.',
    'También están las notas que la persona escribió durante la reunión.',
    today ? `Hoy es ${today} (formato AAAA-MM-DD). Úsalo para convertir fechas dichas como "el viernes" o "en dos semanas".` : '',
    people.length ? `Personas del equipo (usa estos nombres exactos cuando alguien quede a cargo): ${people.join(', ')}.` : '',
    '',
    'Devuelve SOLO un objeto JSON, sin texto antes ni después, con esta forma:',
    '{"title": "...", "summary": ["..."], "attendees": ["..."], "decisions": ["..."], "tasks": [{"title": "...", "owner": "...", "due": "AAAA-MM-DD", "when": "..."}], "open": ["..."]}',
    '- title: un título corto para la reunión (máximo 8 palabras), sin la fecha.',
    '- summary: de 3 a 6 frases con lo más importante que se habló.',
    '- attendees: los nombres de quienes hablaron o fueron mencionados como presentes (vacío si no se sabe).',
    '- decisions: lo que se decidió o acordó, una frase cada una. No pongas tareas aquí.',
    '- tasks: compromisos concretos. "title" empieza con un verbo (máximo 12 palabras); "owner" es quien quedó a cargo (null si nadie);',
    '  "due" es la fecha en AAAA-MM-DD si se puede saber (null si no); "when" es la fecha tal como se dijo (null si no se dijo).',
    '- open: preguntas o temas que quedaron pendientes para la próxima.',
    'Si algo no aparece, deja la lista vacía. No incluyas nada que no esté en la reunión.',
    '',
    'NOTAS DE LA PERSONA:',
    notes.slice(0, 8000) || '(sin notas)',
    '',
    'TRANSCRIPCIÓN:',
    transcript.slice(0, 60000),
  ].filter((l) => l !== '').join('\n');
}

const str = (x: unknown, max: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isoDay = (x: unknown): string | null => {
  const s = String(x ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T12:00:00');
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

export function parseMeeting(text: string): MeetingMinutes | null {
  const m = (text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
  const tasks: MeetingTask[] = Array.isArray(j.tasks)
    ? j.tasks.map((t: any) => ({
        title: str(t?.title, 140),
        owner: t?.owner && !/^(null|nadie|ninguno)$/i.test(String(t.owner).trim()) ? str(t.owner, 60) : null,
        due: isoDay(t?.due),
        when: t?.when ? str(t.when, 60) : null,
      })).filter((t: MeetingTask) => t.title).slice(0, 20)
    : [];
  const out: MeetingMinutes = {
    kind: 'meeting', title: str(j.title, 80), summary: list(j.summary, 8, 300), attendees: list(j.attendees, 30, 60),
    decisions: list(j.decisions, 15, 300), tasks, open: list(j.open, 10, 200),
  };
  return out.summary.length || out.decisions.length || out.tasks.length ? out : null;
}
