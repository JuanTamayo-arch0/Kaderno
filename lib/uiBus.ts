// ============================================================
//  Paneles globales que se abren desde cualquier pantalla:
//  la hoja "Agregar" (botón +), el formulario de tarea, la paleta de
//  comandos (Ctrl K) y la bandeja de avisos.
//  Los dibuja <GlobalPanels/> en app/_layout.tsx.
// ============================================================
import type { Task } from './db';

export type TaskDraft = {
  title?: string; subjectId?: string | null; typeKey?: string | null;
  dueDate?: string | null; dueTime?: string | null;
};
export type Panels = {
  add: boolean;
  addText: string;            // texto inicial de "Agregar" (p. ej. desde "Anotar para después")
  task: { open: boolean; edit: Task | null; draft: TaskDraft | null };
  command: boolean;
  inbox: boolean;
  /** Hoja "Plan de repaso" de un examen (v20, sección G). */
  examPlan: Task | null;
  examReview: Task | null;
};
let panels: Panels = { add: false, addText: '', task: { open: false, edit: null, draft: null }, command: false, inbox: false, examPlan: null, examReview: null };
const ls = new Set<(p: Panels) => void>();
const savedLs = new Set<() => void>();

function emit() { ls.forEach((l) => l(panels)); }
export function subscribePanels(fn: (p: Panels) => void) { ls.add(fn); fn(panels); return () => { ls.delete(fn); }; }

// Se usa como onPress={openAdd}: el evento del toque no es texto, se ignora.
export function openAdd(text?: unknown) { panels = { ...panels, add: true, addText: typeof text === 'string' ? text : '' }; emit(); }
export function closeAdd() { panels = { ...panels, add: false }; emit(); }
export function openTask(edit: Task | null = null, draft: TaskDraft | null = null) {
  panels = { ...panels, add: false, task: { open: true, edit, draft } }; emit();
}
export function closeTask() { panels = { ...panels, task: { open: false, edit: null, draft: null } }; emit(); }
export function openCommand() { panels = { ...panels, command: true }; emit(); }
export function closeCommand() { panels = { ...panels, command: false }; emit(); }
export function openInbox() { panels = { ...panels, inbox: true }; emit(); }
export function closeInbox() { panels = { ...panels, inbox: false }; emit(); }
export function openExamPlan(exam: Task) { panels = { ...panels, examPlan: exam }; emit(); }
export function closeExamPlan() { panels = { ...panels, examPlan: null }; emit(); }
export function openExamReview(exam: Task) { panels = { ...panels, examReview: exam }; emit(); }
export function closeExamReview() { panels = { ...panels, examReview: null }; emit(); }

/** Las pantallas se suscriben para recargar cuando se guarda una tarea en un panel global. */
export function onDataChanged(fn: () => void) { savedLs.add(fn); return () => { savedLs.delete(fn); }; }
export function dataChanged() { savedLs.forEach((f) => f()); }

/** Algo cambió la racha (enfoque guardado, tarea hecha, repaso): se vuelve a pedir. */
const streakLs = new Set<() => void>();
export function onStreakChanged(fn: () => void) { streakLs.add(fn); return () => { streakLs.delete(fn); }; }
export function streakChanged(delay = 900) { setTimeout(() => streakLs.forEach((f) => { try { f(); } catch { /* noop */ } }), delay); }
