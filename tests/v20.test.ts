import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whiteNoise, pinkNoise, brownNoise, impulses, seamless, rng } from '../lib/noise';
import {
  type AmbientPrefs, sanitizePrefs, tapChip, setLevel, mixLabel, targetMix, savePreset, removePreset, activeIds, DEFAULT_PREFS, cleanMix,
} from '../lib/ambientMix';
import { pickTip, BREAK_TIPS, addParked, removeParked, parkedTitle, dayKey, MAX_PARKED } from '../lib/breakTips';

// ---------- Ruido ----------
const inRange = (a: Float32Array) => a.every((v) => v >= -1 && v <= 1 && Number.isFinite(v));
const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

test('los ruidos no se saturan y no quedan en silencio', () => {
  for (const make of [whiteNoise, pinkNoise, brownNoise]) {
    const a = make(48000 * 2, 5);
    assert.ok(inRange(a), make.name);
    assert.ok(rms(a) > 0.05, `${make.name} demasiado bajo`);
  }
  const d = impulses(48000, 48000, 400, 2.5, 3);
  assert.ok(inRange(d));
  assert.ok(rms(d) > 0.01);
});

test('el ruido café tiene más graves que el blanco (cambia poco de una muestra a otra)', () => {
  const diff = (a: Float32Array) => { let s = 0; for (let i = 1; i < a.length; i++) s += Math.abs(a[i] - a[i - 1]); return s / a.length; };
  assert.ok(diff(brownNoise(20000, 1)) < diff(whiteNoise(20000, 1)) / 10);
});

test('mismo resultado con la misma semilla', () => {
  assert.deepEqual(Array.from(pinkNoise(200, 9)), Array.from(pinkNoise(200, 9)));
  const r = rng(1); const v = r();
  assert.ok(v >= 0 && v < 1);
});

test('el bucle se cierra sin salto', () => {
  const a = whiteNoise(4000, 2);
  const s = seamless(a, 400);
  assert.equal(s.length, 3600);
  assert.ok(inRange(s));
});

