import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoMap, parseImportFile, parseImportText, normalizeRows, parseDateTime, formatForFile,
  formatHuman, parseChecklistCell, parsePastedChecklist, mergeChecklist, computeFileDiff,
  diffSummary, previewShift, buildAiPrompt, tasksToCsv, tasksToJson, encodeUtf8,
  toImportPayload, toFilePayload, importableTasks, findDuplicates, resolveAssignee, ImportError,
  type Member, type ExistingTask,
} from '../lib/import';

const members: Member[] = [
  { user_id: '11111111-1111-4111-8111-111111111111', email: 'ana@upb.edu.co', name: 'Ana Gómez', role: 'owner' },
  { user_id: '22222222-2222-4222-8222-222222222222', email: 'juan@upb.edu.co', name: 'Juan José Tamayo', role: 'editor' },
  { user_id: '33333333-3333-4333-8333-333333333333', email: 'juana@upb.edu.co', name: 'Juana Ríos', role: 'editor' },
  { user_id: '44444444-4444-4444-8444-444444444444', email: 'profe@upb.edu.co', name: 'Profe', role: 'viewer' },
];

function cp1252(s: string): Uint8Array {
  return Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
}

// ---------- Fechas ----------

test('fechas: formatos aceptados y hora de Bogotá', () => {
  const cases: [string, 'start' | 'due', string][] = [
    ['2026-10-15', 'due', '2026-10-16T04:59:00.000Z'],
    ['2026-10-15', 'start', '2026-10-15T05:00:00.000Z'],
    ['2026-10-15 14:30', 'due', '2026-10-15T19:30:00.000Z'],
    ['2026-10-15T14:30', 'due', '2026-10-15T19:30:00.000Z'],
    ['2026-10-15T14:30:00-05:00', 'due', '2026-10-15T19:30:00.000Z'],
    ['2026-10-15T19:30:00Z', 'due', '2026-10-15T19:30:00.000Z'],
    ['15/10/2026', 'due', '2026-10-16T04:59:00.000Z'],
    ['15/10/2026 14:30', 'due', '2026-10-15T19:30:00.000Z'],
    ['15/10/2026 2:30 pm', 'due', '2026-10-15T19:30:00.000Z'],
    ['15/10/2026 2:30 p. m.', 'due', '2026-10-15T19:30:00.000Z'],
    ['15/10/2026 2:30p.m.', 'due', '2026-10-15T19:30:00.000Z'],
    ['15/10/2026 12:00 a. m.', 'start', '2026-10-15T05:00:00.000Z'],
    ['15/10/2026 12:15 pm', 'start', '2026-10-15T17:15:00.000Z'],
    ['15/10/2026 6 pm', 'due', '2026-10-15T23:00:00.000Z'],
    ['15-10-26', 'start', '2026-10-15T05:00:00.000Z'],
    ['5/1/2027 8:05', 'start', '2027-01-05T13:05:00.000Z'],
    ['46310', 'start', '2026-10-15T05:00:00.000Z'],
  ];
  for (const [input, kind, iso] of cases) {
    const r = parseDateTime(input, kind);
    assert.ok(r.ok, `${input}: ${!r.ok ? r.error : ''}`);
    assert.equal(r.ok && r.iso, iso, input);
  }
});

test('fechas: rechaza fechas que no existen y horas inválidas', () => {
  for (const bad of ['31/02/2026', '2026-13-01', '15/10/2026 25:00', '15/10/2026 13:00 pm', 'mañana', '15/10/2026 14', '2026-10-15T14:61']) {
    const r = parseDateTime(bad, 'due');
    assert.equal(r.ok, false, bad);
  }
  assert.deepEqual(parseDateTime('', 'due'), { ok: true, iso: null });
  assert.deepEqual(parseDateTime(null, 'due'), { ok: true, iso: null });
});

test('fechas: formato de salida', () => {
  assert.equal(formatForFile('2026-10-15T19:30:00.000Z'), '2026-10-15 14:30');
  assert.equal(formatHuman('2026-10-30T23:00:00.000Z'), '30 oct · 6:00 p. m.');
  assert.equal(formatHuman('2026-10-15T05:00:00.000Z'), '15 oct · 12:00 a. m.');
});

