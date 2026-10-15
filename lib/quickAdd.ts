// ============================================================
//  "Agregar con texto": convierte una frase corta en una tarea.
//    "parcial cálculo viernes 10am"  -> examen · Cálculo II · viernes 10:00
//    "informe física mañana 6 de la tarde" -> tarea · Física · mañana 18:00
//    "leer cap 9 #fisica 20/10" -> tarea · Física · 20 oct
//  Funciona sin internet y sin IA: solo reglas. Lo que no entiende se queda
//  en el título, así nunca se pierde nada de lo escrito.
// ============================================================
import { addDays, isoDate, startOfDay } from './time';

export type QuickSubject = { id: string; name: string };
export type QuickType = { key: string; label: string };
export type QuickResult = {
  title: string;
  typeKey: string | null;
  subjectId: string | null;
  dueDate: string | null;   // YYYY-MM-DD
  dueTime: string | null;   // HH:MM
};

export function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const DAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
  dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6,
};
const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  ene: 0, feb: 1, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11,
};
const TYPE_WORDS: { re: RegExp; key: string }[] = [
  { re: /^(parcial(es)?|examen(es)?|final|previo|evaluacion|sustentacion)$/, key: 'examen' },
  { re: /^(quiz|quices|quizes|quiz\.)$/, key: 'quiz' },
  { re: /^(proyecto|entregable)$/, key: 'proyecto' },
];
const FILLER = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'para', 'a', 'al', 'en', 'este', 'esta', 'proximo', 'proxima', 'que', 'viene', 'hasta', 'antes']);

type Tok = { raw: string; n: string; used: boolean };

