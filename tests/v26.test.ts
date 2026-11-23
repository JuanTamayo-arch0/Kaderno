import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES } from '../lib/palettes';
import { contrast, derive } from '../lib/color';
import { STUDY_ACCENTS, accentOf, isKadernoTheme, logoColors, logoSvg, migrateBrand, withAccent, LOGO, BRAND } from '../lib/brand';

test('marca: cada acento en Kaderno claro y oscuro se lee bien', () => {
  for (const id of ['kaderno-oscuro', 'kaderno-claro']) {
    const t = THEMES[id];
    assert.ok(t, id);
    for (const a of STUDY_ACCENTS) {
      const p = derive(withAccent(id, t.scheme, t.palette, a.id));
      const pairs: [string, string, string][] = [
        ['texto/fondo', p.text, p.bg], ['texto/tarjeta', p.text, p.surface], ['tenue/tarjeta', p.muted, p.surface], ['tenue/fondo', p.muted, p.bg],
        ['onBrand/acento', p.onBrand, p.brand], ['onBad/peligro', p.onBad, p.bad],
        ['verde', p.goodText, p.surface], ['amarillo', p.warnText, p.surface], ['rojo', p.badText, p.surface],
      ];
      for (const [name, x, y] of pairs) assert.ok(contrast(x, y) >= 4.5, `${t.name} + ${a.name}: ${name} = ${contrast(x, y).toFixed(2)}`);
      assert.ok(contrast(p.brand, p.surface) >= 3, `${t.name} + ${a.name}: acento sobre tarjeta`);
      assert.ok(contrast(p.brand2, p.surface) >= 3, `${t.name} + ${a.name}: segundo color sobre tarjeta`);
    }
  }
});

test('marca: el acento solo cambia los temas Kaderno', () => {
  const bosque = THEMES.bosque;
  assert.deepEqual(withAccent('bosque', 'dark', bosque.palette, 'uva'), bosque.palette);
  assert.equal(withAccent('kaderno-claro', 'light', THEMES['kaderno-claro'].palette, 'uva').brand, '#7A3FC8');
  assert.equal(accentOf('nada').id, 'coral', 'un acento desconocido vuelve al de la marca');
  assert.ok(isKadernoTheme('kaderno-oscuro') && !isKadernoTheme('medianoche'));
});

test('marca: el logo es el mismo dibujo en todas sus versiones', () => {
  const svg = logoSvg({ size: 32 });
  assert.ok(svg.includes(LOGO.margin) && svg.includes(LOGO.k));
  assert.ok(svg.includes(`fill="${BRAND.ink}"`) && svg.includes(`stroke="${BRAND.margin}"`), 'tinta con margen coral');
  assert.ok(!logoSvg({ size: 72, tone: 'silueta' }).includes('<rect'), 'la silueta no tiene cuadro');
  const mask = logoSvg({ size: 512, bleed: 0.72 });
  assert.match(mask, /<rect width="48" height="48" fill=/, 'el ícono adaptable llena todo el cuadro');
  assert.match(mask, /scale\(0\.72\)/);
  assert.equal(logoColors('papel').k, BRAND.ink, 'sobre fondo oscuro, la K va en tinta');
  assert.equal(logoColors('tinta', 'trabajo').margin, BRAND.copper);
});

test('marca: quien usaba los valores de antes pasa a los de la marca, una vez', () => {
  const old = migrateBrand({ themeId: 'medianoche', fontId: 'system', brandV: 0 });
  assert.equal(old.themeId, 'kaderno-oscuro');
  assert.equal(old.fontId, 'marca');
  assert.equal(old.accentId, 'coral');
  assert.equal(old.brandV, 26);
  const chosen = migrateBrand({ themeId: 'bosque', fontId: 'nunito', brandV: 0 });
  assert.equal(chosen.themeId, 'bosque');
  assert.equal(chosen.fontId, 'nunito');
  const after = migrateBrand({ themeId: 'medianoche', fontId: 'system', brandV: 26 });
  assert.equal(after.themeId, 'medianoche', 'si después escoge Medianoche, se respeta');
});

test('marca: la letra se sirve desde la app y la pantalla de inicio la precarga', async () => {
  const fs = await import('node:fs');
  assert.ok(fs.statSync('public/fonts/plus-jakarta-sans.woff2').size > 10_000);
  assert.ok(fs.existsSync('public/fonts/OFL-plus-jakarta-sans.txt'), 'licencia de la letra');
  const html = fs.readFileSync('public/index.html', 'utf8');
  assert.match(html, /rel="preload" href="\/fonts\/plus-jakarta-sans\.woff2"/);
  assert.ok(!/—/.test(fs.readFileSync('docs/marca.md', 'utf8')));
});

