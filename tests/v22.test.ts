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

// ---------- Fase 3: ¿Cómo te fue? ----------
const EX = { id: 'ex', title: 'Parcial 2', subject_id: 'fis', type: 'examen', due_date: '2026-10-19', due_at: null };
const at = (d: number, h = 15) => new Date(2026, 9, d, h).toISOString();

test('¿cómo te fue?: cuándo se pregunta', async () => {
  const { shouldAsk } = await import('../lib/examReview');
  assert.equal(shouldAsk(EX, new Date(2026, 9, 20, 9)), true);
  assert.equal(shouldAsk(EX, new Date(2026, 9, 19, 9)), false, 'el mismo día todavía no ha pasado (vence 11:59 pm)');
  assert.equal(shouldAsk({ ...EX, due_at: new Date(2026, 9, 19, 8).toISOString() }, new Date(2026, 9, 19, 12)), true, 'con hora: después de la hora');
  assert.equal(shouldAsk(EX, new Date(2026, 10, 15)), false, 'más de 3 semanas');
  assert.equal(shouldAsk({ ...EX, type: 'tarea' }, new Date(2026, 9, 20)), false);
  assert.equal(shouldAsk({ ...EX, deleted_at: '2026-10-20' } as any, new Date(2026, 9, 20)), false);
});

test('esfuerzo: horas, días, cuándo empezó, últimas 48 h, plan, tarjetas y simulacros', async () => {
  const { computeEffort } = await import('../lib/examReview');
  const e = computeEffort(EX, {
    focus: [
      { minutes: 50, created_at: at(5), subject_id: 'fis' },
      { minutes: 25, created_at: at(12), assignment_id: 's1' },
      { minutes: 60, created_at: at(18), assignment_id: 'ex', subject_id: 'fis' },
      { minutes: 90, created_at: at(19, 9), subject_id: 'fis' },
      { minutes: 40, created_at: at(18), subject_id: 'otra' },
      { minutes: 30, created_at: at(20), subject_id: 'fis' },
      { minutes: 30, created_at: new Date(2026, 8, 20).toISOString(), subject_id: 'fis' },
    ],
    sessions: [{ id: 's1', status: 'done' }, { id: 's2', status: 'pending' }],
    reviews: [at(10), at(15), at(25)],
    quizzes: [{ pct: 55, created_at: at(16) }, { pct: 72, created_at: at(17) }],
    recalls: [at(14)],
  });
  assert.deepEqual({ ...e, last48Share: Math.round(e.last48Share * 100) }, {
    minutes: 225, days: 4, firstDaysBefore: 14, last48Share: 67, sessionsDone: 1, sessionsTotal: 2, cardReviews: 2, quizzes: 2, bestQuiz: 72, lastQuiz: 72, recalls: 1,
  });
});

test('veredicto: alcanzó o no, y por qué', async () => {
  const { verdict, changeSuggestions, parseScore, chartPoints } = await import('../lib/examReview');
  const base = { minutes: 120, days: 1, firstDaysBefore: 1, last48Share: 1, sessionsDone: 0, sessionsTotal: 3, cardReviews: 0, quizzes: 0, bestQuiz: null, lastQuiz: null, recalls: 0 };
  const hist = [{ title: 'P1', focus_min: 600, score: 4.2, max_score: 5 }, { title: 'Q1', focus_min: 480, score: 4.0, max_score: 5 }, { title: 'Q2', focus_min: 60, score: 2.1, max_score: 5 }];
  const v = verdict(2.8, 5, 4.0, base, hist);
  assert.equal(v.reached, false);
  assert.equal(v.headline, 'El esfuerzo no alcanzó');
  assert.deepEqual(v.reasons.map((r) => r.key), ['late', 'cram', 'less', 'plan', 'nosim']);
  assert.match(v.reasons.find((r) => r.key === 'less')!.text, /2 h contra unas 9 h/);
  assert.equal(v.typicalGood, 540);
  assert.deepEqual(changeSuggestions(v.reasons, ['theory', 'nerves']), ['Empezar el plan del parcial 14 días antes', 'Repartir el estudio en varios días, no dejarlo para el final', 'Darle más horas, como en los parciales donde me fue bien', 'Hacer todas las sesiones del plan']);
  const good = verdict(4.5, 5, 4.0, { ...base, minutes: 600, days: 6, firstDaysBefore: 12, last48Share: 0.2, sessionsDone: 3, quizzes: 1, bestQuiz: 80, cardReviews: 40 }, hist);
  assert.equal(good.reached, true);
  assert.equal(good.headline, 'El esfuerzo alcanzó');
  assert.ok(good.reasons.every((r) => r.tone === 'good'));
  const effortOk = verdict(3.5, 5, 4.0, { ...base, minutes: 600, days: 6, firstDaysBefore: 12, last48Share: 0.2, sessionsDone: 3, quizzes: 1, bestQuiz: 75 }, hist);
  assert.equal(effortOk.headline, 'Le pusiste esfuerzo, pero no alcanzó');
  assert.equal(verdict(3.0, 5, null, base).targetPct, 60, 'sin meta: aprobar con 3,0');
  assert.deepEqual(parseScore('4,2'), { score: 4.2, max: 5 });
  assert.deepEqual(parseScore('38/50'), { score: 38, max: 50 });
  assert.equal(parseScore('6'), null);
  assert.equal(parseScore('51/50'), null);
  assert.equal(parseScore('abc'), null);
  assert.deepEqual(chartPoints([{ title: 'P1', focus_min: 120, score: 4, max_score: 5 }, { title: 'X', focus_min: 0, score: null, max_score: 5, skipped: true }], { focus_min: 60, pct: 50, title: 'P2' }),
    [{ x: 2, y: 80, title: 'P1', current: false }, { x: 1, y: 50, title: 'P2', current: true }]);
});

