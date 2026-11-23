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

test('semestres: escala propia, nombres y promedio como el servidor', async () => {
  const t = await import('../lib/terms');
  assert.deepEqual(t.cleanScale({}), { max: 5, pass: 3, decimals: 1 });
  assert.deepEqual(t.cleanScale({ max: 100, pass: 60, decimals: 2 }), { max: 100, pass: 60, decimals: 2 });
  assert.equal(t.cleanScale({ max: 10, pass: 50 }).pass, 6, 'aprobar no puede pasar la máxima');
  assert.equal(t.suggestTermName(new Date(2026, 10, 22)), '2026-2');
  assert.equal(t.suggestTermName(new Date(2027, 2, 1)), '2027-1');
  assert.equal(t.nextTermName('2026-2'), '2027-1');
  assert.equal(t.nextTermName('2027-1'), '2027-2');
  assert.equal(t.nextTermName('Semestre de verano'), '');
  const subs = [
    { name: 'Cálculo II', credits: 4, grade: 4.4, status: 'aprobada' as const },
    { name: 'Física', credits: 4, grade: 2.8, status: 'reprobada' as const },
    { name: 'Inglés IV', credits: 2, grade: 4.0, status: 'homologada' as const },
    { name: 'Ética', credits: 2, grade: null, status: 'retirada' as const },
  ];
  assert.deepEqual(t.termAverage(subs), { avg: 3.6, credits: 6, graded: 8 }, 'igual que _term_summary en SQL');
  assert.equal(t.bestSubject(subs)?.name, 'Cálculo II');
  const scale = { max: 5, pass: 3, decimals: 1 as const };
  assert.equal(t.statusFor(2.9, scale), 'reprobada');
  assert.equal(t.statusFor(3, scale), 'aprobada');
  assert.equal(t.fmtGrade(4.25, scale), '4,3');
  assert.equal(t.fmtGrade(4.25, { decimals: 2 }), '4,25');
  assert.equal(t.parseGrade('4,3'), 4.3);
  assert.equal(t.parseGrade(''), null);
});

test('semestres: acumulado con escalas distintas, racha y cuándo cerrar', async () => {
  const t = await import('../lib/terms');
  const scale = { max: 5, pass: 3, decimals: 1 as const };
  const terms = [
    { status: 'closed' as const, summary: { subjects: [], avg: 4, credits: 18, credits_graded: 18, max: 5 } },
    { status: 'closed' as const, summary: { subjects: [], avg: 80, credits: 10, credits_graded: 10, max: 100 } },
    { status: 'open' as const, summary: null },
  ];
  const c = t.cumulative(terms, scale);
  assert.equal(c.credits, 28);
  assert.equal(c.terms, 2);
  assert.ok(Math.abs((c.avg as number) - 4) < 1e-9, 'el 80 de 100 cuenta como 4 de 5');
  assert.equal(t.longestRun(['2026-03-01', '2026-03-02', '2026-03-02', '2026-03-03', '2026-03-05', '2026-02-28']), 4);
  assert.equal(t.longestRun([]), 0);
  assert.ok(t.shouldOfferClose({ status: 'open', ends_on: '2026-11-20', starts_on: null }, new Date(2026, 10, 22)));
  assert.ok(!t.shouldOfferClose({ status: 'open', ends_on: '2026-12-05', starts_on: null }, new Date(2026, 10, 22)));
  assert.ok(t.shouldOfferClose({ status: 'open', ends_on: null, starts_on: null }, new Date(2026, 11, 3)), 'sin fecha, en diciembre');
  assert.ok(!t.shouldOfferClose({ status: 'closed', ends_on: '2026-01-01', starts_on: null }, new Date(2026, 10, 22)));
});

