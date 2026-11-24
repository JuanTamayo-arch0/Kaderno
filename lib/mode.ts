// ============================================================
//  Modo Trabajo (v24, fase 3). Kaderno para estudiar, para trabajar o para
//  las dos cosas: cambia los nombres y prende lo del trabajo (grabar la
//  reunión, registro de horas). Se guarda en user_prefs.settings.mode.
// ============================================================
import { useEffect, useState } from 'react';
import { t } from './i18n';

export type Mode = 'estudio' | 'trabajo' | 'ambos';
export const MODES: { key: Mode; label: string; hint: string; icon: string }[] = [
  { key: 'estudio', label: t('Estudio'), hint: t('Materias, parciales, clases y repaso'), icon: 'school-outline' },
  { key: 'trabajo', label: t('Trabajo'), hint: t('Áreas o clientes, entregas, reuniones y horas'), icon: 'briefcase-outline' },
  { key: 'ambos', label: t('Los dos'), hint: t('Dos espacios: Estudio y Trabajo, cada uno con lo suyo'), icon: 'layers-outline' },
];

export type Vocab = {
  subjects: string; subject: string; subjectLower: string; subjectsLower: string; newSubject: string; noSubjects: string; noSubjectsText: string; subjectsCount: (n: number) => string;
  schedule: string; studySection: string; studyTab: string; subjectsTab: string; subjectIcon: string; exam: string; exams: string; klass: string; record: string; transcriptOf: string; semester: string; teacher: string;
};

const STUDY: Vocab = {
  subjects: t('Materias'), subject: t('Materia'), subjectLower: 'materia', subjectsLower: 'materias', newSubject: t('Nueva materia'), noSubjects: t('Aún no tienes materias'),
  noSubjectsText: t('Crea las materias del semestre para organizar tareas, notas y calificaciones.'), subjectsCount: (n) => t('{n} este semestre', { n }),
  schedule: t('Horario'), studySection: t('Estudiar'), studyTab: t('Estudiar'), subjectsTab: t('Materias'), subjectIcon: 'book', exam: t('Parcial'), exams: t('Parciales'), klass: 'clase', record: t('Grabar clase'), transcriptOf: t('Transcripción de la clase'), semester: t('Semestre'), teacher: t('Profesor'),
};
const WORK: Vocab = {
  subjects: t('Áreas'), subject: t('Área'), subjectLower: t('área'), subjectsLower: t('áreas'), newSubject: t('Nueva área o cliente'), noSubjects: t('Aún no tienes áreas'),
  noSubjectsText: t('Crea tus áreas o clientes para organizar tareas, notas y horas.'), subjectsCount: (n) => `${n} ${n === 1 ? t('activa') : t('activas')}`,
  schedule: t('Agenda'), studySection: t('Herramientas'), studyTab: t('Enfoque'), subjectsTab: t('Áreas'), subjectIcon: 'briefcase', exam: t('Entrega'), exams: t('Entregas'), klass: t('reunión'), record: t('Grabar reunión'), transcriptOf: t('Transcripción de la reunión'), semester: t('Trimestre'), teacher: t('Responsable'),
};
const BOTH: Vocab = {
  ...STUDY,
  subjects: t('Materias y áreas'), newSubject: t('Nueva materia o área'), noSubjects: t('Aún no tienes materias ni áreas'),
  noSubjectsText: t('Crea tus materias y tus áreas de trabajo para organizar tareas, notas y horas.'), subjectsCount: (n) => t('{n} en total', { n }),
  klass: t('grabación'), transcriptOf: t('Transcripción'),
};

export function vocab(mode: Mode | null | undefined): Vocab {
  return mode === 'trabajo' ? WORK : mode === 'ambos' ? BOTH : STUDY;
}
/** ¿Se muestran las cosas del trabajo (reuniones, horas)? */
export const hasWork = (mode: Mode | null | undefined) => mode === 'trabajo' || mode === 'ambos';
/** ¿Se muestran las cosas del estudio (repaso, promedio, parciales)? */
export const hasStudy = (mode: Mode | null | undefined) => mode !== 'trabajo';
export const parseMode = (v: unknown): Mode => (v === 'trabajo' || v === 'ambos' ? v : 'estudio');

