
import { t } from './i18n';// ============================================================
//  Comentarios en tareas de proyecto (v23, fase 2). Puro, con pruebas:
//  @menciones mientras se escribe, cuáles quedaron en el texto y cómo
//  pintarlas.
// ============================================================

export type MentionPerson = { user_id: string; name: string };

const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Nombre para mencionar: el nombre visible o la parte del correo antes de la @. */
export function mentionName(p: { display_name?: string | null; email?: string | null } | null | undefined): string {
  const n = (p?.display_name ?? '').trim() || (p?.email ?? '').split('@')[0] || t('Integrante');
  return n.replace(/[@\n]/g, '').slice(0, 40);
}

/** Si el cursor está justo después de "@algo", qué se está buscando y dónde empieza. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = (text ?? '').slice(0, caret);
  const m = /(^|[\s(])@([\p{L}\p{N}._-]{0,30}(?: [\p{L}\p{N}._-]{0,30})?)$/u.exec(before);
  if (!m) return null;
  const start = before.length - m[2].length - 1;
  return { start, query: m[2] };
}

/** Personas que coinciden con lo escrito después de la @ (por cualquier palabra del nombre). */
export function mentionMatches(people: MentionPerson[], query: string, exclude?: string | null, max = 6): MentionPerson[] {
  const q = norm(query).trim();
  return people
    .filter((p) => p.user_id !== exclude)
    .filter((p) => !q || norm(p.name).split(/\s+/).some((w) => w.startsWith(q)) || norm(p.name).startsWith(q))
    .slice(0, max);
}

/** Cambia "@an" por "@Ana María " y devuelve el texto y la nueva posición del cursor. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const ins = `@${name} `;
  const out = text.slice(0, start) + ins + text.slice(caret).replace(/^ /, '');
  return { text: out, caret: start + ins.length };
}

/** Quiénes quedaron mencionados en el texto final (por "@Nombre" completo). */
export function mentionsIn(body: string, people: MentionPerson[]): string[] {
  const b = norm(body);
  const ids: string[] = [];
  // Los nombres largos primero, para que "@Ana María" no cuente también a "@Ana".
  const sorted = [...people].sort((a, z) => z.name.length - a.name.length);
  let rest = b;
  for (const p of sorted) {
    const tag = '@' + norm(p.name);
    const re = new RegExp('(?<![\\p{L}\\p{N}])' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'u');
    if (re.test(rest)) { ids.push(p.user_id); rest = rest.replace(re, ' '); }
  }
  return ids;
}

export type Part = { text: string; mention: boolean; me?: boolean };
/** El texto en pedazos para pintar las menciones (y resaltar las tuyas). */
export function commentParts(body: string, people: MentionPerson[], myId?: string | null): Part[] {
  const names = [...people].sort((a, z) => z.name.length - a.name.length);
  const out: Part[] = [];
  let i = 0, buf = '';
  const lower = norm(body);
  while (i < body.length) {
    if (body[i] === '@' && (i === 0 || !/[\p{L}\p{N}]/u.test(body[i - 1]))) {
      const hit = names.find((p) => lower.startsWith('@' + norm(p.name), i) && !/[\p{L}\p{N}]/u.test(body[i + p.name.length + 1] ?? ''));
      if (hit) {
        if (buf) { out.push({ text: buf, mention: false }); buf = ''; }
        out.push({ text: body.slice(i, i + hit.name.length + 1), mention: true, me: hit.user_id === myId });
        i += hit.name.length + 1;
        continue;
      }
    }
    buf += body[i]; i++;
  }
  if (buf) out.push({ text: buf, mention: false });
  return out;
}

/** Cuántos comentarios tiene cada tarea. */
export function countByTask(rows: { task_id: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.task_id] = (out[r.task_id] ?? 0) + 1;
  return out;
}
