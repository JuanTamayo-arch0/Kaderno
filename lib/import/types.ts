// Tipos compartidos por el importador, la exportación y la edición en masa de Proyectos.

/** Campos que entiende el formato de archivo de Kaderno. */
export type Field =
  | 'id'
  | 'title'
  | 'description'
  | 'status'
  | 'assignee'
  | 'start'
  | 'due'
  | 'checklist'
  | 'delete';

/**
 * Columna del tablero. En Kaderno las columnas son configurables por proyecto
 * (projects.board_columns); `status` de una tarea guarda la `key` de su columna.
 */
export interface BoardColumnRef {
  key: string;
  label: string;
  done?: boolean;
}

/** Clave de una columna del tablero del proyecto. */
export type ProjectStatus = string;

export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface Member {
  user_id: string;
  email: string | null;
  name: string | null;
  role: MemberRole;
}

/**
 * Un ítem de checklist leído de un archivo.
 * `done` es null cuando el archivo no lo marcó ni como hecho ni como pendiente
 * (al actualizar, en ese caso se conserva el estado que ya tenía el ítem).
 */
export interface ChecklistItem {
  text: string;
  done: boolean | null;
}

/** Una tarea existente del proyecto, tal como la ve el cliente. */
export interface ExistingTask {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  /** true si la tarea está en una columna marcada como final. */
  done: boolean;
  assignee_id: string | null;
  start_at: string | null; // ISO UTC
  due_at: string | null; // ISO UTC
  checklist: { text: string; done: boolean }[];
}

/** Lo que el importador necesita saber del proyecto. */
export interface ProjectContext {
  members: Member[];
  columns: BoardColumnRef[];
}

/** Una fila del archivo ya convertida a valores de Kaderno. */
export interface NormalizedTask {
  /** Número de fila tal como lo ve el usuario (encabezado = fila 1 en CSV, primer objeto = 1 en JSON). */
  row: number;
  /** Campos que venían con valor en el archivo. Al actualizar, solo esos se tocan. */
  present: Field[];
  id: string | null;
  title: string | null;
  description: string | null;
  status: ProjectStatus | null;
  assignee_id: string | null;
  /** Lo que venía escrito en la columna responsable, para mostrarlo en la vista previa. */
  assignee_input: string | null;
  start_at: string | null;
  due_at: string | null;
  checklist: ChecklistItem[] | null;
  delete: boolean;
  /** true si el usuario decidió omitir esta fila en la vista previa. */
  skip?: boolean;
}

export type IssueLevel = 'error' | 'warning';

export interface RowIssue {
  row: number;
  field: Field | 'row';
  level: IssueLevel;
  message: string;
}

export type FileFormat = 'csv' | 'json';

export interface ParsedFile {
  format: FileFormat;
  headers: string[];
  rows: Record<string, unknown>[];
  /** Número de fila que ve el usuario para cada elemento de `rows`. */
  rowNumbers: number[];
  /** Separador detectado (solo CSV). */
  delimiter?: string;
  /** Codificación con la que se leyó (solo CSV). */
  encoding?: 'utf-8' | 'windows-1252';
  warnings: string[];
}

export type ColumnMapping = Record<string, Field | null>;

export type DuplicatePolicy = 'omitir' | 'actualizar' | 'crear';

export type ShiftTarget = 'ambas' | 'entrega';