// ---------- Espacios (v26, fase 2) ----------
// Quien estudia Y trabaja ("Los dos") tiene dos espacios: Estudio y Trabajo.
// Cada uno muestra solo lo suyo (sus materias o áreas, su navegación, su
// tema). `mode` es el ajuste (qué espacios tiene la persona) y `space` el
// espacio abierto. Con un solo modo, el espacio es ese modo.
export type Space = 'estudio' | 'trabajo';
export const parseSpace = (v: unknown): Space => (v === 'trabajo' ? 'trabajo' : 'estudio');
/** El modo que se ve: con "Los dos", el del espacio abierto. */
export const effectiveMode = (m: Mode, sp: Space): Space => (m === 'ambos' ? sp : m);

// ---------- Estado compartido ----------
let current: Mode = 'estudio';
let space: Space = 'estudio';
let loaded = false;
const listeners = new Set<(m: Mode) => void>();
const spaceListeners = new Set<(s: Space) => void>();
try {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem('kd-mode') : null; if (v) current = parseMode(v);
  const sp = typeof localStorage !== 'undefined' ? localStorage.getItem('kd-space') : null; if (sp) space = parseSpace(sp);
} catch { /* noop */ }

/** El modo que se ve (Estudio o Trabajo). Con "Los dos", sigue al espacio abierto. */
export function getMode(): Mode { return effectiveMode(current, space); }
/** El ajuste tal cual: estudio, trabajo o ambos. */
export function getModeSetting(): Mode { return current; }
/** El espacio abierto. */
export function getSpace(): Space { return effectiveMode(current, space); }
/** ¿La persona tiene los dos espacios? */
export function hasBothSpaces(): boolean { return current === 'ambos'; }
/** Lo llama quien lee las preferencias (al iniciar sesión o en Ajustes). */
export function setModeLocal(m: Mode) {
  loaded = true;
  if (m === current) return;
  const before = getSpace();
  current = m;
  try { localStorage.setItem('kd-mode', m); } catch { /* noop */ }
  listeners.forEach((f) => f(m));
  if (getSpace() !== before) spaceListeners.forEach((f) => f(getSpace()));
}
/** Cambia el espacio abierto (solo tiene efecto con "Los dos"). */
export function setSpaceLocal(sp: Space) {
  if (sp === space) return;
  const before = getSpace();
  space = sp;
  try { localStorage.setItem('kd-space', sp); } catch { /* noop */ }
  listeners.forEach((f) => f(current));
  if (getSpace() !== before) spaceListeners.forEach((f) => f(getSpace()));
}
/** Avisa cuando cambia el espacio que se ve (para repintar el tema). */
export function onSpaceChange(f: (s: Space) => void): () => void {
  spaceListeners.add(f);
  return () => { spaceListeners.delete(f); };
}
export async function saveSpace(sp: Space): Promise<void> {
  setSpaceLocal(sp);
  const { savePrefs } = await import('./db');
  await savePrefs({ space: sp }).catch(() => {});
}
/**
 * `mode` es el ajuste (estudio, trabajo o ambos); `space` es lo que se ve.
 * `v`, `work` y `study` siguen al espacio: con "Los dos", en Estudio no
 * aparece lo del trabajo y en Trabajo no aparece lo del estudio.
 */
export function useMode(): { mode: Mode; space: Space; both: boolean; v: Vocab; work: boolean; study: boolean } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    listeners.add(f);
    if (!loaded) {
      loaded = true;
      import('./db').then(({ fetchPrefs }) => fetchPrefs()).then((p) => {
        if (!p) return;
        if (p.space) setSpaceLocal(parseSpace(p.space));
        setModeLocal(parseMode(p.mode));
      }).catch(() => {});
    }
    return () => { listeners.delete(f); };
  }, []);
  const eff = getSpace();
  return { mode: current, space: eff, both: current === 'ambos', v: vocab(eff), work: hasWork(eff), study: hasStudy(eff) };
}
export async function saveMode(m: Mode): Promise<void> {
  const before = current;
  const db = await import('./db');
  // v26: al pasar de un modo a "Los dos", lo que ya había queda en su espacio
  // (todo era de ese modo) y se abre ese mismo espacio: nada cambia de golpe.
  if (m === 'ambos' && before !== 'ambos') {
    const was: Space = before === 'trabajo' ? 'trabajo' : 'estudio';
    try {
      const subs = await db.getSubjects();
      await db.setSubjectsSpace(subs.filter((x) => x.space !== 'estudio' && x.space !== 'trabajo').map((x) => x.id), was);
    } catch { /* sin conexión o sin schema_v25: se ordena después */ }
    space = was;
    try { localStorage.setItem('kd-space', was); } catch { /* noop */ }
    setModeLocal(m);
    await db.savePrefs({ mode: m, space: was, spacesSorted: true });
    return;
  }
  setModeLocal(m);
  await db.savePrefs({ mode: m });
}
