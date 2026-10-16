import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseImportText, normalizeRows, autoMap, importableTasks, computeFileDiff, toFilePayload,
  taskCode, titleKey, matchRows, findRepeated, DEFAULT_BOARD,
  type ExistingTask, type ProjectContext,
} from '../lib/import';

const ctx: ProjectContext = { members: [], columns: DEFAULT_BOARD };
const ex = (id: string, title: string, extra: Partial<ExistingTask> = {}): ExistingTask => ({
  id, title, description: null, status: 'todo', done: false, assignee_id: null, start_at: null, due_at: null, checklist: [], ...extra,
});

test('código al inicio del título', () => {
  assert.equal(taskCode('H-009 · Descubrimiento de activos'), 'H9');
  assert.equal(taskCode('HU12: Login'), 'HU12');
  assert.equal(taskCode('[RF-2] Reportes'), 'RF2');
  assert.equal(taskCode('T_3 - Algo'), 'T3');
  assert.equal(taskCode('Tarea 1 de cálculo'), null, 'palabras comunes no son código');
  assert.equal(taskCode('PARCIAL 2 repaso'), null);
  assert.equal(taskCode('Diseño de la app'), null);
  assert.equal(titleKey('H-009 · Descubrimiento de Activos'), titleKey('h 009 descubrimiento de activos'));
});

test('reimportar el plan sin ids ya no duplica (caso real: 9 con id y 59 sin id)', () => {
  // El tablero ya tiene las 68 tareas de una importación anterior.
  const existing: ExistingTask[] = [];
  for (let i = 1; i <= 68; i++) existing.push(ex(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, `H-${String(i).padStart(3, '0')} · Historia ${i}`));
  // El archivo nuevo: las 9 primeras con id, el resto sin id y con títulos levemente distintos.
  const tareas = existing.map((e, i) => i < 9
    ? { id: e.id, titulo: e.title, estado: 'Hecho' }
    : { titulo: `H-${String(i + 1).padStart(3, '0')} · Historia ${i + 1} (ajustada)`, estado: 'En revisión' });
  const p = parseImportText(JSON.stringify({ tareas }));
  const r = normalizeRows(p, autoMap(p.headers), ctx);
  const tasks = importableTasks(r.tasks, r.issues);
  const matches = matchRows(tasks, existing);
  assert.equal(matches.size, 59, 'las 59 sin id se reconocen por código');
  const diff = computeFileDiff(tasks, existing, ctx, { matches });
  assert.equal(diff.creates.length, 0, 'no se crea nada nuevo');
  assert.equal(diff.updates.length, 68);
  assert.ok(diff.updates.filter((u) => u.by === 'codigo').length === 59);
  const payload = toFilePayload(diff, 'todo');
  assert.ok(payload.every((row) => typeof row.id === 'string' && !!row.id), 'todas van como actualización con id');
});

test('omitir deja las reconocidas como están; reemplazar borra lo que falta', () => {
  const existing = [ex('a1', 'Marco teórico'), ex('a2', 'Diseño del circuito'), ex('a3', 'Tarea vieja')];
  const p = parseImportText(JSON.stringify({ tareas: [{ titulo: 'marco teorico', estado: 'Hecho' }, { titulo: 'Tarea nueva' }] }));
  const r = normalizeRows(p, autoMap(p.headers), ctx);
  const tasks = importableTasks(r.tasks, r.issues);
  const matches = matchRows(tasks, existing);
  assert.equal(matches.size, 1);
  const skip = computeFileDiff(tasks, existing, ctx, { matches, skipMatched: true });
  assert.deepEqual([skip.updates.length, skip.creates.length, skip.skippedMatches], [0, 1, 1]);
  const repl = computeFileDiff(tasks, existing, ctx, { matches, replaceBoard: true });
  assert.deepEqual(repl.deletes.map((d) => d.existing.id).sort(), ['a2', 'a3']);
  assert.equal(repl.deletes.every((d) => d.task === null), true);
  assert.equal(repl.creates.length, 1);
  const pay = toFilePayload(repl, 'todo');
  assert.equal(pay.filter((x) => x.delete).length, 2);
});

test('dos filas no reclaman la misma tarea', () => {
  const existing = [ex('a1', 'Marco teórico')];
  const p = parseImportText(JSON.stringify({ tareas: [{ titulo: 'Marco teórico' }, { titulo: 'Marco Teórico' }] }));
  const r = normalizeRows(p, autoMap(p.headers), ctx);
  const m = matchRows(importableTasks(r.tasks, r.issues), existing);
  assert.equal(m.size, 1);
});

test('quitar repetidas conserva la más trabajada', () => {
  const groups = findRepeated([
    ex('x1', 'H-009 · Catálogo', { position: 1 }),
    ex('x2', 'H-009 · Catálogo de activos', { position: 2, done: true, status: 'done', assignee_id: 'u1' }),
    ex('x3', 'H-009 · Catálogo', { position: 3, checklist: [{ text: 'a', done: true }] }),
    ex('y1', 'Informe', { position: 4 }),
    ex('y2', 'informe', { position: 5 }),
    ex('z1', 'Única', { position: 6 }),
  ]);
  assert.equal(groups.length, 2);
  const h9 = groups.find((g) => g.key === 'c:H9')!;
  assert.equal(h9.keep.id, 'x2');
  assert.deepEqual(h9.remove.map((t) => t.id).sort(), ['x1', 'x3']);
  const inf = groups.find((g) => g.key.startsWith('t:'))!;
  assert.equal(inf.keep.id, 'y1', 'si empatan, la que estaba primero');
});
