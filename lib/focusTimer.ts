// ============================================================
//  Temporizador Pomodoro global.
//
//  Antes vivía dentro de la pantalla Enfoque y restaba 1 segundo con
//  setInterval: en una pestaña de fondo el navegador frena los intervalos y
//  en el celular se detienen al bloquear, así que el reloj se atrasaba.
//
//  Ahora guarda la HORA DE FIN y calcula lo que falta contra el reloj real,
//  sigue corriendo aunque se cambie de pantalla (Hoy, Estudiar y la barra
//  lateral lo muestran), sobrevive a recargar la página y avisa al terminar.
// ============================================================
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addFocusSession } from './db';
import { streakChanged } from './uiBus';
import { pickTip, dayKey, addParked, removeParked as dropParked, type Parked } from './breakTips';

export type FocusMode = 'work' | 'break';
export type FocusState = {
  mode: FocusMode;
  running: boolean;
  endsAt: number | null;      // ms epoch cuando corre
  remainingMs: number;        // cuando está en pausa
  workMin: number;
  breakMin: number;
  longBreakMin: number;
  subjectId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  cycle: number;              // pomodoros completados en la tanda (0..3)
  sound: boolean;
  // v20: pausas guiadas y "Anotar para después"
  tipId: string | null;       // sugerencia del descanso actual
  tipsDay: string;            // día de `tipsUsed`
  tipsUsed: string[];         // sugerencias ya mostradas hoy
  parked: Parked[];           // lo anotado para después (queda hasta que lo resuelvas)
  distractions: number;       // anotaciones en el pomodoro en curso
  last: { minutes: number; distractions: number; at: number; n: number } | null; // resumen del último pomodoro
  doneToday: { day: string; n: number }; // pomodoros completos hoy (para "Pomodoro 3 terminado")
  // v20: Enfocar juntos
  roomId: string | null;      // sala activa: los pomodoros cuentan para su meta
  startsAt: number | null;    // "Empezar juntos": hora a la que arranca el reloj
};

const KEY = 'kaderno.focus';
const DEFAULT: FocusState = {
  mode: 'work', running: false, endsAt: null, remainingMs: 25 * 60000,
  workMin: 25, breakMin: 5, longBreakMin: 15, subjectId: null, taskId: null, taskTitle: null, cycle: 0, sound: true,
  tipId: null, tipsDay: '', tipsUsed: [], parked: [], distractions: 0, last: null, doneToday: { day: '', n: 0 },
  roomId: null, startsAt: null,
};

let state: FocusState = { ...DEFAULT };
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
let loaded = false;
let onComplete: ((mode: FocusMode, s: FocusState) => void) | null = null;

function save() {
  const raw = JSON.stringify(state);
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.setItem(KEY, raw);
    else AsyncStorage.setItem(KEY, raw).catch(() => {});
  } catch { /* noop */ }
}
function emit() { listeners.forEach((l) => l()); }
function set(patch: Partial<FocusState>) { state = { ...state, ...patch }; save(); emit(); syncTicker(); }

export function loadFocus(): void {
  if (loaded) return;
  loaded = true;
  const apply = (raw: string | null) => {
    if (!raw) return;
    try { state = { ...DEFAULT, ...JSON.parse(raw) }; } catch { /* noop */ }
    // Si terminó mientras la app estaba cerrada, se cierra el ciclo.
    if (state.running && state.endsAt && state.endsAt <= Date.now()) finish(true);
    // Un "Empezar juntos" que quedó programado antes de recargar.
    if (!state.running && state.startsAt) {
      if (state.startsAt > Date.now()) { const at = state.startsAt; scheduled = setTimeout(() => startFocusAt(at, state.workMin), at - Date.now()); }
      else { const ok = state.startsAt + state.workMin * 60000 - Date.now() > 60000; const at = state.startsAt; state = { ...state, startsAt: null }; if (ok) startFocusAt(at, state.workMin); }
    }
    emit(); syncTicker();
  };
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') apply(localStorage.getItem(KEY));
  else AsyncStorage.getItem(KEY).then(apply).catch(() => {});
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }
}

/** Para escuchar cambios fuera de React (la mascota). */
export function subscribeFocus(fn: (s: FocusState) => void): () => void {
  loadFocus();
  const l = () => fn(state);
  listeners.add(l); fn(state);
  return () => { listeners.delete(l); };
}

/** Lo llama el layout para sonar / notificar al terminar. */
export function setFocusCompleteHandler(fn: typeof onComplete) { onComplete = fn; }

export function getFocus(): FocusState { return state; }
export function remainingMs(s: FocusState = state): number {
  return s.running && s.endsAt ? Math.max(0, s.endsAt - Date.now()) : s.remainingMs;
}
export function totalMs(s: FocusState = state): number {
  const min = s.mode === 'work' ? s.workMin : (s.cycle === 0 ? s.longBreakMin : s.breakMin);
  return Math.max(1, min) * 60000;
}

function syncTicker() {
  if (state.running && !ticker) ticker = setInterval(tick, 500);
  if (!state.running && ticker) { clearInterval(ticker); ticker = null; }
}
function tick() {
  if (state.running && state.endsAt && state.endsAt <= Date.now()) finish(false);
  else emit();
}

