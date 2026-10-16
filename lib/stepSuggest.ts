// ============================================================
//  Sugerir microtareas a partir del título y la descripción.
//  Funciona sin internet: lee listas, frases y rangos de ejercicios de la
//  descripción, y si no hay suficiente usa pasos típicos según el tipo
//  ("examen", "informe", "exposición"...). La IA (función "ai", tarea
//  "steps") puede dar sugerencias mejores; esto es el respaldo inmediato.
// ============================================================

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const TEMPLATES: { re: RegExp; steps: string[] }[] = [
  { re: /\b(examen|parcial|final|quiz|quices|previo|evaluacion)\b/, steps: ['Reunir los temas y apuntes', 'Hacer un resumen o mapa de cada tema', 'Resolver ejercicios de práctica', 'Repasar los errores', 'Simulacro con tiempo'] },
  { re: /\b(informe|laboratorio|lab|practica)\b/, steps: ['Organizar los datos tomados', 'Hacer tablas y gráficas', 'Analizar resultados y calcular el error', 'Escribir conclusiones', 'Revisar formato y referencias'] },
  { re: /\b(exposicion|presentacion|sustentacion|diapositivas|pitch)\b/, steps: ['Definir la estructura y los puntos clave', 'Preparar las diapositivas', 'Repartir quién dice qué', 'Ensayar con tiempo', 'Preparar respuestas a posibles preguntas'] },
  { re: /\b(ensayo|articulo|resena|escrito|monografia)\b/, steps: ['Definir la tesis o idea central', 'Buscar y leer fuentes', 'Hacer el esquema', 'Escribir el borrador', 'Revisar redacción y citas'] },
  { re: /\b(lectura|leer|capitulo|libro)\b/, steps: ['Leer y subrayar', 'Anotar ideas principales', 'Hacer un resumen corto', 'Escribir dudas para clase'] },
  { re: /\b(taller|ejercicios|problemas|guia)\b/, steps: ['Leer todos los enunciados', 'Resolver los ejercicios', 'Revisar los que quedaron con dudas', 'Pasar en limpio y entregar'] },
  { re: /\b(proyecto|prototipo|programa|codigo|app|software)\b/, steps: ['Definir requisitos y alcance', 'Diseñar la solución', 'Implementar', 'Probar y corregir', 'Documentar y entregar'] },
  { re: /\b(video|podcast)\b/, steps: ['Escribir el guion', 'Grabar', 'Editar', 'Revisar y publicar'] },
];

function cleanItem(s: string): string {
  let t = s.replace(/^\s*(?:[-*•·]|\d+[.)]|[a-z][.)]|\[ ?[xX ]?\])\s*/, '').trim();
  t = t.replace(/[.;:,]+$/, '').trim();
  if (!t) return '';
  return t[0].toUpperCase() + t.slice(1);
}

/** "ejercicios 1 a 15" -> partes de unos 5 ejercicios. */
function splitRange(text: string): string[] {
  const m = norm(text).match(/(ejercicios?|problemas?|puntos?|preguntas?)\s+(?:del\s+)?(\d+)\s*(?:a|al|-|hasta)\s*(\d+)/);
  if (!m) return [];
  const from = parseInt(m[2], 10), to = parseInt(m[3], 10);
  if (!(to > from) || to - from > 80) return [];
  const label = m[1].startsWith('ejercicio') ? 'Ejercicios' : m[1].startsWith('problema') ? 'Problemas' : m[1].startsWith('pregunta') ? 'Preguntas' : 'Puntos';
  const total = to - from + 1;
  if (total <= 5) return [];
  const parts = Math.min(6, Math.ceil(total / 5));
  const size = Math.ceil(total / parts);
  const out: string[] = [];
  for (let a = from; a <= to; a += size) out.push(`${label} ${a} a ${Math.min(to, a + size - 1)}`);
  return out;
}

export function suggestSteps(title: string, description: string | null | undefined, typeKey?: string | null, existing: string[] = []): string[] {
  const desc = (description ?? '').trim();
  const have = new Set(existing.map(norm));
  const out: string[] = [];
  const push = (s: string) => {
    const c = cleanItem(s);
    if (c.length < 3 || c.length > 90) return;
    const k = norm(c);
    if (have.has(k) || out.some((x) => norm(x) === k)) return;
    out.push(c);
  };

  // 1. Listas en la descripción (una por línea, con viñeta o número).
  const lines = desc.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^(?:[-*•·]|\d+[.)]|[a-z][.)]|\[ ?[xX ]?\])\s+/.test(l));
  if (bulletLines.length >= 2) bulletLines.forEach(push);
  else if (lines.length >= 3) lines.forEach(push);

  // 2. Rangos de ejercicios en el título o la descripción.
  splitRange(`${title} ${desc}`).forEach(push);

  // 3. Frases de la descripción (si no venía como lista).
  if (out.length < 2 && desc) {
    desc.split(/(?<=[.;])\s+|\n|,\s*(?=(?:luego|despues|y luego|y despues|ademas)\b)|\s+(?:luego|despues|y luego|y después|después)\s+/i)
      .map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 2).forEach(push);
    // "Incluir A, B y C" -> un paso por cada parte
    const inc = desc.match(/(?:incluir|incluye|con|debe tener|contener|agregar)\s+(.+)/i);
    if (out.length < 2 && inc) inc[1].split(/,\s*|\s+y\s+/).map((s) => s.trim()).filter((s) => s.length > 2).forEach((s) => push(s));
  }

  // 4. Pasos típicos según el tipo o las palabras del título.
  if (out.length < 3) {
    const hay = norm(`${typeKey ?? ''} ${title} ${desc}`);
    const tpl = TEMPLATES.find((t) => t.re.test(hay));
    if (tpl) tpl.steps.forEach(push);
  }
  if (out.length === 0) ['Entender qué se pide', 'Hacer un primer borrador', 'Revisar y entregar'].forEach(push);
  return out.slice(0, 8);
}