test('semestres: el historial en PDF es sobrio', async () => {
  const t = await import('../lib/terms');
  const html = t.historyHtml({ who: 'Juan', scale: { max: 5, pass: 3, decimals: 1 }, today: new Date(2026, 10, 22), terms: [
    { id: '1', name: '2026-1', starts_on: '2026-02-02', ends_on: '2026-06-06', status: 'closed', closed_at: null, created_at: '', reflection: null,
      summary: { subjects: [{ name: 'Cálculo <II>', credits: 4, grade: 4.4, status: 'aprobada' }], avg: 4.4, credits: 4, credits_graded: 4, max: 5 } },
  ] });
  assert.match(html, /font-family:'Times New Roman'/);
  assert.ok(!/color:#(?!000)[0-9a-f]{3,6}/i.test(html), 'todo en negro');
  assert.match(html, /Cálculo &lt;II&gt;/);
  assert.match(html, /Promedio acumulado: <b>4,4<\/b>/);
  assert.ok(!/—/.test(html));
});

test('movimiento: Trabajo más recto, transiciones y gestos con respeto a reducir movimiento', async () => {
  const { SPACE_RADII } = await import('../lib/brand');
  for (const k of Object.keys(SPACE_RADII.estudio) as (keyof typeof SPACE_RADII.estudio)[]) {
    assert.ok(SPACE_RADII.trabajo[k] < SPACE_RADII.estudio[k], `radio ${k} más recto en Trabajo`);
  }
  const fs = await import('node:fs');
  const motion = fs.readFileSync('lib/motion.ts', 'utf8');
  assert.match(motion, /::view-transition-old\(root\)/);
  assert.match(motion, /prefers-reduced-motion: reduce\) \{\s*::view-transition-group/);
  assert.match(motion, /export function vtNavigate/);
  assert.match(motion, /Posiciones relativas a la lista/, 'el FLIP no confunde el desplazamiento con un movimiento');
  const row = fs.readFileSync('components/TaskRow.tsx', 'utf8');
  assert.match(row, /Math\.abs\(g\.dx\) > Math\.abs\(g\.dy\) \* 2/, 'deslizar solo con gestos claramente horizontales');
  assert.match(row, /Math\.abs\(g\.dx\) > 96/);
  const hoy = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
  assert.match(hoy, /swipe=\{!isWide && r\.t\.status !== 'done'/, 'deslizar solo en el celular');
  const sheet = fs.readFileSync('components/cards/CardForms.tsx', 'utf8');
  assert.match(sheet, /g\.dy > 110 \|\| g\.vy > 1\.1/);
  const ds = fs.readFileSync('components/ds.tsx', 'utf8');
  assert.match(ds, /prefersReducedMotion\(\)/, 'los números que cuentan respetan reducir movimiento');
});

// ---------- Fase 5: mascotas ----------
test('mascotas: la ropa nueva cabe en las cuatro especies en todos los cuadros', async () => {
  const { SPECIES, ITEMS, SHEET_FRAMES, GRID, itemPlacement, petGrid } = await import('../lib/pets/art');
  for (const [id, it] of Object.entries(ITEMS)) {
    for (const sp of Object.keys(SPECIES) as (keyof typeof SPECIES)[]) {
      for (const fr of SHEET_FRAMES) {
        const p = itemPlacement(sp, id as any, fr);
        const w = it.rows[0].length, h = it.rows.length;
        assert.ok(p.x >= 0 && p.x + w <= GRID && p.y + h <= GRID, `${id} se sale en ${sp} ${fr}: ${p.x},${p.y}`);
        // Arriba solo se puede cortar en el aire, y el sombrero de bruja, que es más alto que el lienzo.
        const air = fr === 'salto' || fr === 'cae';
        if (!air && id !== 'sombrero_bruja') assert.ok(p.y >= 0, `${id} se corta arriba en ${sp} ${fr}`);
        if (it.back && p.back) {
          const bw = it.back.rows[0].length;
          assert.ok(p.back.x >= 0 && p.back.x + bw <= GRID && p.back.y >= 0, `${id} (atrás) se sale en ${sp} ${fr}`);
        }
      }
      const plain = JSON.stringify(petGrid(sp));
      assert.notEqual(JSON.stringify(petGrid(sp, { outfit: { [it.slot]: id } as any })), plain, `${id} no se ve en ${sp}`);
    }
  }
});

test('mascotas: la bufanda se queda atrás al caminar y la cola se mece', async () => {
  const { petGrid } = await import('../lib/pets/art');
  const diff = (a: (string | null)[][], b: (string | null)[][]) => a.flatMap((row, y) => row.map((c, x) => (c !== b[y][x] ? `${x},${y}` : ''))).filter(Boolean).join(' ');
  const scarf = (fr: any) => diff(petGrid('gato', { frame: fr, outfit: { cuello: 'bufanda' } }), petGrid('gato', { frame: fr }));
  assert.notEqual(scarf('paso1'), scarf('paso4'), 'la punta de la bufanda va un cuadro tarde');
  const tail = (fr: any) => petGrid('perro', { frame: fr }).map((row) => row.slice(24).join('|')).join('/');
  assert.notEqual(tail('paso1'), tail('paso4'), 'la cola del perro cambia de lado');
});

test('mascotas: el catálogo de la ropa es el mismo en la app y en la base (fase 5)', async () => {
  const fs = await import('node:fs');
  const { ITEM_RULES, ITEM_SETS, SHOP_ORDER, setOf } = await import('../lib/pets/economy');
  const sql = fs.readFileSync('supabase/schema_v25.sql', 'utf8');
  const part = sql.slice(sql.indexOf('FASE 5 · Mascotas'));
  const rows = [...part.matchAll(/\('([a-z_]+)', (\d+), (\d+), '([a-z]+)'\)/g)].map((m) => ({ id: m[1], price: +m[2], level: +m[3], slot: m[4] }));
  const clothes = rows.filter((r) => ['cabeza', 'ojos', 'cuello', 'espalda', 'mano'].includes(r.slot));
  assert.deepEqual(clothes.map((r) => r.id).sort(), Object.keys(ITEM_RULES).sort());
  for (const r of clothes) {
    const it = ITEM_RULES[r.id as keyof typeof ITEM_RULES];
    assert.deepEqual([it.price, it.level, it.slot], [r.price, r.level, r.slot], r.id);
  }
  assert.match(part, /_pet_wear_slot\(p_slot text\)[\s\S]*'espalda', 'mano'/);
  const all = [...ITEM_SETS.estudio, ...ITEM_SETS.trabajo];
  assert.equal(new Set(all).size, all.length, 'una prenda en dos juegos');
  for (const id of all) assert.ok(SHOP_ORDER.includes(id), id);
  assert.equal(setOf('taza'), 'trabajo');
  assert.equal(setOf('mochila'), 'estudio');
  assert.equal(setOf('corona'), 'lucirse');
});

test('mascotas: en Trabajo es discreta (no habla salvo al cerrar el día o si la tocas)', async () => {
  const { react, discreet, initialBrain } = await import('../lib/pets/brain');
  const b = initialBrain();
  const T = 1_000_000_000;
  const done = discreet({ type: 'tarea_hecha', allDone: true }, react({ type: 'tarea_hecha', allDone: true }, b, 'perro', T, 0), 'perro', 0);
  assert.ok(done && !done.say && !done.celebrate && done.mood === 'feliz');
  const open = discreet({ type: 'abrir', overdue: [{ id: 'a', title: 'X', overdue: true }], today: [], hour: 10 },
    react({ type: 'abrir', overdue: [{ id: 'a', title: 'X', overdue: true }], today: [], hour: 10 }, b, 'gato', T, 0), 'gato', 0);
  assert.ok(!open?.say, 'no avisa vencidas en Trabajo');
  const closed = discreet({ type: 'dia_cerrado' }, react({ type: 'dia_cerrado' }, b, 'loro', T, 0), 'loro', 0);
  assert.ok(closed?.say);
  const tap = discreet({ type: 'toque' }, react({ type: 'toque' }, b, 'pinguino', T, 0), 'pinguino', 0);
  assert.ok(tap?.say && !tap.actions?.includes('tienda'), 'sin tienda en Trabajo');
  assert.equal(react({ type: 'logro', title: 'X', reward: 20 }, b, 'gato', T, 0)?.mood, 'sorprendido');
  const fs = await import('node:fs');
  assert.match(fs.readFileSync('components/pets/PetBuddy.tsx', 'utf8'), /setDiscreet\(work\)/);
});

test('mascotas: parpadea a destiempo y se aplasta al aterrizar', async () => {
  const { PetMotion } = await import('../lib/pets/motion');
  const w = { minX: 0, maxX: 800, floor: 600, perches: () => [], rectOf: () => null, obstacle: () => null };
  const m = new PetMotion(w as any, 64, () => 0.5);
  m.placeOnFloor(100);
  const seen = new Set<string>();
  for (let t = 0; t < 8000; t += 40) seen.add(m.frame(t));
  assert.ok(seen.has('parpadeo') && seen.has('respira') && seen.has('quieto'), [...seen].join(','));
  m.squash = 0.1;
  assert.equal(m.frame(9000), 'aterriza');
});

// ---------- Fase 6: pulido ----------
test('contraste: todos los temas y acentos leen a 4,5:1 sobre la tarjeta y sobre el fondo', async () => {
  const { WORK_ACCENTS, spacePalette } = await import('../lib/brand');
  const check = (label: string, p: ReturnType<typeof derive>) => {
    const pairs: [string, string, string][] = [
      ['texto/fondo', p.text, p.bg], ['texto/tarjeta 2', p.text, p.surface2], ['tenue/tarjeta', p.muted, p.surface], ['tenue/tarjeta 2', p.muted, p.surface2],
      ['acento como texto/tarjeta', p.brand, p.surface], ['acento como texto/fondo', p.brand, p.bg], ['texto sobre acento', p.onBrand, p.brand],
      ['verde/fondo', p.goodText, p.bg], ['amarillo/fondo', p.warnText, p.bg], ['rojo/fondo', p.badText, p.bg],
      ['verde/tarjeta', p.goodText, p.surface], ['amarillo/tarjeta', p.warnText, p.surface], ['rojo/tarjeta', p.badText, p.surface],
    ];
    for (const [n, a, b] of pairs) assert.ok(contrast(a, b) >= 4.5, `${label}: ${n} = ${contrast(a, b).toFixed(2)}`);
  };
  for (const [id, t] of Object.entries(THEMES)) {
    const accents = isKadernoTheme(id) ? STUDY_ACCENTS.map((a) => a.id) : [undefined];
    for (const a of accents) check(`${id} ${a ?? ''}`, derive(spacePalette({ themeId: id, scheme: t.scheme, base: t.palette, space: 'estudio', accentId: a })));
  }
  for (const sc of ['dark', 'light'] as const) {
    const id = sc === 'dark' ? 'kaderno-oscuro' : 'kaderno-claro';
    for (const a of WORK_ACCENTS) check(`Trabajo ${sc} ${a.id}`, derive(spacePalette({ themeId: id, scheme: sc, base: THEMES[id].palette, space: 'trabajo', workAccentId: a.id })));
  }
  // Los acentos de la marca no se tocan: ya cumplen.
  const k = derive(spacePalette({ themeId: 'kaderno-claro', scheme: 'light', base: THEMES['kaderno-claro'].palette, space: 'estudio', accentId: 'coral' }));
  assert.equal(k.brand.toLowerCase(), BRAND.marginDeep.toLowerCase());
});

test('documentos: los apuntes en PDF y el historial son sobrios y llevan el pie de Kaderno', async () => {
  const fs = await import('node:fs');
  const pdf = fs.readFileSync('lib/exportPdf.ts', 'utf8');
  assert.match(pdf, /font-family: 'Times New Roman'/);
  assert.ok(!/(?:color|background|border[a-z-]*): ?[^;]*#(?!000\b)[0-9a-f]{3,6}/i.test(pdf.slice(pdf.indexOf('<style>'), pdf.indexOf('</style>'))), 'apuntes todo en negro');
  assert.match(pdf, /docFooter\(\)/);
  const { docFooter } = await import('../lib/brand');
  const f = docFooter();
  assert.match(f, /Hecho con Kaderno/);
  assert.ok(!/#(?!111111|FFFFFF|ffffff)[0-9a-f]{6}/i.test(f), 'el logo del pie va en una tinta');
  const inv = fs.readFileSync('lib/invoice.ts', 'utf8');
  assert.ok(!/docFooter/.test(inv), 'la cuenta de cobro no lleva la marca de Kaderno');
});