// ---------- Fase 4: Capturar nueva ----------
test('lectura de fotos: Markdown, dibujos válidos y texto sin JSON', async () => {
  const { parseOcr, cleanFigures, ocrPrompt } = await import('../supabase/functions/_shared/ocrMarkdown');
  const r = parseOcr('```json\n{"markdown":"# Ley de Ohm\\n\\n$$V = IR$$\\n\\n![circuito en serie](figura:1)\\n\\n![malo](figura:2)","figures":[{"id":1,"x":0.1,"y":0.5,"w":0.6,"h":0.3,"caption":"circuito [en] serie"},{"id":2,"x":0.9,"y":0.9,"w":0.5,"h":0.01}],"title":"Ley de Ohm"}\n```', 'notes');
  assert.equal(r.markdown, '# Ley de Ohm\n\n$$V = IR$$\n\n![circuito en serie](figura:1)');
  assert.deepEqual(r.figures, [{ id: 1, x: 0.1, y: 0.5, w: 0.6, h: 0.3, caption: 'circuito  en  serie' }]);
  assert.equal(r.title, 'Ley de Ohm');
  assert.deepEqual(parseOcr('Solo texto\nsin json', 'notes'), { markdown: 'Solo texto\nsin json', figures: [], title: null });
  assert.deepEqual(parseOcr('{"markdown": "x"}', 'plain').markdown, '{"markdown": "x"}', 'en modo texto no se interpreta');
  assert.deepEqual(cleanFigures([{ id: 1, x: 0.8, y: 0, w: 0.9, h: 0.5 }]).map((f) => f.w), [0.19999999999999996]);
  assert.equal(cleanFigures('x' as any).length, 0);
  assert.match(ocrPrompt('board'), /tablero o pizarra/);
  assert.match(ocrPrompt('notes'), /figura:N/);
});

