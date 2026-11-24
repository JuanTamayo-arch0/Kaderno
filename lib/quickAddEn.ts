// ============================================================
//  v30: "Agregar con texto" en inglés.
//  En vez de un segundo lector, cada palabra en inglés se cambia por la que
//  el lector en español ya entiende ("friday" -> "viernes", "at" -> "las").
//  El texto original se conserva para el título. Solo se usa con la app en
//  inglés, así "sat" o "test" no cambian nada en español.
//    "calculus exam friday 10am"   -> examen · viernes 10:00
//    "physics report on 10/20"     -> 20 oct (mes/día, como en EE. UU.)
//    "read ch 9 every monday until dec 5"
// ============================================================

const MAP: Record<string, string> = {
  // Días
  today: 'hoy', tonight: 'hoy', tomorrow: 'manana', tmrw: 'manana', tmr: 'manana',
  monday: 'lunes', mondays: 'lunes', mon: 'lun',
  tuesday: 'martes', tuesdays: 'martes', tue: 'mar', tues: 'mar',
  wednesday: 'miercoles', wednesdays: 'miercoles', wed: 'mie',
  thursday: 'jueves', thursdays: 'jueves', thu: 'jue', thur: 'jue', thurs: 'jue',
  friday: 'viernes', fridays: 'viernes', fri: 'vie',
  saturday: 'sabado', saturdays: 'sabado', sat: 'sab',
  sunday: 'domingo', sundays: 'domingo', sun: 'dom',
  // Meses ("may" y "sep" ya los entiende)
  january: 'enero', jan: 'ene', february: 'febrero', march: 'marzo', mar: 'marzo',
  april: 'abril', apr: 'abr', june: 'junio', july: 'julio', august: 'agosto', aug: 'ago',
  september: 'septiembre', october: 'octubre', november: 'noviembre', december: 'diciembre', dec: 'dic',
  // Conectores (el lector los descarta o los usa para leer la fecha)
  next: 'proximo', this: 'este', the: 'el', on: 'el', at: 'las', by: 'para', due: 'para', for: 'para',
  of: 'de', until: 'hasta', till: 'hasta', and: 'y', in: 'en',
  // Plazos y repeticiones
  day: 'dia', days: 'dias', week: 'semana', weeks: 'semanas', month: 'mes', months: 'meses',
  every: 'cada', other: 'otro', daily: 'diario', everyday: 'diario', weekly: 'semanal', monthly: 'mensual',
  weekday: 'habil', weekdays: 'habiles',
  noon: 'mediodia', midnight: 'medianoche',
  // Tipos
  exam: 'examen', exams: 'examen', midterm: 'parcial', midterms: 'parcial', test: 'examen',
  project: 'proyecto', deliverable: 'entregable',
};

/** Una palabra ya normalizada (minúsculas, sin tildes ni puntuación) en inglés -> la del lector. */
export function enToken(n: string): string {
  const ord = n.match(/^(\d{1,2})(st|nd|rd|th)$/);
  if (ord) return ord[1];
  // 10/20 o 10/20/2026: en inglés va primero el mes. Si el primero pasa de 12 ya es el día.
  const md = n.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (md && Number(md[1]) <= 12) return `${md[2]}/${md[1]}${md[3] ? '/' + md[3] : ''}`;
  return MAP[n] ?? n;
}
