// ============================================================
//  Columnas por defecto y plantillas de proyecto (puro, sin React Native,
//  para poder probarlo). v24: plantillas de trabajo.
// ============================================================
import type { BoardColumn } from './projects';
import { t } from './i18n';

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { key: 'todo',   label: t('Por hacer'),   color: '#9aa3b2' },
  { key: 'doing',  label: t('En curso'),    color: '#6c8cff' },
  { key: 'review', label: t('En revisión'), color: '#f5b64c' },
  { key: 'done',   label: t('Hecho'),       color: '#37c98b', done: true },
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
    label: t('En blanco'),
    icon: '📋',
    hint: t('Cuatro columnas y nada más.'),
    columns: DEFAULT_COLUMNS,
    tasks: [],
  },
  {
    key: 'grupo',
    label: t('Trabajo en grupo'),
    icon: '👥',
    hint: t('Repartir, escribir, revisar y entregar.'),
    columns: DEFAULT_COLUMNS,
    tasks: [
      t('Repartir las partes'),
      t('Buscar fuentes'),
      t('Escribir el borrador'),
      t('Revisar redacción y citas'),
      t('Armar la entrega final'),
    ],
  },
  {
    key: 'laboratorio',
    label: t('Laboratorio'),
    icon: '🧪',
    hint: t('De la práctica al informe.'),
    columns: [
      { key: 'prep',    label: t('Preparación'), color: '#9aa3b2' },
      { key: 'toma',    label: t('Toma de datos'), color: '#6c8cff' },
      { key: 'analisis',label: t('Análisis'),    color: '#b98cff' },
      { key: 'informe', label: t('Informe'),     color: '#f5b64c' },
      { key: 'entregado', label: t('Entregado'), color: '#37c98b', done: true },
    ],
    tasks: [
      t('Leer la guía de la práctica'),
      t('Preparar materiales'),
      t('Tomar mediciones'),
      t('Calcular resultados y error'),
      t('Redactar conclusiones'),
    ],
  },
  {
    key: 'exposicion',
    label: t('Exposición'),
    icon: '🎤',
    hint: t('Guion, diapositivas y ensayo.'),
    columns: [
      { key: 'ideas',   label: t('Ideas'),       color: '#9aa3b2' },
      { key: 'guion',   label: t('Guion'),       color: '#6c8cff' },
      { key: 'diapos',  label: t('Diapositivas'),color: '#f5b64c' },
      { key: 'ensayo',  label: t('Ensayo'),      color: '#b98cff' },
      { key: 'lista',   label: t('Lista'),       color: '#37c98b', done: true },
    ],
    tasks: [
      t('Definir el mensaje principal'),
      t('Escribir el guion'),
      t('Diseñar las diapositivas'),
      t('Repartir quién dice qué'),
      t('Ensayar con cronómetro'),
    ],
  },
  {
    key: 'investigacion',
    label: t('Investigación'),
    icon: '🔎',
    hint: t('Pregunta, fuentes, escritura.'),
    columns: [
      { key: 'pregunta', label: t('Pregunta'),  color: '#9aa3b2' },
      { key: 'fuentes',  label: t('Fuentes'),   color: '#6c8cff' },
      { key: 'escritura',label: t('Escritura'), color: '#f5b64c' },
      { key: 'revision', label: t('Revisión'),  color: '#b98cff' },
      { key: 'entregado',label: t('Entregado'), color: '#37c98b', done: true },
    ],
    tasks: [
      t('Delimitar la pregunta'),
      t('Reunir bibliografía'),
      t('Fichar las fuentes'),
      t('Escribir el marco teórico'),
      t('Revisar citas y formato'),
    ],
  },
  // v24: plantillas de trabajo.
  {
    key: 'cliente',
    label: t('Proyecto con cliente'),
    icon: '🤝',
    hint: t('Propuesta, ejecución, revisión del cliente y entrega.'),
    work: true,
    columns: [
      { key: 'propuesta', label: t('Propuesta'), color: '#9aa3b2' },
      { key: 'ejecucion', label: t('En ejecución'), color: '#6c8cff' },
      { key: 'revision', label: t('Revisión del cliente'), color: '#f5b64c' },
      { key: 'entregado', label: t('Entregado'), color: '#37c98b', done: true },
    ],
    tasks: [
      t('Reunión de arranque con el cliente'),
      t('Enviar propuesta y cronograma'),
      t('Primera entrega para revisión'),
      t('Ajustes según comentarios'),
      t('Entrega final y cuenta de cobro'),
    ],
  },
  {
    key: 'sprint',
    label: t('Sprint de dos semanas'),
    icon: '🏃',
    hint: t('Pendiente, en curso, en revisión y hecho.'),
    work: true,
    columns: [
      { key: 'pendiente', label: t('Pendiente'), color: '#9aa3b2' },
      { key: 'curso', label: t('En curso'), color: '#6c8cff' },
      { key: 'revision', label: t('En revisión'), color: '#b98cff' },
      { key: 'hecho', label: t('Hecho'), color: '#37c98b', done: true },
    ],
    tasks: [
      t('Planeación del sprint'),
      t('Revisión a mitad de sprint'),
      t('Demo del sprint'),
      t('Retrospectiva'),
    ],
  },
  {
    key: 'lanzamiento',
    label: t('Lanzamiento'),
    icon: '🚀',
    hint: t('Del plan a la salida y el seguimiento.'),
    work: true,
    columns: [
      { key: 'plan', label: t('Plan'), color: '#9aa3b2' },
      { key: 'preparacion', label: t('Preparación'), color: '#6c8cff' },
      { key: 'salida', label: t('Salida'), color: '#f5b64c' },
      { key: 'seguimiento', label: t('Seguimiento'), color: '#37c98b', done: true },
    ],
    tasks: [
      t('Definir objetivo y fecha'),
      t('Preparar materiales y anuncio'),
      t('Probar todo antes de salir'),
      t('Lanzar'),
      t('Medir resultados a la semana'),
    ],
  },
];
/** Plantillas en el orden del modo: en Trabajo, las de trabajo primero (después de "En blanco"). */
export function projectTemplatesFor(mode: 'estudio' | 'trabajo' | 'ambos'): Template[] {
  if (mode === 'estudio') return TEMPLATES.filter((t) => !t.work);
  if (mode === 'trabajo') return [TEMPLATES[0], ...TEMPLATES.filter((t) => t.work), ...TEMPLATES.filter((t) => !t.work && t.key !== 'blank')];
  return TEMPLATES;
}
