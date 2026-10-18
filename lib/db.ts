import { supabase, currentUserId, dedupe } from './supabase';
import { sm2, localISODate } from './srs';

// ---------- Tipos ----------
export type Subject = {
  id: string; name: string; color: string; icon: string; archived: boolean; credits: number | null;
  // schema_v18 (pueden faltar si la migración no se ha corrido)
  teacher?: string | null; room?: string | null; link?: string | null;
};
export type Task = {
  id: string; subject_id: string | null; title: string; description: string | null;
  due_date: string | null; status: 'pending' | 'done'; remind_days: number | null; type: string | null;
  // schema_v14 (pueden faltar si la migración no se ha corrido)
  due_at?: string | null; remind_at?: string | null; estimate_min?: number | null;
  completed_at?: string | null; deleted_at?: string | null; created_at?: string;
};
export type Note = {
  id: string; subject_id: string | null; title: string | null; content: string | null;
  image_path: string | null; ocr_status: string; created_at: string; summary: string | null;
  deleted_at?: string | null;
  // schema_v18
  pinned?: boolean; updated_at?: string | null;
};
export type Slot = { id: string; day: number; slot: number; subject_id: string };
// Microtarea (checklist dentro de una tarea)
export type Step = { id: string; assignment_id: string; title: string; done: boolean; position: number };
// Tipo de tarea propio del usuario
export type TaskTypeRow = { id: string; key: string; label: string; icon: string; color: string; position: number };
export type Grade = {
  id: string; subject_id: string; name: string; weight: number;
  score: number | null; max_score: number;
};
export type FocusSession = { id: string; subject_id: string | null; minutes: number; created_at: string; assignment_id?: string | null };
export type Flashcard = {
  id: string; note_id: string | null; subject_id: string | null;
  front: string; back: string; box: number; due_date: string;
  ease?: number; interval_days?: number; reps?: number; lapses?: number; last_reviewed_at?: string | null;
};

// ---------- Compatibilidad con schema_v14 ----------
// Si la base todavía no tiene las columnas nuevas, la app sigue funcionando
// como antes (sin hora, sin papelera...) en lugar de romperse.
const V14_COLS = ['due_at', 'remind_at', 'estimate_min', 'deleted_at', 'completed_at', 'assignment_id',
  'archived_at', 'ease', 'interval_days', 'reps', 'lapses', 'last_reviewed_at', 'reminded_at'];
let V14 = true;
export function hasV14(): boolean { return V14; }
export function isMissingColumn(err: any): boolean {
  if (!err) return false;
  const m = String(err.message ?? '');
  return err.code === '42703' || err.code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(m);
}
function stripV14<T extends Record<string, any>>(o: T): T {
  const c: Record<string, any> = { ...o };
  V14_COLS.forEach((k) => delete c[k]);
  return c as T;
}
/** Ejecuta con las columnas nuevas y, si faltan, repite sin ellas. */
async function v14<R extends { error: any }>(run: (on: boolean) => PromiseLike<R>): Promise<R> {
  if (!V14) return run(false);
  const r = await run(true);
  if (r.error && isMissingColumn(r.error)) { V14 = false; return run(false); }
  return r;
}

// ---------- Compatibilidad con schema_v18 (ficha de la materia, notas fijadas) ----------
let V18 = true;
export function hasV18(): boolean { return V18; }

async function uid(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error('No hay sesión activa');
  return id;
}

// ---------- Materias ----------
export async function getSubjects(): Promise<Subject[]> {
  return dedupe('subjects', async () => {
    const { data, error } = await supabase
      .from('subjects').select('*').eq('archived', false).order('created_at');
    if (error) throw error;
    return data as Subject[];
  });
}
export async function addSubject(name: string, color: string, icon: string, credits = 0,
  extra: { teacher?: string | null; room?: string | null; link?: string | null } = {}): Promise<void> {
  const base = { user_id: await uid(), name, color, icon, credits };
  const clean = Object.fromEntries(Object.entries(extra).filter(([, v]) => v));
  let { error } = await supabase.from('subjects').insert({ ...base, ...clean });
  if (error && isMissingColumn(error) && Object.keys(clean).length) {
    V18 = false;
    ({ error } = await supabase.from('subjects').insert(base));
  }
  if (error) throw error;
}
export type SubjectPatch = { name?: string; color?: string; icon?: string; credits?: number; teacher?: string | null; room?: string | null; link?: string | null };
const V18_SUBJECT = ['teacher', 'room', 'link'];
export async function updateSubject(id: string, patch: SubjectPatch): Promise<void> {
  const { error } = await supabase.from('subjects').update(patch).eq('id', id);
  if (error && isMissingColumn(error)) {
    V18 = false;
    const rest: Record<string, any> = { ...patch };
    V18_SUBJECT.forEach((k) => delete rest[k]);
    const had = Object.keys(patch).some((k) => V18_SUBJECT.includes(k) && (patch as any)[k]);
    if (Object.keys(rest).length) {
      const r = await supabase.from('subjects').update(rest).eq('id', id);
      if (r.error) throw r.error;
    }
    if (had) throw new Error('Para guardar profesor, salón y enlace falta correr schema_v18.sql en Supabase.');
    return;
  }
  if (error) throw error;
}
export { cleanLink } from './linkCheck';
// Archivar: la materia desaparece de las listas pero conserva sus tareas y
// notas; se puede restaurar desde la Papelera.
export async function deleteSubject(id: string): Promise<void> {
  const { error } = await v14((on) => supabase.from('subjects').update(on ? { archived: true, archived_at: new Date().toISOString() } : { archived: true }).eq('id', id));
  if (error) throw error;
}
export const archiveSubject = deleteSubject;
export async function restoreSubject(id: string): Promise<void> {
  const { error } = await v14((on) => supabase.from('subjects').update(on ? { archived: false, archived_at: null } : { archived: false }).eq('id', id));
  if (error) throw error;
}
export async function getArchivedSubjects(): Promise<(Subject & { archived_at?: string | null })[]> {
  const { data, error } = await supabase.from('subjects').select('*').eq('archived', true).order('created_at');
  if (error) throw error;
  return data as Subject[];
}

