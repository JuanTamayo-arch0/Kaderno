import { supabase } from './supabase';
import { logActivity } from './projects';
import { MAX_FILE_BYTES, guessMime, humanSize, versionPath } from './fileVersions';

// ============================================================
//  Archivos de un proyecto, con versiones (esquema v15).
//
//  · project_files: el archivo (nombre, descripción, versión actual).
//  · project_file_versions: cada subida. El número lo pone la base.
//  · Bucket privado "project-files", ruta <proyecto>/<archivo>/<marca>-<nombre>.
//
//  Subir una versión nueva nunca borra la anterior. Restaurar crea una versión
//  nueva que apunta al mismo objeto guardado; no se duplican bytes.
// ============================================================

const BUCKET = 'project-files';

export type ProjectFile = {
  id: string; project_id: string; task_id: string | null;
  name: string; description: string | null; path: string; mime: string | null; size: number | null;
  current_version: number; uploaded_by: string | null; updated_by: string | null;
  created_at: string; updated_at: string;
};

export type FileVersion = {
  id: string; file_id: string; project_id: string; version: number; name: string | null;
  path: string; size: number | null; mime: string | null; note: string | null; restored_from: number | null;
  uploaded_by: string | null; created_at: string;
};

export type Upload = { name: string; bytes: Uint8Array; mime: string | null; size: number };

/** Error claro cuando falta correr schema_v15.sql. */
export class NeedsV15 extends Error {
  constructor() { super('Falta activar las versiones de archivos: corre supabase/schema_v15.sql en Supabase.'); this.name = 'NeedsV15'; }
}
function isMissing(e: any): boolean {
  const code = e?.code ?? '';
  const msg = String(e?.message ?? '');
  return code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST205' || /project_file_versions|current_version/.test(msg) && /does not exist|not find|schema cache/i.test(msg);
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('No hay sesión activa');
  return data.user.id;
}

function checkSize(u: Upload) {
  if (!u.size && !u.bytes.byteLength) throw new Error('El archivo está vacío.');
  if ((u.size || u.bytes.byteLength) > MAX_FILE_BYTES) {
    throw new Error(`"${u.name}" pesa ${humanSize(u.size || u.bytes.byteLength)}. El máximo es ${humanSize(MAX_FILE_BYTES)}.`);
  }
}

async function putObject(path: string, u: Upload): Promise<void> {
  const body = u.bytes.buffer.slice(u.bytes.byteOffset, u.bytes.byteOffset + u.bytes.byteLength) as ArrayBuffer;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: guessMime(u.name, u.mime), upsert: false, cacheControl: '3600',
  });
  if (error) throw error;
}

async function removeObjects(paths: string[]): Promise<void> {
  const uniq = Array.from(new Set(paths.filter(Boolean)));
  if (!uniq.length) return;
  try { await supabase.storage.from(BUCKET).remove(uniq); } catch { /* si falla queda huérfano, no rompe nada */ }
}

// ---------- Lectura ----------

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const { data, error } = await supabase.from('project_files').select('*')
    .eq('project_id', projectId).neq('path', '').order('created_at', { ascending: false });
  if (error) throw error;
  const rows = ((data as any[]) ?? []).map((r) => ({
    ...r, current_version: r.current_version ?? 1, updated_at: r.updated_at ?? r.created_at, description: r.description ?? null,
  })) as ProjectFile[];
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getFileVersions(fileId: string): Promise<FileVersion[]> {
  const { data, error } = await supabase.from('project_file_versions').select('*')
    .eq('file_id', fileId).order('version', { ascending: false });
  if (error) { if (isMissing(error)) throw new NeedsV15(); throw error; }
  return (data as FileVersion[]) ?? [];
}

/** ¿Está corrida la migración v15? Se usa para avisar antes de que alguien intente subir. */
export async function hasFileVersions(): Promise<boolean> {
  const { error } = await supabase.from('project_file_versions').select('id', { head: true, count: 'exact' }).limit(1);
  return !error || !isMissing(error);
}

/** URL temporal. Con `download` el navegador baja el archivo con ese nombre en vez de abrirlo. */
export async function fileUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(path, 3600, download ? { download } : undefined);
  if (error || !data?.signedUrl) throw error ?? new Error('No se pudo generar el enlace.');
  return data.signedUrl;
}