test('espacios: Trabajo con sus neutros y acentos se lee bien', async () => {
  const { WORK_ACCENTS, spacePalette } = await import('../lib/brand');
  for (const id of ['kaderno-oscuro', 'kaderno-claro', 'bosque', 'papel']) {
    const t = THEMES[id];
    for (const a of WORK_ACCENTS) {
      const p = derive(spacePalette({ themeId: id, scheme: t.scheme, base: t.palette, space: 'trabajo', workAccentId: a.id }));
      for (const [name, x, y] of [['texto', p.text, p.bg], ['texto/tarjeta', p.text, p.surface], ['tenue', p.muted, p.surface], ['tenue/fondo', p.muted, p.bg],
        ['onBrand', p.onBrand, p.brand], ['onBad', p.onBad, p.bad], ['verde', p.goodText, p.surface], ['amarillo', p.warnText, p.surface], ['rojo', p.badText, p.surface]] as [string, string, string][]) {
        assert.ok(contrast(x, y) >= 4.5, `${t.name} en Trabajo + ${a.name}: ${name} = ${contrast(x, y).toFixed(2)}`);
      }
      assert.ok(contrast(p.brand, p.surface) >= 3 && contrast(p.brand2, p.surface) >= 3, `${t.name} en Trabajo + ${a.name}: acentos`);
    }
  }
  // Un tema de "Más colores" en Trabajo usa el Kaderno de Trabajo del mismo claro u oscuro.
  const bosque = spacePalette({ themeId: 'bosque', scheme: 'dark', base: THEMES.bosque.palette, space: 'trabajo' });
  assert.equal(bosque.bg, '#0F1014');
  assert.equal(spacePalette({ themeId: 'bosque', scheme: 'dark', base: THEMES.bosque.palette, space: 'estudio' }).bg, THEMES.bosque.palette.bg);
});

test('espacios: qué se ve en cada uno', async () => {
  const { spaceOf, filterSubjects, filterBySubject, suggestSpace, needsSorting, otherSpaceLine } = await import('../lib/spaces');
  const { effectiveMode } = await import('../lib/mode');
  assert.equal(effectiveMode('ambos', 'trabajo'), 'trabajo');
  assert.equal(effectiveMode('estudio', 'trabajo'), 'estudio', 'con un modo, el espacio es ese modo');
  const subs = [{ id: 'calc', space: 'estudio' }, { id: 'acme', space: 'trabajo' }, { id: 'vieja', space: null }];
  assert.equal(spaceOf(subs[2], 'trabajo'), 'trabajo', 'sin espacio cuenta como el modo');
  assert.equal(spaceOf(subs[2], 'ambos'), 'estudio');
  assert.deepEqual(filterSubjects(subs, 'trabajo', 'ambos').map((s) => s.id), ['acme']);
  assert.deepEqual(filterSubjects(subs, 'estudio', 'ambos').map((s) => s.id), ['calc', 'vieja']);
  assert.equal(filterSubjects(subs, 'trabajo', 'trabajo').length, 3, 'con un solo modo no se filtra nada');
  const tasks = [{ id: 1, subject_id: 'calc' }, { id: 2, subject_id: 'acme' }, { id: 3, subject_id: null }, { id: 4, subject_id: 'borrada' }];
  assert.deepEqual(filterBySubject(tasks, filterSubjects(subs, 'trabajo', 'ambos'), subs, 'ambos').map((t) => t.id), [2, 3, 4], 'las sin materia se ven en los dos');
  assert.equal(suggestSpace({ id: 'x', credits: 3 }), 'estudio');
  assert.equal(suggestSpace({ id: 'x', credits: 0 }, { rated: true }), 'trabajo');
  assert.equal(suggestSpace({ id: 'x', default_template: 'acta' }), 'trabajo');
  assert.ok(needsSorting(subs, 'ambos') && !needsSorting(subs, 'trabajo'));
  assert.equal(otherSpaceLine(2, 'trabajo'), 'En Trabajo: 2 cosas para hoy');
  assert.equal(otherSpaceLine(0, 'estudio'), null);
});

test('espacios: en Trabajo no aparece lo del estudio', async () => {
  const fs = await import('node:fs');
  const parts = fs.readFileSync('components/subject/SubjectParts.tsx', 'utf8');
  assert.match(parts, /work \? \['tareas', 'notas', 'files'\]/, 'sin pestaña de calificaciones en Trabajo');
  assert.match(parts, /subject\.credits && !work/, 'sin créditos en Trabajo');
  const modal = fs.readFileSync('components/SubjectModal.tsx', 'utf8');
  assert.match(modal, /\{!work && <Field label="Créditos"/);
  const areas = fs.readFileSync('app/(tabs)/materias.tsx', 'utf8');
  assert.match(areas, /\{!work && \(/, 'sin promedio en las tarjetas de áreas');
  const hoy = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
  assert.match(hoy, /\{study && <PetInvite \/>\}/);
  assert.match(hoy, /offerSemester = study &&/);
});
