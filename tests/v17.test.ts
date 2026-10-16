import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES, ITEMS, GRID, ANIMS, petGrid, petSvg, petSheet, coinSvg,
  type Species, type Mood, type Frame, type ItemId,
} from '../lib/pets/art';

const species = Object.keys(SPECIES) as Species[];
const moods: Mood[] = ['normal', 'feliz', 'dormido', 'preocupado', 'concentrado'];
const frames: Frame[] = ['quieto', 'respira', 'parpadeo', 'paso1', 'paso2', 'paso3', 'paso4', 'salto', 'agarrado', 'cae', 'sueno1', 'sueno2'];

test('cada mascota tiene media cuadrícula de 32 x 16 y colores para cada letra', () => {
  for (const s of species) {
    const d = SPECIES[s];
    assert.equal(d.half.length, GRID, s);
    for (const row of d.half) assert.equal(row.length, GRID / 2, `${s}: "${row}"`);
    const letters = new Set([...d.half.join(''), ...d.feet.join(''), ...d.extra.flatMap((l) => l.rows).join('')]);
    letters.delete('.');
    for (const ch of letters) assert.ok(d.palette[ch], `${s}: falta el color "${ch}"`);
    for (const l of d.extra) {
      const w = l.rows[0].length;
      for (const row of l.rows) assert.equal(row.length, w, `${s}: capa con filas desiguales`);
      assert.ok(l.x >= 0 && l.x + w <= GRID && l.y >= 0 && l.y + l.rows.length <= GRID, `${s}: capa fuera del lienzo`);
    }
  }
});

test('las prendas tienen filas parejas y le caben a las cuatro mascotas', () => {
  for (const [id, it] of Object.entries(ITEMS)) {
    const w = it.rows[0].length;
    for (const row of it.rows) assert.equal(row.length, w, `${id}: "${row}"`);
    for (const s of species) {
      const plain = petGrid(s).flat().filter(Boolean).length;
      const dressed = petGrid(s, { outfit: { [it.slot]: id as ItemId } }).flat().filter(Boolean).length;
      assert.ok(dressed >= plain, `${id} en ${s} borra píxeles del lienzo`);
    }
  }
});

test('la ropa solo se pone en su lugar', () => {
  const a = JSON.stringify(petGrid('gato'));
  const b = JSON.stringify(petGrid('gato', { outfit: { cuello: 'gorro' } }));
  assert.equal(a, b);
});

test('cada ánimo y cada cuadro cambian algo y producen un SVG válido', () => {
  for (const s of species) {
    const base = JSON.stringify(petGrid(s));
    for (const m of moods.filter((x) => x !== 'normal')) assert.notEqual(JSON.stringify(petGrid(s, { mood: m })), base, `${s} ${m}`);
    for (const f of frames.filter((x) => x !== 'quieto')) assert.notEqual(JSON.stringify(petGrid(s, { frame: f })), base, `${s} ${f}`);
    const svg = petSvg(s, { size: 96, label: s });
    assert.match(svg, /^<svg [^>]*viewBox="0 0 32 32"[^>]*width="96"/);
    assert.match(svg, /role="img" aria-label="pinguino|gato|perro|loro"/);
    assert.ok(svg.length < 6000, `${s} pesa ${svg.length}`);
  }
});

test('mirar a un lado corre las pupilas', () => {
  assert.notEqual(JSON.stringify(petGrid('perro', { look: 1 })), JSON.stringify(petGrid('perro', { look: -1 })));
});

test('la tira de cuadros mide un cuadro por animación', () => {
  const sheet = petSheet('loro', ANIMS.camina.frames);
  assert.match(sheet, /viewBox="0 0 128 32"/);
  for (const a of Object.values(ANIMS)) for (const f of a.frames) assert.ok(frames.includes(f));
});

test('cada especie tiene su moneda', () => {
  const ids = new Set(species.map((s) => SPECIES[s].coin.id));
  assert.equal(ids.size, 4);
  for (const s of species) assert.match(coinSvg(s, 24), /viewBox="0 0 12 12"/);
});
