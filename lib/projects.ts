import { supabase, currentUserId, dedupe } from './supabase';

// ============================================================
//  Capa de datos de PROYECTOS (esquema v12).
//
//  Dos cosas que conviene tener presentes al leer este archivo:
//
//  1. Los perfiles NO se traen con "embed" de PostgREST. Se piden aparte con
//     un `in('id', ids)`. Es una consulta más, pero no depende del nombre
//     exacto de la clave foránea (project_tasks_assignee_id_fkey y compañía),
//     que es justo lo que se rompe en silencio si mañana se recrea una tabla.
//
//  2. Nadie se mete solo a un proyecto: `project_members` no tiene política de
//     INSERT. La única puerta es la función join_project(codigo) del servidor.
// ============================================================

// ---------- Tipos ----------

// Una columna del tablero. Vive dentro de projects.board_columns (jsonb), no en
// su propia tabla: renombrar o reordenar el tablero es UNA escritura.
export type BoardColumn = {
  key: string;
  label: string;
  color: string;
  done?: boolean;    // la(s) columna(s) que cuentan como "terminado"
};

export type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_emoji: string;
};

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export type Project = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  subject_id: string | null;
  color: string;
  icon: string;
  join_code: string | null;
  board_columns: BoardColumn[];
  archived: boolean;
  created_at: string;
};

export type Member = {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: string;
  profile?: Profile | null;
};

export type PTask = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  assignee_id: string | null;
  due_date: string | null;
  // Fecha y hora (schema_v13). Pueden no venir si esa migración no se ha corrido.
  start_at?: string | null;
  due_at?: string | null;
  position: number;
  done: boolean;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type PStep = {
  id: string;
  project_id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
};

export type Activity = {
  id: string;
  project_id: string;
  actor_id: string | null;
  kind: string;
  summary: string;
  meta: Record<string, any>;
  created_at: string;
};

async function uid(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error('No hay sesión activa');
  return id;
}

// ---------- Columnas por defecto y plantillas ----------

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { key: 'todo',   label: 'Por hacer',   color: '#9aa3b2' },
  { key: 'doing',  label: 'En curso',    color: '#6c8cff' },
  { key: 'review', label: 'En revisión', color: '#f5b64c' },
  { key: 'done',   label: 'Hecho',       color: '#37c98b', done: true },
];

// Las plantillas viven aquí, en el cliente, y NO en una tabla. Una plantilla es
// un puñado de columnas y unas tarjetas de arranque; ponerlas en la base
// obligaría a una migración cada vez que se quiera cambiar una palabra.
export type Template = {
  key: string;
  label: string;
  icon: string;
  hint: string;
  columns: BoardColumn[];
  tasks: string[];
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
];

// Normaliza lo que venga de la base: si alguien dejó el tablero vacío o con
// basura, se cae a las columnas por defecto en lugar de pintar una pantalla en
// blanco sin explicación.
export function columnsOf(p: Pick<Project, 'board_columns'> | null | undefined): BoardColumn[] {
  const raw = p?.board_columns;
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_COLUMNS;
  const clean = raw.filter((c: any) => c && typeof c.key === 'string' && c.key.length > 0);
  return clean.length ? (clean as BoardColumn[]) : DEFAULT_COLUMNS;
}

// ---------- Perfil propio ----------

// Se llama después de iniciar sesión. El disparador de auth.users cubre las
// cuentas nuevas y hay un relleno para las viejas, pero esto lo deja garantizado
// antes de que la fila de projects.owner_id -> profiles.id lo necesite.
export async function ensureMyProfile(): Promise<void> {
  try { await supabase.rpc('ensure_my_profile'); } catch { /* no es crítico */ }
}

export async function updateMyProfile(patch: { display_name?: string; avatar_emoji?: string }): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', await uid());
  if (error) throw error;
}

async function profilesByIds(ids: string[]): Promise<Record<string, Profile>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return {};
  const { data, error } = await supabase.from('profiles')
    .select('id, display_name, email, avatar_emoji').in('id', uniq);
  if (error) throw error;
  const out: Record<string, Profile> = {};
  ((data as Profile[]) ?? []).forEach((p) => { out[p.id] = p; });
  return out;
}

