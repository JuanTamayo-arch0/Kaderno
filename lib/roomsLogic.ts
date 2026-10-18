// ============================================================
//  Enfocar juntos: lógica pura de las salas (sin red ni React).
// ============================================================
import { ITEMS, SPECIES, type Outfit } from './pets/art';

export type RoomState = 'work' | 'break' | 'online' | 'away';

/** Lo que cada quien publica en el canal de la sala (presencia). */
export type PresenceInfo = {
  uid: string;
  name: string;
  pet: string | null;          // especie de la mascota activa
  outfit: Outfit | null;       // su ropa (para dibujarla en el patio)
  state: 'work' | 'break' | 'idle';
  endsAt: number | null;       // ms, si el reloj corre
  remainingMs: number | null;  // si está en pausa
  task: string | null;         // solo si la persona decide mostrarla
  at: number;
};

export type RoomPerson = { user_id: string; name: string; avatar?: string | null; is_owner?: boolean; pomodoros: number; minutes: number };

export type Proposal = { id: string; by: string; name: string; workMin: number; startAt: number };
export type Greeting = { id: string; from: string; fromName: string; to: string; at: number };

// ---------- Código de la sala ----------
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Lo que la persona escribió → código limpio (o null si no sirve). */
export function normalizeCode(input: string): string | null {
  const c = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE_RE.test(c) ? c : null;
}
export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}
export function joinLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/sala/unirse?codigo=${code}`;
}

// ---------- Estado de cada persona ----------
export function minutesLeft(p: Pick<PresenceInfo, 'endsAt' | 'remainingMs'>, now: number): number | null {
  const ms = p.endsAt ? p.endsAt - now : p.remainingMs;
  if (ms == null || ms <= 0) return null;
  return Math.max(1, Math.ceil(ms / 60000));
}

export function personState(p: PresenceInfo | undefined, now: number): { state: RoomState; label: string; detail: string } {
  if (!p) return { state: 'away', label: 'Fuera', detail: '' };
  const left = minutesLeft(p, now);
  if (p.state === 'work') return { state: 'work', label: 'Enfocado', detail: left ? `quedan ${left} min` : '' };
  if (p.state === 'break') return { state: 'break', label: 'Descanso', detail: left ? `vuelve en ${left} min` : '' };
  return { state: 'online', label: 'En la sala', detail: '' };
}

const ORDER: Record<RoomState, number> = { work: 0, break: 1, online: 2, away: 3 };

export type RoomRow = RoomPerson & { me: boolean; live: PresenceInfo | undefined; state: RoomState; label: string; detail: string };

/** Junta la lista de la sala con quién está conectado. Tú primero, luego enfocados, descanso, en la sala y fuera. */
export function mergePeople(people: RoomPerson[], online: Record<string, PresenceInfo>, me: string, now: number): RoomRow[] {
  const rows: RoomRow[] = people.map((p) => {
    const live = online[p.user_id];
    return { ...p, me: p.user_id === me, live, ...personState(live, now) };
  });
  // Alguien conectado que aún no aparece en la lista (se acaba de unir).
  Object.values(online).forEach((o) => {
    if (!rows.some((r) => r.user_id === o.uid)) rows.push({ user_id: o.uid, name: o.name, pomodoros: 0, minutes: 0, me: o.uid === me, live: o, ...personState(o, now) });
  });
  return rows.sort((a, b) => Number(b.me) - Number(a.me) || ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name, 'es'));
}

export function stateCounts(rows: RoomRow[]): string {
  const w = rows.filter((r) => r.state === 'work').length;
  const b = rows.filter((r) => r.state === 'break').length;
  const o = rows.filter((r) => r.state === 'online').length;
  const parts: string[] = [];
  if (w) parts.push(w === 1 ? '1 enfocado' : `${w} enfocados`);
  if (b) parts.push(b === 1 ? '1 en descanso' : `${b} en descanso`);
  if (o) parts.push(o === 1 ? '1 en la sala' : `${o} en la sala`);
  return parts.length ? parts.join(', ') : 'Nadie conectado ahora';
}

export function groupProgress(people: RoomPerson[], goal: number): { done: number; goal: number; frac: number; label: string; reached: boolean } {
  const done = people.reduce((s, p) => s + (p.pomodoros || 0), 0);
  const g = Math.max(1, goal || 8);
  return {
    done, goal: g, frac: Math.min(1, done / g), reached: done >= g,
    label: done >= g ? `¡Meta cumplida! ${done} pomodoros juntos hoy` : `Juntos hoy: ${done} de ${g} pomodoros`,
  };
}

// ---------- Empezar juntos ----------
export const PROPOSAL_LEAD_MS = 10_000; // los relojes arrancan 10 s después de proponer

export function makeProposal(by: string, name: string, workMin: number, now: number, rand = Math.random()): Proposal {
  return { id: `${now.toString(36)}${Math.floor(rand * 1e6).toString(36)}`, by, name, workMin: Math.min(180, Math.max(1, Math.round(workMin))), startAt: now + PROPOSAL_LEAD_MS };
}

/** Se puede unir mientras quede al menos 1 minuto del pomodoro propuesto. */
export function proposalOpen(p: Proposal | null, now: number): boolean {
  return !!p && now < p.startAt + p.workMin * 60000 - 60000;
}

/** Cuándo arranca (o si ya arrancó, cuánto queda): todos terminan a la misma hora. */
export function joinPlan(p: Proposal, now: number): { waitMs: number; endsAt: number; lateMin: number } {
  const endsAt = p.startAt + p.workMin * 60000;
  return { waitMs: Math.max(0, p.startAt - now), endsAt, lateMin: now > p.startAt ? Math.floor((now - p.startAt) / 60000) : 0 };
}

export function proposalText(p: Proposal, now: number): string {
  const wait = Math.ceil((p.startAt - now) / 1000);
  if (wait > 0) return `${p.name} propone un pomodoro de ${p.workMin} min. Empieza en ${wait} s.`;
  const left = Math.ceil((p.startAt + p.workMin * 60000 - now) / 60000);
  return `${p.name} empezó un pomodoro de ${p.workMin} min. Quedan ${left} min.`;
}

/** Valida lo que llega por el canal (nunca confiar en el otro lado). */
export function parseProposal(x: any, now: number): Proposal | null {
  if (!x || typeof x !== 'object') return null;
  const { id, by, name, workMin, startAt } = x;
  if (typeof id !== 'string' || typeof by !== 'string' || typeof name !== 'string') return null;
  if (typeof workMin !== 'number' || workMin < 1 || workMin > 180) return null;
  // La hora de inicio debe ser razonable (relojes desfasados hasta 2 min).
  if (typeof startAt !== 'number' || startAt > now + 2 * 60000 || startAt < now - workMin * 60000) return null;
  return { id: id.slice(0, 40), by: by.slice(0, 40), name: name.slice(0, 40), workMin: Math.round(workMin), startAt };
}

export function parsePresence(x: any): PresenceInfo | null {
  if (!x || typeof x !== 'object' || typeof x.uid !== 'string') return null;
  const st = x.state === 'work' || x.state === 'break' ? x.state : 'idle';
  const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null);
  return {
    uid: x.uid.slice(0, 40), name: typeof x.name === 'string' ? x.name.slice(0, 40) : 'Alguien',
    pet: typeof x.pet === 'string' && x.pet in SPECIES ? x.pet : null, outfit: cleanOutfit(x.outfit), state: st,
    endsAt: num(x.endsAt), remainingMs: num(x.remainingMs), task: typeof x.task === 'string' ? x.task.slice(0, 80) : null, at: num(x.at) ?? 0,
  };
}

/** Solo ropa que existe y en su lugar (lo que llega por el canal no es de fiar). */
export function cleanOutfit(o: any): Outfit | null {
  if (!o || typeof o !== 'object') return null;
  const out: Outfit = {};
  (['cabeza', 'ojos', 'cuello'] as const).forEach((slot) => {
    const id = o[slot];
    if (typeof id === 'string' && id in ITEMS && (ITEMS as any)[id].slot === slot) out[slot] = id as any;
  });
  return Object.keys(out).length ? out : null;
}

export function parseGreeting(x: any, now: number): Greeting | null {
  if (!x || typeof x !== 'object') return null;
  const { id, from, fromName, to, at } = x;
  if ([id, from, fromName, to].some((v) => typeof v !== 'string') || typeof at !== 'number') return null;
  if (Math.abs(now - at) > 2 * 60000) return null;
  return { id: id.slice(0, 40), from: from.slice(0, 40), fromName: fromName.slice(0, 40), to: to.slice(0, 40), at };
}

/** Lo que publico según mi reloj. La tarea solo si lo permito. */
export function myPresence(
  me: { uid: string; name: string; pet: string | null; outfit?: Outfit | null },
  f: { running: boolean; mode: 'work' | 'break'; endsAt: number | null; remainingMs: number; taskTitle: string | null; startedPomodoro: boolean },
  shareTask: boolean, now: number,
): PresenceInfo {
  const active = f.running || f.startedPomodoro;
  const state = !active ? 'idle' : f.mode;
  return {
    uid: me.uid, name: me.name, pet: me.pet, outfit: me.outfit ?? null, state,
    endsAt: f.running ? f.endsAt : null, remainingMs: !f.running && active ? f.remainingMs : null,
    task: shareTask && state === 'work' ? f.taskTitle : null, at: now,
  };
}
