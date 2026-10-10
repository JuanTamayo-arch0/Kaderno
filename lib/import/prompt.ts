import { formatDMY, formatForJson } from './dates';
import type { Member } from './types';

export interface PromptContext {
  projectName: string;
  subjectName?: string | null;
  members: Member[];
  /** Fecha y hora actual (ISO). */
  now: string;
  /** Entrega final del proyecto (ISO), si la tiene. */
  deadline?: string | null;
}

function memberLine(m: Member): string {
  if (m.email && m.name) return `${m.name} <${m.email}>`;
  return m.email || m.name || '';
}

/**
 * Prompt que copia el botón "Copiar prompt para IA". Lleva los integrantes, la
 * materia y las fechas del proyecto para que la IA asigne responsables reales y no
 * ponga fechas después de la entrega.
 */
export function buildAiPrompt(ctx: PromptContext): string {
  const members = ctx.members.filter((m) => m.role !== 'viewer').map(memberLine).filter(Boolean);
  const project = ctx.subjectName ? `${ctx.projectName} (${ctx.subjectName})` : ctx.projectName;
  const deadlineLine = ctx.deadline
    ? `Entrega final: ${formatForJson(ctx.deadline)!.replace('T', ' ')}, hora de Bogotá.`
    : 'El proyecto no tiene entrega final definida: propón fechas razonables.';

  const lines = [
    'Ayúdame a dividir este proyecto universitario en tareas para importarlas en Kaderno.',
    '',
    `Proyecto: ${project}`,
    members.length ? `Integrantes: ${members.join(', ')}` : 'Integrantes: deja "responsable" vacío.',
    `Hoy es ${formatDMY(ctx.now)}. ${deadlineLine}`,
    '',
    'Responde SOLO con un JSON válido, sin texto antes ni después, con esta forma:',
    '{"tareas": [{"titulo": "", "descripcion": "", "estado": "Por hacer", "responsable": "correo de un integrante o vacío", "inicio": "AAAA-MM-DDTHH:MM", "entrega": "AAAA-MM-DDTHH:MM", "checklist": [{"texto": "", "hecho": false}]}]}',
    '',
    'Reglas:',
    '- Tareas concretas de 1 a 5 días de trabajo, con un título corto que empiece con un verbo.',
    '- Reparte la carga de forma equilibrada entre los integrantes y usa sus correos exactos.',
    '- Todas las fechas entre hoy y la entrega final, en hora de Bogotá; el inicio siempre antes de la entrega.',
    '- Entre 2 y 6 ítems de checklist por tarea.',
    '- Deja tiempo al final para revisar y unir el trabajo.',
    '',
    'Enunciado del proyecto:',
    '[pega aquí el enunciado]',
  ];
  return lines.join('\n');
}