// ---------- Checklist ----------

test('checklist: celda con | y marcas', () => {
  assert.deepEqual(parseChecklistCell('[x] Buscar fuentes | Resumir | [ ] Citar en APA'), [
    { text: 'Buscar fuentes', done: true },
    { text: 'Resumir', done: null },
    { text: 'Citar en APA', done: false },
  ]);
});

test('checklist: texto pegado de Notion, Keep o WhatsApp', () => {
  const pasted = '- [ ] Introducción\n- [x] Marco teórico\n* Resultados\n1. Conclusiones\n\n✓ Portada\n• Anexos';
  assert.deepEqual(parsePastedChecklist(pasted), [
    { text: 'Introducción', done: false },
    { text: 'Marco teórico', done: true },
    { text: 'Resultados', done: null },
    { text: 'Conclusiones', done: null },
    { text: 'Portada', done: true },
    { text: 'Anexos', done: null },
  ]);
});

test('checklist: al unir conserva lo hecho con el mismo texto', () => {
  const merged = mergeChecklist(
    [{ text: 'Introducción', done: true }, { text: 'Resultados', done: false }],
    [{ text: 'introduccion', done: null }, { text: 'Resultados', done: true }, { text: 'Anexos', done: null }],
  );
  assert.deepEqual(merged, [
    { text: 'introduccion', done: true },
    { text: 'Resultados', done: true },
    { text: 'Anexos', done: false },
  ]);
});

// ---------- Responsables ----------

test('responsables: correo, nombre, parte del correo y comienzo del nombre', () => {
  assert.deepEqual(resolveAssignee('ANA@upb.edu.co', members), { kind: 'found', user_id: members[0].user_id });
  assert.deepEqual(resolveAssignee('ana gomez', members), { kind: 'found', user_id: members[0].user_id });
  assert.deepEqual(resolveAssignee('juan', members), { kind: 'found', user_id: members[1].user_id }); // parte del correo
  assert.deepEqual(resolveAssignee('Juan José', members), { kind: 'found', user_id: members[1].user_id });
  assert.equal(resolveAssignee('Pedro', members).kind, 'unknown');
  assert.equal(resolveAssignee('', members).kind, 'none');
});

// ---------- CSV ----------

test('CSV de Excel en español: ; y Windows-1252', () => {
  const csv = 'Título;Descripción;Estado;Responsable;Inicio;Entrega;Checklist\r\n' +
    'Marco teórico;"Revisar 5 fuentes; mínimo 2 en inglés";En curso;ana@upb.edu.co;12/10/2026;15/10/2026 11:59 pm;[x] Buscar fuentes | Resumir\r\n' +
    'Diseño del circuito;;Por hacer;Juan;12/10/2026;18/10/2026 2:00 pm;Simular | Montar protoboard\r\n';
  const p = parseImportFile({ name: 'tareas.csv', bytes: cp1252(csv) });
  assert.equal(p.delimiter, ';');
  assert.equal(p.encoding, 'windows-1252');
  assert.equal(p.rows.length, 2);
  const map = autoMap(p.headers);
  assert.equal(map['Título'], 'title');
  assert.equal(map['Descripción'], 'description');
  const r = normalizeRows(p, map, members);
  assert.equal(r.issues.filter((i) => i.level === 'error').length, 0, JSON.stringify(r.issues));
  const [a, b] = r.tasks;
  assert.equal(a.title, 'Marco teórico');
  assert.equal(a.description, 'Revisar 5 fuentes; mínimo 2 en inglés');
  assert.equal(a.status, 'doing');
  assert.equal(a.assignee_id, members[0].user_id);
  assert.equal(a.due_at, '2026-10-16T04:59:00.000Z');
  assert.equal(a.checklist?.length, 2);
  assert.equal(b.assignee_id, members[1].user_id);
  assert.equal(b.due_at, '2026-10-18T19:00:00.000Z');
  assert.equal(r.mode, 'import');
});

