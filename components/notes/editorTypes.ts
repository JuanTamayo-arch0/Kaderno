// Tipos compartidos por el editor de notas (web y nativo).
export type HeadingItem = { level: number; text: string; index: number };

export type NoteEditorHandle = {
  /** Lleva la vista al título número `index` del índice. */
  scrollToHeading: (index: number) => void;
  /** Markdown actual (incluye lo que todavía no se ha avisado con onChange). */
  flush: () => string | null;
};

export type SelectionAction = 'flashcard' | 'explain';

export type NoteEditorProps = {
  /** Markdown inicial. El editor se vuelve a montar al cambiar de nota (usa `key`). */
  value: string;
  onChange: (md: string) => void;
  editing: boolean;
  /** En modo lectura, un clic en el texto pide pasar a editar. */
  onRequestEdit?: () => void;
  /** Esc mientras se edita: volver a la vista de lectura. */
  onRequestRead?: () => void;
  onOutline?: (items: HeadingItem[]) => void;
  onSelectionAction?: (kind: SelectionAction, text: string) => void;
  /** Sube una imagen pegada o arrastrada y devuelve la ruta en el almacenamiento. */
  uploadImage?: (file: Blob) => Promise<string>;
  minHeight?: number;
  /** Ancho cómodo de lectura (px). */
  maxWidth?: number;
};

/** Prefijo de las imágenes guardadas dentro del texto: ![](kd-img:<ruta>). */
export const KD_IMG = 'kd-img:';
