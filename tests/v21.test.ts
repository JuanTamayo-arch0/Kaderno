import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepeat, nextDate, firstDate, ruleText, cleanRule } from '../lib/repeat';
import { parseQuickAdd } from '../lib/quickAdd';

// Hoy: lunes 19 de octubre de 2026.
const T = '2026-10-19';

test('repeticiones: texto en español a regla', () => {
  const r = (s: string) => parseRepeat(s, T);
  assert.deepEqual(r('lab de física cada martes'), { rule: { freq: 'week', interval: 1, days: [2] }, rest: 'lab de física' });
  assert.deepEqual(r('quiz de inglés cada viernes 8am')!.rule, { freq: 'week', interval: 1, days: [5] });
  assert.equal(r('quiz de inglés cada viernes 8am')!.rest, 'quiz de inglés 8am');
  assert.deepEqual(r('leer 20 páginas cada día')!.rule, { freq: 'day', interval: 1 });
  assert.deepEqual(r('gimnasio cada día hábil')!.rule, { freq: 'week', interval: 1, days: [1, 2, 3, 4, 5] });
  assert.deepEqual(r('reunión cada 2 semanas')!.rule, { freq: 'week', interval: 2 });
  assert.deepEqual(r('pagar cada mes el 15')!.rule, { freq: 'month', interval: 1, monthDay: 15 });
  assert.deepEqual(r('tutoría cada lunes y miércoles hasta el 5 dic')!.rule, { freq: 'week', interval: 1, days: [1, 3], until: '2026-12-05' });
  assert.deepEqual(r('regar cada! 3 días')!.rule, { freq: 'day', interval: 3, fromDone: true });
  assert.deepEqual(r('todos los viernes y sábados correr')!.rule, { freq: 'week', interval: 1, days: [5, 6] });
  assert.equal(r('todos los viernes y sábados correr')!.rest, 'correr');
  assert.deepEqual(r('leer diario hasta 20/11')!.rule, { freq: 'day', interval: 1, until: '2026-11-20' });
  assert.equal(r('parcial el martes'), null);
  assert.equal(r('cada uno lee su parte'), null);
});

test('repeticiones: siguiente fecha', () => {
  const tue = { freq: 'week', interval: 1, days: [2] } as const;
  assert.equal(nextDate({ ...tue, days: [2] }, '2026-10-20', '2026-10-20', '2026-10-20'), '2026-10-27');
  // Atrasada: no nace vencida.
  assert.equal(nextDate({ freq: 'week', interval: 1, days: [2] }, '2026-10-06', '2026-10-19', T), '2026-10-20');
  assert.equal(nextDate({ freq: 'day', interval: 1 }, '2026-10-15', '2026-10-19', T), '2026-10-19');
  // Días hábiles: del viernes al lunes.
  assert.equal(nextDate({ freq: 'week', interval: 1, days: [1, 2, 3, 4, 5] }, '2026-10-23', '2026-10-23', '2026-10-23'), '2026-10-26');
  // Cada 2 semanas los lunes y miércoles.
  const two = { freq: 'week', interval: 2, days: [1, 3] } as const;
  assert.equal(nextDate({ ...two, days: [1, 3] }, '2026-10-19', T, T), '2026-10-21');
  assert.equal(nextDate({ ...two, days: [1, 3] }, '2026-10-21', '2026-10-21', '2026-10-21'), '2026-11-02');
  // Fin de mes: el 31 cae en el último día.
  assert.equal(nextDate({ freq: 'month', interval: 1, monthDay: 31 }, '2027-01-31', '2027-01-31', '2027-01-31'), '2027-02-28');
  assert.equal(nextDate({ freq: 'month', interval: 1, monthDay: 31 }, '2027-02-28', '2027-02-28', '2027-02-28'), '2027-03-31');
  // Hasta: se acaba.
  assert.equal(nextDate({ freq: 'week', interval: 1, days: [1], until: '2026-10-30' }, '2026-10-26', '2026-10-26', '2026-10-26'), null);
  // Desde que la terminas.
  assert.equal(nextDate({ freq: 'day', interval: 3, fromDone: true }, '2026-10-10', '2026-10-19', T), '2026-10-22');
  assert.equal(nextDate({ freq: 'day', interval: 3 }, '2026-10-17', '2026-10-19', T), '2026-10-20');
});

