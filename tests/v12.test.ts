import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES } from '../lib/palettes';
import { contrast, derive } from '../lib/color';
import { parseQuickAdd, matchSubject } from '../lib/quickAdd';
import { sm2 } from '../lib/srs';
import { remindAt, inferChoice, remindDays } from '../lib/reminders';
import { bucketOf, fmtDue, dueMoment, combine, compareDue, isOverdue } from '../lib/time';

// ---------- Contraste de todos los temas ----------
test('todos los temas cumplen contraste 4.5 en los pares importantes', () => {
  for (const t of Object.values(THEMES)) {
    const p = derive(t.palette);
    const pairs: [string, string, string][] = [
      ['texto/fondo', p.text, p.bg], ['texto/tarjeta', p.text, p.surface], ['tenue/tarjeta', p.muted, p.surface],
      ['onBrand/marca', p.onBrand, p.brand], ['onBad/peligro', p.onBad, p.bad],
      ['verde texto', p.goodText, p.surface], ['amarillo texto', p.warnText, p.surface], ['rojo texto', p.badText, p.surface],
    ];
    for (const [name, a, b] of pairs) {
      const c = contrast(a, b);
      assert.ok(c >= 4.5, `${t.name}: ${name} = ${c.toFixed(2)}`);
    }
    // La marca como texto sobre la tarjeta (enlaces, pestaña activa) al menos 3 (texto en negrita).
    assert.ok(contrast(p.brand, p.surface) >= 3, `${t.name}: marca/tarjeta`);
  }
});

// ---------- Agregar con texto ----------
const subjects = [
  { id: 'calc', name: 'Cálculo II' }, { id: 'fis', name: 'Física Mecánica' },
  { id: 'cir', name: 'Circuitos II' }, { id: 'ing', name: 'Inglés IV' },
];
const types = [{ key: 'tarea', label: 'Tarea' }, { key: 'examen', label: 'Examen' }, { key: 'quiz', label: 'Quiz' }, { key: 'proyecto', label: 'Proyecto' }, { key: 'lab', label: 'Laboratorio' }];
// Jueves 15 de octubre de 2026, 10:00 am
const NOW = new Date(2026, 9, 15, 10, 0, 0);

test('parcial cálculo viernes 10am', () => {
  const r = parseQuickAdd('parcial cálculo viernes 10am', subjects, types, NOW);
  assert.equal(r.typeKey, 'examen');
  assert.equal(r.subjectId, 'calc');
  assert.equal(r.dueDate, '2026-10-16');
  assert.equal(r.dueTime, '10:00');
  assert.equal(r.title, 'Parcial cálculo');
});

test('informe física mañana 6 de la tarde', () => {
  const r = parseQuickAdd('informe física mañana 6 de la tarde', subjects, types, NOW);
  assert.equal(r.subjectId, 'fis');
  assert.equal(r.dueDate, '2026-10-16');
  assert.equal(r.dueTime, '18:00');
  assert.equal(r.title, 'Informe física');
  assert.equal(r.typeKey, null);
});

test('fechas numéricas, con mes y hashtag', () => {
  let r = parseQuickAdd('leer cap 9 #fisica 20/10', subjects, types, NOW);
  assert.equal(r.subjectId, 'fis'); assert.equal(r.dueDate, '2026-10-20'); assert.equal(r.title, 'Leer cap 9');
  r = parseQuickAdd('quiz inglés el 3 de noviembre a las 7', subjects, types, NOW);
  assert.equal(r.typeKey, 'quiz'); assert.equal(r.subjectId, 'ing'); assert.equal(r.dueDate, '2026-11-03'); assert.equal(r.dueTime, '19:00');
  r = parseQuickAdd('taller 2 oct', subjects, types, NOW); // ya pasó: año siguiente
  assert.equal(r.dueDate, '2027-10-02');
});

