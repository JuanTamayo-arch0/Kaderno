import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { t, tc, tp, fill, deviceLang, cleanLang, locale, weekdayNames, monthNames, _setLangForTests, I18N_READY } from '../lib/i18n';
import { EN } from '../lib/i18n/en';
import { check } from '../scripts/i18n-check';
import { wrapPath } from '../scripts/i18n-wrap';
import { looksSpanish, isHumanText, jsxTextValue } from '../scripts/i18nRules';

test('v30 idiomas: t, variables, contexto y plurales', () => {
  _setLangForTests('es');
  assert.equal(t('Nueva tarea'), 'Nueva tarea');
  assert.equal(t('Hola, {name}', { name: 'Ana' }), 'Hola, Ana');
  assert.equal(fill('Faltan {n} de {total}', { n: 2 }), 'Faltan 2 de {total}', 'una variable que no llega se deja');
  assert.equal(fill('Marca con {{ }}'), 'Marca con {{ }}');
  assert.equal(tp(1, '{n} tarea', '{n} tareas'), '1 tarea');
  assert.equal(tp(3, '{n} tarea', '{n} tareas'), '3 tareas');
  assert.equal(locale(), 'es-CO');
  _setLangForTests('en');
  assert.equal(locale(), 'en-US');
  assert.equal(t('Texto que no existe en el diccionario'), 'Texto que no existe en el diccionario', 'sin traducción queda en español');
  if (EN['Mar']) assert.notEqual(tc('sonido', 'Mar'), t('Mar'), 'el día y el sonido del mar no se confunden');
  assert.equal(weekdayNames('short')[0], 'Mon');
  assert.equal(monthNames('long')[0], 'January');
  _setLangForTests('es');
  assert.equal(weekdayNames('long')[0], 'Lunes');
  assert.equal(monthNames('long')[10], 'Noviembre');
});

test('v30 idiomas: el idioma del dispositivo y valores guardados', () => {
  assert.equal(deviceLang(['en-US', 'es-CO']), 'en');
  assert.equal(deviceLang(['es-CO', 'en-US']), 'es');
  assert.equal(deviceLang(['pt-BR']), 'es', 'otro idioma abre en español');
  assert.equal(deviceLang([]), 'es');
  assert.equal(cleanLang('en'), 'en');
  assert.equal(cleanLang('fr'), null);
});

test('v30 idiomas: el script envuelve lo seguro y respeta las variables locales llamadas t', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-i18n-'));
  const f = path.join(dir, 'Prueba.tsx');
  fs.writeFileSync(f, [
    "import React from 'react';",
    "export function P({ n, tasks }: { n: number; tasks: { title: string }[] }) {",
    "  const s = supabase.from('assignments').select('*');",
    "  if (x === 'Hoy') return null;",
    "  return (<View>",
    "    <Text>Nueva tarea</Text>",
    "    <Text>{n} pendientes</Text>",
    "    <Button label=\"Guardar\" icon=\"add\" />",
    "    {tasks.map((t) => <Text key={t.title} accessibilityLabel={`Abrir ${t.title}`}>x</Text>)}",
    "  </View>);",
    "}",
  ].join('\n'));
  wrapPath(f, false);
  const out = fs.readFileSync(f, 'utf8');
  assert.match(out, /\{t\('Nueva tarea'\)\}/);
  assert.match(out, /\{t\('\{n\} pendientes', \{ n \}\)\}/, 'texto y valores en un solo t()');
  assert.match(out, /label=\{t\('Guardar'\)\} icon="add"/, 'el ícono no se toca');
  assert.match(out, /accessibilityLabel=\{trn\('Abrir \{title\}', \{ title: t\.title \}\)\}/, 'donde t es una tarea se usa trn');
  assert.match(out, /select\('\*'\)/);
  assert.match(out, /x === 'Hoy'/, 'las comparaciones no se tocan');
  assert.match(out, /import \{ t, trn \} from '[.\/\w-]*lib\/i18n';/, 'agrega el import');
});

test('v30 idiomas: reglas para reconocer texto en español', () => {
  assert.equal(looksSpanish('Nueva tarea'), true);
  assert.equal(looksSpanish('Cálculo II'), true);
  assert.equal(looksSpanish('assignments'), false);
  assert.equal(looksSpanish('x y'), false, 'una "y" sola no basta');
  assert.equal(isHumanText('kd-lang'), false);
  assert.equal(isHumanText('<rect x="1"/>'), false, 'el HTML se traduce a mano');
  assert.equal(jsxTextValue('\n      Hola\n      mundo\n    '), 'Hola mundo');
  assert.equal(jsxTextValue(' pendientes'), ' pendientes');
});