// ---------- Escritura ----------

/** Sube un archivo nuevo al proyecto (queda como versión 1). */
export async function uploadNewFile(projectId: string, u: Upload, opts: { note?: string; description?: string; taskId?: string | null } = {}): Promise<ProjectFile> {
  checkSize(u);
  const me = await uid();
  const mime = guessMime(u.name, u.mime);
  // 1) La fila del archivo, todavía sin ruta (no aparece en la lista hasta tener una versión).
  const { data: row, error } = await supabase.from('project_files').insert({
    project_id: projectId, task_id: opts.taskId ?? null, name: u.name.trim().slice(0, 200), path: '',
    mime, size: u.size, uploaded_by: me, description: opts.description?.trim() || null,
  }).select('*').single();
  if (error) { if (isMissing(error)) throw new NeedsV15(); throw error; }
  const file = row as ProjectFile;
  const path = versionPath(projectId, file.id, u.name);
  try {
    // 2) Los bytes. 3) La versión (la base actualiza el archivo).
    await putObject(path, u);
    const { error: vErr } = await supabase.from('project_file_versions')
      .insert({ file_id: file.id, path, size: u.size, mime, name: u.name, note: opts.note?.trim() || null });
    if (vErr) { if (isMissing(vErr)) throw new NeedsV15(); throw vErr; }
  } catch (e) {
    await removeObjects([path]);
    await supabase.from('project_files').delete().eq('id', file.id);
    throw e;
  }
  logActivity(projectId, 'file_added', `subió “${u.name}”`, { file_id: file.id });
  return { ...file, path, current_version: 1 };
}

/** Sube una versión nueva de un archivo que ya existe. Devuelve el número que le tocó. */
export async function uploadVersion(file: ProjectFile, u: Upload, note?: string): Promise<number> {
  checkSize(u);
  const mime = guessMime(u.name, u.mime);
  const path = versionPath(file.project_id, file.id, u.name);
  await putObject(path, u);
  const { data, error } = await supabase.from('project_file_versions')
    .insert({ file_id: file.id, path, size: u.size, mime, name: u.name, note: note?.trim() || null })
    .select('version').single();
  if (error) {
    await removeObjects([path]);
    if (isMissing(error)) throw new NeedsV15();
    throw error;
  }
  const n = (data as any)?.version ?? file.current_version + 1;
  logActivity(file.project_id, 'file_version', `subió la versión ${n} de “${file.name}”`, { file_id: file.id, version: n });
  return n;
}

/** Vuelve a una versión anterior creando una versión nueva igual a ella. */
export async function restoreVersion(file: ProjectFile, v: FileVersion, note?: string): Promise<number> {
  const { data, error } = await supabase.from('project_file_versions').insert({
    file_id: file.id, path: v.path, size: v.size, mime: v.mime, name: v.name ?? file.name,
    note: note?.trim() || `Restaurada desde la versión ${v.version}`, restored_from: v.version,
  }).select('version').single();
  if (error) { if (isMissing(error)) throw new NeedsV15(); throw error; }
  const n = (data as any)?.version ?? file.current_version + 1;
  logActivity(file.project_id, 'file_restore', `restauró la versión ${v.version} de “${file.name}”`, { file_id: file.id, version: n });
  return n;
}

export async function updateFileInfo(file: ProjectFile, patch: { name?: string; description?: string | null }): Promise<void> {
  const clean: Record<string, any> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new Error('El archivo necesita un nombre.');
    clean.name = n.slice(0, 200);
  }
  if (patch.description !== undefined) clean.description = patch.description?.trim() || null;
  const { error } = await supabase.from('project_files').update(clean).eq('id', file.id);
  if (error) throw error;
}

/** Borra el archivo con TODAS sus versiones (fila y bytes). */
export async function deleteProjectFile(file: ProjectFile): Promise<void> {
  let paths = [file.path];
  try { paths = paths.concat((await getFileVersions(file.id)).map((v) => v.path)); } catch { /* sin v15: solo la ruta actual */ }
  const { error } = await supabase.from('project_files').delete().eq('id', file.id);
  if (error) throw error;
  await removeObjects(paths);
  logActivity(file.project_id, 'file_deleted', `eliminó “${file.name}”`, { file_id: file.id });
}