test('relativas: hoy, pasado mañana, en 3 días, próximo jueves', () => {
  assert.equal(parseQuickAdd('algo hoy', subjects, types, NOW).dueDate, '2026-10-15');
  assert.equal(parseQuickAdd('algo pasado mañana', subjects, types, NOW).dueDate, '2026-10-17');
  assert.equal(parseQuickAdd('algo en 3 días', subjects, types, NOW).dueDate, '2026-10-18');
  assert.equal(parseQuickAdd('algo el jueves', subjects, types, NOW).dueDate, '2026-10-15');
  assert.equal(parseQuickAdd('algo el próximo jueves', subjects, types, NOW).dueDate, '2026-10-22');
  assert.equal(parseQuickAdd('algo lunes', subjects, types, NOW).dueDate, '2026-10-19');
});

test('solo hora: hoy si no ha pasado, si no mañana; mediodía', () => {
  assert.deepEqual([parseQuickAdd('estudiar 3pm', subjects, types, NOW).dueDate, parseQuickAdd('estudiar 3pm', subjects, types, NOW).dueTime], ['2026-10-15', '15:00']);
  assert.equal(parseQuickAdd('estudiar 8am', subjects, types, NOW).dueDate, '2026-10-16');
  assert.equal(parseQuickAdd('entrega al mediodía', subjects, types, NOW).dueTime, '12:00');
  assert.equal(parseQuickAdd('reunión 12:30pm', subjects, types, NOW).dueTime, '12:30');
  assert.equal(parseQuickAdd('reunión 12am', subjects, types, NOW).dueTime, '00:00');
});

test('tipos propios, título vacío y texto sin nada que entender', () => {
  let r = parseQuickAdd('laboratorio circuitos', subjects, types, NOW);
  assert.equal(r.typeKey, 'lab'); assert.equal(r.subjectId, 'cir');
  r = parseQuickAdd('parcial #calculo viernes', subjects, types, NOW);
  assert.equal(r.title, 'Parcial');
  r = parseQuickAdd('Comprar cuaderno', subjects, types, NOW);
  assert.deepEqual(r, { title: 'Comprar cuaderno', typeKey: null, subjectId: null, dueDate: null, dueTime: null });
});

test('matchSubject no confunde palabras cortas', () => {
  assert.equal(matchSubject('de', subjects), null);
  assert.equal(matchSubject('calc', subjects)?.id, 'calc');
  assert.equal(matchSubject('mecanica', subjects)?.id, 'fis');
  assert.equal(matchSubject('historia', subjects), null);
});

// ---------- Repetición espaciada ----------
test('SM-2: intervalos crecen y "otra vez" reinicia', () => {
  const now = new Date(2026, 9, 15, 10);
  let c: any = { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 };
  const r1 = sm2(c, 2, now); assert.equal(r1.interval_days, 1); assert.equal(r1.due_date, '2026-10-16');
  const r2 = sm2(r1, 2, now); assert.equal(r2.interval_days, 6);
  const r3 = sm2(r2, 2, now); assert.ok(r3.interval_days >= 14 && r3.interval_days <= 16, String(r3.interval_days));
  const easy = sm2(r2, 3, now); assert.ok(easy.interval_days > r3.interval_days);
  const hard = sm2(r2, 1, now); assert.ok(hard.interval_days < r3.interval_days);
  const lapse = sm2(r3, 0, now);
  assert.equal(lapse.interval_days, 1); assert.equal(lapse.reps, 0); assert.equal(lapse.lapses, 1); assert.ok(lapse.ease < r3.ease);
  // Tarjeta vieja con solo caja 4: no vuelve a empezar de cero.
  const old = sm2({ box: 4 }, 2, now); assert.ok(old.interval_days >= 1);
  assert.ok(sm2({ ease: 1.3, interval_days: 10, reps: 5 }, 1, now).ease >= 1.3);
});

// ---------- Recordatorios ----------
test('remindAt calcula el momento del aviso', () => {
  const now = new Date(2026, 9, 15, 10);
  const at = (c: any, d: string, t: string | null) => remindAt(c, d, t, now)?.toString() ?? null;
  assert.equal(remindAt('1h', '2026-10-16', '10:00', now)?.getHours(), 9);
  assert.equal(remindAt('evening', '2026-10-17', null, now)?.getDate(), 16);
  assert.equal(remindAt('evening', '2026-10-17', null, now)?.getHours(), 20);
  assert.equal(remindAt('1d', '2026-10-17', null, now)?.getHours(), 9);
  assert.equal(at('at', '2026-10-17', null), null, 'a la hora necesita hora');
  assert.equal(at('2d', '2026-10-16', null), null, 'ya pasó');
  assert.equal(at('none', '2026-10-20', null), null);
  assert.equal(remindDays('2d'), 2);
  const r = remindAt('3h', '2026-10-20', '14:00', now)!;
  assert.equal(inferChoice(r.toISOString(), 0, '2026-10-20', '14:00'), '3h');
  assert.equal(inferChoice(null, 2, '2026-10-20', null), '2d');
  assert.equal(inferChoice(null, 0, '2026-10-20', null), 'none');
});