test('repeticiones: primera fecha y texto', () => {
  assert.equal(firstDate({ freq: 'week', interval: 1, days: [2] }, T), '2026-10-20');
  assert.equal(firstDate({ freq: 'week', interval: 1, days: [1] }, T), '2026-10-19');
  assert.equal(firstDate({ freq: 'month', interval: 1, monthDay: 15 }, T), '2026-11-15');
  assert.equal(ruleText({ freq: 'week', interval: 1, days: [1, 3] }), 'cada lunes y miércoles');
  assert.equal(ruleText({ freq: 'week', interval: 1, days: [1, 2, 3, 4, 5] }), 'cada día hábil');
  assert.equal(ruleText({ freq: 'day', interval: 3, fromDone: true }), 'cada 3 días (desde que la terminas)');
  assert.equal(ruleText({ freq: 'month', interval: 1, monthDay: 15, until: '2026-12-05' }), 'cada mes el 15 hasta el 5 dic');
  assert.deepEqual(cleanRule({ freq: 'week', interval: '2', days: [9, 1, 1], until: 'x' }), { freq: 'week', interval: 2, days: [1] });
  assert.equal(cleanRule({ freq: 'year' }), null);
});

test('agregar rápido con repetición', () => {
  const now = new Date(2026, 9, 19, 9, 0);
  const subs = [{ id: 'f', name: 'Física Mecánica' }, { id: 'i', name: 'Inglés IV' }];
  const types = [{ key: 'tarea', label: 'Tarea' }, { key: 'quiz', label: 'Quiz' }];
  const a = parseQuickAdd('lab de física cada martes', subs, types, now);
  assert.deepEqual([a.title, a.subjectId, a.dueDate, a.repeat?.days], ['Lab de física', 'f', '2026-10-20', [2]]);
  const b = parseQuickAdd('quiz de inglés cada viernes 8am', subs, types, now);
  assert.deepEqual([b.typeKey, b.subjectId, b.dueDate, b.dueTime], ['quiz', 'i', '2026-10-23', '08:00']);
  const c = parseQuickAdd('leer 20 páginas cada día', subs, types, now);
  assert.deepEqual([c.title, c.dueDate, c.repeat?.freq], ['Leer 20 páginas', '2026-10-19', 'day']);
  const d = parseQuickAdd('repaso cada lunes 7am', subs, types, now); // ya pasó la hora de hoy
  assert.equal(d.dueDate, '2026-10-26');
  assert.ok(!parseQuickAdd('parcial física viernes', subs, types, now).repeat);
});

// ---------- Línea de tiempo, cierre, cuenta regresiva, bandeja ----------
test('línea de tiempo: carriles, horas libres y sobrecarga', async () => {
  const { layoutBlocks, freeMinutes, overloadText, taskMinutes, minuteAt, bandOf, fmtHours } = await import('../lib/day');
  const placed = layoutBlocks([{ id: 'a', start: 480, end: 600 }, { id: 'b', start: 540, end: 570 }, { id: 'c', start: 560, end: 620 }, { id: 'd', start: 700, end: 760 }]);
  const by = Object.fromEntries(placed.map((p) => [p.id, [p.lane, p.lanes]]));
  assert.deepEqual(by, { a: [0, 3], b: [1, 3], c: [2, 3], d: [0, 1] });
  assert.equal(freeMinutes(18 * 60, [{ start: 19 * 60, end: 20 * 60 }, { start: 19 * 60 + 30, end: 21 * 60 }]), 5 * 60 - 120);
  assert.equal(freeMinutes(23 * 60 + 10, []), 0);
  assert.equal(overloadText(7 * 60, 4 * 60), 'Planeaste 7 h y te quedan 4 h libres hoy.');
  assert.equal(overloadText(120, 300), null);
  assert.equal(taskMinutes(null), 30);
  assert.equal(taskMinutes(30, 1.6), 48);
  assert.equal(taskMinutes(30, 1.1), 30);
  assert.equal(minuteAt(150, 60), 6 * 60 + 150);
  assert.equal(minuteAt(-20, 60), 360);
  assert.equal(bandOf(13 * 60), 'tarde');
  assert.equal(fmtHours(270), '4 h 30');
});