test('capturar: materia de la clase de ahora, título, páginas con dibujos y pizarra', async () => {
  const { suggestSubject, suggestTitle, uncertainCount, mergePages, resolveFigures, boardMarkdown, firstLine } = await import('../lib/capture');
  const blocks = [{ id: 'b1', start: '07:00', end: '09:00' }, { id: 'b2', start: '09:00', end: '11:00' }];
  const subs = [{ id: 'cal', name: 'Cálculo', color: '#000' }, { id: 'fis', name: 'Física', color: '#111' }];
  const slots = [{ day: 1, slot: 1, subject_id: 'fis' }];
  assert.equal(suggestSubject(new Date(2026, 9, 20, 10, 15), slots, blocks, subs, 'cal'), 'fis', 'martes en clase de física');
  assert.equal(suggestSubject(new Date(2026, 9, 20, 11, 15), slots, blocks, subs, 'cal'), 'fis', 'hasta 20 min después de la clase');
  assert.equal(suggestSubject(new Date(2026, 9, 20, 15, 0), slots, blocks, subs, 'cal'), 'cal', 'sin clase: la última usada');
  assert.equal(suggestSubject(new Date(2026, 9, 20, 15, 0), slots, blocks, subs, 'otra'), 'cal');
  assert.equal(suggestTitle('texto\n## Ley de **Ohm** [?]\n', new Date(2026, 9, 20)), 'Ley de Ohm');
  assert.equal(suggestTitle('sin títulos', new Date(2026, 9, 20)), 'Clase del 20 oct');
  assert.equal(suggestTitle('# A', new Date(), 'Del modelo'), 'Del modelo');
  assert.equal(uncertainCount('la ley [?] de [?] Ohm'), 2);
  const m = mergePages([
    { markdown: 'Pág 1 ![a](figura:1)', figures: [{ id: 1, x: 0, y: 0, w: 0.5, h: 0.5, caption: 'a' }] },
    { markdown: '', figures: [] },
    { markdown: 'Pág 3 ![b](figura:1) ![c](figura:2)', figures: [{ id: 1, x: 0, y: 0, w: 0.5, h: 0.5, caption: 'b' }] },
  ]);
  assert.equal(m.markdown, 'Pág 1 ![a](figura:p1f1)\n\nPág 3 ![b](figura:p3f1) ![c](figura:2)');
  assert.deepEqual(m.figures.map((f) => [f.page, f.key]), [[0, 'p1f1'], [2, 'p3f1']]);
  assert.equal(resolveFigures(m.markdown, { p1f1: 'u/1.jpg' }), 'Pág 1 ![a](kd-img:u/1.jpg)\n\nPág 3');
  assert.equal(boardMarkdown(['u/a.jpg', 'u/b.jpg'], ['F = ma ![x](figura:1)', ''], true), '![Pizarra 1](kd-img:u/a.jpg)\n\nF = ma\n\n![Pizarra 2](kd-img:u/b.jpg)');
  assert.equal(boardMarkdown(['u/a.jpg'], ['texto'], false), '![Pizarra](kd-img:u/a.jpg)');
  assert.equal(firstLine('\n# Taller 3: **circuitos**\nResolver...'), 'Taller 3: circuitos');
});

test('foto: recorte dentro de la imagen y modo escáner', async () => {
  const { clampCrop, scanFilter } = await import('../lib/capture');
  assert.deepEqual(clampCrop({ x: -0.2, y: 0.5, w: 2, h: 0.01 }), { x: 0, y: 0.5, w: 1, h: 0.08 });
  assert.deepEqual(Object.values(clampCrop({ x: 0.99, y: 0.99, w: 0.5, h: 0.5 })).map((v) => Math.round(v * 100) / 100), [0.92, 0.92, 0.08, 0.08]);
  // Papel grisáceo (~220) con manchas (196) y trazo (50): papel y manchas blancos, trazo negro.
  const px: number[] = [];
  for (let i = 0; i < 1000; i++) { const v = i < 10 ? 50 : i % 97 === 0 ? 196 : 218 + (i % 5); px.push(v, v, v, 255); }
  scanFilter(px, 100, 10);
  assert.equal(px[0], 0, 'trazo negro');
  assert.equal(px[500 * 4], 255, 'papel blanco');
  assert.ok(px[97 * 2 * 4] >= 250, 'una mancha apenas más oscura que el papel no se vuelve negra');
  assert.equal(px[3], 255, 'no toca la transparencia');
  // Tablero oscuro (40) con tiza clara (230): queda tiza oscura sobre blanco.
  const b: number[] = [];
  for (let i = 0; i < 1000; i++) { const v = i < 10 ? 230 : 40; b.push(v, v, v, 255); }
  scanFilter(b, 100, 10);
  assert.equal(b[0], 0, 'tiza oscura');
  assert.equal(b[500 * 4], 255, 'fondo blanco');
});

test('PDF: texto de una página con sus saltos de línea', async () => {
  const { textOf } = await import('../lib/captureImage');
  assert.equal(textOf([
    { str: 'Guía 3', transform: [0, 0, 0, 0, 72, 720] }, { str: '', hasEOL: true, transform: [0, 0, 0, 0, 72, 720] },
    { str: 'La ley de ', transform: [0, 0, 0, 0, 72, 700] }, { str: 'Ohm', transform: [0, 0, 0, 0, 130, 700] },
    { str: 'Otra línea', transform: [0, 0, 0, 0, 72, 680] },
  ]), 'Guía 3\nLa ley de Ohm\nOtra línea');
});
