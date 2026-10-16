import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestSteps } from '../lib/stepSuggest';
import { safeName, versionPath, humanSize, guessMime, kindOf, matchExisting, baseKey, previewable, whenLabel, extOf } from '../lib/fileVersions';
import { calendarLinks, diagnoseCalendar } from '../lib/calendarLink';
import { buildIcs, classesFromSchedule, DEFAULT_ICS_BLOCKS } from '../supabase/functions/_shared/ics';

// ---------- Microtareas sugeridas ----------
test('pasos: una lista en la descripción se vuelve pasos', () => {
  const s = suggestSteps('Informe', '- Buscar 3 fuentes\n- Hacer el esquema\n2) Escribir la introducción.');
  assert.deepEqual(s, ['Buscar 3 fuentes', 'Hacer el esquema', 'Escribir la introducción']);
});
test('pasos: "ejercicios 1 a 15" se parte en tandas', () => {
  const s = suggestSteps('Taller de cálculo', 'Resolver los ejercicios 1 a 15 de la guía');
  assert.deepEqual(s.slice(0, 3), ['Ejercicios 1 a 5', 'Ejercicios 6 a 10', 'Ejercicios 11 a 15']);
});
test('pasos: sin descripción usa la plantilla del tipo y no repite lo que ya existe', () => {
  const s = suggestSteps('Parcial de física', '', 'examen', ['Resolver ejercicios de práctica']);
  assert.ok(s.includes('Simulacro con tiempo'));
  assert.ok(!s.some((x) => x.toLowerCase().includes('resolver ejercicios de práctica')));
  assert.ok(s.length >= 3 && s.length <= 8);
});
test('pasos: frases con "luego" y "incluir A, B y C"', () => {
  const a = suggestSteps('Video', 'Grabar la entrevista luego editar el material');
  assert.ok(a.includes('Grabar la entrevista') && a.includes('Editar el material'));
  const b = suggestSteps('Póster', 'Debe incluir objetivos, metodología y resultados');
  assert.ok(b.includes('Objetivos') && b.includes('Metodología') && b.includes('Resultados'));
});
test('pasos: algo genérico nunca queda vacío', () => {
  assert.equal(suggestSteps('Cosa', null).length, 3);
});

// ---------- Archivos versionados ----------
test('archivos: nombres seguros para Storage', () => {
  assert.equal(safeName('Informe final (versión 2).docx'), 'Informe_final_version_2.docx');
  assert.equal(safeName('   .pdf'), 'archivo.pdf');
  assert.equal(safeName('a'.repeat(200) + '.pptx').length, 80);
  assert.equal(extOf('foto.JPEG'), 'jpeg');
  assert.equal(versionPath('p1', 'f1', 'Mi tabla.xlsx', 123, 'abc'), 'p1/f1/123-abc-Mi_tabla.xlsx');
});
test('archivos: tamaño, tipo e ícono', () => {
  assert.equal(humanSize(512), '512 B');
  assert.equal(humanSize(2048), '2 KB');
  assert.equal(humanSize(3.5 * 1024 * 1024), '3.5 MB');
  assert.equal(humanSize(null), '');
  assert.equal(guessMime('x.docx', null), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(guessMime('x.pdf', 'application/octet-stream'), 'application/pdf');
  assert.equal(guessMime('raro.qqq', null), 'application/octet-stream');
  assert.equal(kindOf('a.pptx'), 'slides');
  assert.equal(kindOf('a', 'image/png'), 'image');
  assert.ok(previewable('a.pdf') && !previewable('a.docx'));
});
test('archivos: reconoce otra versión del mismo archivo', () => {
  const files = [{ id: '1', name: 'Informe.docx' }, { id: '2', name: 'Datos lab.xlsx' }, { id: '3', name: 'Presentación.pptx' }];
  assert.equal(matchExisting('informe.docx', files)?.id, '1');
  assert.equal(matchExisting('Informe_v2.docx', files)?.id, '1');
  assert.equal(matchExisting('Informe final corregido.docx', files)?.id, '1');
  assert.equal(matchExisting('Datos lab (1).xlsx', files)?.id, '2');
  assert.equal(matchExisting('presentacion 2026-10-14.pptx', files)?.id, '3');
  assert.equal(matchExisting('Informe.pdf', files), null, 'otra extensión es otro archivo');
  assert.equal(matchExisting('Anexo.docx', files), null);
  assert.equal(baseKey('Final.docx'), '|docx');
});
test('archivos: cuándo', () => {
  const now = new Date('2026-10-15T15:00:00');
  assert.equal(whenLabel('2026-10-15T14:59:30', now), 'hace un momento');
  assert.equal(whenLabel('2026-10-15T14:40:00', now), 'hace 20 min');
  assert.equal(whenLabel('2026-10-14T10:00:00', now), 'ayer');
  assert.equal(whenLabel('2026-03-02T10:00:00', now), '2 mar');
  assert.equal(whenLabel('2025-03-02T10:00:00', now), '2 mar 2025');
});

// ---------- Calendario ----------
const TOKEN = 'a'.repeat(48);
test('calendario: enlaces directos y por el dominio de Kaderno', () => {
  const d = calendarLinks(TOKEN, 'https://abc.supabase.co/');
  assert.equal(d.https, `https://abc.supabase.co/functions/v1/ical?token=${TOKEN}`);
  assert.equal(d.webcal, `webcal://abc.supabase.co/functions/v1/ical?token=${TOKEN}`);
  assert.ok(d.google.startsWith('https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2F'));
  assert.equal(d.viaKaderno, false);
  const k = calendarLinks(TOKEN, 'https://abc.supabase.co', 'https://kaderno.app/calendario/');
  assert.equal(k.https, `https://kaderno.app/calendario/${TOKEN}.ics`);
  assert.equal(k.viaKaderno, true);
  assert.equal(calendarLinks(TOKEN, 'https://abc.supabase.co', 'http://inseguro/cal').viaKaderno, false, 'sin https no se usa');
});
test('calendario: el diagnóstico dice qué arreglar', () => {
  assert.equal(diagnoseCalendar(200, 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR', false).ok, true);
  assert.match(diagnoseCalendar(401, '{"msg":"Missing authorization header"}', false).detail, /--no-verify-jwt/);
  assert.match(diagnoseCalendar(404, 'Enlace no válido o ya reemplazado', false).title, /ya no existe/);
  assert.match(diagnoseCalendar(404, 'Function not found', false).title, /no está desplegada/);
  assert.match(diagnoseCalendar(200, '<!doctype html>', true).detail, /Nginx/);
  assert.match(diagnoseCalendar(0, '', true).detail, /certbot/);
  assert.equal(diagnoseCalendar(500, 'boom', false).ok, false);
});
test('calendario: zona horaria y bloques por defecto', () => {
  const classes = classesFromSchedule([{ id: 's1', day: 0, slot: 1, subject_id: 'm' }], DEFAULT_ICS_BLOCKS, { m: 'Física' });
  assert.deepEqual(classes.map((c) => [c.start, c.end]), [['08:00', '10:00']]);
  const ics = buildIcs({ name: 'K', tasks: [], classes, now: new Date('2026-10-15T12:00:00Z'), tz: 'America/Bogota' });
  assert.ok(ics.includes('X-WR-TIMEZONE:America/Bogota'));
  assert.ok(ics.includes('DTSTART:20261012T080000'));
  assert.ok(!buildIcs({ name: 'K', tasks: [], classes: [], now: new Date(), tz: 'x;y' }).includes('X-WR-TIMEZONE'));
});
