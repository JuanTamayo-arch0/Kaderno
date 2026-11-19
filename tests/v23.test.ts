import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- Fase 2: comentarios y menciones ----------
const PEOPLE = [{ user_id: 'ana', name: 'Ana María' }, { user_id: 'an', name: 'Ana' }, { user_id: 'luis', name: 'luis' }, { user_id: 'me', name: 'Juan José' }];

test('menciones: qué se busca después de la @', async () => {
  const { mentionQuery, mentionMatches, insertMention, mentionName } = await import('../lib/comments');
  assert.deepEqual(mentionQuery('Hola @an', 8), { start: 5, query: 'an' });
  assert.deepEqual(mentionQuery('@', 1), { start: 0, query: '' });
  assert.deepEqual(mentionQuery('Hola @Ana Ma', 12), { start: 5, query: 'Ana Ma' });
  assert.equal(mentionQuery('correo juan@upb', 15), null, 'una @ dentro de una palabra no es mención');
  assert.equal(mentionQuery('hola', 4), null);
  assert.deepEqual(mentionMatches(PEOPLE, 'ma', 'me').map((p) => p.user_id), ['ana'], 'por cualquier palabra del nombre');
  assert.deepEqual(mentionMatches(PEOPLE, 'án', 'me').map((p) => p.user_id), ['ana', 'an'], 'sin tildes');
  assert.deepEqual(mentionMatches(PEOPLE, '', 'me').map((p) => p.user_id), ['ana', 'an', 'luis'], 'sin mí');
  assert.deepEqual(insertMention('Hola @an ¿listo?', 5, 8, 'Ana María'), { text: 'Hola @Ana María ¿listo?', caret: 16 });
  assert.equal(mentionName({ display_name: '  ', email: 'luis@upb.edu.co' }), 'luis');
  assert.equal(mentionName(null), 'Integrante');
});

test('menciones: quién quedó en el texto y cómo se pinta', async () => {
  const { mentionsIn, commentParts, countByTask } = await import('../lib/comments');
  assert.deepEqual(mentionsIn('@Ana María y @luis, ¿ya?', PEOPLE), ['ana', 'luis'], '"@Ana María" no cuenta también a "@Ana"');
  assert.deepEqual(mentionsIn('@ana y @Ana María', PEOPLE), ['ana', 'an']);
  assert.deepEqual(mentionsIn('@Anabel no existe', PEOPLE), []);
  assert.deepEqual(mentionsIn('sin menciones', PEOPLE), []);
  assert.deepEqual(commentParts('Hola @Ana María, mira @Juan José', PEOPLE, 'me'), [
    { text: 'Hola ', mention: false }, { text: '@Ana María', mention: true, me: false }, { text: ', mira ', mention: false }, { text: '@Juan José', mention: true, me: true },
  ]);
  assert.deepEqual(commentParts('correo@ana.com', PEOPLE), [{ text: 'correo@ana.com', mention: false }], 'un correo no es mención');
  assert.deepEqual(mentionsIn('escribe a correo@ana.com', PEOPLE), []);
  assert.deepEqual(countByTask([{ task_id: 'a' }, { task_id: 'b' }, { task_id: 'a' }]), { a: 2, b: 1 });
});

// ---------- Fase 3: calendario del proyecto ----------
const tk = (id: string, due: string | null, start: string | null = null, extra: Partial<{ done: boolean; assignee_id: string | null }> = {}) =>
  ({ id, title: id.toUpperCase(), status: 'todo', done: false, assignee_id: 'ana', due_date: due, due_at: null, start_at: start ? new Date(start + 'T08:00:00').toISOString() : null, ...extra });