// Nombre corto para mostrar: el que puso la persona, o lo que va antes de la
// arroba del correo, o "Alguien" si el perfil aún no cargó.
export function nameOf(p: Profile | null | undefined): string {
  if (!p) return 'Alguien';
  const n = (p.display_name ?? '').trim();
  if (n) return n;
  const mail = (p.email ?? '').trim();
  if (mail) return mail.split('@')[0];
  return 'Alguien';
}

export function initialsOf(p: Profile | null | undefined): string {
  const n = nameOf(p);
  const parts = n.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

// Color estable por persona, derivado del id: la misma persona sale siempre del
// mismo color en todos los dispositivos, sin guardar nada.
const AVATAR_COLORS = ['#6c8cff', '#37c98b', '#f5b64c', '#ff7b9c', '#b98cff', '#38bdf8', '#f97362'];
export function colorOf(userId: string | null | undefined): string {
  if (!userId) return '#9aa3b2';
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ---------- Proyectos ----------

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('*')
    .eq('archived', false).order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Project[]) ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Project) ?? null;
}

export async function createProject(p: {
  name: string;
  description?: string | null;
  subject_id?: string | null;
  color?: string;
  icon?: string;
  template?: string;
}): Promise<string> {
  await ensureMyProfile();
  const tpl = TEMPLATES.find((t) => t.key === p.template) ?? TEMPLATES[0];
  const { data, error } = await supabase.from('projects').insert({
    owner_id: await uid(),
    name: p.name,
    description: p.description ?? null,
    subject_id: p.subject_id ?? null,
    color: p.color ?? '#6c8cff',
    icon: p.icon ?? '📦',
    board_columns: tpl.columns,
  }).select('id').single();
  if (error) throw error;
  const id = (data as { id: string }).id;

  // Tarjetas de arranque de la plantilla, todas en la primera columna.
  if (tpl.tasks.length) {
    const first = tpl.columns[0]?.key ?? 'todo';
    const rows = tpl.tasks.map((title, i) => ({
      project_id: id, title, status: first, position: (i + 1) * 1000,
    }));
    const { error: e2 } = await supabase.from('project_tasks').insert(rows);
    if (e2) throw e2;
  }
  return id;
}

export async function updateProject(id: string, patch: {
  name?: string; description?: string | null; subject_id?: string | null;
  color?: string; icon?: string; archived?: boolean;
}): Promise<void> {
  const { error } = await supabase.from('projects').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

// Cambiar las columnas y, acto seguido, recalcular qué tareas quedan "hechas":
// si se marca otra columna como final, las tarjetas que ya estaban ahí tienen
// que pasar a hechas (y al revés). Eso lo hace resync_project_done en el servidor.
export async function setBoardColumns(id: string, columns: BoardColumn[]): Promise<void> {
  const { error } = await supabase.from('projects').update({ board_columns: columns }).eq('id', id);
  if (error) throw error;
  const { error: e2 } = await supabase.rpc('resync_project_done', { p: id });
  if (e2) throw e2;
}

// ---------- Entrar con código ----------

// Mirar el proyecto ANTES de entrar, para poder confirmar "¿es este?".
export async function peekProject(code: string): Promise<{ id: string; name: string; icon: string; color: string; members: number } | null> {
  const { data, error } = await supabase.rpc('peek_project', { code: code.trim().toUpperCase() });
  if (error) throw error;
  const rows = (data as any[]) ?? [];
  return rows.length ? rows[0] : null;
}

export async function joinProject(code: string): Promise<string> {
  await ensureMyProfile();
  const { data, error } = await supabase.rpc('join_project', { code: code.trim().toUpperCase() });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''));
  return data as string;
}

export async function regenJoinCode(projectId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regen_join_code', { p: projectId });
  if (error) throw error;
  return data as string;
}

// ---------- Integrantes ----------

export async function getMembers(projectId: string): Promise<Member[]> {
  const { data, error } = await supabase.from('project_members').select('*')
    .eq('project_id', projectId).order('created_at');
  if (error) throw error;
  const rows = (data as Member[]) ?? [];
  const profs = await profilesByIds(rows.map((m) => m.user_id));
  return rows.map((m) => ({ ...m, profile: profs[m.user_id] ?? null }));
}

