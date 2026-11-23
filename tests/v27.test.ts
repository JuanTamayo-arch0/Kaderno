import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUrgent, isImportant, quadrantOf, byQuadrant, dropChange, weekBalance, balanceLine, quadrantInfo, cleanUrgentDays,
} from '../lib/eisenhower';

const TODAY = '2026-11-23';

test('matriz: urgente sale de la fecha y cambia con los días elegidos', () => {
  assert.equal(isUrgent({ due_date: '2026-11-20' }, TODAY), true, 'vencida');
  assert.equal(isUrgent({ due_date: '2026-11-25' }, TODAY, 2), true);
  assert.equal(isUrgent({ due_date: '2026-11-26' }, TODAY, 2), false);
  assert.equal(isUrgent({ due_date: '2026-11-26' }, TODAY, 3), true);
  assert.equal(isUrgent({ due_date: null }, TODAY), false, 'sin fecha no es urgente');
  assert.equal(isUrgent({ due_at: new Date(2026, 10, 24, 23, 59).toISOString() }, TODAY), true, 'con hora usa el día local');
  assert.deepEqual([cleanUrgentDays('3'), cleanUrgentDays(-1), cleanUrgentDays('x'), cleanUrgentDays(40)], [3, 2, 2, 2]);
});

test('matriz: importante es la estrella o la prioridad alta del proyecto', () => {
  assert.equal(isImportant({ important: true }), true);
  assert.equal(isImportant({ important: false }), false);
  assert.equal(isImportant({ priority: 'alta' }), true);
  assert.equal(isImportant({ priority: 'urgente' }), true);
  assert.equal(isImportant({ priority: 'normal' }), false);
});

test('matriz: cuatro cuadrantes, ordenados por fecha', () => {
  const t = (id: string, due: string | null, important: boolean) => ({ id, due_date: due, important });
  const r = byQuadrant([t('a', '2026-11-30', true), t('b', '2026-11-22', true), t('c', '2026-11-24', false), t('d', null, false), t('e', null, true), t('f', '2026-11-23', true)], TODAY);
  assert.deepEqual(r.hacer.map((x) => x.id), ['b', 'f']);
  assert.deepEqual(r.planear.map((x) => x.id), ['a', 'e'], 'sin fecha al final');
  assert.deepEqual(r.rapido.map((x) => x.id), ['c']);
  assert.deepEqual(r.soltar.map((x) => x.id), ['d']);
  assert.equal(quadrantOf({ due_date: '2026-11-23', priority: 'alta' }, TODAY), 'hacer');
});

test('matriz: soltar en otro cuadrante cambia la estrella y ofrece la fecha', () => {
  assert.deepEqual(dropChange('soltar', 'planear'), { important: true, offer: null });
  assert.deepEqual(dropChange('hacer', 'rapido'), { important: false, offer: null });
  assert.deepEqual(dropChange('planear', 'hacer'), { important: null, offer: 'hoy' });
  assert.deepEqual(dropChange('rapido', 'planear'), { important: true, offer: 'despues' });
  assert.deepEqual(dropChange('hacer', 'hacer'), { important: null, offer: null });
});

test('matriz: el tercer cuadrante es "Delegar" en Trabajo y "Hacer rápido" en Estudio', () => {
  assert.equal(quadrantInfo('rapido', true).title, 'Delegar');
  assert.equal(quadrantInfo('rapido', false).title, 'Hacer rápido');
  for (const q of ['hacer', 'planear', 'rapido', 'soltar'] as const) for (const w of [true, false]) {
    const i = quadrantInfo(q, w);
    assert.ok(!/—/.test(i.title + i.hint + i.empty));
  }
});