test('v30 idiomas: no queda texto en español sin envolver y las traducciones conservan las variables', () => {
  const rep = check();
  assert.deepEqual(rep.unwrapped.slice(0, 5), [], 'textos sin envolver');
  assert.deepEqual(rep.broken.slice(0, 5), [], 'traducciones que pierden variables o espacios');
  if (I18N_READY) assert.deepEqual(rep.missing.slice(0, 5), [], 'con el inglés prendido no puede faltar nada');
  assert.ok(rep.keys.size > 3000);
});

test('v30 idiomas: fechas con el idioma de la app y el selector', () => {
  for (const f of ['app/horas.tsx', 'app/mascota.tsx', 'components/TaskModal.tsx', 'lib/pets/economy.ts']) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /'es-CO'/, f);
  }
  assert.match(fs.readFileSync('app/ajustes.tsx', 'utf8'), /<LangPicker \/>/);
  assert.match(fs.readFileSync('app/login.tsx', 'utf8'), /<LangPicker compact onDark=\{!wide\} \/>/);
  assert.match(fs.readFileSync('app/_layout.tsx', 'utf8'), /syncCloudLang\(remote\)/);
});

test('v30 idiomas: agregar con texto en inglés', async () => {
  const { parseQuickAdd } = await import('../lib/quickAdd');
  const { parseRepeat } = await import('../lib/repeat');
  const subjects = [{ id: 'calc', name: 'Calculus II' }, { id: 'phys', name: 'Physics' }];
  const types = [{ key: 'tarea', label: 'Task' }, { key: 'examen', label: 'Exam' }, { key: 'quiz', label: 'Quiz' }];
  const now = new Date(2026, 10, 23, 9, 0); // lunes 23 nov 2026, 9:00
  _setLangForTests('en');
  try {
    let r = parseQuickAdd('calculus exam friday 10am', subjects, types, now);
    assert.deepEqual([r.typeKey, r.subjectId, r.dueDate, r.dueTime], ['examen', 'calc', '2026-11-27', '10:00']);
    r = parseQuickAdd('physics report on 12/3', subjects, types, now);
    assert.equal(r.dueDate, '2026-12-03', 'mes/día como en EE. UU.');
    assert.equal(r.title, 'Physics report');
    r = parseQuickAdd('read chapter 9 tomorrow at 6', subjects, types, now);
    assert.deepEqual([r.dueDate, r.dueTime, r.title], ['2026-11-24', '18:00', 'Read chapter 9']);
    assert.equal(parseQuickAdd('essay day after tomorrow', subjects, types, now).dueDate, '2026-11-25');
    assert.equal(parseQuickAdd('lab next week', subjects, types, now).dueDate, '2026-11-30');
    assert.equal(parseQuickAdd('quiz in 3 days', subjects, types, now).dueDate, '2026-11-26');
    assert.equal(parseQuickAdd('presentation Dec 5th', subjects, types, now).dueDate, '2026-12-05');
    assert.equal(parseQuickAdd('call 30/11', subjects, types, now).dueDate, '2026-11-30', 'si el primero pasa de 12 es el día');
    const rp = parseRepeat('gym every monday and wednesday until dec 18', '2026-11-23');
    assert.deepEqual(rp?.rule, { freq: 'week', interval: 1, days: [1, 3], until: '2026-12-18' });
    assert.equal(rp?.rest, 'gym');
    assert.deepEqual(parseRepeat('standup every weekday', '2026-11-23')?.rule, { freq: 'week', interval: 1, days: [1, 2, 3, 4, 5] });
    assert.deepEqual(parseRepeat('rent every month on the 5th', '2026-11-23')?.rule, { freq: 'month', interval: 1, monthDay: 5 });
  } finally { _setLangForTests('es'); }
  // En español, las palabras en inglés no cambian nada.
  const es = parseQuickAdd('test sat', subjects, types, now);
  assert.deepEqual([es.dueDate, es.typeKey], [null, null]);
});

