// ============================================================
//  Enfocar juntos: conexión en tiempo real con la sala activa.
//
//  Usa un canal privado de Supabase Realtime "sala:<id>" (solo los
//  miembros pueden entrar: lo controlan las políticas de schema_v19):
//   · Presencia: cada quien publica su estado (Enfocado, Descanso, En la
//     sala) y cuánto le queda. No se escribe nada en la base cada segundo.
//   · "Empezar juntos": quien propone envía la hora de inicio; los que se
//     unen arrancan su reloj para terminar todos a la vez.
//
//  La sala activa sigue conectada mientras la app esté abierta, aunque
//  cambies de pantalla, y los pomodoros que termines cuentan para su meta.
// ============================================================
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { realtimeClient } from './realtimeLazy';
import { subscribeFocus, getFocus, startFocusAt, setFocusRoom, totalMs, remainingMs, type FocusState } from './focusTimer';
import { activePet, subscribePets } from './pets/store';
import type { Outfit, Species } from './pets/art';
import { toast } from './feedback';
import { unlockAmbient } from './ambient';
import {
  type PresenceInfo, type Proposal, type Greeting, makeProposal, parseProposal, parsePresence, myPresence, proposalOpen, parseGreeting, cleanOutfit,
} from './roomsLogic';

export type LiveRoom = {
  room: { id: string; name: string } | null;
  status: 'off' | 'connecting' | 'on' | 'error';
  error: string | null;
  online: Record<string, PresenceInfo>;
  proposal: Proposal | null;
  joinedProposal: string | null;
  shareTask: boolean;
  me: string | null;
  greetings: Greeting[];   // saludos recientes de la sala (los últimos 10)
};

const KEY = 'kd:sala';
const SHARE_KEY = 'kd:sala:tarea';
const web = Platform.OS === 'web' && typeof window !== 'undefined';

const live: LiveRoom = { room: null, status: 'off', error: null, online: {}, proposal: null, joinedProposal: null, shareTask: false, me: null, greetings: [] };
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

let channel: RealtimeChannel | null = null;
let me: { uid: string; name: string; pet: string | null; outfit: Outfit | null } | null = null;
let petsUnsub: (() => void) | null = null;
let focusUnsub: (() => void) | null = null;
let lastSent = '';
let started = false;
let gen = 0;
let viewing: string | null = null; // sala que se está mirando (ahí no hace falta el aviso)

/** La pantalla de la sala avisa cuándo está a la vista. */
export function setViewingRoom(id: string | null) { viewing = id; }

