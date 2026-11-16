// ============================================================
//  Columnas por defecto y plantillas de proyecto (puro, sin React Native,
//  para poder probarlo). v24: plantillas de trabajo.
// ============================================================
import type { BoardColumn } from './projects';

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { key: 'todo',   label: 'Por hacer',   color: '#9aa3b2' },
  { key: 'doing',  label: 'En curso',    color: '#6c8cff' },
  { key: 'review', label: 'En revisión', color: '#f5b64c' },
  { key: 'done',   label: 'Hecho',       color: '#37c98b', done: true },
];

export type Template = {
  key: string;
  label: string;
  icon: string;
  hint: string;
  columns: BoardColumn[];
  tasks: string[];
  /** v24: plantilla de trabajo (se muestra primero en modo Trabajo). */
  work?: boolean;
};

export const TEMPLATES: Template[] = [
  {
    key: 'blank',
    label: 'En blanco',
    icon: '📋',
    hint: 'Cuatro columnas y nada más.',
    columns: DEFAULT_COLUMNS,
    tasks: [],
  },
  {
    key: 'grupo',
    label: 'Trabajo en grupo',
    icon: '👥',
    hint: 'Repartir, escribir, revisar y entregar.',
    columns: DEFAULT_COLUMNS,
    tasks: [
      'Repartir las partes',
      'Buscar fuentes',
      'Escribir el borrador',
      'Revisar redacción y citas',
      'Armar la entrega final',
    ],
  },
  {
    key: 'laboratorio',
    label: 'Laboratorio',
    icon: '🧪',
    hint: 'De la práctica al informe.',
    columns: [
      { key: 'prep',    label: 'Preparación', color: '#9aa3b2' },
      { key: 'toma',    label: 'Toma de datos', color: '#6c8cff' },
      { key: 'analisis',label: 'Análisis',    color: '#b98cff' },
      { key: 'informe', label: 'Informe',     color: '#f5b64c' },
      { key: 'entregado', label: 'Entregado', color: '#37c98b', done: true },
    ],
    tasks: [
      'Leer la guía de la práctica',
      'Preparar materiales',
      'Tomar mediciones',
      'Calcular resultados y error',
      'Redactar conclusiones',
    ],
  },
  {
    key: 'exposicion',
    label: 'Exposición',
    icon: '🎤',
    hint: 'Guion, diapositivas y ensayo.',
    columns: [
      { key: 'ideas',   label: 'Ideas',       color: '#9aa3b2' },
      { key: 'guion',   label: 'Guion',       color: '#6c8cff' },
      { key: 'diapos',  label: 'Diapositivas',color: '#f5b64c' },
      { key: 'ensayo',  label: 'Ensayo',      color: '#b98cff' },
      { key: 'lista',   label: 'Lista',       color: '#37c98b', done: true },
    ],
    tasks: [
      'Definir el mensaje principal',
      'Escribir el guion',
      'Diseñar las diapositivas',
      'Repartir quién dice qué',
      'Ensayar con cronómetro',
    ],
  },
  {
    key: 'investigacion',
    label: 'Investigación',
    icon: '🔎',
    hint: 'Pregunta, fuentes, escritura.',
    columns: [
      { key: 'pregunta', label: 'Pregunta',  color: '#9aa3b2' },
      { key: 'fuentes',  label: 'Fuentes',   color: '#6c8cff' },
      { key: 'escritura',label: 'Escritura', color: '#f5b64c' },
      { key: 'revision', label: 'Revisión',  color: '#b98cff' },
      { key: 'entregado',label: 'Entregado', color: '#37c98b', done: true },
    ],
    tasks: [
      'Delimitar la pregunta',
      'Reunir bibliografía',
      'Fichar las fuentes',
      'Escribir el marco teórico',
      'Revisar citas y formato',
    ],
  },
  // v24: plantillas de trabajo.
  {
    key: 'cliente',
    label: 'Proyecto con cliente',
    icon: '🤝',
    hint: 'Propuesta, ejecución, revisión del cliente y entrega.',
    work: true,
    columns: [
      { key: 'propuesta', label: 'Propuesta', color: '#9aa3b2' },
      { key: 'ejecucion', label: 'En ejecución', color: '#6c8cff' },
      { key: 'revision', label: 'Revisión del cliente', color: '#f5b64c' },
      { key: 'entregado', label: 'Entregado', color: '#37c98b', done: true },
    ],
    tasks: [
      'Reunión de arranque con el cliente',
      'Enviar propuesta y cronograma',
      'Primera entrega para revisión',
      'Ajustes según comentarios',
      'Entrega final y cuenta de cobro',
    ],
  },
  {
    key: 'sprint',
    label: 'Sprint de dos semanas',
    icon: '🏃',
    hint: 'Pendiente, en curso, en revisión y hecho.',
    work: true,
    columns: [
      { key: 'pendiente', label: 'Pendiente', color: '#9aa3b2' },
      { key: 'curso', label: 'En curso', color: '#6c8cff' },
      { key: 'revision', label: 'En revisión', color: '#b98cff' },
      { key: 'hecho', label: 'Hecho', color: '#37c98b', done: true },
    ],
    tasks: [
      'Planeación del sprint',
      'Revisión a mitad de sprint',
      'Demo del sprint',
      'Retrospectiva',
    ],
  },
  {
    key: 'lanzamiento',
    label: 'Lanzamiento',
    icon: '🚀',
    hint: 'Del plan a la salida y el seguimiento.',
    work: true,
    columns: [
      { key: 'plan', label: 'Plan', color: '#9aa3b2' },
      { key: 'preparacion', label: 'Preparación', color: '#6c8cff' },
      { key: 'salida', label: 'Salida', color: '#f5b64c' },
      { key: 'seguimiento', label: 'Seguimiento', color: '#37c98b', done: true },
    ],
    tasks: [
      'Definir objetivo y fecha',
      'Preparar materiales y anuncio',
      'Probar todo antes de salir',
      'Lanzar',
      'Medir resultados a la semana',
    ],
  },
];
/** Plantillas en el orden del modo: en Trabajo, las de trabajo primero (después de "En blanco"). */
export function projectTemplatesFor(mode: 'estudio' | 'trabajo' | 'ambos'): Template[] {
  if (mode === 'estudio') return TEMPLATES.filter((t) => !t.work);
  if (mode === 'trabajo') return [TEMPLATES[0], ...TEMPLATES.filter((t) => t.work), ...TEMPLATES.filter((t) => !t.work && t.key !== 'blank')];
  return TEMPLATES;
}