// ---------- Tareas ----------
export async function getTasks(subjectId?: string): Promise<Task[]> {
  return dedupe(`tasks:${subjectId ?? '*'}`, () => getTasksNow(subjectId));
}
async function getTasksNow(subjectId?: string): Promise<Task[]> {
  const { data, error } = await v14((on) => {
    let q = supabase.from('assignments').select('*');
    if (on) q = q.is('deleted_at', null);
    if (subjectId) q = q.eq('subject_id', subjectId);
    return q.order('due_date', { ascending: true, nullsFirst: false });
  });
  if (error) throw error;
  return data as Task[];
}
export type TaskInput = {
  title: string; subject_id: string | null; due_date: string | null; remind_days: number | null;
  description?: string | null; type?: string;
  due_at?: string | null; remind_at?: string | null; estimate_min?: number | null;
};
export async function addTask(t: TaskInput): Promise<string> {
  const u = await uid();
  const { data, error } = await v14((on) => supabase.from('assignments')
    .insert({ user_id: u, status: 'pending', ...(on ? t : stripV14(t)) })
    .select('id').single());
  if (error) throw error;
  return (data as { id: string }).id;
}
export async function toggleTask(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('assignments').update({ status: done ? 'done' : 'pending' }).eq('id', id);
  if (error) throw error;
}
/** A la papelera (se puede restaurar 30 días). Sin schema_v14 se borra de verdad. */
export async function deleteTask(id: string): Promise<void> {
  const { error } = await v14((on) => on
    ? supabase.from('assignments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    : supabase.from('assignments').delete().eq('id', id));
  if (error) throw error;
}
export async function restoreTask(id: string): Promise<void> {
  const { error } = await supabase.from('assignments').update({ deleted_at: null }).eq('id', id);
  if (error) throw error;
}
export async function purgeTask(id: string): Promise<void> {
  const { error } = await supabase.from('assignments').delete().eq('id', id);
  if (error) throw error;
}
export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<void> {
  const { error } = await v14((on) => supabase.from('assignments').update(on ? patch : stripV14(patch)).eq('id', id));
  if (error) throw error;
}
/** Mueve varias tareas de fecha conservando la hora. */
export async function moveTaskDate(t: Task, isoDate: string | null): Promise<void> {
  const patch: Partial<TaskInput> = { due_date: isoDate };
  if (t.due_at && isoDate) {
    const d = new Date(t.due_at);
    const [y, m, dd] = isoDate.split('-').map(Number);
    d.setFullYear(y, m - 1, dd);
    patch.due_at = d.toISOString();
  } else if (!isoDate) patch.due_at = null;
  await updateTask(t.id, patch);
}

// ---------- Microtareas ----------
export async function getSteps(assignmentId: string): Promise<Step[]> {
  const { data, error } = await supabase.from('assignment_steps').select('*')
    .eq('assignment_id', assignmentId).order('position');
  if (error) throw error;
  return data as Step[];
}
// Trae de una sola vez las microtareas de MUCHAS tareas (para la lista de "Hoy":
// una consulta en lugar de una por tarjeta) y las devuelve agrupadas.
export async function getStepsFor(assignmentIds: string[]): Promise<Record<string, Step[]>> {
  if (assignmentIds.length === 0) return {};
  const { data, error } = await supabase.from('assignment_steps').select('*')
    .in('assignment_id', assignmentIds).order('position');
  if (error) throw error;
  const out: Record<string, Step[]> = {};
  ((data as Step[]) ?? []).forEach((s) => { (out[s.assignment_id] ??= []).push(s); });
  return out;
}
export async function addStep(assignmentId: string, title: string, position: number): Promise<Step> {
  const { data, error } = await supabase.from('assignment_steps')
    .insert({ user_id: await uid(), assignment_id: assignmentId, title, position })
    .select('*').single();
  if (error) throw error;
  return data as Step;
}
export async function toggleStep(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('assignment_steps').update({ done }).eq('id', id);
  if (error) throw error;
}
export async function renameStep(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('assignment_steps').update({ title }).eq('id', id);
  if (error) throw error;
}
export async function deleteStep(id: string): Promise<void> {
  const { error } = await supabase.from('assignment_steps').delete().eq('id', id);
  if (error) throw error;
}
// Reescribe las posiciones tras arrastrar / mover una microtarea.
export async function reorderSteps(ordered: { id: string }[]): Promise<void> {
  await Promise.all(ordered.map((s, i) =>
    supabase.from('assignment_steps').update({ position: i }).eq('id', s.id)));
}

// ---------- Tipos de tarea propios ----------
export async function getTaskTypes(): Promise<TaskTypeRow[]> {
  return dedupe('task-types', async () => {
    const { data, error } = await supabase.from('task_types').select('*').order('position');
    if (error) throw error;
    return data as TaskTypeRow[];
  });
}
export async function upsertTaskType(t: { key: string; label: string; icon: string; color: string; position?: number }): Promise<void> {
  const { error } = await supabase.from('task_types')
    .upsert({ user_id: await uid(), position: 0, ...t }, { onConflict: 'user_id,key' });
  if (error) throw error;
}
export async function deleteTaskType(key: string): Promise<void> {
  const { error } = await supabase.from('task_types').delete().match({ user_id: await uid(), key });
  if (error) throw error;
}
// Cuántas tareas usan un tipo (para avisar antes de borrarlo).
export async function countTasksByType(key: string): Promise<number> {
  const { count, error } = await supabase.from('assignments')
    .select('id', { count: 'exact', head: true }).eq('type', key);
  if (error) throw error;
  return count ?? 0;
}
// Al borrar un tipo, sus tareas pasan a otro (por defecto 'tarea').
export async function retypeTasks(from: string, to = 'tarea'): Promise<void> {
  const { error } = await supabase.from('assignments')
    .update({ type: to }).match({ user_id: await uid(), type: from });
  if (error) throw error;
}

// ---------- Notas ----------
/** Solo id y materia de cada nota (para contar), sin el texto: mucho más liviano. */
export async function getNoteRefs(): Promise<{ id: string; subject_id: string | null }[]> {
  const { data, error } = await v14((on) => {
    let q = supabase.from('notes').select(on ? 'id, subject_id, deleted_at' : 'id, subject_id');
    if (on) q = q.is('deleted_at', null);
    return q;
  });
  if (error) throw error;
  return (data as any[]) ?? [];
}
export async function getNotes(subjectId?: string): Promise<Note[]> {
  const { data, error } = await v14((on) => {
    let q = supabase.from('notes').select('*');
    if (on) q = q.is('deleted_at', null);
    if (subjectId) q = q.eq('subject_id', subjectId);
    return q.order('created_at', { ascending: false });
  });
  if (error) throw error;
  return data as Note[];
}
export async function addNote(n: {
  subject_id: string | null; title: string; content: string; image_path: string | null;
}): Promise<string> {
  const { data, error } = await supabase.from('notes').insert({ user_id: await uid(), ocr_status: 'done', ...n }).select('id').single();
  if (error) throw error;
  return (data as any).id as string;
}
export async function getNote(id: string): Promise<Note | null> {
  const { data, error } = await supabase.from('notes').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Note;
}
export async function setNotePinned(id: string, pinned: boolean): Promise<void> {
  const { error } = await supabase.from('notes').update({ pinned }).eq('id', id);
  if (error && isMissingColumn(error)) { V18 = false; throw new Error('Para fijar notas falta correr schema_v18.sql en Supabase.'); }
  if (error) throw error;
}
export async function updateNote(id: string, patch: { title?: string; content?: string; summary?: string }): Promise<void> {
  const { error } = await supabase.from('notes').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteNote(id: string): Promise<void> {
  const { error } = await v14((on) => on
    ? supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    : supabase.from('notes').delete().eq('id', id));
  if (error) throw error;
}
export async function restoreNote(id: string): Promise<void> {
  const { error } = await supabase.from('notes').update({ deleted_at: null }).eq('id', id);
  if (error) throw error;
}
export async function purgeNote(id: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Papelera ----------
export async function getTrash(): Promise<{ tasks: Task[]; notes: Note[]; subjects: (Subject & { archived_at?: string | null })[] }> {
  if (!V14) return { tasks: [], notes: [], subjects: await getArchivedSubjects() };
  const [t, n, s] = await Promise.all([
    supabase.from('assignments').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    supabase.from('notes').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    getArchivedSubjects(),
  ]);
  if (t.error && isMissingColumn(t.error)) { V14 = false; return { tasks: [], notes: [], subjects: s }; }
  if (t.error) throw t.error;
  if (n.error) throw n.error;
  return { tasks: (t.data as Task[]) ?? [], notes: (n.data as Note[]) ?? [], subjects: s };
}

// ---------- Horario ----------
export async function getSchedule(): Promise<Slot[]> {
  return dedupe('schedule', async () => {
    const { data, error } = await supabase.from('schedule').select('*');
    if (error) throw error;
    return data as Slot[];
  });
}
export async function setSlot(day: number, slot: number, subjectId: string): Promise<void> {
  const { error } = await supabase
    .from('schedule')
    .upsert({ user_id: await uid(), day, slot, subject_id: subjectId }, { onConflict: 'user_id,day,slot' });
  if (error) throw error;
}
export async function clearSlot(day: number, slot: number): Promise<void> {
  const u = await uid();
  const { error } = await supabase.from('schedule').delete().match({ user_id: u, day, slot });
  if (error) throw error;
}

// Al cambiar las franjas horarias hay que reubicar las clases ya guardadas.
// `plan` dice, por cada fila: a qué franja se mueve, o null si su franja desapareció.
//
// Se hace en DOS pasos a propósito: primero se mandan las filas que se mueven a
// franjas temporales (1000 + destino) y luego a la definitiva. Si se hiciera en
// uno solo, mover la franja 2→1 mientras la 1 todavía existe rompería la
// restricción única (user_id, day, slot). Nunca se borra lo que no toca.
export async function remapSlots(plan: { id: string; newSlot: number | null }[]): Promise<void> {
  const removed = plan.filter((p) => p.newSlot === null);
  const moved = plan.filter((p) => p.newSlot !== null);
  if (removed.length) {
    const { error } = await supabase.from('schedule').delete().in('id', removed.map((r) => r.id));
    if (error) throw error;
  }
  if (!moved.length) return;
  for (const m of moved) {
    const { error } = await supabase.from('schedule').update({ slot: 1000 + (m.newSlot as number) }).eq('id', m.id);
    if (error) throw error;
  }
  for (const m of moved) {
    const { error } = await supabase.from('schedule').update({ slot: m.newSlot as number }).eq('id', m.id);
    if (error) throw error;
  }
}

// ---------- Subida de imagen + OCR ----------
// Sube la foto al bucket privado y devuelve su ruta.
import { decode } from 'base64-arraybuffer';
export async function uploadPhoto(base64: string): Promise<string> {
  const u = await uid();
  const path = `${u}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('notes').upload(path, decode(base64), {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

// Llama a la Edge Function "ocr" que usa un modelo de visión.
export async function runOCR(base64: string, mediaType = 'image/jpeg'): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ocr', {
    body: { imageBase64: base64, mediaType },
  });
  if (error) throw error;
  return (data as any)?.text ?? '';
}

// URL firmada (temporal) para mostrar la foto de una nota
export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('notes').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ---------- Adjuntos de nota (diagramas / imágenes) ----------
export type NoteImage = { id: string; note_id: string; path: string; created_at: string };
export async function getNoteImages(noteId: string): Promise<NoteImage[]> {
  const { data, error } = await supabase.from('note_images').select('*').eq('note_id', noteId).order('created_at');
  if (error) throw error;
  return data as NoteImage[];
}
export async function addNoteImage(noteId: string, base64: string): Promise<void> {
  const path = await uploadPhoto(base64);
  const { error } = await supabase.from('note_images').insert({ user_id: await uid(), note_id: noteId, path });
  if (error) throw error;
}
export async function deleteNoteImage(id: string, path: string): Promise<void> {
  try { await supabase.storage.from('notes').remove([path]); } catch { /* ignore */ }
  const { error } = await supabase.from('note_images').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Archivos por materia (materiales: PDFs, etc.) ----------
export type SubjectFile = { id: string; subject_id: string; name: string; path: string; mime: string | null; size: number | null; created_at: string };
export async function getSubjectFiles(subjectId: string): Promise<SubjectFile[]> {
  const { data, error } = await supabase.from('subject_files').select('*').eq('subject_id', subjectId).order('created_at', { ascending: false });
  if (error) throw error;
  return data as SubjectFile[];
}
export async function uploadSubjectFile(subjectId: string, file: { name: string; mime: string | null; size: number | null; body: Blob | ArrayBuffer | Uint8Array }): Promise<void> {
  const u = await uid();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${u}/files/${Date.now()}-${safe}`;
  const { error: upErr } = await supabase.storage.from('notes').upload(path, file.body as any, { contentType: file.mime ?? 'application/octet-stream', upsert: false });
  if (upErr) throw upErr;
  const { error } = await supabase.from('subject_files').insert({ user_id: u, subject_id: subjectId, name: file.name, path, mime: file.mime, size: file.size });
  if (error) throw error;
}
export async function deleteSubjectFile(id: string, path: string): Promise<void> {
  try { await supabase.storage.from('notes').remove([path]); } catch { /* ignore */ }
  const { error } = await supabase.from('subject_files').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Calificaciones ----------
export async function getGrades(subjectId: string): Promise<Grade[]> {
  const { data, error } = await supabase.from('grades').select('*').eq('subject_id', subjectId).order('created_at');
  if (error) throw error;
  return data as Grade[];
}
export async function addGrade(g: {
  subject_id: string; name: string; weight: number; score: number | null; max_score: number;
}): Promise<void> {
  const { error } = await supabase.from('grades').insert({ user_id: await uid(), ...g });
  if (error) throw error;
}
export async function updateGrade(id: string, patch: { name?: string; weight?: number; score?: number | null; max_score?: number }): Promise<void> {
  const { error } = await supabase.from('grades').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteGrade(id: string): Promise<void> {
  const { error } = await supabase.from('grades').delete().eq('id', id);
  if (error) throw error;
}
export async function getAllGrades(): Promise<Grade[]> {
  const { data, error } = await supabase.from('grades').select('*');
  if (error) throw error;
  return data as Grade[];
}
// Resumen de calificaciones: promedio ponderado (normalizado a la escala máxima) y
// cuánto necesitas en lo que falta para alcanzar la nota de aprobación.
export function gradeSummary(grades: Grade[], passMark: number) {
  const scale = grades[0]?.max_score ?? 5;
  const graded = grades.filter((g) => g.score != null && g.weight > 0);
  const doneWeight = graded.reduce((a, g) => a + g.weight, 0);
  // Promedio actual (sobre el peso ya calificado)
  const earned = graded.reduce((a, g) => a + (g.score! / g.max_score) * scale * (g.weight / 100), 0);
  const current = doneWeight > 0 ? earned / (doneWeight / 100) : 0;
  const remainingWeight = Math.max(0, 100 - doneWeight);
  // Nota necesaria en el peso restante para aprobar
  const needed = remainingWeight > 0 ? ((passMark - earned) / (remainingWeight / 100)) : null;
  return { scale, current, doneWeight, remainingWeight, earned, needed };
}

// ---------- Pomodoro ----------
export async function addFocusSession(minutes: number, subjectId: string | null, assignmentId: string | null = null, roomId: string | null = null): Promise<void> {
  const u = await uid();
  const row: Record<string, any> = { user_id: u, minutes, subject_id: subjectId, assignment_id: assignmentId };
  if (roomId) row.room_id = roomId;
  let { error } = await v14((on) => supabase.from('focus_sessions').insert(on ? row : stripV14(row)));
  // Sin schema_v19 no existe room_id: se guarda igual, sin sala.
  if (error && roomId && isMissingColumn(error)) {
    delete row.room_id;
    ({ error } = await v14((on) => supabase.from('focus_sessions').insert(on ? row : stripV14(row))));
  }
  if (error) throw error;
}
/** Minutos de enfoque acumulados por tarea. */
export async function getFocusByTask(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length || !V14) return {};
  const { data, error } = await supabase.from('focus_sessions').select('assignment_id, minutes').in('assignment_id', ids);
  if (error) { if (isMissingColumn(error)) V14 = false; return {}; }
  const out: Record<string, number> = {};
  ((data as { assignment_id: string; minutes: number }[]) ?? []).forEach((r) => { out[r.assignment_id] = (out[r.assignment_id] ?? 0) + r.minutes; });
  return out;
}
export async function getFocusStats(): Promise<{ todayMin: number; weekMin: number; bySubject: { subject_id: string | null; minutes: number }[] }> {
  const since = new Date(); since.setDate(since.getDate() - 7);
  const { data, error } = await supabase.from('focus_sessions').select('*').gte('created_at', since.toISOString());
  if (error) throw error;
  const rows = (data as FocusSession[]) ?? [];
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const todayMin = rows.filter((r) => new Date(r.created_at) >= startToday).reduce((a, r) => a + r.minutes, 0);
  const weekMin = rows.reduce((a, r) => a + r.minutes, 0);
  const map = new Map<string | null, number>();
  rows.forEach((r) => map.set(r.subject_id, (map.get(r.subject_id) ?? 0) + r.minutes));
  const bySubject = Array.from(map.entries()).map(([subject_id, minutes]) => ({ subject_id, minutes }));
  return { todayMin, weekMin, bySubject };
}

// Detalle de enfoque para el panel de escritorio: racha, minutos por día (7d) y sesiones recientes.
export async function getFocusDetail(): Promise<{
  todayMin: number; weekMin: number; streak: number;
  byDay: { label: string; min: number }[];
  recent: FocusSession[];
}> {
  const since = new Date(); since.setDate(since.getDate() - 30);
  const { data, error } = await supabase.from('focus_sessions').select('*')
    .gte('created_at', since.toISOString()).order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data as FocusSession[]) ?? [];
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const keyOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const minsByDay = new Map<number, number>();
  rows.forEach((r) => { const k = keyOf(new Date(r.created_at)); minsByDay.set(k, (minsByDay.get(k) ?? 0) + r.minutes); });

  const todayMin = minsByDay.get(startToday.getTime()) ?? 0;
  const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const byDay: { label: string; min: number }[] = [];
  let weekMin = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(startToday); d.setDate(d.getDate() - i);
    const m = minsByDay.get(d.getTime()) ?? 0;
    weekMin += m;
    byDay.push({ label: i === 0 ? 'Hoy' : names[d.getDay()], min: m });
  }
  // Racha: días consecutivos con enfoque, contando hacia atrás desde hoy (o ayer si hoy va en 0).
  let streak = 0; const d = new Date(startToday);
  if ((minsByDay.get(d.getTime()) ?? 0) === 0) d.setDate(d.getDate() - 1);
  while ((minsByDay.get(d.getTime()) ?? 0) > 0) { streak++; d.setDate(d.getDate() - 1); }

  return { todayMin, weekMin, streak, byDay, recent: rows.slice(0, 6) };
}

/** Lo que muestra la ficha de una materia: enfoque de los últimos 7 días y tarjetas para hoy. */
export async function getSubjectStudy(subjectId: string): Promise<{ weekMin: number; dueCards: number }> {
  const since = new Date(); since.setDate(since.getDate() - 7);
  const today = localISODate(new Date());
  const [f, c] = await Promise.all([
    supabase.from('focus_sessions').select('minutes').eq('subject_id', subjectId).gte('created_at', since.toISOString()),
    supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('subject_id', subjectId).lte('due_date', today),
  ]);
  const weekMin = ((f.data as { minutes: number }[] | null) ?? []).reduce((a, r) => a + (r.minutes ?? 0), 0);
  return { weekMin, dueCards: c.count ?? 0 };
}

// ---------- Flashcards (Leitner) ----------
export async function addFlashcards(cards: { front: string; back: string }[], noteId: string | null, subjectId: string | null): Promise<void> {
  const u = await uid();
  const rows = cards.map((c) => ({ user_id: u, note_id: noteId, subject_id: subjectId, front: c.front, back: c.back }));
  const { error } = await supabase.from('flashcards').insert(rows);
  if (error) throw error;
}
export async function getDueFlashcards(): Promise<Flashcard[]> {
  const today = localISODate(new Date());
  const { data, error } = await supabase.from('flashcards').select('*').lte('due_date', today).order('due_date');
  if (error) throw error;
  return data as Flashcard[];
}
export async function countDueFlashcards(): Promise<number> {
  return dedupe('flash-due', countDueNow);
}
async function countDueNow(): Promise<number> {
  const today = localISODate(new Date());
  const { count, error } = await supabase.from('flashcards').select('*', { count: 'exact', head: true }).lte('due_date', today);
  if (error) throw error;
  return count ?? 0;
}
/**
 * Repasa una tarjeta con SM-2 (lib/srs.ts). `grade`: 0 otra vez, 1 difícil,
 * 2 bien, 3 fácil. Sin schema_v14 se usa el sistema de cajas anterior.
 */
export async function reviewFlashcard(card: Flashcard, grade: 0 | 1 | 2 | 3): Promise<void> {
  const next = sm2(card, grade, new Date());
  const { error } = await v14((on) => supabase.from('flashcards').update(on ? next : { box: next.box, due_date: next.due_date }).eq('id', card.id));
  if (error) throw error;
}
export async function updateFlashcard(id: string, patch: { front?: string; back?: string; subject_id?: string | null }): Promise<void> {
  const { error } = await supabase.from('flashcards').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteFlashcard(id: string): Promise<void> {
  const { error } = await supabase.from('flashcards').delete().eq('id', id);
  if (error) throw error;
}
export async function getAllFlashcards(): Promise<Flashcard[]> {
  const { data, error } = await supabase.from('flashcards').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as Flashcard[];
}

// ---------- IA (usa la Edge Function "ai") ----------
export async function aiSummary(content: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai', { body: { task: 'summary', content } });
  if (error) throw error;
  return (data as any)?.summary ?? '';
}
export async function aiFlashcards(content: string): Promise<{ front: string; back: string }[]> {
  const { data, error } = await supabase.functions.invoke('ai', { body: { task: 'flashcards', content } });
  if (error) throw error;
  return (data as any)?.cards ?? [];
}

export async function aiSteps(title: string, description: string | null): Promise<string[]> {
  const content = `Título: ${title}${description ? `\nDescripción: ${description}` : ''}`;
  const { data, error } = await supabase.functions.invoke('ai', { body: { task: 'steps', content } });
  if (error) throw error;
  const steps = (data as any)?.steps;
  if (!Array.isArray(steps)) throw new Error('La función de IA no conoce la tarea "steps" (hay que volver a desplegarla).');
  return steps.map((s: unknown) => String(s));
}

// ---------- Búsqueda global ----------
export type ProjectTaskHit = { id: string; title: string; project_id: string; due_at: string | null; due_date: string | null; done: boolean };
export async function search(q: string): Promise<{ notes: Note[]; tasks: Task[]; subjects: Subject[]; flashcards: Flashcard[]; projectTasks: ProjectTaskHit[] }> {
  const term = `%${q.replace(/[%_]/g, '')}%`;
  const [byTitle, byContent, byTask, subs, cFront, cBack, pTasks] = await Promise.all([
    supabase.from('notes').select('*').ilike('title', term).limit(20),
    supabase.from('notes').select('*').ilike('content', term).limit(20),
    supabase.from('assignments').select('*').ilike('title', term).limit(20),
    supabase.from('subjects').select('*').eq('archived', false).ilike('name', term).limit(20),
    supabase.from('flashcards').select('*').ilike('front', term).limit(20),
    supabase.from('flashcards').select('*').ilike('back', term).limit(20),
    supabase.from('project_tasks').select('id, title, project_id, due_at, due_date, done').ilike('title', term).limit(20),
  ]);
  const live = <T extends { deleted_at?: string | null }>(xs: T[]) => xs.filter((x) => !x.deleted_at);
  const nMap = new Map<string, Note>();
  live([...((byTitle.data as Note[]) ?? []), ...((byContent.data as Note[]) ?? [])]).forEach((n) => nMap.set(n.id, n));
  const cMap = new Map<string, Flashcard>();
  [...((cFront.data as Flashcard[]) ?? []), ...((cBack.data as Flashcard[]) ?? [])].forEach((c) => cMap.set(c.id, c));
  return {
    notes: Array.from(nMap.values()),
    tasks: live((byTask.data as Task[]) ?? []),
    subjects: (subs.data as Subject[]) ?? [],
    flashcards: Array.from(cMap.values()),
    projectTasks: pTasks.error ? [] : ((pTasks.data as ProjectTaskHit[]) ?? []),
  };
}

// ---------- Oráculo (chat con IA sobre tus notas) ----------
export type OracleMsg = { id: string; role: 'user' | 'assistant'; content: string; scope: string | null; created_at: string };

export async function askOracle(params: {
  question: string; mode: 'all' | 'subject' | 'note'; subjectId?: string | null; noteId?: string | null;
  ability?: string | null; history?: { role: string; content: string }[];
  /** Mascota activa: el Oráculo responde con su tono (si la función está al día). */
  pet?: { name: string; species: string } | null;
}): Promise<{ answer: string; sources: { note_id: string; title: string }[]; usedSemantic: boolean }> {
  const { data, error } = await supabase.functions.invoke('oracle', { body: { action: 'ask', ...params } });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}
// Indexa una nota para búsqueda semántica (best-effort; no rompe si falla).
export async function indexNote(noteId: string, content: string, subjectId: string | null): Promise<void> {
  try { await supabase.functions.invoke('oracle', { body: { action: 'index', noteId, content, subjectId } }); }
  catch { /* silencioso */ }
}
export async function reindexNotes(): Promise<number> {
  const { data, error } = await supabase.functions.invoke('oracle', { body: { action: 'reindex' } });
  if (error) throw error;
  return (data as any)?.indexed ?? 0;
}
export async function getOracleMessages(): Promise<OracleMsg[]> {
  const { data, error } = await supabase.from('oracle_messages').select('*').order('created_at').limit(200);
  if (error) throw error;
  return data as OracleMsg[];
}
export async function saveOracleMessage(role: 'user' | 'assistant', content: string, scope: string): Promise<void> {
  const { error } = await supabase.from('oracle_messages').insert({ user_id: await uid(), role, content, scope });
  if (error) throw error;
}
export async function clearOracleMessages(): Promise<void> {
  const { error } = await supabase.from('oracle_messages').delete().eq('user_id', await uid());
  if (error) throw error;
}

// ---------- Personalización sincronizada entre dispositivos ----------
// Las preferencias se piden desde varios lados al abrir la app (tema, Hoy,
// avisos). Se recuerdan 10 s y se actualizan al guardar desde aquí.
let prefsMemo: { id: string; at: number; value: any } | null = null;
export async function fetchPrefs(): Promise<any | null> {
  const id = await currentUserId();
  if (!id) return null;
  if (prefsMemo && prefsMemo.id === id && Date.now() - prefsMemo.at < 10_000) return prefsMemo.value;
  return dedupe('prefs', async () => {
    const { data, error } = await supabase.from('user_prefs').select('settings').eq('user_id', id).maybeSingle();
    if (error) return null;
    const value = data?.settings ?? null;
    prefsMemo = { id, at: Date.now(), value };
    return value;
  });
}

// Guarda MEZCLANDO con lo que ya había: la personalización (tema, fuente…) y la
// configuración del horario viven en el mismo jsonb, así que si esto sobrescribiera
// el objeto completo, guardar una cosa borraría la otra.
export async function savePrefs(settings: any): Promise<void> {
  const id = await currentUserId();
  if (!id) return;
  const prev = (await fetchPrefs()) ?? {};
  const merged = { ...prev, ...settings };
  const { error } = await supabase.from('user_prefs')
    .upsert({ user_id: id, settings: merged, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) { prefsMemo = null; throw error; }
  prefsMemo = { id, at: Date.now(), value: merged };
}

// ---------- Fondo de pantalla propio (bucket público "wallpapers") ----------
// Devuelve la URL pública, que no expira: se puede guardar tal cual en las
// preferencias y sirve tras recargar la página o en otro dispositivo.
export async function uploadWallpaper(body: Blob | ArrayBuffer | Uint8Array, mime = 'image/jpeg'): Promise<string> {
  const u = await uid();
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const path = `${u}/fondo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('wallpapers')
    .upload(path, body as any, { contentType: mime, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('wallpapers').getPublicUrl(path);
  return data.publicUrl;
}
// Sube un fondo a partir de lo que devuelve el selector de imágenes: un data:
// URI (móvil, o web con base64) o una URL local blob:/file:.
export async function uploadWallpaperFromUri(uri: string, mimeHint?: string): Promise<string> {
  if (uri.startsWith('data:')) {
    const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(uri);
    const mime = mimeHint || (m?.[1] || 'image/jpeg');
    const payload = m?.[3] ?? '';
    if (m?.[2]) return uploadWallpaper(decode(payload), mime);
    return uploadWallpaper(new Blob([decodeURIComponent(payload)], { type: mime }), mime);
  }
  const res = await fetch(uri);
  const blob = await res.blob();
  return uploadWallpaper(blob, mimeHint || blob.type || 'image/jpeg');
}
// Borra los fondos anteriores del usuario para no dejar basura acumulada.
export async function cleanOldWallpapers(keepUrl: string | null): Promise<void> {
  try {
    const u = await uid();
    const { data } = await supabase.storage.from('wallpapers').list(u);
    const stale = (data ?? [])
      .map((f) => `${u}/${f.name}`)
      .filter((p) => !keepUrl || !keepUrl.includes(p));
    if (stale.length) await supabase.storage.from('wallpapers').remove(stale);
  } catch { /* no es crítico */ }
}


// ---------- Avisos (bandeja de la campana) ----------
export type AppNotification = {
  id: number; kind: string; title: string; body: string | null; url: string | null;
  created_at: string; read_at: string | null;
};
export async function getNotifications(limit = 40): Promise<AppNotification[]> {
  const { data, error } = await supabase.from('notification_queue')
    .select('id, kind, title, body, url, created_at, read_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) { if (/does not exist|schema cache|PGRST20/.test(String(error.message))) return []; throw error; }
  return data as AppNotification[];
}
export async function markNotificationsRead(ids?: number[]): Promise<void> {
  let q = supabase.from('notification_queue').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (ids?.length) q = q.in('id', ids);
  const { error } = await q;
  if (error && !/does not exist|schema cache/.test(String(error.message))) throw error;
}

// ---------- Notificaciones push ----------
export async function savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string; user_agent?: string }): Promise<void> {
  const { error } = await supabase.from('push_subscriptions')
    .upsert({ user_id: await uid(), ...sub }, { onConflict: 'endpoint' });
  if (error) throw error;
}
export async function deletePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
}

// ---------- Calendario (.ics) ----------
export async function getCalendarToken(regen = false): Promise<string> {
  const { data, error } = await supabase.rpc('my_calendar_token', { p_regen: regen });
  if (error) throw error;
  return String(data);
}

// ---------- Exportar todos mis datos (Ajustes) ----------
export async function exportMyData(): Promise<Record<string, unknown>> {
  const tables = ['subjects', 'assignments', 'assignment_steps', 'notes', 'grades', 'focus_sessions', 'flashcards', 'schedule', 'task_types', 'user_prefs'];
  const out: Record<string, unknown> = { exportado: new Date().toISOString(), app: 'Kaderno', version: 12 };
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*');
    out[t] = error ? { error: error.message } : data;
  }
  return out;
}
