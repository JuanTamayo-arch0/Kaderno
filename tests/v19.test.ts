import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classDays, nextClass, nextEvaluation, groupTasks, sortNotes, filterNotes, notePreview, readingStats, outline,
  countdown, joinEs, minutesLabel,
} from '../lib/subjectInfo';
import { cleanLink } from '../lib/linkCheck';
import { noteToHtml } from '../lib/noteHtml';

const blocks = [
  { id: 'a', start: '07:00', end: '08:00' },
  { id: 'b', start: '08:00', end: '09:00' },
  { id: 'c', start: '14:00', end: '16:00' },
];
const S = 'fis';
const slots = [
  { day: 0, slot: 0, subject_id: S }, { day: 0, slot: 1, subject_id: S },   // lunes 7-9
  { day: 2, slot: 2, subject_id: S },                                      // miércoles 14-16
  { day: 1, slot: 0, subject_id: 'otra' },
];

test('días de clase en texto', () => {
  assert.equal(classDays(slots, S).label, 'Lun y Mié');
  assert.equal(joinEs(['Lun', 'Mié', 'Vie']), 'Lun, Mié y Vie');
  assert.equal(classDays(slots, 'nada').label, '');
});

test('próxima clase junta bloques seguidos y respeta la hora', () => {
  // Sábado 17 oct 2026, 15:30
  const sat = new Date(2026, 9, 17, 15, 30);
  const n = nextClass(slots, S, blocks, sat)!;
  assert.equal(n.day, 0);
  assert.equal(n.start.getDate(), 19);
  assert.equal(n.start.getHours(), 7);
  assert.equal(n.end.getHours(), 9);
  assert.equal(n.now, false);
  // Lunes 8:15: está en clase
  const mon = new Date(2026, 9, 19, 8, 15);
  const m = nextClass(slots, S, blocks, mon)!;
  assert.equal(m.now, true);
  // Lunes 10:00: la siguiente es el miércoles 14:00
  const w = nextClass(slots, S, blocks, new Date(2026, 9, 19, 10, 0))!;
  assert.equal(w.day, 2);
  assert.equal(w.start.getHours(), 14);
  // Bloque borrado del horario: no se rompe
  assert.equal(nextClass([{ day: 0, slot: 9, subject_id: S }], S, blocks, sat), null);
});

test('próxima evaluación con peso de la calificación', () => {
  const now = new Date(2026, 9, 17, 12);
  const tasks = [
    { id: '1', title: 'Informe 3', due_date: '2026-10-22', status: 'pending', type: 'tarea' },
    { id: '2', title: 'Parcial 3', due_date: '2026-10-30', status: 'pending', type: 'tarea' },
    { id: '3', title: 'Quiz viejo', due_date: '2026-10-01', status: 'pending', type: 'quiz' },
  ];
  const grades = [{ name: 'parcial 3', weight: 25, score: null }, { name: 'Parcial 1', weight: 15, score: 3 }];
  const e = nextEvaluation(tasks, grades, now)!;
  assert.equal(e.title, 'Parcial 3');
  assert.equal(e.weight, 25);
  assert.equal(countdown(e.due!, now), 'En 13 días');
  // Sin exámenes con fecha: la primera calificación pendiente
  const g = nextEvaluation([tasks[0]], grades, now)!;
  assert.deepEqual([g.title, g.due, g.weight], ['parcial 3', null, 25]);
  assert.equal(nextEvaluation([], [], now), null);
});

test('grupos de tareas', () => {
  const now = new Date(2026, 9, 17, 12);
  const g = groupTasks([
    { id: 'a', title: 'a', due_date: '2026-10-30' },
    { id: 'b', title: 'b', due_date: '2026-10-16' },
    { id: 'c', title: 'c', due_date: '2026-10-23' },
    { id: 'd', title: 'd' },
    { id: 'e', title: 'e', due_date: '2026-10-24' },
  ], now);
  assert.deepEqual(g.map((x) => [x.key, x.tasks.map((t) => t.id).join('')]), [['overdue', 'b'], ['week', 'c'], ['later', 'ea'], ['none', 'd']]);
});

test('notas: orden, búsqueda, vista previa, lectura e índice', () => {
  const notes = [
    { id: '1', title: 'Vieja', content: 'Aire comprimido', created_at: '2026-07-01T00:00:00Z' },
    { id: '2', title: 'Nueva', content: 'Ondas', created_at: '2026-07-02T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
    { id: '3', title: 'Fijada', content: 'Fórmulas', created_at: '2026-06-01T00:00:00Z', pinned: true },
  ];
  assert.deepEqual(sortNotes(notes).map((n) => n.id), ['3', '2', '1']);
  assert.deepEqual(filterNotes(notes, 'formulas').map((n) => n.id), ['3']);
  assert.deepEqual(filterNotes(notes, 'AIRE comp').map((n) => n.id), ['1']);
  assert.equal(filterNotes(notes, '  ').length, 3);
  assert.equal(notePreview('# Título\n\n**Negrita** y `code`\n- [ ] tarea\n$$x^2$$\n![](kd-img:1)'), 'Título Negrita y code tarea');
  assert.equal(notePreview('Ver $E = mc^2$ y cuesta $20 y $30'), 'Ver E = mc^2 y cuesta $20 y $30');
  assert.equal(readingStats('uno dos tres').words, 3);
  assert.equal(readingStats('').minutes, 1);
  assert.deepEqual(outline('# A\ntexto\n## B **x**\n```\n# no\n```\n### C\n#### D'), [
    { level: 1, text: 'A', index: 0 }, { level: 2, text: 'B x', index: 1 }, { level: 3, text: 'C', index: 2 },
  ]);
  assert.equal(minutesLabel(130), '2 h 10');
  assert.equal(minutesLabel(45), '45 min');
});

test('enlaces del aula virtual', () => {
  assert.equal(cleanLink('aula.upb.edu.co/curso'), 'https://aula.upb.edu.co/curso');
  assert.equal(cleanLink(' https://teams.microsoft.com/x '), 'https://teams.microsoft.com/x');
  assert.equal(cleanLink('javascript:alert(1)'), null);
  assert.equal(cleanLink('http://a b'), null);
  assert.equal(cleanLink(''), null);
});

test('PDF: la nota sale con formato, fórmulas, tablas e imágenes', async () => {
  const html = await noteToHtml('## Fuerza\n\n**FRL** y $F = P \\cdot A$, cuesta $20 y $30.\n\n$$\nx^2\n$$\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n![](kd-img:u/1.jpg)\n\n<script>alert(1)</script>',
    async (p) => `https://s.test/${p}`);
  assert.match(html, /<h2>Fuerza<\/h2>/);
  assert.match(html, /<strong>FRL<\/strong>/);
  assert.match(html, /class="katex"/);
  assert.match(html, /cuesta \$20 y \$30/);
  assert.match(html, /<div class="math">/);
  assert.match(html, /<table>/);
  assert.match(html, /src="https:\/\/s\.test\/u\/1\.jpg"/);
  assert.doesNotMatch(html, /<script>/);
});