test('partes del día, mover a mañana y cierre', async () => {
  const { dayParts, plannedMinutes, moveCandidates, leftovers, carryOver, shouldOfferClose } = await import('../lib/day');
  const at = (h: number, d = 19) => new Date(2026, 9, d, h).toISOString();
  const tasks = [
    { id: 'a', due_date: '2026-10-19', estimate_min: 60 },
    { id: 'b', due_date: '2026-10-25', plan_at: at(16), estimate_min: 90 },
    { id: 'c', due_date: '2026-10-22', plan_day: '2026-10-19', plan_band: 'noche' },
    { id: 'd', due_date: '2026-10-17' },
    { id: 'e', due_date: '2026-10-19', status: 'done' },
    { id: 'f', due_date: '2026-10-30', plan_at: at(10, 18) },
    { id: 'g', inbox: true },
  ];
  const p = dayParts(tasks, '2026-10-19', '2026-10-19');
  assert.deepEqual([p.timed.map((t) => t.id), p.banded.noche.map((t) => t.id), p.loose.map((t) => t.id)], [['b'], ['c'], ['a', 'd']]);
  assert.equal(plannedMinutes(tasks, '2026-10-19', '2026-10-19'), 60 + 90 + 30 + 30);
  assert.deepEqual(moveCandidates(tasks, '2026-10-19', '2026-10-19').map((t) => t.id), ['b', 'c']);
  assert.deepEqual(leftovers(tasks, '2026-10-19').map((t) => t.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(carryOver(tasks, '2026-10-19', '2026-10-18').map((t) => t.id), ['f']);
  assert.equal(shouldOfferClose(new Date(2026, 9, 19, 19), false), true);
  assert.equal(shouldOfferClose(new Date(2026, 9, 19, 15), false), false);
  assert.equal(shouldOfferClose(new Date(2026, 9, 19, 19), true), false);
});

test('cuenta regresiva y bandeja', async () => {
  const { examCountdown, goesToInbox } = await import('../lib/day');
  const c = examCountdown([
    { id: 'a', title: 'Parcial 3', type: 'examen', due_date: '2026-11-01' },
    { id: 'b', title: 'Quiz', type: 'quiz', due_date: '2026-10-20' },
    { id: 'c', title: 'Taller', type: 'tarea', due_date: '2026-10-20' },
    { id: 'd', title: 'Final', type: 'examen', due_date: '2026-12-30' },
  ], '2026-10-19');
  assert.deepEqual(c.map((x) => [x.title, x.label, x.tone]), [['Quiz', 'mañana', 'bad'], ['Parcial 3', '13 días', 'muted']]);
  assert.equal(goesToInbox({ dueDate: null, subjectId: null }), true);
  assert.equal(goesToInbox({ dueDate: null, subjectId: 'x' }), false);
});

// ---------- Notas conectadas ----------
const A = '11111111-2222-4333-8444-555555555555', B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
test('enlaces entre notas', async () => {
  const { extractLinks, refreshLinkTitles, linkMarkdown } = await import('../lib/noteLinks');
  const md = `Ver [Bernoulli](kd-note:${A}) y [Venturi](kd-note:${B}), otra vez [B](kd-note:${A}). [web](https://x.co)`;
  assert.deepEqual(extractLinks(md), [A, B]);
  assert.equal(refreshLinkTitles(md, { [A]: 'Ecuación de Bernoulli' }), `Ver [Ecuación de Bernoulli](kd-note:${A}) y [Venturi](kd-note:${B}), otra vez [Ecuación de Bernoulli](kd-note:${A}). [web](https://x.co)`);
  assert.equal(linkMarkdown(A, 'Leyes [1]'), `[Leyes 1](kd-note:${A})`);
});

test('tarjetas escritas en la nota', async () => {
  const { parseCardLines, diffNoteCards } = await import('../lib/noteLinks');
  const md = '# Tema\n- **Bernoulli** :: P + ½ρv² = constante\nTexto normal con ::raro\n```\na :: b\n```\nLa unidad {{FRL}} filtra el aire\n1. Caudal :: Q = A·v\n> cita :: no';
  const lines = parseCardLines(md);
  assert.deepEqual(lines.map((l) => [l.kind, l.front, l.back]), [['basic', 'Bernoulli', 'P + ½ρv² = constante'], ['cloze', 'La unidad {{FRL}} filtra el aire', ''], ['basic', 'Caudal', 'Q = A·v']]);
  const d = diffNoteCards(lines, [
    { id: 'c1', front: 'Bernoulli', back: 'P + ½ρv² = cte', note_line: '- **Bernoulli** :: P + ½ρv² = cte' },
    { id: 'c2', front: 'Caudal', back: 'Q = A·v', note_line: '1. Caudal :: Q = A·v' },
  ]);
  assert.deepEqual(d.create.map((c) => c.front), ['La unidad {{FRL}} filtra el aire']);
  assert.deepEqual(d.update.map((u) => [u.id, u.back]), [['c1', 'P + ½ρv² = constante']]);
});

test('plantillas y nota de clase', async () => {
  const { TEMPLATES, builtinTemplate, classNoteTitle } = await import('../lib/noteLinks');
  assert.deepEqual(TEMPLATES.map((t) => t.key), ['cornell', 'lab', 'capitulo', 'ejercicio']);
  assert.match(builtinTemplate('lab')!.content, /## Conclusiones/);
  assert.equal(builtinTemplate('x'), null);
  assert.equal(classNoteTitle(new Date(2026, 9, 23)), 'Clase del 23 oct');
});

// ---------- Tu calendario en Hoy ----------
test('leer un .ics: horas con zona, todo el día y repeticiones', async () => {
  const { parseIcs, safeCalendarUrl, zonedToUtc } = await import('../supabase/functions/_shared/icsParse');
  assert.equal(zonedToUtc(2026, 9, 19, 8, 0, 0, 'America/Bogota').toISOString(), '2026-10-19T13:00:00.000Z');
  const ics = [
    'BEGIN:VCALENDAR', 'X-WR-TIMEZONE:America/Bogota',
    'BEGIN:VEVENT', 'UID:a', 'DTSTART;TZID=America/Bogota:20261019T070000', 'DTEND;TZID=America/Bogota:20261019T080000', 'SUMMARY:Gimnasio', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'DTSTART:20261020T150000Z', 'DTEND:20261020T160000Z', 'SUMMARY:Turno\\, trabajo', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c', 'DTSTART;VALUE=DATE:20261021', 'DTEND;VALUE=DATE:20261022', 'SUMMARY:Cumpleaños', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:d', 'DTSTART;TZID=America/Bogota:20261005T180000', 'DTEND;TZID=America/Bogota:20261005T190000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z', 'EXDATE;TZID=America/Bogota:20261021T180000', 'SUMMARY:Inglés', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:e', 'DTSTART:20261019T200000Z', 'DTEND:20261019T210000Z', 'STATUS:CANCELLED', 'SUMMARY:No', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:f', 'DTSTART;TZID=America/Bogota:20261019T120000', 'DURATION:PT2H', 'SUMMARY:Almuerzo largo con una descripción que', ' sigue en otra línea', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const ev = parseIcs(ics, new Date('2026-10-19T00:00:00Z'), new Date('2026-10-27T00:00:00Z'));
  assert.deepEqual(ev.map((e) => [e.title, e.start, e.allDay]), [
    ['Gimnasio', '2026-10-19T12:00:00.000Z', false],
    ['Almuerzo largo con una descripción quesigue en otra línea', '2026-10-19T17:00:00.000Z', false],
    ['Inglés', '2026-10-19T23:00:00.000Z', false],
    ['Turno, trabajo', '2026-10-20T15:00:00.000Z', false],
    ['Cumpleaños', '2026-10-21T00:00:00.000Z', true],
    ['Inglés', '2026-10-26T23:00:00.000Z', false],
  ]);
  assert.equal(safeCalendarUrl('webcal://calendar.google.com/calendar/ical/x/basic.ics'), 'https://calendar.google.com/calendar/ical/x/basic.ics');
  assert.equal(safeCalendarUrl('http://example.com/a.ics'), null);
  assert.equal(safeCalendarUrl('https://192.168.1.10/a.ics'), null);
  assert.equal(safeCalendarUrl('https://localhost/a.ics'), null);
});

test('agenda con eventos de otros calendarios', async () => {
  const { buildAgenda } = await import('../lib/agenda');
  const day = new Date(2026, 9, 19, 12);
  const at = (h: number, m = 0, d = 19) => new Date(2026, 9, d, h, m).toISOString();
  const ev = [
    { id: 'a', title: 'Turno', start: at(15), end: at(17, 30), color: '#e5484d' },
    { id: 'b', title: 'Viaje', start: at(22, 0, 18), end: at(9) },
    { id: 'c', title: 'Cumpleaños', start: '2026-10-19T00:00:00.000Z', end: '2026-10-20T00:00:00.000Z', all_day: true },
    { id: 'd', title: 'Mañana', start: at(10, 0, 20), end: at(11, 0, 20) },
  ];
  const a = buildAgenda(day, [], [], [], [], ev);
  assert.deepEqual(a.timed.map((t) => [t.kind, t.title, t.start, t.end]), [['event', 'Viaje', 0, 540], ['event', 'Turno', 900, 1050]]);
  assert.equal(a.timed[1].color, '#e5484d');
  assert.deepEqual(a.allDay.map((t) => t.title), ['Cumpleaños']);
  assert.equal(buildAgenda(day, [], [], [], []).timed.length, 0);
});

test('compartir: copia sin imágenes privadas ni enlaces internos; enlaces seguros', async () => {
  const { noteForExport } = await import('../lib/noteLinks');
  const md = 'Ver [Derivadas](kd-note:11111111-2222-3333-4444-555555555555)\n\n![pizarra](kd-img:u/1.png)\n\n![](kd-img:u/2.png)';
  assert.equal(noteForExport('Límites', md), '# Límites\n\nVer Derivadas\n\n*(imagen: pizarra)*\n\n*(imagen)*\n');
  assert.equal(noteForExport('', ''), '# Nota\n\n\n');
  const { safeUrls } = await import('../lib/noteHtml');
  assert.equal(safeUrls('<a href="javascript:alert(1)">x</a>'), '<a href="#">x</a>');
  assert.equal(safeUrls('<a href="https://ok.co">x</a>'), '<a rel="noopener noreferrer nofollow" target="_blank" href="https://ok.co">x</a>');
  assert.equal(safeUrls('<img src="data:image/svg+xml,..." alt="">'), '<img src="" alt="">');
  assert.equal(safeUrls('<img src="https://s.co/a.png">'), '<img src="https://s.co/a.png">');
});
