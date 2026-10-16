// ============================================================
//  Utilidades puras para los archivos versionados de un proyecto.
//  Sin dependencias de Supabase ni de React Native para poder probarlas.
// ============================================================

/** Tope por archivo. Supabase (plan gratis) permite 50 MB; 25 MB deja margen y sube rápido. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

/** Nombre apto para una ruta de Storage: sin tildes, espacios ni símbolos, máx. 80 caracteres. */
export function safeName(name: string): string {
  const ext = extOf(name);
  const base = ext ? name.trim().slice(0, -(ext.length + 1)) : name.trim();
  let b = strip(base).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '');
  if (!b) b = 'archivo';
  const max = 80 - (ext ? ext.length + 1 : 0);
  if (b.length > max) b = b.slice(0, max);
  return ext ? `${b}.${ext}` : b;
}

/**
 * Ruta en el bucket project-files. La primera carpeta tiene que ser el id del
 * proyecto (de eso dependen las políticas). El número de versión lo pone la
 * base, así que la ruta no lo lleva: lleva una marca única para que dos
 * personas subiendo a la vez nunca choquen.
 */
export function versionPath(projectId: string, fileId: string, name: string, stamp: number = Date.now(), rand: string = Math.random().toString(36).slice(2, 8)): string {
  return `${projectId}/${fileId}/${stamp}-${rand}-${safeName(name)}`;
}

export function humanSize(bytes: number | null | undefined): string {
  if (bytes == null || !isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / 1024 / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', html: 'text/html',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', heic: 'image/heic',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  py: 'text/x-python', js: 'text/javascript', ts: 'text/plain', java: 'text/plain', c: 'text/plain', cpp: 'text/plain', ipynb: 'application/json',
  dwg: 'application/acad', stl: 'model/stl',
};

export function guessMime(name: string, given?: string | null): string {
  if (given && given !== 'application/octet-stream') return given;
  return MIME[extOf(name)] ?? given ?? 'application/octet-stream';
}

export type FileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'image' | 'audio' | 'video' | 'archive' | 'code' | 'other';

export function kindOf(name: string, mime?: string | null): FileKind {
  const e = extOf(name);
  const m = (mime ?? '').toLowerCase();
  if (e === 'pdf' || m.includes('pdf')) return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(e) || m.includes('wordprocessing')) return 'doc';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(e) || m.includes('spreadsheet')) return 'sheet';
  if (['ppt', 'pptx', 'odp', 'key'].includes(e) || m.includes('presentation')) return 'slides';
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(e)) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'archive';
  if (['py', 'js', 'ts', 'tsx', 'java', 'c', 'cpp', 'h', 'ipynb', 'm', 'r', 'sql', 'html', 'css', 'json'].includes(e)) return 'code';
  return 'other';
}

export const KIND_ICON: Record<FileKind, string> = {
  pdf: 'document-text-outline', doc: 'reader-outline', sheet: 'grid-outline', slides: 'easel-outline',
  image: 'image-outline', audio: 'musical-notes-outline', video: 'videocam-outline', archive: 'archive-outline',
  code: 'code-slash-outline', other: 'document-outline',
};

/** Se puede ver dentro de la app (visor) sin descargar. */
export function previewable(name: string, mime?: string | null): boolean {
  const k = kindOf(name, mime);
  return k === 'pdf' || k === 'image' || extOf(name) === 'txt';
}

const norm = (s: string) => strip(s).toLowerCase().trim();

/**
 * ¿Este archivo nuevo parece otra versión de uno que ya está? Compara el nombre
 * sin extensión, ignorando sufijos comunes de versión ("v2", "final", "(1)",
 * "corregido", fechas). Devuelve el id del archivo existente o null.
 */
export function baseKey(name: string): string {
  const ext = extOf(name);
  let b = norm(ext ? name.slice(0, -(ext.length + 1)) : name);
  b = b.replace(/\(\d+\)/g, ' ')
    .replace(/[\s_.-]+(v|ver|version)\s*\d+\b/g, ' ')
    .replace(/\b(final|definitivo|corregido|revisado|ultima|ultimo|nuevo|copia|copy|draft|borrador)\b/g, ' ')
    .replace(/\b\d{4}[-_.]?\d{2}[-_.]?\d{2}\b/g, ' ')
    .replace(/[\s_.-]+/g, ' ')
    .trim();
  return `${b}|${ext}`;
}

export function matchExisting<T extends { id: string; name: string }>(name: string, files: T[]): T | null {
  const exact = files.find((f) => norm(f.name) === norm(name));
  if (exact) return exact;
  const k = baseKey(name);
  if (k.startsWith('|')) return null;
  return files.find((f) => baseKey(f.name) === k) ?? null;
}

/** Texto corto de cuándo: "hace 5 min", "ayer", "12 oct". */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400 && d.getDate() === now.getDate()) return `hace ${Math.floor(s / 3600)} h`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'ayer';
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const base = `${d.getDate()} ${meses[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}
