import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- Fase 1: grabar la clase ----------
test('transcripción: frases limpias, sin duplicar lo que repite Android', async () => {
  const { addSegment, cleanSentence, fmtClock, MAX_CHARS } = await import('../lib/classRec');
  assert.equal(cleanSentence('  hoy vemos  la ley de ohm '), 'Hoy vemos la ley de ohm.');
  assert.equal(cleanSentence('¿alguna pregunta?'), '¿alguna pregunta?');
  let s = addSegment([], 3.4, 'hoy vemos la ley');
  s = addSegment(s, 5, 'hoy vemos la ley de ohm');
  assert.deepEqual(s, [{ t: 3, text: 'Hoy vemos la ley de ohm.' }]);
  s = addSegment(s, 6, 'Hoy vemos la ley de Ohm.');
  assert.equal(s.length, 1);
  s = addSegment(s, 50, 'hoy vemos la ley de ohm otra vez');
  assert.equal(s.length, 2, 'después de 30 s ya no se reemplaza');
  assert.equal(addSegment(s, 60, '   ').length, 2);
  assert.equal(addSegment([{ t: 0, text: 'x'.repeat(MAX_CHARS) }], 9, 'más').length, 1, 'tope de caracteres');
  assert.equal(fmtClock(65), '1:05');
  assert.equal(fmtClock(3725), '1:02:05');
});

test('marcas: cada línea guarda el minuto en que se empezó a escribir', async () => {
  const { startMarks, updateMarks, marksList, noteLines, findMark, segmentAt, timeline } = await import('../lib/classRec');
  assert.deepEqual(noteLines('## Ohm\n\n- V = I R\n![](kd-img:a.png)\n```\ncodigo\n```\n---\n1. Resistencia'), ['Ohm', 'V = I R', 'Resistencia']);
  let md = '## Ley de Ohm';
  let m = startMarks(md);
  let next = '## Ley de Ohm\n\n- V = I';
  m = updateMarks(m, md, next, 120); md = next;
  next = '## Ley de Ohm\n\n- V = I R (voltaje)';
  m = updateMarks(m, md, next, 150); md = next;
  next = '## Ley de Ohm\n\n- V = I R (voltaje)\n- La resistencia depende del material';
  m = updateMarks(m, md, next, 600); md = next;
  const list = marksList(m);
  assert.deepEqual(list, [{ t: 120, line: 'V = I R (voltaje)' }, { t: 600, line: 'La resistencia depende del material' }], 'lo que ya estaba no cuenta y lo alargado conserva su minuto');
  assert.equal(findMark(list, 'resistencia depende')?.t, 600);
  assert.equal(findMark(list, 'V = I R (voltaje)\nLa resistencia depende del material')?.t, 120);
  assert.equal(findMark(list, 'nada que ver'), null);
  const segs = [{ t: 0, text: 'a' }, { t: 100, text: 'b' }, { t: 610, text: 'c' }];
  assert.equal(segmentAt(segs, 590), 1);
  assert.equal(segmentAt(segs, 700), 2);
  assert.deepEqual(timeline(segs, list).map((x) => x.kind), ['said', 'said', 'wrote', 'wrote', 'said']);
});

test('transcripción para la IA, búsqueda, resumen en la nota y tareas', async () => {
  const { transcriptText, searchSegments, summaryMarkdown, taskQuickText } = await import('../lib/classRec');
  const segs = [{ t: 0, text: 'Hoy vemos Ohm.' }, { t: 120, text: 'La resistencia se mide en ohmios.' }, { t: 400, text: 'Para el viernes el taller 3.' }];
  assert.equal(transcriptText(segs), '[0:00] Hoy vemos Ohm. La resistencia se mide en ohmios. [6:40] Para el viernes el taller 3.');
  assert.equal(transcriptText(segs, 20, false), 'Hoy vemos Ohm.');
  assert.deepEqual(searchSegments(segs, 'resistencia ohmios'), [1]);
  assert.deepEqual(searchSegments(segs, 'Ohm'), [0, 1]);
  assert.deepEqual(searchSegments(segs, ' '), []);
  const md = summaryMarkdown({ ideas: ['V = IR relaciona voltaje y corriente'], formulas: ['$V = IR$'], tasks: [{ title: 'Taller 3', when: 'el viernes' }], questions: [] }, '20 oct');
  assert.equal(md, '## Resumen de la clase (20 oct)\n\n- V = IR relaciona voltaje y corriente\n\n**Fórmulas**\n\n$$V = IR$$\n\n**Lo que dejó el profesor**\n\n- [ ] Taller 3 (el viernes)\n');
  assert.equal(taskQuickText({ title: 'Taller 3', when: 'el viernes' }), 'Taller 3 el viernes');
  assert.equal(taskQuickText({ title: 'Leer cap. 2', when: null }), 'Leer cap. 2');
});

test('resumen de clase de la IA: se valida lo que devuelve', async () => {
  const { parseClassSummary, classSummaryPrompt } = await import('../supabase/functions/_shared/classSummary');
  const ok = parseClassSummary('Aquí va: {"ideas":["Ohm","  Kirchhoff  "],"formulas":["V=IR"],"tasks":[{"title":"Taller 3","when":"viernes"},{"title":""}],"questions":["¿Qué es un ohmio?"]}');
  assert.deepEqual(ok, { ideas: ['Ohm', 'Kirchhoff'], formulas: ['V=IR'], tasks: [{ title: 'Taller 3', when: 'viernes' }], questions: ['¿Qué es un ohmio?'] });
  assert.equal(parseClassSummary('no hay json'), null);
  assert.equal(parseClassSummary('{"ideas":[],"formulas":[],"tasks":[]}'), null);
  assert.match(classSummaryPrompt('texto', '', 'Física'), /de Física/);
});

test('línea de tiempo: frases del mismo segundo en su orden', async () => {
  const { timeline } = await import('../lib/classRec');
  const t = timeline([{ t: 1, text: 'a' }, { t: 1, text: 'b' }, { t: 1, text: 'c' }], [{ t: 1, line: 'x' }]);
  assert.deepEqual(t.map((x) => x.text), ['a', 'b', 'c', 'x']);
});