export async function setMemberRole(memberId: string, role: 'editor' | 'viewer'): Promise<void> {
  const { error } = await supabase.from('project_members').update({ role }).eq('id', memberId);
  if (error) throw error;
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('project_members').delete().eq('id', memberId);
  if (error) throw error;
}

export async function leaveProject(projectId: string): Promise<void> {
  const { error } = await supabase.from('project_members').delete()
    .match({ project_id: projectId, user_id: await uid() });
  if (error) throw error;
}

// Mi papel en el proyecto, para decidir qué se puede tocar en la pantalla.
export function myRole(members: Member[], myId: string | null): ProjectRole | null {
  if (!myId) return null;
  return members.find((m) => m.user_id === myId)?.role ?? null;
}
export function canEdit(role: ProjectRole | null): boolean {
  return role === 'owner' || role === 'editor';
}

// ---------- Tareas del proyecto ----------

export async function getProjectTasks(projectId: string): Promise<PTask[]> {
  const { data, error } = await supabase.from('project_tasks').select('*')
    .eq('project_id', projectId).order('position');
  if (error) throw error;
  return (data as PTask[]) ?? [];
}

// Si la base todavía no tiene la columna due_at (falta schema_v13), PostgREST
// responde que no la encuentra: en ese caso se reintenta sin ella para que crear
// y editar tareas nunca se rompa por la hora.
function missingDueAt(error: { message?: string; code?: string } | null): boolean {
  return !!error && /due_at/.test(error.message ?? '') && /column|schema cache/i.test(error.message ?? '');
}
function withoutDueAt<T extends { due_at?: string | null }>(o: T): Omit<T, 'due_at'> {
  const { due_at: _omit, ...rest } = o;
  return rest;
}

export async function addProjectTask(t: {
  project_id: string; title: string; status: string;
  description?: string | null; assignee_id?: string | null; due_date?: string | null;
  due_at?: string | null; position?: number;
}): Promise<PTask> {
  const row: Record<string, any> = {
    project_id: t.project_id,
    title: t.title,
    status: t.status,
    description: t.description ?? null,
    assignee_id: t.assignee_id ?? null,
    due_date: t.due_date ?? null,
    position: t.position ?? Date.now() % 1e9,
    created_by: await uid(),
  };
  if (t.due_at !== undefined) row.due_at = t.due_at;
  let { data, error } = await supabase.from('project_tasks').insert(row).select('*').single();
  if (missingDueAt(error)) ({ data, error } = await supabase.from('project_tasks').insert(withoutDueAt(row)).select('*').single());
  if (error) throw error;
  return data as PTask;
}

export async function updateProjectTask(id: string, patch: {
  title?: string; description?: string | null; status?: string;
  assignee_id?: string | null; due_date?: string | null; due_at?: string | null; position?: number;
}): Promise<void> {
  let { error } = await supabase.from('project_tasks').update(patch).eq('id', id);
  if (missingDueAt(error)) ({ error } = await supabase.from('project_tasks').update(withoutDueAt(patch)).eq('id', id));
  if (error) throw error;
}

export async function deleteProjectTask(id: string): Promise<void> {
  const { error } = await supabase.from('project_tasks').delete().eq('id', id);
  if (error) throw error;
}

// Posición para soltar una tarjeta ENTRE otras dos. Al ser un número decimal,
// meter algo en medio es un promedio y no hay que renumerar la columna entera.
// Si los vecinos quedan pegadísimos (pasa tras muchísimos arrastres seguidos)
// se devuelve null y quien llama renumera esa columna.
export function positionBetween(before: number | null, after: number | null): number | null {
  if (before == null && after == null) return 1000;
  if (before == null) return (after as number) - 1000;
  if (after == null) return before + 1000;
  if (Math.abs(after - before) < 1e-6) return null;
  return (before + after) / 2;
}

// Renumera de mil en mil las tarjetas de una columna. Se usa solo cuando
// positionBetween se queda sin espacio.
export async function renumberColumn(tasks: PTask[]): Promise<void> {
  await Promise.all(tasks.map((t, i) =>
    supabase.from('project_tasks').update({ position: (i + 1) * 1000 }).eq('id', t.id)));
}

