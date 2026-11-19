// ============================================================
//  Modo Trabajo (v24, fase 3). Kaderno para estudiar, para trabajar o para
//  las dos cosas: cambia los nombres y prende lo del trabajo (grabar la
//  reunión, registro de horas). Se guarda en user_prefs.settings.mode.
// ============================================================
import { useEffect, useState } from 'react';

export type Mode = 'estudio' | 'trabajo' | 'ambos';
export const MODES: { key: Mode; label: string; hint: string; icon: string }[] = [
  { key: 'estudio', label: 'Estudio', hint: 'Materias, parciales, clases y repaso', icon: 'school-outline' },
  { key: 'trabajo', label: 'Trabajo', hint: 'Áreas o clientes, entregas, reuniones y horas', icon: 'briefcase-outline' },
  { key: 'ambos', label: 'Los dos', hint: 'Estudias y trabajas: todo junto', icon: 'layers-outline' },
];

export type Vocab = {
  subjects: string; subject: string; subjectLower: string; subjectsLower: string; newSubject: string; noSubjects: string; noSubjectsText: string; subjectsCount: (n: number) => string;
  schedule: string; studySection: string; studyTab: string; subjectsTab: string; subjectIcon: string; exam: string; exams: string; klass: string; record: string; transcriptOf: string; semester: string; teacher: string;
};

const STUDY: Vocab = {
  subjects: 'Materias', subject: 'Materia', subjectLower: 'materia', subjectsLower: 'materias', newSubject: 'Nueva materia', noSubjects: 'Aún no tienes materias',
  noSubjectsText: 'Crea las materias del semestre para organizar tareas, notas y calificaciones.', subjectsCount: (n) => `${n} este semestre`,
  schedule: 'Horario', studySection: 'Estudiar', studyTab: 'Estudiar', subjectsTab: 'Materias', subjectIcon: 'book', exam: 'Parcial', exams: 'Parciales', klass: 'clase', record: 'Grabar clase', transcriptOf: 'Transcripción de la clase', semester: 'Semestre', teacher: 'Profesor',
};
const WORK: Vocab = {
  subjects: 'Áreas', subject: 'Área', subjectLower: 'área', subjectsLower: 'áreas', newSubject: 'Nueva área o cliente', noSubjects: 'Aún no tienes áreas',
  noSubjectsText: 'Crea tus áreas o clientes para organizar tareas, notas y horas.', subjectsCount: (n) => `${n} ${n === 1 ? 'activa' : 'activas'}`,
  schedule: 'Agenda', studySection: 'Herramientas', studyTab: 'Enfoque', subjectsTab: 'Áreas', subjectIcon: 'briefcase', exam: 'Entrega', exams: 'Entregas', klass: 'reunión', record: 'Grabar reunión', transcriptOf: 'Transcripción de la reunión', semester: 'Trimestre', teacher: 'Responsable',
};
const BOTH: Vocab = {
  ...STUDY,
  subjects: 'Materias y áreas', newSubject: 'Nueva materia o área', noSubjects: 'Aún no tienes materias ni áreas',
  noSubjectsText: 'Crea tus materias y tus áreas de trabajo para organizar tareas, notas y horas.', subjectsCount: (n) => `${n} en total`,
  klass: 'grabación', transcriptOf: 'Transcripción',
};

export function vocab(mode: Mode | null | undefined): Vocab {
  return mode === 'trabajo' ? WORK : mode === 'ambos' ? BOTH : STUDY;
}
/** ¿Se muestran las cosas del trabajo (reuniones, horas)? */
export const hasWork = (mode: Mode | null | undefined) => mode === 'trabajo' || mode === 'ambos';
/** ¿Se muestran las cosas del estudio (repaso, promedio, parciales)? */
export const hasStudy = (mode: Mode | null | undefined) => mode !== 'trabajo';
export const parseMode = (v: unknown): Mode => (v === 'trabajo' || v === 'ambos' ? v : 'estudio');

// ---------- Estado compartido ----------
let current: Mode = 'estudio';
let loaded = false;
const listeners = new Set<(m: Mode) => void>();
try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem('kd-mode') : null; if (v) current = parseMode(v); } catch { /* noop */ }

export function getMode(): Mode { return current; }
/** Lo llama quien lee las preferencias (al iniciar sesión o en Ajustes). */
export function setModeLocal(m: Mode) {
  loaded = true;
  if (m === current) return;
  current = m;
  try { localStorage.setItem('kd-mode', m); } catch { /* noop */ }
  listeners.forEach((f) => f(m));
}
export function useMode(): { mode: Mode; v: Vocab; work: boolean; study: boolean } {
  const [m, setM] = useState<Mode>(current);
  useEffect(() => {
    listeners.add(setM);
    if (!loaded) {
      loaded = true;
      import('./db').then(({ fetchPrefs }) => fetchPrefs()).then((p) => { if (p) setModeLocal(parseMode(p.mode)); }).catch(() => {});
    }
    return () => { listeners.delete(setM); };
  }, []);
  return { mode: m, v: vocab(m), work: hasWork(m), study: hasStudy(m) };
}
export async function saveMode(m: Mode): Promise<void> {
  setModeLocal(m);
  const { savePrefs } = await import('./db');
  await savePrefs({ mode: m });
}
