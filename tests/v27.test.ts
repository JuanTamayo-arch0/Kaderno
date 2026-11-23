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
