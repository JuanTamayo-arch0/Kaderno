// ============================================================
//  v30: idiomas (español e inglés).
//
//  El texto en español es la llave: `t('Nueva tarea')` devuelve "New task"
//  en inglés y el mismo texto en español. Así el código sigue leyéndose en
//  español y no hay que inventar nombres para 3.000 textos. Las traducciones
//  viven en lib/i18n/en/*.ts y `npm run i18n` revisa que no falte ninguna.
//
//  - Variables: t('Hola, {name}', { name }) -> "Hi, {name}".
//  - Plurales: tp(n, '{n} tarea', '{n} tareas').
//  - Un mismo texto con dos sentidos ("Mar": martes o el sonido del mar) se
//    distingue con contexto: tc('sonido', 'Mar').
//  - El idioma se lee una vez al cargar (localStorage o el del dispositivo):
//    al cambiarlo la app se recarga, así también los textos que se arman al
//    cargar cada archivo salen en el idioma nuevo.
//
//  Sin react-native: se puede probar con tsx.
// ============================================================

import { EN } from './i18n/en';

export type Lang = 'es' | 'en';
export const LANGS: { id: Lang; name: string; native: string }[] = [
  { id: 'es', name: 'Spanish', native: 'Español' },
  { id: 'en', name: 'English', native: 'English' },
];
export const LANG_KEY = 'kd-lang';

/**
 * El inglés está listo (v30, fase 7): sin elección guardada manda el idioma
 * del dispositivo. En false, la app sale en español salvo que alguien elija
 * inglés a mano (así se probó mientras se traducía por fases).
 */
export const I18N_READY = true;

/** El idioma del dispositivo: inglés si lo pide primero; si no, español. */
export function deviceLang(languages: readonly string[] | undefined): Lang {
  const first = (languages ?? []).find((l) => !!l)?.toLowerCase() ?? '';
  return first.startsWith('en') ? 'en' : 'es';
}

export function cleanLang(v: unknown): Lang | null {
  return v === 'es' || v === 'en' ? v : null;
}

function initialLang(): Lang {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = cleanLang(localStorage.getItem(LANG_KEY));
      if (saved) return saved;
    }
  } catch { /* noop */ }
  if (!I18N_READY) return 'es';
  try {
    // Solo en el navegador (Node también tiene navigator y las pruebas corren en español).
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') return deviceLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
  } catch { /* noop */ }
  return 'es';
}

let current: Lang = initialLang();

/** Idioma actual. */
export function lang(): Lang { return current; }

/** Solo para pruebas y para el arranque en nativo. */
export function _setLangForTests(l: Lang): void { current = l; }

/** Configuración regional para fechas y números. */
export function locale(): string { return current === 'en' ? 'en-US' : 'es-CO'; }

/** Reemplaza {nombre} por su valor. */
export function fill(s: string, vars?: Record<string, string | number | null | undefined>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars && vars[k] != null ? String(vars[k]) : m));
}

/** Traduce un texto escrito en español. */
export function t(es: string, vars?: Record<string, string | number | null | undefined>): string {
  const out = current === 'en' ? (EN[es] ?? es) : es;
  return fill(out, vars);
}

/** Lo mismo que t, para donde `t` ya es otra cosa (por ejemplo `tasks.map((t) => ...)`). */
export const trn = t;

/** Igual que t, para un texto que en español tiene más de un sentido. */
export function tc(context: string, es: string, vars?: Record<string, string | number | null | undefined>): string {
  const out = current === 'en' ? (EN[`${context}|${es}`] ?? EN[es] ?? es) : es;
  return fill(out, vars);
}

/** Plural: tp(3, '{n} tarea', '{n} tareas'). */
export function tp(n: number, one: string, many: string, vars?: Record<string, string | number | null | undefined>): string {
  return t(n === 1 ? one : many, { n, ...vars });
}

/** Días de la semana (0 = lunes) en el idioma actual. */
export function weekdayNames(style: 'long' | 'short' | 'narrow' = 'short'): string[] {
  const base = new Date(2024, 0, 1); // lunes 1 de enero de 2024
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base); d.setDate(base.getDate() + i);
    const s = d.toLocaleDateString(locale(), { weekday: style });
    return cap(s.replace('.', ''));
  });
}

/** Meses (0 = enero) en el idioma actual. */
export function monthNames(style: 'long' | 'short' = 'long'): string[] {
  return Array.from({ length: 12 }, (_, i) => cap(new Date(2024, i, 15).toLocaleDateString(locale(), { month: style }).replace('.', '')));
}

function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }

const ES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ES_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ES_DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const ES_DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EN_DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Días cortos (0 = domingo, como getDay): "mié" en español, "Wed" en inglés. */
export function daysShort(): string[] { return [...(current === 'en' ? EN_DAYS : ES_DAYS)]; }
/** Días completos (0 = domingo): "miércoles" en español, "Wednesday" en inglés. */
export function daysLong(): string[] { return [...(current === 'en' ? EN_DAYS_LONG : ES_DAYS_LONG)]; }
/** Separador decimal del idioma: "," en español (4,5), "." en inglés (4.5). */
export function decSep(): string { return current === 'en' ? '.' : ','; }
/** Separador de columnas del CSV: ";" para Excel en español, "," en inglés. */
export function csvSep(): string { return current === 'en' ? ',' : ';'; }
/** Inicial de cada día (0 = domingo): D L M M J V S en español, S M T W T F S en inglés. */
export function dayLetters(): string[] { return current === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['D', 'L', 'M', 'M', 'J', 'V', 'S']; }
/** Lo mismo empezando en lunes. */
export function dayLettersMon(): string[] { const d = dayLetters(); return [...d.slice(1), d[0]]; }
/** Día y mes en el orden del idioma: "23 nov" en español, "Nov 23" en inglés. */
export function dayMonth(day: number | string, month: string): string { return current === 'en' ? `${month} ${day}` : `${day} ${month}`; }
/** Meses cortos como los escribe la app: "nov" en español, "Nov" en inglés. */
export function monthsShort(): string[] { return [...(current === 'en' ? EN_SHORT : ES_SHORT)]; }
/** Meses completos: "noviembre" en español, "November" en inglés. */
export function monthsLong(): string[] { return [...(current === 'en' ? EN_LONG : ES_LONG)]; }