test('matriz: balance de la semana para el ritual del lunes', () => {
  const done = (due: string | null, important: boolean, at: string) => ({ status: 'done', due_date: due, important, completed_at: new Date(at + 'T15:00:00').toISOString() });
  const tasks = [
    done('2026-11-17', false, '2026-11-17'), done('2026-11-18', false, '2026-11-17'), done('2026-11-19', false, '2026-11-19'),
    done('2026-11-30', true, '2026-11-18'), done(null, false, '2026-11-20'), done('2026-11-10', true, '2026-11-10'),
    { status: 'pending', due_date: '2026-11-18', important: false, completed_at: null },
  ];
  const b = weekBalance(tasks, '2026-11-16');
  assert.equal(b.total, 5, 'solo lo terminado esa semana');
  assert.deepEqual(b.counts, { hacer: 0, planear: 1, rapido: 3, soltar: 1 });
  assert.equal(b.urgentOnlyPct, 60);
  assert.match(balanceLine(b, true)!, /60 %.*delegar/);
  assert.match(balanceLine(b, false)!, /estrella/);
  assert.equal(balanceLine(weekBalance(tasks.slice(0, 2), '2026-11-16'), false), null, 'con poco no dice nada');
});

test('matriz: la vista está en Hoy y la estrella en la tarea', async () => {
  const fs = await import('node:fs');
  const hoy = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
  assert.match(hoy, /k: 'matriz', label: 'Matriz'/);
  assert.match(hoy, /label: t\.important \? 'Quitar importante' : 'Marcar importante'/);
  const modal = fs.readFileSync('components/TaskModal.tsx', 'utf8');
  assert.match(modal, /accessibilityLabel="Importante"/);
  const sql = fs.readFileSync('supabase/schema_v26.sql', 'utf8');
  assert.match(sql, /add column if not exists important boolean not null default false/);
});

// ---------- Fase 2: la rana y la lista para mañana ----------
import { frogOf, suggestFrog, orderLoose, sizeOf, check135, ivyCandidates, togglePick } from '../lib/frog';
import { dayParts } from '../lib/day';

test('rana: se sugiere lo importante, largo y viejo; nunca una sesión de repaso', () => {
  const now = new Date('2026-11-23T08:00:00');
  const t = (id: string, o: any = {}) => ({ id, status: 'pending', created_at: '2026-11-22T10:00:00Z', ...o });
  const list = [t('corta'), t('larga', { estimate_min: 120 }), t('importante', { important: true, estimate_min: 20 }), t('sesion', { important: true, estimate_min: 200, parent_id: 'x' })];
  assert.equal(suggestFrog(list, now)?.id, 'importante');
  assert.equal(suggestFrog(list.filter((x) => x.id !== 'importante'), now)?.id, 'larga');
  assert.equal(suggestFrog([t('vieja', { created_at: '2026-11-01T00:00:00Z' }), t('nueva')], now)?.id, 'vieja');
  assert.equal(suggestFrog([], now), null);
  assert.equal(frogOf([t('a', { frog: true, plan_day: '2026-11-24' }), t('b', { frog: true, plan_day: '2026-11-23' })], '2026-11-23')?.id, 'b');
  assert.equal(frogOf([t('a', { frog: true, plan_day: '2026-11-23', status: 'done' })], '2026-11-23'), null);
});

test('mi día: la rana primero, luego la lista en orden; lo planeado sin hora ya no se pierde', () => {
  const D = '2026-11-24';
  const list = [{ id: 'x' }, { id: 'b', plan_day: D, plan_order: 2 }, { id: 'a', plan_day: D, plan_order: 1 }, { id: 'r', plan_day: D, plan_order: 3, frog: true }];
  assert.deepEqual(orderLoose(list, D).map((x) => x.id), ['r', 'a', 'b', 'x']);
  const parts = dayParts([{ id: 'm', status: 'pending', plan_day: D, due_date: '2026-11-30' }], D, '2026-11-23');
  assert.deepEqual(parts.loose.map((x) => x.id), ['m'], 'antes desaparecía de Mi día');
});

test('regla 1-3-5: tamaños por estimado y aviso solo si se pasa', () => {
  assert.deepEqual([sizeOf(120), sizeOf(90), sizeOf(30), sizeOf(15), sizeOf(null)], ['grande', 'mediana', 'mediana', 'pequena', 'mediana']);
  assert.equal(check135([{ estimate_min: 120 }, { estimate_min: 45 }, { estimate_min: 10 }]).text, null);
  const r = check135([{ estimate_min: 120 }, { estimate_min: 100 }, { estimate_min: 10 }]);
  assert.deepEqual(r.counts, { grande: 2, mediana: 0, pequena: 1 });
  assert.match(r.text!, /2 grandes, 0 medianas y 1 pequeña/);
});

