// ============================================================
//  Importar entregas del sílabo.
//  Acepta tres formas de texto:
//   1. Tabla con encabezado (copiada de Excel o un CSV): columnas como
//      título / actividad, fecha, hora, tipo, materia, descripción.
//   2. Líneas con barras, como las que devuelve el prompt para IA:
//      "20/10/2026 10:00 | Examen | Parcial 1 | Temas 1 a 4"
//   3. Texto libre, una entrega por línea: "Semana 5 (20/10): Parcial 1".
//  Cada línea se entiende con las mismas reglas de "Agregar con texto".
// ============================================================
import { parseQuickAdd, matchSubject, norm, type QuickSubject, type QuickType } from './quickAdd';
import { t, lang } from './i18n';

export type SylRow = {
  title: string;
  subjectId: string | null;
  typeKey: string | null;
  dueDate: string | null;
  dueTime: string | null;
  description: string | null;
  include: boolean;
  warning: string | null;
};

const HEAD: Record<string, string[]> = {
  // Encabezados en español y en inglés (v30).
  title: ['titulo', 'tarea', 'actividad', 'entrega', 'evaluacion', 'nombre', 'tema', 'title', 'task', 'activity', 'assignment', 'name', 'topic'], // i18n-ok
  date: ['fecha', 'dia', 'vence', 'fecha de entrega', 'fecha entrega', 'date', 'due', 'due date', 'day', 'deadline'], // i18n-ok
  time: ['hora', 'time'], // i18n-ok
  type: ['tipo', 'categoria', 'type', 'category'], // i18n-ok
  subject: ['materia', 'asignatura', 'curso', 'subject', 'course', 'class'], // i18n-ok
  description: ['descripcion', 'detalle', 'detalles', 'notas', 'observaciones', 'peso', 'description', 'details', 'notes', 'weight'], // i18n-ok
};

function detectDelimiter(lines: string[]): string | null {
  for (const d of ['\t', '|', ';']) {
    const withD = lines.filter((l) => l.includes(d)).length;
    if (withD >= Math.max(1, Math.ceil(lines.length * 0.6))) return d;
  }
  // Coma solo si la primera línea parece encabezado.
  if (lines.length > 1 && lines[0].includes(',') && headerMap(lines[0].split(',')) ) return ',';
  return null;
}

function headerMap(cells: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  cells.forEach((c, i) => {
    const n = norm(c).replace(/[^a-z ]/g, '').trim();
    for (const [k, names] of Object.entries(HEAD)) {
      if (map[k] === undefined && names.some((x) => n === x || (n.startsWith(x) && x.length >= 4))) { map[k] = i; break; }
    }
  });
  return map.title !== undefined && (map.date !== undefined || map.type !== undefined) ? map : null;
}