test('CSV de Google Sheets: comas, UTF-8 con BOM y salto de línea dentro de una celda', () => {
  const csv = '﻿title,description,due,checklist\n"Informe, versión 1","Línea 1\nLínea 2",2026-10-20 18:00,"Intro\nResultados"\n\n';
  const p = parseImportFile({ name: 'export.csv', bytes: encodeUtf8(csv) });
  assert.equal(p.delimiter, ',');
  assert.equal(p.encoding, 'utf-8');
  const r = normalizeRows(p, autoMap(p.headers), members);
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].title, 'Informe, versión 1');
  assert.equal(r.tasks[0].description, 'Línea 1\nLínea 2');
  assert.deepEqual(r.tasks[0].checklist?.map((c) => c.text), ['Intro', 'Resultados']);
});

test('CSV: errores y avisos por fila', () => {
  const csv = 'titulo;estado;responsable;inicio;entrega\n' +
    ';Por hacer;;;\n' +                                   // fila 2: sin título
    'A;Lo que sea;Pedro;;\n' +                           // fila 3: estado y responsable desconocidos
    'B;;;20/10/2026;15/10/2026\n' +                      // fila 4: inicio después de entrega
    'C;;;;31/02/2026\n' +                                // fila 5: fecha que no existe
    'A;;;;\n';                                           // fila 6: repetida con la 3
  const p = parseImportText(csv);
  const r = normalizeRows(p, autoMap(p.headers), members);
  const errs = r.issues.filter((i) => i.level === 'error').map((i) => i.row);
  const warns = r.issues.filter((i) => i.level === 'warning').map((i) => i.row);
  assert.deepEqual(errs.sort(), [2, 4, 5]);
  assert.ok(warns.includes(3) && warns.includes(6));
  assert.equal(importableTasks(r.tasks, r.issues).length, 2);
});

test('CSV: el apóstrofo de protección contra fórmulas se quita al importar', () => {
  const p = parseImportText("titulo;descripcion\n'=Cálculo de pérdidas;'-dato\n");
  const r = normalizeRows(p, autoMap(p.headers), members);
  assert.equal(r.tasks[0].title, '=Cálculo de pérdidas');
  assert.equal(r.tasks[0].description, '-dato');
});

test('archivos inválidos dan mensajes claros', () => {
  assert.throws(() => parseImportFile({ name: 'x.csv', bytes: new Uint8Array() }), ImportError);
  assert.throws(() => parseImportText('titulo\n'), /solo tiene encabezados/);
  assert.throws(() => parseImportText('{"tareas": [ {"titulo": "a" '), /no es válido/);
  assert.throws(() => parseImportText('{"hola": 1}'), /lista de tareas/);
  const many = 'titulo\n' + Array.from({ length: 501 }, (_, i) => `T${i}`).join('\n');
  assert.throws(() => parseImportText(many), /Máximo 500/);
});

// ---------- JSON ----------

test('JSON de una IA envuelto en ```json y con texto alrededor', () => {
  const ai = 'Claro, aquí está:\n```json\n{"tareas": [{"titulo": "Investigar", "responsable": "juana@upb.edu.co", "inicio": "2026-10-12T08:00", "entrega": "2026-10-14T18:00", "checklist": [{"texto": "Fuentes", "hecho": false}, "Resumen"]}]}\n```\nAvísame si quieres cambios.';
  const p = parseImportText(ai);
  assert.equal(p.format, 'json');
  const r = normalizeRows(p, autoMap(p.headers), members);
  assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
  const t = r.tasks[0];
  assert.equal(t.assignee_id, members[2].user_id);
  assert.equal(t.start_at, '2026-10-12T13:00:00.000Z');
  assert.deepEqual(t.checklist, [{ text: 'Fuentes', done: false }, { text: 'Resumen', done: null }]);
  const payload = toImportPayload(r.tasks);
  assert.deepEqual(payload[0].checklist, [{ title: 'Fuentes', done: false }, { title: 'Resumen', done: false }]);
  assert.equal(payload[0].status, 'todo');
});

