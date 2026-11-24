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