test('calendario: días, mes y tareas por día', async () => {
  const { spanOf, monthGrid, byDueDay, isoDay, dueDayOf } = await import('../lib/projectCalendar');
  assert.equal(isoDay(dueDayOf({ ...tk('a', '2026-11-20'), due_at: new Date(2026, 10, 20, 23, 59).toISOString() })!), '2026-11-20');
  assert.deepEqual(Object.values(spanOf(tk('a', '2026-11-20', '2026-11-16'))!).map(isoDay), ['2026-11-16', '2026-11-20']);
  assert.deepEqual(Object.values(spanOf(tk('a', '2026-11-20'))!).map(isoDay), ['2026-11-20', '2026-11-20'], 'sin inicio: solo el día de entrega');
  assert.deepEqual(Object.values(spanOf(tk('a', '2026-11-20', '2026-11-25'))!).map(isoDay), ['2026-11-20', '2026-11-20'], 'inicio después de la entrega');
  assert.deepEqual(Object.values(spanOf(tk('a', null, '2026-11-25'))!).map(isoDay), ['2026-11-25', '2026-11-25']);
  assert.equal(spanOf(tk('a', null)), null);
  const g = monthGrid(2026, 10);
  assert.equal(g.length, 6); assert.equal(isoDay(g[0][0]), '2026-10-26', 'empieza el lunes'); assert.equal(g[0][0].getDay(), 1);
  const by = byDueDay([tk('b', '2026-11-20'), { ...tk('a', '2026-11-20'), done: true }, tk('c', null)]);
  assert.deepEqual(Object.keys(by), ['2026-11-20']);
  assert.deepEqual(by['2026-11-20'].map((t) => t.id), ['b', 'a'], 'las hechas al final');
});

test('línea de tiempo: rango y barras recortadas', async () => {
  const { timelineRange, barOf, isoDay } = await import('../lib/projectCalendar');
  const today = new Date(2026, 10, 15, 10);
  const r = timelineRange([tk('a', '2026-11-30', '2026-11-10'), tk('b', '2026-12-20')], today);
  assert.equal(isoDay(r.from), '2026-11-09'); assert.equal(isoDay(r.to), '2026-12-22'); assert.equal(r.days, 44);
  assert.deepEqual(barOf(tk('a', '2026-11-30', '2026-11-10'), r.from, r.days), { left: 1, width: 21, clippedStart: false, clippedEnd: false });
  assert.equal(barOf(tk('x', null), r.from, r.days), null);
  const big = timelineRange([tk('a', '2027-12-01'), tk('b', '2025-01-01')], today, 120);
  assert.equal(big.days, 121, 'no pasa del máximo');
  assert.equal(isoDay(big.from), '2026-10-16', 'recorta alrededor de hoy');
  assert.deepEqual(barOf(tk('b', '2025-01-01'), big.from, big.days), null);
  assert.equal(barOf(tk('a', '2027-12-01', '2026-11-01'), big.from, big.days)!.clippedEnd, true);
});

test('cruces por persona y camino a la entrega final', async () => {
  const { clashes, roadToFinal, isoDay } = await import('../lib/projectCalendar');
  const tasks = [
    tk('a', '2026-11-20', '2026-11-16'), tk('b', '2026-11-19', '2026-11-18'), tk('c', '2026-11-21', '2026-11-19'),
    tk('d', '2026-11-19', '2026-11-18', { done: true }), tk('e', '2026-11-19', '2026-11-18', { assignee_id: 'luis' }),
    tk('f', '2026-11-25', null, { assignee_id: null }), tk('g', null),
  ];
  const c = clashes(tasks, 3);
  assert.equal(c.length, 1);
  assert.deepEqual([c[0].user_id, isoDay(c[0].from), isoDay(c[0].to), c[0].count], ['ana', '2026-11-19', '2026-11-19', 3]);
  assert.deepEqual(c[0].titles.sort(), ['A', 'B', 'C']);
  assert.equal(clashes(tasks, 3, new Date(2026, 10, 20)).length, 0, 'los días que ya pasaron no cuentan');
  const r = roadToFinal(tasks, new Date(2026, 10, 15, 9));
  assert.equal(r.final!.id, 'f'); assert.equal(r.daysLeft, 10); assert.equal(r.done, 1); assert.equal(r.total, 7);
  assert.equal(r.undated, 1); assert.equal(r.late, 0); assert.equal(r.thisWeek, 4); assert.equal(r.pace, 'tight', '6 pendientes en 7 días hábiles');
  assert.equal(roadToFinal(tasks, new Date(2026, 10, 15), 'a').final!.id, 'a', 'se puede elegir la entrega final');
  assert.equal(roadToFinal(tasks, new Date(2026, 10, 22)).pace, 'late', 'con tareas vencidas');
  assert.equal(roadToFinal([tk('x', '2027-03-01')], new Date(2026, 10, 15)).pace, 'ok');
  assert.equal(roadToFinal([], new Date()).pace, 'none');
});