test('JSON con lista en la raíz y claves en inglés', () => {
  const p = parseImportText('[{"title": "A", "status": "done", "due": "2026-10-20"}]');
  const r = normalizeRows(p, autoMap(p.headers), members);
  assert.equal(r.tasks[0].status, 'done');
});

// ---------- Duplicados ----------

const existing: ExistingTask[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Marco teórico', description: null, status: 'doing',
    assignee_id: members[0].user_id, start_at: '2026-10-12T05:00:00.000Z', due_at: '2026-10-16T04:59:00.000Z',
    checklist: [{ text: 'Buscar fuentes', done: true }, { text: 'Resumir', done: false }],
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Montaje', description: 'Protoboard', status: 'todo',
    assignee_id: null, start_at: null, due_at: '2026-10-20T23:00:00.000Z', checklist: [],
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: '=SUMA(A1)', description: '+peligro', status: 'done',
    assignee_id: members[1].user_id, start_at: null, due_at: null, checklist: [],
  },
];

test('duplicados contra lo que ya existe en el proyecto', () => {
  const p = parseImportText('titulo;entrega\nmarco teorico;15/10/2026\nOtra;15/10/2026\n');
  const r = normalizeRows(p, autoMap(p.headers), members);
  const d = findDuplicates(r.tasks, existing);
  assert.equal(d.get(2), existing[0].id);
  assert.equal(d.has(3), false);
});

// ---------- Exportar y volver a subir ----------

test('exportar CSV: ; con BOM aparte, protección de fórmulas y vuelta completa', () => {
  const csv = tasksToCsv(existing, members);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'id;titulo;descripcion;estado;responsable;inicio;entrega;checklist');
  assert.ok(csv.includes("'=SUMA(A1)"));
  assert.ok(csv.includes("'+peligro"));
  assert.ok(csv.includes('[x] Buscar fuentes | Resumir'));
  // Volver a subir el mismo archivo no cambia nada.
  const p = parseImportText(csv);
  const r = normalizeRows(p, autoMap(p.headers), members);
  assert.equal(r.mode, 'update');
  assert.equal(r.issues.filter((i) => i.level === 'error').length, 0, JSON.stringify(r.issues));
  const diff = computeFileDiff(importableTasks(r.tasks, r.issues), existing, members);
  assert.equal(diff.updates.length, 0, JSON.stringify(diff.updates.map((u) => u.changes)));
  assert.equal(diff.unchanged, 3);
  assert.equal(diffSummary(diff), 'No hay cambios');
});

test('exportar JSON y volver a subir', () => {
  const json = tasksToJson(existing, members);
  const p = parseImportText(json);
  const r = normalizeRows(p, autoMap(p.headers), members);
  const diff = computeFileDiff(importableTasks(r.tasks, r.issues), existing, members);
  assert.equal(diff.updates.length, 0, JSON.stringify(diff.updates.map((u) => u.changes)));
});

test('actualizar por archivo: cambios, nuevas, borradas, ids ajenos y nada se borra por faltar', () => {
  const csv = 'id;titulo;estado;responsable;entrega;checklist;eliminar\n' +
    `${existing[0].id};Marco teórico;Hecho;juan@upb.edu.co;;Buscar fuentes | Resumir | Citar;\n` +
    `${existing[1].id};;;;;;sí\n` +
    ';Tarea nueva;;;25/10/2026 8:00 am;;\n' +
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd;Ajena;;;;;\n';
  // existing[2] no está en el archivo: no se toca.
  const p = parseImportText(csv);
  const r = normalizeRows(p, autoMap(p.headers), members);
  const diff = computeFileDiff(importableTasks(r.tasks, r.issues), existing, members);
  assert.equal(diff.updates.length, 1);
  const u = diff.updates[0];
  assert.deepEqual(u.changes.map((c) => c.field).sort(), ['assignee', 'checklist', 'status']);
  assert.deepEqual(u.checklist, [
    { text: 'Buscar fuentes', done: true }, // conserva lo hecho
    { text: 'Resumir', done: false },
    { text: 'Citar', done: false },
  ]);
  assert.equal(diff.deletes.length, 1);
  assert.equal(diff.creates.length, 1);
  assert.equal(diff.unknownIds.length, 1);
  assert.equal(diffSummary(diff), '1 cambia, 1 nueva, 1 se borra');
  const payload = toFilePayload(diff);
  assert.deepEqual(payload[0].fields?.sort(), ['assignee_id', 'checklist', 'status']);
  assert.equal(payload[0].title, undefined); // el título no cambió, no se envía
  assert.deepEqual(payload[2], { id: existing[1].id, delete: true });
});