// ---------- Fechas de tareas ----------
test('bucketOf y fmtDue con y sin hora', () => {
  const now = new Date(2026, 9, 15, 15, 0); // jueves 3 pm
  assert.equal(bucketOf({ due_date: '2026-10-14' }, now), 'overdue');
  assert.equal(bucketOf({ due_date: '2026-10-15' }, now), 'today');
  assert.equal(bucketOf({ due_at: combine('2026-10-15', '10:00') }, now), 'overdue', 'hoy a las 10 ya pasó');
  assert.equal(bucketOf({ due_at: combine('2026-10-15', '18:00') }, now), 'today');
  assert.equal(bucketOf({ due_date: '2026-10-16' }, now), 'tomorrow');
  assert.equal(bucketOf({ due_date: '2026-10-18' }, now), 'week');
  assert.equal(bucketOf({ due_date: '2026-10-19' }, now), 'nextweek');
  assert.equal(bucketOf({ due_date: '2026-10-26' }, now), 'later');
  assert.equal(bucketOf({}, now), 'none');
  assert.equal(isOverdue({ due_date: '2026-10-14', status: 'done' }, now), false);
  assert.equal(fmtDue({ due_at: combine('2026-10-15', '18:00') }, now), 'Hoy, 6:00 pm');
  assert.equal(fmtDue({ due_date: '2026-10-16' }, now), 'Mañana');
  assert.equal(fmtDue({ due_date: '2026-10-17' }, now), 'sáb 17');
  assert.equal(fmtDue({ due_date: '2026-10-30' }, now), '30 oct');
  assert.equal(dueMoment({ due_date: '2026-10-16' })!.getHours(), 23);
  const list = [{ due_date: null }, { due_date: '2026-10-20' }, { due_at: combine('2026-10-20', '08:00') }];
  assert.deepEqual([...list].sort(compareDue).map((x: any) => x.due_at ? 'hora' : x.due_date ?? 'sin'), ['hora', '2026-10-20', 'sin']);
});

// ---------- Sílabo ----------
import { parseSyllabus } from '../lib/syllabus';
import { buildAgenda, nowAndNext } from '../lib/agenda';
import { semesterAverage, subjectAverage, neededFor } from '../lib/grades';

test('sílabo: formato del prompt con barras', () => {
  const txt = '20/10/2026 10:00 | Examen | Parcial 1 | Temas 1 a 4, 25%\n03/11/2026 | Tarea | Taller 3 |\n10/11/2026 | Proyecto | Entrega final | ';
  const r = parseSyllabus(txt, subjects, types, 'calc', NOW);
  assert.equal(r.length, 3);
  assert.deepEqual([r[0].title, r[0].typeKey, r[0].dueDate, r[0].dueTime, r[0].subjectId, r[0].description], ['Parcial 1', 'examen', '2026-10-20', '10:00', 'calc', 'Temas 1 a 4, 25%']);
  assert.deepEqual([r[1].title, r[1].typeKey, r[1].dueDate, r[1].dueTime], ['Taller 3', 'tarea', '2026-11-03', null]);
  assert.equal(r[2].typeKey, 'proyecto');
  assert.ok(r.every((x) => x.include));
});

test('sílabo: tabla con encabezado (Excel, tabuladores) y fecha pasada', () => {
  const txt = 'Actividad\tFecha\tHora\tTipo\tMateria\nQuiz 2\t2026-10-22\t7:00 am\tQuiz\tInglés\nLaboratorio 1\t01/10/2026\t\tLaboratorio\tFísica';
  const r = parseSyllabus(txt, subjects, types, null, NOW);
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].title, r[0].dueDate, r[0].dueTime, r[0].typeKey, r[0].subjectId], ['Quiz 2', '2026-10-22', '07:00', 'quiz', 'ing']);
  assert.equal(r[1].subjectId, 'fis');
  assert.equal(r[1].warning, 'La fecha ya pasó');
  assert.equal(r[1].include, false);
});