function finish(silent: boolean, skipped = false) {
  const done = state.mode;
  if (done === 'work') {
    const s = state;
    // Saltar a mitad de un pomodoro guarda solo lo que se alcanzó a hacer
    // (antes guardaba el pomodoro completo y regalaba minutos y monedas).
    const minutes = skipped ? Math.floor((totalMs(s) - remainingMs(s)) / 60000) : Math.max(1, s.workMin);
    if (minutes >= 1) addFocusSession(minutes, s.subjectId, s.taskId, s.roomId).then(() => streakChanged(300)).catch(() => {});
    const cycle = (s.cycle + 1) % 4;
    const brk = cycle === 0 ? s.longBreakMin : s.breakMin;
    // Sugerencia para el descanso, sin repetir las de hoy.
    const today = dayKey();
    const used = s.tipsDay === today ? s.tipsUsed : [];
    const tip = pickTip(cycle === 0, used);
    const n = (s.doneToday?.day === today ? s.doneToday.n : 0) + (minutes >= 1 ? 1 : 0);
    state = {
      ...state, mode: 'break', cycle, running: true, endsAt: Date.now() + Math.max(1, brk) * 60000, remainingMs: Math.max(1, brk) * 60000,
      tipId: tip.id, tipsDay: today, tipsUsed: tip.used,
      last: { minutes, distractions: s.distractions, at: Date.now(), n }, distractions: 0, doneToday: { day: today, n },
    };
  } else {
    state = { ...state, mode: 'work', running: false, endsAt: null, remainingMs: Math.max(1, state.workMin) * 60000, tipId: null };
  }
  save(); emit(); syncTicker();
  if (!silent) onComplete?.(done, state);
}

export function startFocus(opts: Partial<Pick<FocusState, 'subjectId' | 'taskId' | 'taskTitle'>> = {}) {
  loadFocus();
  const rem = state.remainingMs > 0 ? state.remainingMs : totalMs();
  cancelScheduled();
  set({ ...opts, running: true, endsAt: Date.now() + rem, startsAt: null });
}
export function pauseFocus() { cancelScheduled(); set({ running: false, remainingMs: remainingMs(), endsAt: null, startsAt: null }); }
export function resetFocus() { cancelScheduled(); set({ running: false, endsAt: null, mode: 'work', remainingMs: Math.max(1, state.workMin) * 60000, distractions: 0, tipId: null, startsAt: null }); }
export function skipFocus() { finish(true, true); }
export function configureFocus(patch: Partial<Pick<FocusState, 'workMin' | 'breakMin' | 'longBreakMin' | 'subjectId' | 'taskId' | 'taskTitle' | 'sound'>>) {
  const next = { ...state, ...patch };
  if (!state.running && (patch.workMin != null || patch.breakMin != null)) {
    next.remainingMs = Math.max(1, next.mode === 'work' ? next.workMin : next.breakMin) * 60000;
  }
  state = next; save(); emit();
}

// ---------- Enfocar juntos ----------
let scheduled: ReturnType<typeof setTimeout> | null = null;
function cancelScheduled() { if (scheduled) { clearTimeout(scheduled); scheduled = null; } }

/** La sala activa (los pomodoros que termines cuentan para ella). */
export function setFocusRoom(roomId: string | null) { loadFocus(); if (state.roomId !== roomId) set({ roomId }); }

/**
 * "Empezar juntos": arranca un pomodoro de `workMin` a la hora `startAt`, de modo
 * que todos terminen a la vez. Si ya pasó la hora, arranca con lo que queda.
 * Si queda menos de un minuto no hace nada y devuelve false.
 */
export function startFocusAt(startAt: number, workMin: number): boolean {
  loadFocus();
  cancelScheduled();
  const total = Math.max(1, workMin) * 60000;
  const endsAt = startAt + total;
  if (endsAt - Date.now() < 60000) return false;
  const go = () => {
    scheduled = null;
    set({ mode: 'work', workMin, running: true, endsAt, remainingMs: Math.max(0, endsAt - Date.now()), startsAt: null, distractions: 0, tipId: null });
  };
  const wait = startAt - Date.now();
  if (wait > 0) {
    set({ mode: 'work', workMin, running: false, endsAt: null, remainingMs: total, startsAt: startAt, tipId: null });
    scheduled = setTimeout(go, wait);
  } else go();
  return true;
}

/** "Otra idea": cambia la sugerencia del descanso por otra que no haya salido hoy. */
export function nextTip() {
  if (state.mode !== 'break') return;
  const today = dayKey();
  const used = state.tipsDay === today ? state.tipsUsed : [];
  const tip = pickTip(state.cycle === 0, used, Math.random(), state.tipId);
  set({ tipId: tip.id, tipsDay: today, tipsUsed: tip.used });
}

/** Anotar para después: guarda la idea y cuenta una distracción del pomodoro en curso. */
export function parkThought(text: string) {
  loadFocus();
  const next = addParked(state.parked ?? [], text);
  if (next === state.parked) return;
  set({ parked: next, distractions: state.mode === 'work' && (state.running || state.remainingMs < totalMs()) ? state.distractions + 1 : state.distractions });
}
export function removeParked(id: string) { set({ parked: dropParked(state.parked ?? [], id) }); }
export function clearParked() { set({ parked: [] }); }

/** Hook: se repinta cada medio segundo mientras corre. */
export function useFocusTimer() {
  const [, force] = useState(0);
  useEffect(() => {
    loadFocus();
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const rem = remainingMs();
  const total = totalMs();
  return { state, remaining: rem, total, frac: Math.min(1, rem / total), label: fmtClock(rem) };
}

export function fmtClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Pitido corto con WebAudio (web). */
export function beep() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = i === 2 ? 880 : 660; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch { /* noop */ }
}
