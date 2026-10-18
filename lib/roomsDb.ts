// ============================================================
//  Enfocar juntos: lecturas y funciones de la base (schema_v19, fase 5).
//  Todo lo que crea o cambia salas pasa por funciones del servidor.
// ============================================================
import { supabase } from './supabase';
import type { RoomPerson } from './roomsLogic';

export type StudyRoom = { id: string; owner_id: string; project_id: string | null; name: string; code: string | null; goal: number; created_at: string };

export const ROOMS_MISSING = 'Para estudiar en salas falta correr schema_v19.sql en Supabase.';

function missing(err: any): boolean {
  if (!err) return false;
  const m = String(err.message ?? '');
  return ['42P01', '42883', 'PGRST202', 'PGRST205', '42703'].includes(err.code) || /does not exist|Could not find the (table|function)/i.test(m);
}
function fail(err: any): never {
  if (missing(err)) throw new Error(ROOMS_MISSING);
  throw new Error(String(err?.message ?? 'No se pudo completar'));
}

/** Mis salas (de amigos y de proyectos en las que entré), la más nueva primero. */
export async function listRooms(): Promise<StudyRoom[]> {
  const { data, error } = await supabase.from('study_rooms').select('id, owner_id, project_id, name, code, goal, created_at').order('created_at', { ascending: false });
  if (error) fail(error);
  return (data ?? []) as StudyRoom[];
}

export async function getRoom(id: string): Promise<StudyRoom | null> {
  const { data, error } = await supabase.from('study_rooms').select('id, owner_id, project_id, name, code, goal, created_at').eq('id', id).maybeSingle();
  if (error) fail(error);
  return (data as StudyRoom) ?? null;
}

async function rpc<T>(fn: string, args: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

export const createRoom = (name: string) => rpc<StudyRoom>('study_room_create', { p_name: name });
export const roomForProject = (projectId: string) => rpc<StudyRoom>('study_room_for_project', { p: projectId });
export const leaveRoom = (id: string) => rpc<void>('study_room_leave', { r: id });
export const updateRoom = (id: string, name: string | null, goal: number | null) => rpc<StudyRoom>('study_room_update', { r: id, p_name: name, p_goal: goal });
export const newRoomCode = (id: string) => rpc<StudyRoom>('study_room_new_code', { r: id });

/** Unirse con el código. Devuelve null si no existe ninguna sala con ese código. */
export async function joinRoom(code: string): Promise<StudyRoom | null> {
  const r = await rpc<StudyRoom | null>('study_room_join', { p_code: code });
  return r && r.id ? r : null;
}

export async function roomPeople(id: string): Promise<RoomPerson[]> {
  let tz = 'America/Bogota';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* noop */ }
  const rows = await rpc<any[]>('study_room_people', { r: id, tz });
  return (rows ?? []).map((r) => ({ user_id: r.user_id, name: r.name, avatar: r.avatar, is_owner: !!r.is_owner, pomodoros: r.pomodoros ?? 0, minutes: r.minutes ?? 0 }));
}