// Mover una tarjeta a otra columna / otro lugar. Devuelve la posición aplicada.
export async function moveTask(
  taskId: string,
  status: string,
  columnTasks: PTask[],
  index: number,
): Promise<void> {
  const others = columnTasks.filter((t) => t.id !== taskId);
  const before = index > 0 ? others[index - 1]?.position ?? null : null;
  const after = others[index]?.position ?? null;
  let pos = positionBetween(before, after);
  if (pos == null) {
    await renumberColumn(others);
    pos = (index + 1) * 1000 - 500;
  }
  await updateProjectTask(taskId, { status, position: pos });
}

// ---------- Microtareas de una tarea de proyecto ----------

export async function getProjectSteps(projectId: string): Promise<Record<string, PStep[]>> {
  const { data, error } = await supabase.from('project_task_steps').select('*')
    .eq('project_id', projectId).order('position');
  if (error) throw error;
  const out: Record<string, PStep[]> = {};
  ((data as PStep[]) ?? []).forEach((s) => { (out[s.task_id] ??= []).push(s); });
  return out;
}

export async function addProjectStep(projectId: string, taskId: string, title: string, position: number): Promise<PStep> {
  const { data, error } = await supabase.from('project_task_steps')
    .insert({ project_id: projectId, task_id: taskId, title, position })
    .select('*').single();
  if (error) throw error;
  return data as PStep;
}

export async function toggleProjectStep(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('project_task_steps').update({ done }).eq('id', id);
  if (error) throw error;
}

export async function renameProjectStep(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('project_task_steps').update({ title }).eq('id', id);
  if (error) throw error;
}

export async function deleteProjectStep(id: string): Promise<void> {
  const { error } = await supabase.from('project_task_steps').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Bitácora ----------

export async function getActivity(projectId: string, limit = 30): Promise<(Activity & { profile?: Profile | null })[]> {
  const { data, error } = await supabase.from('project_activity').select('*')
    .eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const rows = (data as Activity[]) ?? [];
  const profs = await profilesByIds(rows.map((a) => a.actor_id ?? '').filter(Boolean));
  return rows.map((a) => ({ ...a, profile: a.actor_id ? profs[a.actor_id] ?? null : null }));
}

// Deja constancia de algo. Nunca rompe la acción principal: si la bitácora
// falla, la tarea igual se movió, y es peor mostrar un error por eso.
export async function logActivity(projectId: string, kind: string, summary: string, meta: Record<string, any> = {}): Promise<void> {
  try {
    await supabase.from('project_activity')
      .insert({ project_id: projectId, actor_id: await uid(), kind, summary, meta });
  } catch { /* silencioso a propósito */ }
}

// ---------- Panel de carga por integrante ----------

export type Load = {
  user_id: string;
  profile: Profile | null;
  total: number;
  done: number;
  pending: number;
  late: number;
  soon: number;       // vence en los próximos 3 días
  percent: number;    // 0..100 de lo suyo que ya terminó
  share: number;      // 0..100 del trabajo pendiente del grupo que lleva encima
};

// Reparto del trabajo. Es una función pura para poder mirarla sin base de datos
// y para que la pantalla la recalcule sin pedir nada al servidor.
export function workload(tasks: PTask[], members: Member[]): { loads: Load[]; unassigned: number; balanced: boolean } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const soonLimit = new Date(today); soonLimit.setDate(soonLimit.getDate() + 3);

  const pendingTotal = tasks.filter((t) => !t.done && t.assignee_id).length;

  const loads: Load[] = members.map((m) => {
    const mine = tasks.filter((t) => t.assignee_id === m.user_id);
    const done = mine.filter((t) => t.done).length;
    const pending = mine.length - done;
    let late = 0, soon = 0;
    mine.filter((t) => !t.done && t.due_date).forEach((t) => {
      const d = new Date(t.due_date as string); d.setHours(0, 0, 0, 0);
      if (d < today) late++;
      else if (d <= soonLimit) soon++;
    });
    return {
      user_id: m.user_id,
      profile: m.profile ?? null,
      total: mine.length,
      done,
      pending,
      late,
      soon,
      percent: mine.length ? Math.round((done / mine.length) * 100) : 0,
      share: pendingTotal ? Math.round((pending / pendingTotal) * 100) : 0,
    };
  }).sort((a, b) => b.pending - a.pending || b.total - a.total);

  const unassigned = tasks.filter((t) => !t.done && !t.assignee_id).length;

  // "Repartido" = a nadie le toca más del doble que a quien menos tiene.
  const pend = loads.map((l) => l.pending);
  const max = Math.max(0, ...pend), min = Math.min(...(pend.length ? pend : [0]));
  const balanced = loads.length < 2 || max - min <= 1 || max <= min * 2;

  return { loads, unassigned, balanced };
}

