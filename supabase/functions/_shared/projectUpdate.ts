// ============================================================
//  Estado semanal de un proyecto (v25, fase 3). TypeScript puro: lo usan la
//  función "ai" y las pruebas de la app.
// ============================================================
export type UpdateHealth = 'en_curso' | 'en_riesgo' | 'atrasado';

export function projectUpdatePrompt(reportMd: string): string {
  return [
    'Eres quien lidera un proyecto de trabajo y escribe el estado semanal para el equipo y para quien lo supervisa, en español de Colombia.',
    'Abajo está el informe de la semana (lo hecho, lo que viene, lo atrasado y la carga del equipo).',
    'Escribe de 3 a 5 frases cortas, sin listas ni títulos ni rayas largas: cómo va, qué se logró, qué riesgo hay y qué sigue.',
    'Elige el estado: "en_curso" si va bien, "en_riesgo" si hay algo atrasado o en peligro, "atrasado" si la entrega no se va a cumplir así.',
    'Devuelve SOLO un objeto JSON: {"health": "en_curso" | "en_riesgo" | "atrasado", "body": "..."}',
    '',
    'INFORME:',
    reportMd.slice(0, 12000),
  ].join('\n');
}

export function parseProjectUpdate(text: string): { health: UpdateHealth | null; body: string } | null {
  const m = (text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const body = String(j.body ?? '').replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, 2000);
    if (!body) return null;
    const h = ['en_curso', 'en_riesgo', 'atrasado'].includes(j.health) ? (j.health as UpdateHealth) : null;
    return { health: h, body };
  } catch { return null; }
}
