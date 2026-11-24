// ============================================================
//  Cronómetro libre (v25, fase 2): iniciar y parar en cualquier tarea,
//  sin pomodoro. Uno a la vez; sigue corriendo entre pantallas y si se
//  cierra la app (se guarda en el dispositivo). Al parar se anota en el
//  registro de horas (focus_sessions, source 'timer').
// ============================================================
import { useEffect, useState } from 'react';
import { t } from './i18n';

export type Stopwatch = {
  startedAt: number; title: string;
  projectId?: string | null; projectTaskId?: string | null; subjectId?: string | null; assignmentId?: string | null;
  snoozedUntil?: number | null;
};
const KEY = 'kd-stopwatch';
export const FORGOT_MS = 3 * 3_600_000;
export const MAX_MIN = 720;

let current: Stopwatch | null = null;
try { const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; if (raw) current = JSON.parse(raw); } catch { current = null; }
const listeners = new Set<(s: Stopwatch | null) => void>();
function publish(s: Stopwatch | null) {
  current = s;
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* noop */ }
  listeners.forEach((f) => f(s));
}

export const getStopwatch = () => current;
/** Empieza (si había otro corriendo, primero lo para y lo guarda). */
export async function startStopwatch(o: Omit<Stopwatch, 'startedAt' | 'snoozedUntil'>, now = Date.now()): Promise<{ saved: number | null }> {
  let saved: number | null = null;
  if (current) saved = (await stopStopwatch()).minutes;
  publish({ ...o, title: o.title.trim().slice(0, 140) || t('Trabajo'), startedAt: now, snoozedUntil: null });
  return { saved };
}
/** Para y guarda. `minutes` permite corregir la duración (cronómetro olvidado). */
export async function stopStopwatch(minutes?: number, now = Date.now()): Promise<{ minutes: number; saved: boolean }> {
  const s = current;
  if (!s) return { minutes: 0, saved: false };
  const m = Math.min(MAX_MIN, Math.max(0, Math.round(minutes ?? elapsedMin(s, now))));
  publish(null);
  if (m < 1) return { minutes: 0, saved: false };
  const { addTimerSession } = await import('./hoursDb');
  try { await addTimerSession({ minutes: m, project_id: s.projectId ?? null, project_task_id: s.projectTaskId ?? null, subject_id: s.subjectId ?? null, assignment_id: s.assignmentId ?? null, note: s.title }); }
  catch (e) { publish(s); throw e; } // si no se pudo guardar, sigue corriendo para no perder el tiempo
  return { minutes: m, saved: true };
}
export function discardStopwatch() { publish(null); }
export function snoozeForgotten(ms = FORGOT_MS, now = Date.now()) { if (current) publish({ ...current, snoozedUntil: now + ms }); }

export const elapsedMs = (s: Stopwatch, now = Date.now()) => Math.max(0, now - s.startedAt);
export const elapsedMin = (s: Stopwatch, now = Date.now()) => elapsedMs(s, now) / 60_000;
/** "0:05:09", "1:23:45". */
export function clock(ms: number): string {
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
/** ¿Lleva tanto tiempo que quizá se olvidó? */
export function isForgotten(s: Stopwatch | null, now = Date.now()): boolean {
  return !!s && elapsedMs(s, now) >= FORGOT_MS && !(s.snoozedUntil && s.snoozedUntil > now);
}

/** Hook: el cronómetro y su tiempo, actualizado cada segundo mientras corre. */
export function useStopwatch(): { sw: Stopwatch | null; ms: number } {
  const [sw, setSw] = useState<Stopwatch | null>(current);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { listeners.add(setSw); return () => { listeners.delete(setSw); }; }, []);
  useEffect(() => {
    if (!sw) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sw?.startedAt]);
  return { sw, ms: sw ? elapsedMs(sw, now) : 0 };
}
