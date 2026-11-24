import { formatDMY, formatForJson } from './dates';
import type { BoardColumnRef, Member } from './types';
import { t, lang } from '../i18n';

export interface PromptContext {
  projectName: string;
  subjectName?: string | null;
  members: Member[];
  /** Fecha y hora actual (ISO). */
  now: string;
  /** Entrega final del proyecto (ISO), si la tiene. */
  deadline?: string | null;
  /** Columnas del tablero, para que la IA use nombres que existen. */
  columns?: BoardColumnRef[];
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
    ? t('Entrega final: {replace}, hora de Bogotá.', { replace: formatForJson(ctx.deadline)!.replace('T', ' ') })
    : t('El proyecto no tiene entrega final definida: propón fechas razonables.');

  const cols = ctx.columns?.length ? ctx.columns : [{ key: 'todo', label: t('Por hacer') }];
  const firstCol = cols[0].label;
  const colNames = cols.map((c) => c.label).join(', ');

  const lines = [
    t('Ayúdame a dividir este proyecto universitario en tareas para importarlas en Kaderno.'),
    '',
    t('Proyecto: {project}', { project }),
    members.length ? t('Integrantes: {v}', { v: members.join(', ') }) : t('Integrantes: deja "responsable" vacío.'),
    t('Hoy es {now}. {deadlineLine}', { now: formatDMY(ctx.now), deadlineLine }),
    '',
    t('Responde SOLO con un JSON válido, sin texto antes ni después, con esta forma:'),
    lang() === 'en'
      ? `{"tasks": [{"title": "", "description": "", "status": "${firstCol}", "assignee": "a member's email or empty", "start": "YYYY-MM-DDTHH:MM", "due": "YYYY-MM-DDTHH:MM", "checklist": [{"text": "", "done": false}]}]}` // i18n-ok
      : `{"tareas": [{"titulo": "", "descripcion": "", "estado": "${firstCol}", "responsable": "correo de un integrante o vacío", "inicio": "AAAA-MM-DDTHH:MM", "entrega": "AAAA-MM-DDTHH:MM", "checklist": [{"texto": "", "hecho": false}]}]}`, // i18n-ok
    '',
    t('Reglas:'),
    t('- Tareas concretas de 1 a 5 días de trabajo, con un título corto que empiece con un verbo.'),
    t('- Reparte la carga de forma equilibrada entre los integrantes y usa sus correos exactos.'),
    t('- Todas las fechas entre hoy y la entrega final, en hora de Bogotá; el inicio siempre antes de la entrega.'),
    t('- Entre 2 y 6 ítems de checklist por tarea.'),
    t('- "estado" debe ser una de estas columnas: {colNames}. Casi todo empieza en "{firstCol}".', { colNames, firstCol }),
    t('- Deja tiempo al final para revisar y unir el trabajo.'),
    t('- Si te paso tareas que ya existen (con "id"), devuélvelas con el MISMO "id" para que se actualicen en vez de duplicarse. Si no tienen id, conserva exactamente su título o su código inicial (por ejemplo "H-009").'),
    '',
    t('Enunciado del proyecto:'),
    t('[pega aquí el enunciado]'),
  ];
  return lines.join('\n');
}