export function parseQuickAdd(input: string, subjects: QuickSubject[], types: QuickType[], now = new Date()): QuickResult {
  const toks: Tok[] = input.trim().split(/\s+/).filter(Boolean).map((raw) => ({ raw, n: norm(raw).replace(/^[(\["'¿¡]+|[)\]"',;.:!?]+$/g, ''), used: false }));
  let dueDate: Date | null = null;
  let hour: number | null = null, minute = 0, ampm: 'am' | 'pm' | null = null;
  let typeKey: string | null = null;
  let subjectId: string | null = null;
  const today = startOfDay(now);
  const use = (...ix: number[]) => ix.forEach((i) => { if (toks[i]) toks[i].used = true; });
  const at = (i: number) => toks[i]?.n ?? '';

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.used) continue;
    const w = t.n;

    // ---- Fechas relativas ----
    if (w === 'hoy') { dueDate = today; use(i); continue; }
    if (w === 'manana' && at(i - 1) !== 'la' && at(i - 1) !== 'de') {
      if (at(i - 1) === 'pasado') { dueDate = addDays(today, 2); use(i - 1, i); } else { dueDate = addDays(today, 1); use(i); }
      continue;
    }
    if (w === 'en' && /^\d+$/.test(at(i + 1)) && /^(dias?|semanas?)$/.test(at(i + 2))) {
      const n = parseInt(at(i + 1), 10);
      dueDate = addDays(today, at(i + 2).startsWith('semana') ? n * 7 : n); use(i, i + 1, i + 2); continue;
    }
    if (w === 'en' && /^(una|1)$/.test(at(i + 1)) && /^semana$/.test(at(i + 2))) { dueDate = addDays(today, 7); use(i, i + 1, i + 2); continue; }
    if (w in DAYS && !(w === 'mar' && /^\d/.test(at(i - 1)))) {
      const target = DAYS[w];
      let diff = (target - today.getDay() + 7) % 7;
      const next = at(i - 1) === 'proximo' || at(i + 1) === 'que' && at(i + 2) === 'viene';
      if (next && diff === 0) diff = 7;
      if (at(i - 1) === 'proximo') use(i - 1);
      if (at(i + 1) === 'que' && at(i + 2) === 'viene') use(i + 1, i + 2);
      dueDate = addDays(today, diff); use(i);
      if (at(i - 1) === 'el') use(i - 1);
      continue;
    }
    // 2026-10-20 (ISO)
    let iso = w.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      const cand = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
      if (!isNaN(cand.getTime())) { dueDate = cand; use(i); continue; }
    }
    // 20/10, 20-10, 20/10/2026
    let m = w.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (m) {
      const d = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1;
      let y = m[3] ? parseInt(m[3], 10) : today.getFullYear();
      if (y < 100) y += 2000;
      if (mo >= 0 && mo < 12 && d >= 1 && d <= 31) {
        let cand = new Date(y, mo, d);
        if (!m[3] && cand < today) cand = new Date(y + 1, mo, d);
        dueDate = cand; use(i); if (at(i - 1) === 'el') use(i - 1); continue;
      }
    }
    // 20 oct, 20 de octubre
    if (/^\d{1,2}$/.test(w)) {
      const mi = at(i + 1) === 'de' ? i + 2 : i + 1;
      if (at(mi) in MONTHS) {
        const d = parseInt(w, 10), mo = MONTHS[at(mi)];
        let cand = new Date(today.getFullYear(), mo, d);
        if (cand < today) cand = new Date(today.getFullYear() + 1, mo, d);
        dueDate = cand; use(i, mi); if (mi === i + 2) use(i + 1); if (at(i - 1) === 'el') use(i - 1);
        continue;
      }
    }

    // ---- Horas ----
    m = w.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|m)?$/);
    const nextAmPm = /^(am|pm|a\.m\.?|p\.m\.?)$/.test(at(i + 1)) ? at(i + 1) : null;
    const prevIsAlas = (at(i - 1) === 'las' && at(i - 2) === 'a') || at(i - 1) === 'las';
    const dayPart = at(i + 1) === 'de' && at(i + 2) === 'la' && /^(tarde|noche|manana)$/.test(at(i + 3));
    if (m && (m[2] || m[3] || nextAmPm || prevIsAlas || dayPart)) {
      const h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0;
      if (h <= 23 && mi < 60) {
        hour = h; minute = mi;
        const ap = (m[3] ?? nextAmPm ?? '').replace(/\./g, '');
        if (ap === 'am' || ap === 'pm') ampm = ap;
        else if (ap === 'm') { hour = 12; ampm = 'pm'; }
        use(i); if (nextAmPm) use(i + 1);
        if (prevIsAlas) { use(i - 1); if (at(i - 2) === 'a') use(i - 2); }
        // "6 de la tarde / noche / mañana"
        if (at(i + 1) === 'de' && at(i + 2) === 'la' && /^(tarde|noche|manana)$/.test(at(i + 3))) {
          ampm = at(i + 3) === 'manana' ? 'am' : 'pm'; use(i + 1, i + 2, i + 3);
        }
        continue;
      }
    }
    if (w === 'mediodia') { hour = 12; minute = 0; ampm = 'pm'; use(i); if (at(i - 1) === 'al' || at(i - 1) === 'a') use(i - 1); continue; }
    if (w === 'medianoche') { hour = 23; minute = 59; ampm = null; use(i); if (at(i - 1) === 'a') use(i - 1); continue; }

    // ---- #materia ----
    if (w.startsWith('#') && w.length > 2) {
      const sub = matchSubject(w.slice(1), subjects);
      if (sub) { subjectId = sub.id; use(i); continue; }
    }
  }

  // ---- Tipo ----
  for (let i = 0; i < toks.length && !typeKey; i++) {
    if (toks[i].used) continue;
    const w = toks[i].n;
    const builtin = TYPE_WORDS.find((x) => x.re.test(w));
    if (builtin && types.some((t) => t.key === builtin.key)) { typeKey = builtin.key; continue; }
    const custom = types.find((t) => norm(t.label) === w || norm(t.key) === w);
    if (custom) typeKey = custom.key;
  }

  // ---- Materia por palabra ----
  if (!subjectId) {
    for (let i = 0; i < toks.length && !subjectId; i++) {
      if (toks[i].used || toks[i].n.length < 3 || FILLER.has(toks[i].n)) continue;
      const sub = matchSubject(toks[i].n, subjects);
      if (sub) subjectId = sub.id;
    }
  }

  // ---- Hora final ----
  let dueTime: string | null = null;
  if (hour != null) {
    let h = hour;
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    // "a las 6" sin am/pm: de 1 a 7 se entiende de la tarde.
    if (!ampm && h >= 1 && h <= 7) h += 12;
    dueTime = `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    if (!dueDate) {
      // Solo hora: hoy si todavía no pasó, si no mañana.
      const cand = new Date(today); cand.setHours(h, minute, 0, 0);
      dueDate = cand.getTime() > now.getTime() ? today : addDays(today, 1);
    }
  }

  // ---- Título: lo que no se usó, sin conectores sueltos al final ----
  const rest = toks.filter((t) => !t.used).map((t) => t.raw);
  while (rest.length && FILLER.has(norm(rest[rest.length - 1]))) rest.pop();
  while (rest.length && FILLER.has(norm(rest[0])) && rest.length > 1) rest.shift();
  let title = rest.join(' ').trim();
  if (!title) {
    const tl = types.find((t) => t.key === typeKey)?.label ?? 'Tarea';
    const sn = subjects.find((s) => s.id === subjectId)?.name;
    title = sn ? `${tl} de ${sn}` : tl;
  }
  title = title[0].toUpperCase() + title.slice(1);

  return { title, typeKey, subjectId, dueDate: dueDate ? isoDate(dueDate) : null, dueTime };
}

/** Materia cuyo nombre contiene la palabra o alguna de sus palabras empieza por ella. */
export function matchSubject(word: string, subjects: QuickSubject[]): QuickSubject | null {
  const w = norm(word);
  if (w.length < 3) return null;
  let best: { s: QuickSubject; score: number } | null = null;
  for (const s of subjects) {
    const n = norm(s.name);
    const words = n.split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    if (n === w) score = 100;
    else if (words.some((x) => x === w)) score = 80;
    else if (w.length >= 4 && words.some((x) => x.startsWith(w))) score = 60;
    else if (w.length >= 5 && words.some((x) => w.startsWith(x) && x.length >= 4)) score = 50;
    // Siglas: "ing" para "Inglés", "calc" para "Cálculo"
    if (score && (!best || score > best.score)) best = { s, score };
  }
  return best?.s ?? null;
}
