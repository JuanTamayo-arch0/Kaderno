// ============================================================
//  Acta de una reunión transcrita (v24, fase 4). TypeScript puro: lo usan la
//  función "ai" y las pruebas de la app.
// ============================================================
// v30: sin importar lang.ts, porque la app también usa este archivo (y Deno pide la extensión).
type Lang = 'es' | 'en';
const LABEL_EN: Record<string, string> = {
  Acta: 'Minutes', Asistentes: 'Attendees', Resumen: 'Summary', Decisiones: 'Decisions', Tareas: 'Tasks',
  'Pendientes para la próxima': 'Open items for next time', 'sin responsable': 'no owner',
};
const say = (lang: Lang, es: string) => (lang === 'en' ? LABEL_EN[es] ?? es : es);

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

/** v25: cómo quiere la persona sus actas (user_prefs.settings.minutes). */
export type MinutesStyle = { format: 'completa' | 'breve' | 'detallada'; extra: string };
export const DEFAULT_MINUTES_STYLE: MinutesStyle = { format: 'completa', extra: '' };
export function cleanMinutesStyle(x: any): MinutesStyle {
  const f = String(x?.format ?? '');
  return {
    format: f === 'breve' || f === 'detallada' ? f : 'completa',
    extra: String(x?.extra ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
  };
}

export type MeetingExtras = { style?: Partial<MinutesStyle> | null; prevOpen?: string[] };

export function meetingPrompt(transcript: string, notes: string, people: string[], today: string, extras: MeetingExtras = {}): string {
  const st = cleanMinutesStyle(extras.style ?? {});
  const prev = (extras.prevOpen ?? []).map((x) => String(x).replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, 15);
  const summaryRule = st.format === 'breve'
    ? '- summary: de 1 a 3 frases cortas, solo lo esencial.'
    : st.format === 'detallada'
    ? '- summary: de 5 a 8 frases con los temas en el orden en que se hablaron y los datos concretos que se dieron.'
    : '- summary: de 3 a 6 frases con lo más importante que se habló.';
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
    summaryRule,
    '- attendees: los nombres de quienes hablaron o fueron mencionados como presentes (vacío si no se sabe).',
    '- decisions: lo que se decidió o acordó, una frase cada una. No pongas tareas aquí.',
    '- tasks: compromisos concretos. "title" empieza con un verbo (máximo 12 palabras); "owner" es quien quedó a cargo (null si nadie);',
    '  "due" es la fecha en AAAA-MM-DD si se puede saber (null si no); "when" es la fecha tal como se dijo (null si no se dijo).',
    '- open: preguntas o temas que quedaron pendientes para la próxima.',
    'Si algo no aparece, deja la lista vacía. No incluyas nada que no esté en la reunión.',
    prev.length ? 'Estos temas quedaron pendientes en la reunión anterior. Si en esta se resolvió alguno, dilo en decisions; si se habló y sigue abierto, repítelo en open; si no se habló, no lo pongas:' : '',
    ...prev.map((x) => `  * ${x}`),
    st.extra ? `Indicación de la persona sobre cómo quiere sus actas (respétala si no contradice el formato JSON): ${st.extra}` : '',
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

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso: string, lang: Lang = 'es') => { const [, m, d] = iso.split('-').map(Number); return lang === 'en' ? `${MONTHS_EN[m - 1]} ${d}` : `${d} ${MONTHS_ES[m - 1]}`; };

/**
 * El acta en texto simple, para mandarla por WhatsApp o correo y para que el
 * Oráculo la lea. Con bold, los títulos van entre asteriscos (WhatsApp).
 */
export function minutesPlain(m: MeetingMinutes, dateLabel: string, bold = false, lang: Lang = 'es'): string {
  const h = (t: string) => (bold ? `*${t}*` : t);
  const out: string[] = [h(`${say(lang, 'Acta')}${m.title ? `: ${m.title}` : ''} (${dateLabel})`)];
  const block = (t: string, xs: string[]) => { if (xs.length) out.push('', h(say(lang, t)), ...xs.map((x) => `- ${x}`)); };
  if (m.attendees.length) out.push('', `${say(lang, 'Asistentes')}: ${m.attendees.join(', ')}`);
  block('Resumen', m.summary);
  block('Decisiones', m.decisions);
  block('Tareas', m.tasks.map((t) => {
    const who = t.owner ?? say(lang, 'sin responsable');
    const when = t.due ? dayLabel(t.due, lang) : t.when ?? '';
    return `${t.title} (${who}${when ? `, ${when}` : ''})`;
  }));
  block('Pendientes para la próxima', m.open);
  return out.join('\n');
}