function splitCells(line: string, d: string): string[] {
  if (d !== ',') return line.split(d).map((c) => c.trim());
  // CSV simple con comillas
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function typeOf(cell: string, types: QuickType[]): string | null {
  const n = norm(cell).trim();
  if (!n) return null;
  const r = parseQuickAdd(cell, [], types);
  if (r.typeKey) return r.typeKey;
  return types.find((t) => norm(t.label) === n || norm(t.key) === n)?.key ?? null;
}

function finish(row: Omit<SylRow, 'include' | 'warning'>, now: Date): SylRow {
  let warning: string | null = null;
  let past = false;
  if (!row.dueDate) warning = t('Sin fecha');
  else {
    const [y, m, d] = row.dueDate.split('-').map(Number);
    const due = new Date(y, m - 1, d, 23, 59);
    if (due.getTime() < now.getTime()) { warning = t('La fecha ya pasó'); past = true; }
  }
  return { ...row, include: !past, warning };
}

export function parseSyllabus(text: string, subjects: QuickSubject[], types: QuickType[], defaultSubjectId: string | null, now = new Date()): SylRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^[-=|\s]+$/.test(l));
  if (!lines.length) return [];
  const d = detectDelimiter(lines);
  const rows: SylRow[] = [];

  if (d) {
    const first = splitCells(lines[0], d);
    const map = headerMap(first);
    const body = map ? lines.slice(1) : lines;
    for (const line of body) {
      const cells = splitCells(line, d).filter((_, i, arr) => !(d === '|' && (i === 0 || i === arr.length - 1) && arr[i] === ''));
      if (!cells.some(Boolean)) continue;
      let title = '', date = '', time = '', type: string | null = null, subj: string | null = null, desc = '';
      if (map) {
        title = cells[map.title] ?? '';
        date = map.date !== undefined ? cells[map.date] ?? '' : '';
        time = map.time !== undefined ? cells[map.time] ?? '' : '';
        type = map.type !== undefined ? typeOf(cells[map.type] ?? '', types) : null;
        subj = map.subject !== undefined ? matchSubject(cells[map.subject] ?? '', subjects)?.id ?? null : null;
        desc = map.description !== undefined ? cells[map.description] ?? '' : '';
      } else {
        // Sin encabezado. Formato del prompt: fecha | tipo | título | descripción.
        const isDate = (c: string) => !!parseQuickAdd(`x ${c}`, [], [], now).dueDate && /\d/.test(c);
        const di = cells.findIndex(isDate);
        if (di >= 0) date = cells[di];
        const others = cells.filter((_, i) => i !== di);
        const ti = others.findIndex((c) => c.split(/\s+/).length <= 2 && !!typeOf(c, types));
        if (ti >= 0) type = typeOf(others[ti], types);
        const rest = others.filter((_, i) => i !== ti);
        title = rest[0] ?? '';
        desc = rest.slice(1).join(' · ');
      }
      const when = parseQuickAdd(`x ${date} ${time}`.trim(), [], [], now);
      const tparse = parseQuickAdd(title || t('Entrega'), subjects, types, now);
      rows.push(finish({
        title: (title || tparse.title).trim(),
        subjectId: subj ?? tparse.subjectId ?? defaultSubjectId,
        typeKey: type ?? tparse.typeKey,
        dueDate: when.dueDate ?? tparse.dueDate,
        dueTime: when.dueTime ?? tparse.dueTime,
        description: desc.trim() || null,
      }, now));
    }
    return rows;
  }

  for (const line of lines) {
    const p = parseQuickAdd(line.replace(/^\s*[-*•]\s*/, '').replace(/^(semana|week)\s+\d+\s*[:.-]?\s*/i, ''), subjects, types, now);
    rows.push(finish({ title: p.title, subjectId: p.subjectId ?? defaultSubjectId, typeKey: p.typeKey, dueDate: p.dueDate, dueTime: p.dueTime, description: null }, now));
  }
  return rows;
}

/** Prompt para que una IA convierta el sílabo al formato con barras. */
export function syllabusPrompt(subjectName: string | null, year: number): string {
  // i18n-ok-desde: los dos prompts, cada uno en su idioma.
  if (lang() === 'en') return [
    `I'm going to paste the schedule or syllabus for ${subjectName ? `the course ${subjectName}` : 'a course'} for the ${year} term.`,
    'Extract ALL assignments, exams, quizzes, workshops, presentations and projects with a date.',
    'Return them one per line, with no header or extra text, in this exact format:',
    '',
    'MM/DD/YYYY HH:MM | Type | Title | Description',
    '',
    'Rules:',
    '- Type must be one of: Task, Exam, Quiz, Project.',
    '- If there is no time, leave just the date (MM/DD/YYYY).',
    "- If you don't know the exact date, use the first day of that week.",
    '- In Description put the weight or topics, if they appear. Otherwise leave it empty.',
    '',
    'Here is the syllabus:',
    '',
  ].join('\n');
  return [
    `Te voy a pegar el cronograma o sílabo de ${subjectName ? `la materia ${subjectName}` : 'una materia'} del semestre ${year}.`,
    'Extrae TODAS las entregas, exámenes, quices, talleres, exposiciones y proyectos con fecha.',
    'Devuélvelas una por línea, sin encabezado ni texto adicional, con este formato exacto:',
    '',
    'DD/MM/AAAA HH:MM | Tipo | Título | Descripción',
    '',
    'Reglas:',
    '- Tipo debe ser uno de: Tarea, Examen, Quiz, Proyecto.',
    '- Si no hay hora, deja solo la fecha (DD/MM/AAAA).',
    '- Si no sabes la fecha exacta, pon la del primer día de esa semana.',
    '- En Descripción pon el peso o los temas, si aparecen. Si no, déjala vacía.',
    '',
    'Este es el sílabo:',
    '',
  ].join('\n');
  // i18n-ok-hasta
}