// ---------- Mezcla ----------
test('preferencias raras se limpian', () => {
  const p = sanitizePrefs({ mix: { lluvia: 2, mar: -1, nada: 0.5, fuego: '0.4' }, master: 7, onBreak: 'x', presets: [{ name: '' }, { name: 'A', mix: { mar: 0.5 } }, 3], muted: 'si' });
  assert.deepEqual(p.mix, { lluvia: 1 });
  assert.equal(p.master, 1);
  assert.equal(p.onBreak, 'silencio');
  assert.deepEqual(p.presets, [{ name: 'A', mix: { mar: 0.5 } }]);
  assert.equal(p.muted, false);
  assert.deepEqual(sanitizePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(cleanMix({ rio: 0.0001 }), {});
});

test('un toque en un chip deja solo ese sonido; otro toque lo apaga', () => {
  let m = tapChip({}, 'lluvia');
  assert.deepEqual(activeIds(m), ['lluvia']);
  m = tapChip(m, 'mar');
  assert.deepEqual(activeIds(m), ['mar']);
  assert.deepEqual(tapChip(m, 'mar'), {});
  assert.deepEqual(tapChip({ lluvia: 0.5, bosque: 0.3 }, 'silencio'), {});
  // Desde una mezcla, tocar uno de sus sonidos lo deja solo.
  assert.deepEqual(activeIds(tapChip({ lluvia: 0.5, bosque: 0.3 }, 'bosque')), ['bosque']);
});

test('deslizador a cero quita el sonido de la mezcla', () => {
  assert.deepEqual(setLevel({ lluvia: 0.5 }, 'lluvia', 0), {});
  assert.deepEqual(setLevel({}, 'mar', 0.333), { mar: 0.33 });
});

test('nombre de la mezcla, del más fuerte al más suave', () => {
  assert.equal(mixLabel({}), 'Silencio');
  assert.equal(mixLabel({ lluvia: 0.6 }), 'Lluvia');
  assert.equal(mixLabel({ bosque: 0.25, lluvia: 0.6 }), 'Lluvia y bosque');
  assert.equal(mixLabel({ rosa: 0.1, lluvia: 0.6, mar: 0.3 }), 'Lluvia, mar y ruido rosa');
});

test('qué suena según el reloj', () => {
  const p = { ...DEFAULT_PREFS, mix: { lluvia: 0.6 } };
  assert.deepEqual(targetMix({ running: true, mode: 'work' }, p), { lluvia: 0.6 });
  assert.equal(targetMix({ running: false, mode: 'work' }, p), null);
  assert.equal(targetMix({ running: true, mode: 'break' }, p), null); // descanso en silencio por defecto
  assert.deepEqual(targetMix({ running: true, mode: 'break' }, { ...p, onBreak: 'pajaros' }), { pajaros: 0.7 });
  assert.deepEqual(targetMix({ running: true, mode: 'break' }, { ...p, onBreak: 'igual' }), { lluvia: 0.6 });
  assert.equal(targetMix({ running: true, mode: 'work' }, { ...p, muted: true }), null);
  assert.equal(targetMix({ running: true, mode: 'work' }, { ...p, mix: {} }), null);
});

test('mezclas guardadas: máximo 3, la más nueva primero, sin repetir nombre', () => {
  let p: AmbientPrefs = { ...DEFAULT_PREFS, mix: { lluvia: 0.6 } };
  p = savePreset(p, 'Uno'); p = savePreset(p, 'Dos'); p = savePreset(p, 'Tres'); p = savePreset(p, 'Cuatro');
  assert.deepEqual(p.presets.map((x) => x.name), ['Cuatro', 'Tres', 'Dos']);
  p = savePreset({ ...p, mix: { mar: 0.4 } }, 'tres');
  assert.deepEqual(p.presets.map((x) => x.name), ['tres', 'Cuatro', 'Dos']);
  assert.deepEqual(p.presets[0].mix, { mar: 0.4 });
  const empty = { ...p, mix: {} };
  assert.equal(savePreset(empty, 'Vacía'), empty); // sin sonidos no hay qué guardar
  assert.deepEqual(removePreset(p, 'Dos').presets.map((x) => x.name), ['tres', 'Cuatro']);
});

// ---------- Pausas guiadas ----------
test('las sugerencias no se repiten en el día y respetan corta o larga', () => {
  const short = BREAK_TIPS.filter((t) => !t.long).length;
  let used: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < short; i++) {
    const r = pickTip(false, used, (i * 0.37) % 1);
    assert.ok(!seen.has(r.id), `repitió ${r.id}`);
    assert.equal(BREAK_TIPS.find((t) => t.id === r.id)!.long, false);
    seen.add(r.id); used = r.used;
  }
  // Agotadas: vuelve a empezar sin repetir la que se está mostrando.
  const last = [...seen].pop()!;
  const again = pickTip(false, used, 0.99, last);
  assert.notEqual(again.id, last);
  assert.equal(again.used.length, 1 + used.filter((id) => BREAK_TIPS.find((t) => t.id === id)!.long).length);
  assert.equal(BREAK_TIPS.find((t) => t.id === pickTip(true, [], 0).id)!.long, true);
});

test('"Otra idea" nunca devuelve la misma', () => {
  for (let i = 0; i < 20; i++) {
    const r = pickTip(true, ['caminar'], i / 20, 'comer');
    assert.notEqual(r.id, 'comer');
  }
});

test('día local', () => {
  assert.equal(dayKey(new Date(2026, 9, 5, 23, 59)), '2026-10-05');
});

// ---------- Anotar para después ----------
test('anotar limpia el texto, ignora vacíos y tiene tope', () => {
  let l = addParked([], '  escribirle   a Ana  ', 1000);
  assert.equal(l.length, 1);
  assert.equal(l[0].text, 'escribirle a Ana');
  assert.equal(addParked(l, '   '), l);
  for (let i = 0; i < 40; i++) l = addParked(l, `idea ${i}`, 2000 + i);
  assert.equal(l.length, MAX_PARKED);
  assert.equal(l[l.length - 1].text, 'idea 39');
  const id = l[0].id;
  assert.equal(removeParked(l, id).length, MAX_PARKED - 1);
  assert.equal(parkedTitle(1), 'Anotaste 1 cosa para después');
  assert.equal(parkedTitle(3), 'Anotaste 3 cosas para después');
});

// ---------- Mascota en la pausa ----------
import { react, initialBrain } from '../lib/pets/brain';
test('la mascota sugiere la pausa, salvo si está silenciada', () => {
  const now = Date.now();
  const r = react({ type: 'pausa', tip: 'Toma agua.' }, initialBrain(), 'perro', now, 0.1);
  assert.equal(r?.say, 'Toma agua.');
  assert.equal(react({ type: 'pausa', tip: 'Toma agua.' }, { ...initialBrain(), mutedUntil: now + 1000 }, 'perro', now), null);
});