test('v30 idiomas: cuenta de cobro bilingüe, sílabo y exportación en inglés', async () => {
  const { invoiceHtml } = await import('../lib/invoice');
  const inv: any = {
    id: 'i', client_id: 'c', prefix: 'CC', number: 7, issued_on: '2026-11-30', period_from: '2026-11-01', period_to: '2026-11-30',
    issuer: { full_name: 'Juan Tamayo', doc_type: 'CC', doc_number: '1000', city: 'Medellín', bank_name: 'Bancolombia', account_type: 'ahorros', account_number: '123-45' },
    client: { name: 'Acme S.A.S.' }, items: [{ concept: 'Web', hours: 2.5, rate: 60000, amount: 150000 }], total: 150000,
    note: null, status: 'emitida', paid_on: null, created_at: '',
  };
  const es = invoiceHtml(inv);
  assert.doesNotMatch(es, /OWES|class="en"/, 'en español no lleva traducción');
  _setLangForTests('en');
  try {
    const en = invoiceHtml(inv);
    assert.match(en, /CUENTA DE COBRO No\. CC-0007/, 'el texto legal sigue en español');
    assert.match(en, /DEBE A <span class="en">\(OWES\)<\/span>/);
    assert.match(en, /30 de noviembre de 2026 <span class="en">\(November 30, 2026\)<\/span>/);
    assert.match(en, /Please pay to Bancolombia savings account number 123-45, in the name of Juan Tamayo\./);
    assert.match(en, /ciento cincuenta mil pesos m\/cte/);
    const { parseSyllabus, syllabusPrompt } = await import('../lib/syllabus');
    const rows = parseSyllabus('Date\tTitle\tType\n12/04/2026\tFinal project\tProject', [], [{ key: 'proyecto', label: 'Project' }], null, new Date(2026, 10, 23));
    assert.equal(rows[0].dueDate, '2026-12-04'); assert.equal(rows[0].typeKey, 'proyecto');
    assert.match(syllabusPrompt('Physics', 2026), /MM\/DD\/YYYY/);
  } finally { _setLangForTests('es'); }
});

test('v30 idiomas: servidor (IA, cupos, actas, calendario) y la página en inglés', async () => {
  const { langOf, answerIn, say } = await import('../supabase/functions/_shared/lang');
  assert.equal(langOf('en'), 'en'); assert.equal(langOf(undefined), 'es'); assert.equal(langOf('fr'), 'es');
  assert.equal(answerIn('es'), '');
  assert.match(answerIn('en'), /in natural English/);
  assert.equal(say('en', 'Inicia sesión para usar la IA.'), 'Sign in to use the AI.');
  assert.equal(say('es', 'Inicia sesión para usar la IA.'), 'Inicia sesión para usar la IA.');
  const { limitMessage } = await import('../supabase/functions/_shared/plans');
  assert.match(limitMessage('free', 'quiz', 'en'), /^You reached today's limit \(2 mock exams\)\. .*Kaderno Pro you get 8 a day\.$/);
  assert.match(limitMessage('free', 'quiz'), /^Llegaste al límite de hoy/);
  const { minutesPlain } = await import('../supabase/functions/_shared/meeting');
  const m: any = { kind: 'meeting', title: 'Kickoff', summary: ['Plan'], attendees: ['Ana'], decisions: [], tasks: [{ title: 'Send deck', owner: null, due: '2026-12-04', when: null }], open: [] };
  assert.equal(minutesPlain(m, 'Nov 23', false, 'en'), 'Minutes: Kickoff (Nov 23)\n\nAttendees: Ana\n\nSummary\n- Plan\n\nTasks\n- Send deck (no owner, Dec 4)');
  assert.match(minutesPlain(m, '23 nov'), /^Acta: Kickoff \(23 nov\)/);
  const { buildIcs } = await import('../supabase/functions/_shared/ics');
  const ics = buildIcs({ name: 'Kaderno', lang: 'en', tasks: [{ id: '1', title: 'Report', due_date: '2026-12-01', kind: 'project', project: null }], classes: [], now: new Date('2026-11-23T12:00:00Z') });
  assert.match(ics, /SUMMARY:\[Project\] Report/); assert.match(ics, /CATEGORIES:Deadlines/);
  // La página: idioma, descripción y manifiesto en inglés desde el principio.
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /manifest-en\.webmanifest/); assert.match(html, /localStorage\.getItem\('kd-lang'\)/);
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest-en.webmanifest'), 'utf8'));
  const es = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.webmanifest'), 'utf8'));
  assert.equal(man.lang, 'en'); assert.equal(man.shortcuts.length, es.shortcuts.length);
  assert.deepEqual(man.icons, es.icons, 'el manifiesto en inglés solo cambia los textos');
  assert.deepEqual(man.share_target, es.share_target);
  // La app manda el idioma en cada llamada a las funciones.
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'lib', 'supabase.ts'), 'utf8'), /body: \{ lang: lang\(\), \.\.\.body \}/);
});