function store(k: string, v: string | null) {
  if (!web) return;
  try { if (v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch { /* noop */ }
}
function read(k: string): string | null {
  if (!web) return null;
  try { return window.localStorage.getItem(k); } catch { return null; }
}

export function getLiveRoom(): LiveRoom { return live; }
export function subscribeLiveRoom(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useLiveRoom(): LiveRoom {
  const [, force] = useState(0);
  useEffect(() => subscribeLiveRoom(() => force((n) => n + 1)), []);
  return live;
}

/** Al abrir la app: vuelve a la sala en la que estabas. */
export function initRooms(): void {
  if (started) return;
  started = true;
  live.shareTask = read(SHARE_KEY) === '1';
  const raw = read(KEY);
  if (!raw) return;
  try {
    const r = JSON.parse(raw);
    if (r && typeof r.id === 'string' && typeof r.name === 'string') { live.room = { id: r.id, name: r.name }; setFocusRoom(r.id); void connect(); }
  } catch { /* noop */ }
}

/** Entrar a una sala (queda como sala activa). */
export async function enterRoom(room: { id: string; name: string }): Promise<void> {
  if (live.room?.id === room.id && (live.status === 'on' || live.status === 'connecting')) {
    if (live.room.name !== room.name) { live.room = { ...room }; store(KEY, JSON.stringify(live.room)); emit(); }
    return;
  }
  await disconnect();
  live.room = { id: room.id, name: room.name };
  live.proposal = null; live.joinedProposal = null;
  store(KEY, JSON.stringify(live.room));
  setFocusRoom(room.id);
  emit();
  await connect();
}

/** Dejar de estar en la sala ahora (no te saca de la lista de miembros). */
export async function exitRoom(): Promise<void> {
  await disconnect();
  live.room = null; live.proposal = null; live.joinedProposal = null;
  store(KEY, null);
  setFocusRoom(null);
  emit();
}

async function disconnect() {
  gen++;
  focusUnsub?.(); focusUnsub = null;
  petsUnsub?.(); petsUnsub = null;
  const ch = channel; channel = null;
  lastSent = '';
  live.online = {}; live.status = 'off'; live.error = null;
  if (ch) { try { await ch.untrack(); } catch { /* */ } try { (await realtimeClient()).removeChannel(ch); } catch { /* */ } }
}

async function connect() {
  try { await connectInner(); } catch (e: any) {
    console.warn('Sala:', e?.message ?? e);
    live.status = 'error'; live.error = 'No se pudo conectar a la sala.'; emit();
  }
}

async function connectInner() {
  const room = live.room;
  if (!room) return;
  const my = ++gen;
  live.status = 'connecting'; live.error = null; emit();
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (my !== gen) return;
  if (!user) { live.status = 'off'; emit(); return; }
  const full = String(user.user_metadata?.full_name ?? '').trim();
  me = { uid: user.id, name: (full || String(user.email ?? '').split('@')[0] || 'Alguien').slice(0, 40), pet: activePet()?.species ?? null, outfit: cleanOutfit(activePet()?.outfit) };
  live.me = user.id;

  const rt = await realtimeClient();
  if (my !== gen) return;
  const ch = rt.channel(`sala:${room.id}`, { config: { private: true, presence: { key: user.id }, broadcast: { self: false } } });
  channel = ch;
  ch.on('presence', { event: 'sync' }, () => {
    if (my !== gen) return;
    const st = ch.presenceState() as Record<string, any[]>;
    const online: Record<string, PresenceInfo> = {};
    Object.values(st).forEach((metas) => {
      const best = [...(metas ?? [])].map(parsePresence).filter(Boolean).sort((a, b) => (b!.at - a!.at))[0];
      if (best) online[best.uid] = best;
    });
    live.online = online;
    rememberPets(room.id, online);
    emit();
  });
  ch.on('broadcast', { event: 'propose' }, ({ payload }) => { if (my === gen) onProposal(parseProposal(payload, Date.now())); });
  ch.on('broadcast', { event: 'saludo' }, ({ payload }) => { if (my === gen) onGreeting(parseGreeting(payload, Date.now())); });
  ch.subscribe((status, err) => {
    if (my !== gen) return;
    if (status === 'SUBSCRIBED') { live.status = 'on'; live.error = null; lastSent = ''; void track(true); }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      live.status = 'error';
      live.error = /unauthori|denied|permission/i.test(String(err?.message ?? '')) ? 'No tienes acceso a esta sala.' : 'No se pudo conectar a la sala. Reintentando...';
    } else if (status === 'CLOSED') live.status = 'off';
    emit();
  });
  focusUnsub = subscribeFocus((f) => { void track(false); flushGreetings(f); });
  // Si cambias de mascota o de ropa, los demás lo ven.
  petsUnsub?.();
  petsUnsub = subscribePets(() => {
    if (!me) return;
    const p = activePet();
    me = { ...me, pet: p?.species ?? null, outfit: cleanOutfit(p?.outfit) };
    void track(false);
  });
}

function presenceNow(f: FocusState = getFocus()): PresenceInfo | null {
  if (!me) return null;
  const startedPomodoro = !f.running && remainingMs(f) < totalMs(f);
  return myPresence(me, { running: f.running, mode: f.mode, endsAt: f.endsAt, remainingMs: remainingMs(f), taskTitle: f.taskTitle, startedPomodoro }, live.shareTask, Date.now());
}

/** Publica mi estado solo cuando cambia algo que los demás ven. */
async function track(force: boolean) {
  if (!channel || live.status !== 'on') return;
  const p = presenceNow();
  if (!p) return;
  const sig = `${p.state}|${p.endsAt ? Math.round(p.endsAt / 5000) : ''}|${p.remainingMs ? Math.round(p.remainingMs / 60000) : ''}|${p.task ?? ''}|${p.pet ?? ''}|${JSON.stringify(p.outfit ?? {})}`;
  if (!force && sig === lastSent) return;
  lastSent = sig;
  try { await channel.track(p); } catch { /* se reintenta en el próximo cambio */ }
}

export function setShareTask(v: boolean) {
  live.shareTask = v;
  store(SHARE_KEY, v ? '1' : '0');
  emit();
  void track(true);
}

// ---------- Empezar juntos ----------
function onProposal(p: Proposal | null) {
  if (!p || !me || p.by === me.uid) return;
  live.proposal = p;
  emit();
  const now = Date.now();
  if (!proposalOpen(p, now)) return;
  if (viewing === live.room?.id) return; // la pantalla de la sala ya lo muestra con su botón
  const f = getFocus();
  const busy = f.running && f.mode === 'work';
  toast(`${p.name} propone empezar juntos un pomodoro de ${p.workMin} min${busy ? ' (reinicia tu reloj)' : ''}.`, {
    actionLabel: 'Me uno', onAction: () => { acceptProposal(p); }, duration: Math.max(9000, Math.min(60000, p.startAt - now + 20000)),
  });
}

/** Unirse a la propuesta: el reloj arranca para terminar a la misma hora que los demás. */
export function acceptProposal(p: Proposal | null = live.proposal): boolean {
  if (!p) return false;
  unlockAmbient(); // es un toque: deja listo el sonido de fondo
  const ok = startFocusAt(p.startAt, p.workMin);
  if (ok) { live.joinedProposal = p.id; emit(); }
  else toast('Ese pomodoro ya casi termina. Propón uno nuevo.', { tone: 'plain' });
  return ok;
}

/** Proponer un pomodoro con mi duración. Arranca en 10 s para todos. */
export async function proposeTogether(): Promise<boolean> {
  if (!channel || live.status !== 'on' || !me) { toast('Todavía no hay conexión con la sala.', { tone: 'plain' }); return false; }
  const p = makeProposal(me.uid, me.name, getFocus().workMin, Date.now());
  const res = await channel.send({ type: 'broadcast', event: 'propose', payload: p });
  if (res !== 'ok') { toast('No se pudo enviar la propuesta. Intenta de nuevo.', { tone: 'bad' }); return false; }
  live.proposal = p;
  acceptProposal(p);
  return true;
}

// ---------- Mascotas vistas (para dibujar dormidas a quien está fuera) ----------
export type SeenPet = { species: Species; outfit: Outfit | null; name: string };
function seenKey(roomId: string) { return `kd:sala:mascotas:${roomId}`; }
export function petsSeen(roomId: string): Record<string, SeenPet> {
  try { return JSON.parse(read(seenKey(roomId)) ?? '{}') ?? {}; } catch { return {}; }
}
function rememberPets(roomId: string, online: Record<string, PresenceInfo>) {
  const prev = petsSeen(roomId);
  let changed = false;
  Object.values(online).forEach((o) => {
    if (!o.pet) return;
    const next: SeenPet = { species: o.pet as Species, outfit: o.outfit, name: o.name };
    if (JSON.stringify(prev[o.uid]) !== JSON.stringify(next)) { prev[o.uid] = next; changed = true; }
  });
  if (changed) store(seenKey(roomId), JSON.stringify(prev));
}

// ---------- Saludos entre mascotas ----------
const sentAt = new Map<string, number>();   // a quién saludé y cuándo
const gotAt = new Map<string, number>();    // quién me saludó y cuándo
let pending: Greeting[] = [];               // los que llegaron mientras me enfocaba

function pushGreeting(g: Greeting) {
  if (live.greetings.some((x) => x.id === g.id)) return;
  live.greetings = [...live.greetings, g].slice(-10);
  emit();
}

/** Saludar a alguien de la sala (su mascota y la mía saltan en el patio). Máximo uno cada 10 s por persona. */
export async function sendGreeting(to: string): Promise<boolean> {
  if (!channel || live.status !== 'on' || !me || to === me.uid) return false;
  const now = Date.now();
  if (now - (sentAt.get(to) ?? 0) < 10_000) return false;
  sentAt.set(to, now);
  const g: Greeting = { id: `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, from: me.uid, fromName: me.name, to, at: now };
  pushGreeting(g);
  const res = await channel.send({ type: 'broadcast', event: 'saludo', payload: g });
  return res === 'ok';
}

function onGreeting(g: Greeting | null) {
  if (!g || !me || g.from === me.uid) return;
  const now = Date.now();
  if (now - (gotAt.get(g.from) ?? 0) < 5_000) return; // nadie llena la sala de saludos
  gotAt.set(g.from, now);
  pushGreeting(g);
  if (g.to !== me.uid || viewing === live.room?.id) return; // el patio ya lo muestra
  const f = getFocus();
  if (f.running && f.mode === 'work') { pending.push(g); return; } // no interrumpir el enfoque
  toast(`${g.fromName} te saludó desde ${live.room?.name ?? 'la sala'}.`);
}

/** Al terminar el enfoque, los saludos que llegaron mientras tanto. */
function flushGreetings(f: FocusState) {
  if (!pending.length || (f.running && f.mode === 'work')) return;
  const names = [...new Set(pending.map((g) => g.fromName))];
  pending = [];
  toast(names.length === 1 ? `${names[0]} te saludó mientras te enfocabas.` : `Te saludaron mientras te enfocabas: ${names.join(', ')}.`);
}

// ---------- Para las mascotas sueltas ----------
let memberIds: string[] = [];
/** La pantalla de la sala dice quiénes son miembros (para mostrar dormidas a las de quien está fuera). */
export function setRoomMembers(ids: string[]) {
  if (ids.join(',') === memberIds.join(',')) return;
  memberIds = ids; emit();
}
export function roomMembers(): string[] { return memberIds; }

type RoomFx = { type: 'celebrar'; big: boolean };
const fxLs = new Set<(fx: RoomFx) => void>();
export function onRoomFx(fn: (fx: RoomFx) => void): () => void { fxLs.add(fn); return () => { fxLs.delete(fn); }; }
export function roomFx(fx: RoomFx) { fxLs.forEach((f) => { try { f(fx); } catch { /* noop */ } }); }