test('actualizar por archivo: inicio después de la entrega combinando con lo existente', () => {
  const csv = `id;inicio\n${existing[0].id};20/10/2026\n`;
  const p = parseImportText(csv);
  const r = normalizeRows(p, autoMap(p.headers), members);
  const diff = computeFileDiff(importableTasks(r.tasks, r.issues), existing, members);
  assert.equal(diff.updates.length, 0);
  assert.equal(diff.issues[0].level, 'error');
});

// ---------- Correr fechas ----------

test('correr fechas: ambas conserva la duración, solo entrega puede quedar inválida', () => {
  const both = previewShift(existing, 7, 'ambas', '2026-10-25T23:00:00.000Z');
  assert.equal(both.items.length, 2);
  assert.equal(both.withoutDates, 1);
  const a = both.items.find((i) => i.id === existing[0].id)!;
  assert.equal(a.start_after, '2026-10-19T05:00:00.000Z');
  assert.equal(a.due_after, '2026-10-23T04:59:00.000Z');
  assert.equal(both.overDeadlineCount, 1); // Montaje pasa al 27
  assert.ok(both.summary.startsWith('2 tareas. La última entrega pasa del 20 oct al 27 oct'));

  const back = previewShift(existing, -5, 'entrega');
  const a2 = back.items.find((i) => i.id === existing[0].id)!;
  assert.equal(a2.start_after, existing[0].start_at);
  assert.equal(a2.invalid, true);
});

// ---------- Prompt ----------

test('prompt de IA con integrantes (sin viewers), materia y fechas', () => {
  const p = buildAiPrompt({
    projectName: 'Proyecto final', subjectName: 'Circuitos II', members,
    now: '2026-10-09T22:00:00.000Z', deadline: '2026-10-30T23:00:00.000Z',
  });
  assert.ok(p.includes('Proyecto: Proyecto final (Circuitos II)'));
  assert.ok(p.includes('Ana Gómez <ana@upb.edu.co>'));
  assert.ok(!p.includes('profe@upb.edu.co'));
  assert.ok(p.includes('Hoy es 09/10/2026. Entrega final: 2026-10-30 18:00'));
  // El formato pedido en el prompt lo entiende el importador.
  const sample = p.split('\n').find((l) => l.startsWith('{"tareas"'))!;
  const parsed = parseImportText(sample.replace(/"AAAA-MM-DDTHH:MM"/g, '"2026-10-12T08:00"').replace('correo de un integrante o vacío', 'ana@upb.edu.co').replace('"titulo": ""', '"titulo": "X"'));
  const r = normalizeRows(parsed, autoMap(parsed.headers), members);
  assert.equal(r.issues.filter((i) => i.level === 'error').length, 0, JSON.stringify(r.issues));
});

test('las plantillas se importan sin errores', async () => {
  const { readFileSync } = await import('node:fs');
  for (const name of ['plantilla_tareas.csv', 'plantilla_tareas.json']) {
    const p = parseImportFile({ name, bytes: new Uint8Array(readFileSync(`plantillas/${name}`)) });
    const r = normalizeRows(p, autoMap(p.headers), members);
    assert.equal(r.tasks.length, 4, name);
    assert.equal(r.issues.filter((i) => i.level === 'error').length, 0, name + JSON.stringify(r.issues));
    assert.equal(r.tasks[0].checklist?.length, 3, name);
    assert.equal(r.tasks[3].due_at, '2026-10-30T23:00:00.000Z', name);
  }
});