// ---------- Lo mío, para la pantalla de "Hoy" ----------

export type MyProjectTask = PTask & { project: Pick<Project, 'id' | 'name' | 'color' | 'icon'> | null };

// Tareas de cualquier proyecto asignadas a mí y sin terminar. Se usa en "Hoy"
// para que el trabajo en grupo no viva en una pestaña aparte que nadie abre.
export async function getMyProjectTasks(): Promise<MyProjectTask[]> {
  return dedupe('my-ptasks', getMyProjectTasksNow);
}
async function getMyProjectTasksNow(): Promise<MyProjectTask[]> {
  const me = await uid();
  // Una sola ida y vuelta: el proyecto viene incrustado (FK estándar project_tasks.project_id).
  const embedded = await supabase.from('project_tasks').select('*, project:projects(id, name, color, icon)')
    .eq('assignee_id', me).eq('done', false);
  if (!embedded.error) return ((embedded.data as any[]) ?? []).map((t) => ({ ...t, project: t.project ?? null }));
  // Respaldo (si el incrustado falla por algún cambio en la base): dos consultas.
  const { data, error } = await supabase.from('project_tasks').select('*')
    .eq('assignee_id', me).eq('done', false);
  if (error) throw error;
  const rows = (data as PTask[]) ?? [];
  if (!rows.length) return [];

  const ids = Array.from(new Set(rows.map((t) => t.project_id)));
  const { data: ps, error: e2 } = await supabase.from('projects')
    .select('id, name, color, icon').in('id', ids);
  if (e2) throw e2;
  const byId: Record<string, any> = {};
  ((ps as any[]) ?? []).forEach((p) => { byId[p.id] = p; });

  return rows.map((t) => ({ ...t, project: byId[t.project_id] ?? null }));
}

// ---------- Resumen para la lista de proyectos ----------

export type Overview = {
  project: Project;
  total: number;
  done: number;
  mine: number;        // pendientes asignadas a mí
  members: Member[];
};

// Todo lo que la lista necesita en TRES consultas, no en tres por tarjeta.
export async function getProjectsOverview(): Promise<Overview[]> {
  const me = await uid();
  // Proyectos, tareas e integrantes a la vez: RLS ya limita a los proyectos donde
  // estoy, así que no hace falta esperar la lista de ids (una ida y vuelta menos).
  const [projects, tasksRes, membersRes] = await Promise.all([
    getProjects(),
    supabase.from('project_tasks').select('id, project_id, done, assignee_id'),
    supabase.from('project_members').select('*').order('created_at'),
  ]);
  if (!projects.length) return [];
  if (tasksRes.error) throw tasksRes.error;
  if (membersRes.error) throw membersRes.error;
  const ids = new Set(projects.map((p) => p.id));

  const tasks = ((tasksRes.data as any[]) ?? []).filter((t) => ids.has(t.project_id));
  const members = ((membersRes.data as Member[]) ?? []).filter((m) => ids.has(m.project_id));
  const profs = await profilesByIds(members.map((m) => m.user_id));

  return projects.map((project) => {
    const mt = tasks.filter((t) => t.project_id === project.id);
    return {
      project,
      total: mt.length,
      done: mt.filter((t) => t.done).length,
      mine: mt.filter((t) => !t.done && t.assignee_id === me).length,
      members: members.filter((m) => m.project_id === project.id)
        .map((m) => ({ ...m, profile: profs[m.user_id] ?? null })),
    };
  });
}

// Cuántos proyectos tengo, para el contador del menú.
export async function countProjects(): Promise<number> {
  const { count, error } = await supabase.from('projects')
    .select('id', { count: 'exact', head: true }).eq('archived', false);
  if (error) throw error;
  return count ?? 0;
}