test('ivy lee: candidatas con lo importante primero y lo ya elegido arriba; máximo 6', () => {
  const T = '2026-11-24';
  const c = ivyCandidates([
    { id: 'hecha', status: 'done' }, { id: 'bandeja', inbox: true }, { id: 'tarde', due_date: '2026-12-10' },
    { id: 'pronto', due_date: '2026-11-25' }, { id: 'estrella', important: true, due_date: '2026-12-20' }, { id: 'elegida', plan_day: T, plan_order: 1 },
  ], T);
  assert.deepEqual(c.map((x) => x.id), ['elegida', 'estrella', 'pronto', 'tarde']);
  let l: string[] = [];
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) l = togglePick(l, id).list;
  assert.deepEqual(togglePick(l, 'g'), { list: l, full: true });
  assert.deepEqual(togglePick(l, 'c').list, ['a', 'b', 'd', 'e', 'f']);
});

test('rana: la mascota la recuerda en la mañana, antes que las vencidas', async () => {
  const { react, initialBrain } = await import('../lib/pets/brain');
  const b = initialBrain();
  const ev = { type: 'abrir' as const, overdue: [{ id: 'v', title: 'Vencida', overdue: true }], today: [], hour: 8, frog: { id: 'r', title: 'Informe final' } };
  assert.match(react(ev, b, 'pinguino', 1e12, 0)?.say ?? '', /Informe final/);
  assert.match(react({ ...ev, hour: 15 }, b, 'pinguino', 1e12, 0)?.say ?? '', /vencida/i, 'en la tarde ya no');
});

// ---------- Fase 3: formas de enfocarse ----------
import { flowBreakMin, breakAfter, styleTimes, FLOW_CAP_MIN } from '../lib/focusStyle';

test('enfoque: Flujo da una pausa de un quinto, entre 5 y 20', () => {
  assert.deepEqual([flowBreakMin(10), flowBreakMin(40), flowBreakMin(62), flowBreakMin(90), flowBreakMin(200)], [5, 8, 12, 18, 20]);
});

test('enfoque: la pausa según la forma', () => {
  const s = { breakMin: 5, longBreakMin: 15 };
  assert.equal(breakAfter('pomodoro', 25, 1, s), 5);
  assert.equal(breakAfter('pomodoro', 25, 0, s), 15, 'la larga cada 4');
  assert.equal(breakAfter(undefined, 25, 0, s), 15, 'lo guardado antes de v27 es Pomodoro');
  assert.equal(breakAfter('52-17', 52, 0, s), 17, 'sin pausa larga');
  assert.equal(breakAfter('flujo', 47, 0, s), 9);
});

test('enfoque: tiempos de cada forma; Pomodoro vuelve a los tuyos', () => {
  const mine = { work: 40, brk: 8, long: 20 };
  assert.deepEqual(styleTimes('52-17', mine), { workMin: 52, breakMin: 17, longBreakMin: 17 });
  assert.equal(styleTimes('flujo', mine).workMin, FLOW_CAP_MIN);
  assert.deepEqual(styleTimes('pomodoro', mine), { workMin: 40, breakMin: 8, longBreakMin: 20 });
});

test('enfoque: el aviso del bloque que se pasa y la pausa en curso', async () => {
  const fs = await import('node:fs');
  const ft = fs.readFileSync('lib/focusTimer.ts', 'utf8');
  assert.match(ft, /now >= state\.blockEnd/);
  assert.match(ft, /BLOCK_SNOOZE_MS = 15 \* 60_000/);
  assert.match(ft, /s\.brkMin \?\? \(s\.cycle === 0/, 'el reloj de la pausa usa la pausa que tocó');
  const lay = fs.readFileSync('app/_layout.tsx', 'utf8');
  assert.match(lay, /Se acabó el bloque de/);
});
