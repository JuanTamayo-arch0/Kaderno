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

// ---------- Fase 2: anotar PDFs ----------
test('resaltados: rectángulos en proporciones de la página, líneas juntas', async () => {
  const { toPageRects, mergeLines } = await import('../lib/highlights');
  const page = { left: 100, top: 50, width: 600, height: 800 };
  const r = toPageRects([
    { left: 160, top: 130, width: 120, height: 16 },
    { left: 282, top: 131, width: 200, height: 15 },
    { left: 160, top: 150, width: 300, height: 16 },
    { left: 0, top: 0, width: 0.5, height: 10 },
    { left: 900, top: 130, width: 50, height: 16 },
  ], page);
  assert.equal(r.length, 2, 'dos líneas; fuera de la página y diminutos se quitan');
  assert.deepEqual(r[0], { x: 0.1, y: 0.1, w: 0.5367, h: 0.02 });
  assert.equal(r[1].y, 0.125);
  assert.deepEqual(toPageRects([{ left: 1, top: 1, width: 5, height: 5 }], { left: 0, top: 0, width: 0, height: 0 }), []);
  assert.equal(mergeLines([{ x: 0.1, y: 0.1, w: 0.1, h: 0.02 }, { x: 0.5, y: 0.1, w: 0.1, h: 0.02 }]).length, 2, 'lejos en la misma línea no se juntan');
});

test('citas de PDF: texto limpio, enlace a la página y vuelta', async () => {
  const { cleanPdfText, quoteMarkdown, fileLink, parseFileLink, sortHighlights, clampPage } = await import('../lib/highlights');
  assert.equal(cleanPdfText('la conser-\nvación de la\n energía  ­total'), 'la conservación de la energía total');
  assert.equal(cleanPdfText('Bogotá-\nMedellín'), 'Bogotá-Medellín', 'mayúscula después del guion no se une');
  const id = '11111111-2222-3333-4444-555555555555';
  assert.equal(fileLink('subject', id, 4), `kd-file:subject:${id}#p=4`);
  assert.deepEqual(parseFileLink(`kd-file:project:${id}#p=12`), { kind: 'project', id, page: 12 });
  assert.deepEqual(parseFileLink(`kd-file:subject:${id}`), { kind: 'subject', id, page: 1 });
  assert.equal(parseFileLink('kd-file:otro:x'), null);
  assert.equal(quoteMarkdown('La ley\nde Ohm', 'Guía [3].pdf', 'subject', id, 4, 'Sale en el parcial'),
    `> La ley de Ohm\n>\n> [Guía 3.pdf, pág. 4](kd-file:subject:${id}#p=4)\n\nSale en el parcial\n`);
  const s = sortHighlights([{ page: 2, rects: [{ x: 0, y: 0.5, w: 1, h: 0.1 }] }, { page: 1, rects: [{ x: 0, y: 0.9, w: 1, h: 0.1 }] }, { page: 2, rects: [{ x: 0, y: 0.1, w: 1, h: 0.1 }] }]);
  assert.deepEqual(s.map((h) => [h.page, h.rects[0].y]), [[1, 0.9], [2, 0.1], [2, 0.5]]);
  assert.equal(clampPage(0, 10), 1); assert.equal(clampPage(99, 10), 10); assert.equal(clampPage(NaN, 10), 1);
});

test('compartir y exportar quitan los enlaces a PDFs privados', async () => {
  const { noteForExport } = await import('../lib/noteLinks');
  assert.equal(noteForExport('N', '> cita\n>\n> [Guía.pdf, pág. 4](kd-file:subject:11111111-2222-3333-4444-555555555555#p=4)'), '# N\n\n> cita\n>\n> Guía.pdf, pág. 4\n');
});
