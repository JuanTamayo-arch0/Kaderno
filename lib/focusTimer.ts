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
};

const KEY = 'kaderno.focus';
const DEFAULT: FocusState = {
  mode: 'work', running: false, endsAt: null, remainingMs: 25 * 60000,
  workMin: 25, breakMin: 5, longBreakMin: 15, subjectId: null, taskId: null, taskTitle: null, cycle: 0, sound: true,
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
    emit(); syncTicker();
  };
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') apply(localStorage.getItem(KEY));
  else AsyncStorage.getItem(KEY).then(apply).catch(() => {});
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }
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

function finish(silent: boolean) {
  const done = state.mode;
  if (done === 'work') {
    const s = state;
    addFocusSession(Math.max(1, s.workMin), s.subjectId, s.taskId).catch(() => {});
    const cycle = (s.cycle + 1) % 4;
    const brk = cycle === 0 ? s.longBreakMin : s.breakMin;
    state = { ...state, mode: 'break', cycle, running: true, endsAt: Date.now() + Math.max(1, brk) * 60000, remainingMs: Math.max(1, brk) * 60000 };
  } else {
    state = { ...state, mode: 'work', running: false, endsAt: null, remainingMs: Math.max(1, state.workMin) * 60000 };
  }
  save(); emit(); syncTicker();
  if (!silent) onComplete?.(done, state);
}

export function startFocus(opts: Partial<Pick<FocusState, 'subjectId' | 'taskId' | 'taskTitle'>> = {}) {
  loadFocus();
  const rem = state.remainingMs > 0 ? state.remainingMs : totalMs();
  set({ ...opts, running: true, endsAt: Date.now() + rem });
}
export function pauseFocus() { set({ running: false, remainingMs: remainingMs(), endsAt: null }); }
export function resetFocus() { set({ running: false, endsAt: null, mode: 'work', remainingMs: Math.max(1, state.workMin) * 60000 }); }
export function skipFocus() { finish(true); }
export function configureFocus(patch: Partial<Pick<FocusState, 'workMin' | 'breakMin' | 'longBreakMin' | 'subjectId' | 'taskId' | 'taskTitle' | 'sound'>>) {
  const next = { ...state, ...patch };
  if (!state.running && (patch.workMin != null || patch.breakMin != null)) {
    next.remainingMs = Math.max(1, next.mode === 'work' ? next.workMin : next.breakMin) * 60000;
  }
  state = next; save(); emit();
}

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