test('sílabo: texto libre, una entrega por línea', () => {
  const txt = 'Semana 5 (20/10): Parcial 1\n- Quiz de lectura 27/10\nExposición grupal 5 nov 8am\nPresentación sin fecha';
  const r = parseSyllabus(txt, subjects, types, 'ing', NOW);
  assert.equal(r.length, 4);
  assert.equal(r[0].dueDate, '2026-10-20'); assert.equal(r[0].typeKey, 'examen'); assert.equal(r[0].title, 'Parcial 1');
  assert.equal(r[1].typeKey, 'quiz'); assert.equal(r[1].dueDate, '2026-10-27');
  assert.equal(r[2].dueDate, '2026-11-05'); assert.equal(r[2].dueTime, '08:00');
  assert.equal(r[3].warning, 'Sin fecha'); assert.equal(r[3].subjectId, 'ing');
});

// ---------- Agenda ----------
test('agenda: une bloques seguidos y ordena entregas con hora', () => {
  const blocks = [{ id: 'a', start: '06:00', end: '08:00' }, { id: 'b', start: '08:00', end: '10:00' }, { id: 'c', start: '10:00', end: '12:00' }];
  const subs = [{ id: 'calc', name: 'Cálculo II', color: '#111111' }, { id: 'fis', name: 'Física', color: '#222222' }];
  const thursday = new Date(2026, 9, 15, 9, 0); // jueves = día 3
  const slots = [{ day: 3, slot: 0, subject_id: 'calc' }, { day: 3, slot: 1, subject_id: 'calc' }, { day: 3, slot: 2, subject_id: 'fis' }, { day: 2, slot: 0, subject_id: 'fis' }];
  const tasks = [
    { id: 't1', title: 'Quiz', due_at: new Date(2026, 9, 15, 10, 0).toISOString(), subject_id: 'fis' },
    { id: 't2', title: 'Informe', due_date: '2026-10-15', subject_id: 'calc' },
    { id: 't3', title: 'Hecha', due_date: '2026-10-15', status: 'done' },
    { id: 't4', title: 'Otro día', due_date: '2026-10-16' },
  ];
  const ag = buildAgenda(thursday, slots, blocks, subs, tasks);
  assert.deepEqual(ag.timed.map((x) => [x.kind, x.title, x.start, x.end]), [['class', 'Cálculo II', 360, 600], ['class', 'Física', 600, 720], ['due', 'Quiz', 600, null]]);
  assert.deepEqual(ag.allDay.map((t) => t.id), ['t2']);
  const nn = nowAndNext(thursday, slots, blocks, subs);
  assert.equal(nn.now?.title, 'Cálculo II'); assert.equal(nn.next?.title, 'Física');
});

// ---------- Promedios ----------
test('promedios por materia, por créditos y nota necesaria', () => {
  const g = [
    { subject_id: 'a', weight: 30, score: 4, max_score: 5 }, { subject_id: 'a', weight: 20, score: 80, max_score: 100 },
    { subject_id: 'a', weight: 50, score: null, max_score: 5 }, { subject_id: 'b', weight: 40, score: 3, max_score: 5 },
  ];
  assert.equal(subjectAverage(g.filter((x) => x.subject_id === 'a')).avg, 4);
  assert.equal(subjectAverage([]).avg, null);
  const sem = semesterAverage([{ id: 'a', name: 'A', credits: 3 }, { id: 'b', name: 'B', credits: 1 }, { id: 'c', name: 'C', credits: 4 }], g);
  assert.equal(sem.avg, (4 * 3 + 3 * 1) / 4);
  assert.equal(sem.rows.find((r) => r.id === 'c')?.avg, null);
  const need = neededFor(g.filter((x) => x.subject_id === 'a'), 3);
  assert.equal(need.remainingWeight, 50);
  assert.ok(Math.abs((need.needed ?? 0) - 2) < 1e-9);
});
