// ============================================================
//  v30: idioma en el servidor. TypeScript puro (lo usan las funciones y
//  la app). La app manda "lang" en cada llamada (ver lib/supabase.ts); los
//  avisos y el calendario lo leen de user_prefs.settings.lang.
// ============================================================

export type Lang = 'es' | 'en';
export const langOf = (x: unknown): Lang => (x === 'en' ? 'en' : 'es');

/** Lo que se agrega al final de un prompt para que la IA responda en inglés. */
export function answerIn(lang: Lang): string {
  return lang === 'en'
    ? '\n\nIMPORTANT: The person uses Kaderno in English. Write every text you return (titles, questions, answers, explanations, summaries, tasks) in natural English, even if the material is in Spanish and even if an instruction above says to write in Spanish. Keep JSON keys and fixed values exactly as specified.'
    : '';
}

/** Mensajes fijos del servidor en inglés. La llave es el texto en español. */
const EN: Record<string, string> = {
  'Falta el contenido': 'Content is missing',
  'Inicia sesión para usar la IA.': 'Sign in to use the AI.',
  'Inicia sesión para leer fotos.': 'Sign in to read photos.',
  'Fallo del modelo': 'The model failed',
  'Fallo del modelo de visión': 'The vision model failed',
  'La IA no pudo redactar el estado, intenta de nuevo.': "The AI couldn't draft the status, try again.",
  'La IA no pudo armar el acta, intenta de nuevo.': "The AI couldn't put together the minutes, try again.",
  'La IA no pudo resumir la clase, intenta de nuevo.': "The AI couldn't summarize the class, try again.",
  'La IA no devolvió preguntas, intenta de nuevo.': "The AI didn't return questions, try again.",
  'La IA no pudo comparar tu respuesta, intenta de nuevo.': "The AI couldn't compare your answer, try again.",
  'La IA no devolvió tarjetas, intenta de nuevo.': "The AI didn't return any cards, try again.",
  'No autenticado': 'Not signed in',
  'Falta question': 'The question is missing',
  'La imagen es muy grande.': 'The image is too large.',
  'Formato de imagen no soportado.': 'Image format not supported.',
  'Enlace no válido': 'Invalid link',
  'Este enlace ya no funciona.': 'This link no longer works.',
  'Nota': 'Note',
  'Reunión': 'Meeting',
  'Empezar enfoque': 'Start focus',
  'Acta': 'Minutes',
  'Asistentes': 'Attendees',
  'Resumen': 'Summary',
  'Decisiones': 'Decisions',
  'Tareas': 'Tasks',
  'Pendientes para la próxima': 'Open items for next time',
  'sin responsable': 'no owner',
  'Proyecto': 'Project',
  'Entregas': 'Deadlines',
  'Clases': 'Classes',
};

/** Texto fijo del servidor en el idioma pedido. */
export function say(lang: Lang, es: string): string {
  return lang === 'en' ? EN[es] ?? es : es;
}
