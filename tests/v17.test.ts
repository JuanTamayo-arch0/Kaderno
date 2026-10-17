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

// ---------- Economía ----------
import { ITEM_RULES, SHOP_ORDER, adoptPrice, levelOf, levelProgress, itemState, coinLabel } from '../lib/pets/economy';

test('reglas de la tienda iguales al arte y ordenadas por precio', () => {
  assert.deepEqual(Object.keys(ITEM_RULES).sort(), Object.keys(ITEMS).sort());
  for (const [id, r] of Object.entries(ITEM_RULES)) assert.equal(r.slot, ITEMS[id as ItemId].slot, id);
  for (let i = 1; i < SHOP_ORDER.length; i++) assert.ok(ITEM_RULES[SHOP_ORDER[i - 1]].price <= ITEM_RULES[SHOP_ORDER[i]].price);
  assert.deepEqual([0, 1, 2, 3].map(adoptPrice), [0, 600, 1000, 1500]);
});

test('niveles: 50 * n * (n - 1), igual que pet_level en la base', () => {
  const cases: [number, number][] = [[0, 1], [99, 1], [100, 2], [299, 2], [300, 3], [600, 4], [1000, 5], [1500, 6], [4499, 9], [4500, 10]];
  for (const [xp, lv] of cases) assert.equal(levelOf(xp), lv, `xp ${xp}`);
  assert.deepEqual(levelProgress(850), { level: 4, into: 250, span: 400, toNext: 150, pct: 250 / 400 });
});

test('estado de cada prenda en la tienda', () => {
  const pet = { xp: 120, coins: 100, outfit: { cabeza: 'gorro' as ItemId } };
  const owned = new Set(['gorro', 'corbatin']);
  assert.equal(itemState('gorro', pet, owned), 'puesta');
  assert.equal(itemState('corbatin', pet, owned), 'tuya');
  assert.equal(itemState('collar', pet, owned), 'comprable');
  assert.equal(itemState('gafas', pet, owned), 'cara');
  assert.equal(itemState('audifonos', pet, owned), 'bloqueada');
  assert.equal(coinLabel(1, SPECIES.perro.coin), '1 hueso');
  assert.equal(coinLabel(1500, SPECIES.perro.coin), '1.500 huesos');
});

// ---------- Frases ----------
import { LINES, DAILY, lineFor, dailyPhrase } from '../lib/pets/lines';

test('cada situación tiene frases para las cuatro, sin rayas largas', () => {
  for (const [sit, bySp] of Object.entries(LINES)) {
    for (const s of species) {
      assert.ok(bySp[s].length > 0, `${sit} ${s}`);
      for (const l of bySp[s]) assert.ok(!l.includes('—'), `${sit} ${s}: ${l}`);
    }
  }
  for (const l of DAILY) assert.ok(!l.includes('—') && l.length < 90, l);
  assert.ok(DAILY.length >= 60);
});

test('las plantillas se rellenan y el plural sale bien', () => {
  assert.equal(lineFor('vencidas', 'pinguino', { n: 1, tarea: 'Taller' }, 0), 'Hay 1 vencida. Empecemos por ahí.');
  assert.equal(lineFor('vencidas', 'pinguino', { n: 3, tarea: 'Taller' }, 0), 'Hay 3 vencidas. Empecemos por ahí.');
  assert.equal(lineFor('vencidas', 'pinguino', { n: 3, tarea: 'Taller' }, 0.99), 'Primero lo vencido: Taller.');
  assert.equal(lineFor('enfoque_fin', 'perro', { min: 25 }, 0), '¡25 minutos! ¡Qué máquina!');
});

test('la frase del día no se repite en 30 días seguidos', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) seen.add(dailyPhrase(new Date(2026, 9, 1 + i)));
  assert.equal(seen.size, 30);
  assert.equal(dailyPhrase(new Date(2026, 9, 16, 8)), dailyPhrase(new Date(2026, 9, 16, 22)));
});

// ---------- Cerebro ----------
import { react, commit, initialBrain, nextTask, isWandering, suggestion, GAP, type PetEvent } from '../lib/pets/brain';

const MIN = 60_000;
const T0 = new Date(2026, 9, 16, 10, 0).getTime();
const abrir = (o: Partial<Extract<PetEvent, { type: 'abrir' }>> = {}): PetEvent => ({ type: 'abrir', overdue: [], today: [], hour: 10, ...o });

test('al abrir con vencidas habla una vez y luego espera', () => {
  let b = initialBrain();
  const ev = abrir({ overdue: [{ id: 'a', title: 'Taller de integrales', overdue: true, dueTs: 1 }] });
  const r = react(ev, b, 'gato', T0, 0);
  assert.equal(r?.mood, 'preocupado');
  assert.equal(r?.say, 'Taller de integrales ya venció. No se va a hacer sola.');
  assert.deepEqual(r?.actions, ['enfocar', 'mover_hoy']);
  b = commit(b, r, T0);
  assert.equal(react(ev, b, 'gato', T0 + 10 * MIN, 0), null, 'repitió antes de la espera');
  // Pasada la espera global pero no la de "vencidas": saluda en vez de repetir.
  const r2 = react(ev, b, 'gato', T0 + GAP.importa + MIN, 0);
  assert.equal(r2?.key, 'hola');
});

test('conversador habla más seguido que solo cuando importa', () => {
  const b = commit(initialBrain('importa'), { say: 'x', spontaneous: true, key: 'hola' }, T0);
  const ev: PetEvent = { type: 'paseo', next: { id: 'q', title: 'Quiz' } };
  assert.equal(react(ev, b, 'loro', T0 + 25 * MIN, 0), null);
  assert.ok(react(ev, { ...b, talk: 'conversador' }, 'loro', T0 + 25 * MIN, 0)?.say?.includes('Quiz'));
});

test('en enfoque y silenciada no habla sola, pero reacciona', () => {
  const foc = { ...initialBrain(), focusing: true };
  assert.equal(react(abrir({ overdue: [{ id: 'a', title: 'X', overdue: true }] }), foc, 'perro', T0, 0), null);
  const done = react({ type: 'tarea_hecha', allDone: false }, foc, 'perro', T0, 0);
  assert.equal(done?.mood, 'feliz'); assert.equal(done?.say, undefined); assert.ok(done?.celebrate);
  const muted = { ...initialBrain(), mutedUntil: Number.MAX_SAFE_INTEGER };
  assert.equal(react({ type: 'paseo', next: { id: 'q', title: 'Quiz' } }, muted, 'perro', T0, 0), null);
  assert.ok(react({ type: 'toque' }, muted, 'perro', T0, 0)?.say, 'si la tocas, responde');
  assert.deepEqual(react({ type: 'toque' }, foc, 'perro', T0, 0)?.actions, ['terminar_enfoque', 'seguir']);
});

test('de noche se duerme y día completo celebra', () => {
  assert.equal(react(abrir({ hour: 23 }), initialBrain(), 'pinguino', T0, 0)?.mood, 'dormido');
  const r = react({ type: 'tarea_hecha', allDone: true }, initialBrain(), 'pinguino', T0, 0);
  assert.equal(r?.say, 'Día completo. Bien hecho.');
});

test('qué hacer ahora: vencida más vieja, luego la más corta de hoy', () => {
  const o = [{ id: '1', title: 'B', overdue: true, dueTs: 20 }, { id: '2', title: 'A', overdue: true, dueTs: 10 }];
  const t = [{ id: '3', title: 'Larga', today: true, estimate: 120 }, { id: '4', title: 'Corta', today: true, estimate: 20 }];
  assert.equal(nextTask(o, t)?.id, '2');
  assert.equal(nextTask([], t)?.id, '4');
  assert.equal(nextTask([], []), null);
  assert.equal(suggestion([], [], 'loro', 0).task, null);
});

test('paseo sin hacer nada: 3 pantallas en 2 minutos sin acciones', () => {
  assert.equal(isWandering([T0, T0 + 20_000, T0 + 40_000], T0 - 1000, T0 + 41_000), true);
  assert.equal(isWandering([T0, T0 + 20_000, T0 + 40_000], T0 + 30_000, T0 + 41_000), false);
  assert.equal(isWandering([T0, T0 + 200_000], 0, T0 + 200_000), false);
});

// ---------- Movimiento ----------
import { PetMotion, type World } from '../lib/pets/motion';

function world(over: Partial<World> = {}): World & { cards: Record<string, { left: number; right: number; top: number } | null> } {
  const cards: Record<string, { left: number; right: number; top: number } | null> = { c1: { left: 20, right: 380, top: 300 } };
  return {
    cards, minX: 0, maxX: 400, floor: 600,
    perches: () => Object.entries(cards).filter(([, r]) => r).map(([key, rect]) => ({ key, rect: rect! })),
    rectOf: (k) => cards[k] ?? null,
    obstacle: () => ({ left: 180, right: 230, top: 570 }),
    ...over,
  };
}
const run = (m: PetMotion, secs: number, each?: () => void) => { for (let i = 0; i < secs * 60; i++) { m.step(1 / 60); each?.(); } };

test('camina por el piso y salta el obstáculo', () => {
  const m = new PetMotion(world(), 64, () => 0.99);
  m.placeOnFloor(60);
  assert.equal(m.y, m.yOn(600));
  m.walkTo(300);
  let minY = m.y;
  run(m, 10, () => { minY = Math.min(minY, m.y); });
  assert.ok(minY < m.yOn(600) - 30, `no saltó: ${minY}`);
  assert.ok(Math.abs(m.x - 300) < 40, `no llegó: ${m.x}`);
  assert.equal(m.on, null);
});

test('al soltarla sobre una tarjeta se queda arriba; luego se baja al piso', () => {
  const w = world();
  const m = new PetMotion(w, 64, () => 0.99);
  m.placeOnFloor(100);
  m.grab(); m.dragTo(150, 120); m.release(0, 0);
  assert.equal(m.mode, 'air');
  run(m, 2);
  assert.equal(m.on, 'c1');
  assert.equal(m.y, m.yOn(300));
  m.hopDown(1, true);
  run(m, 2);
  assert.equal(m.on, null);
  assert.equal(m.y, m.yOn(600));
});

test('si la tarjeta desaparece, cae', () => {
  const w = world();
  const m = new PetMotion(w, 64, () => 0.99);
  m.grab(); m.dragTo(150, 120); m.release(0, 0);
  run(m, 2);
  assert.equal(m.on, 'c1');
  w.cards.c1 = null;
  run(m, 2);
  assert.equal(m.on, null);
  assert.equal(m.y, m.yOn(600));
});

test('quieta o en enfoque se va a su esquina; nunca sale de la pantalla', () => {
  const m = new PetMotion(world({ obstacle: () => null }), 64, () => 0.5);
  m.placeOnFloor(10);
  m.still = true;
  run(m, 20);
  assert.ok(Math.abs(m.x - m.corner()) < 2, `x ${m.x}`);
  m.grab(); m.dragTo(-500, -500); m.release(-3000, -3000);
  run(m, 3, () => { assert.ok(m.x >= 0 && m.x <= 400 - 64); });
  assert.equal(m.mode === 'idle' || m.mode === 'walk', true);
});

test('cuadros según el estado', () => {
  const m = new PetMotion(world(), 64, () => 0.99);
  m.placeOnFloor(50);
  m.jump(0, -300);
  assert.equal(m.frame(0), 'salto');
  m.grab();
  assert.equal(m.frame(0), 'agarrado');
  m.release(0, 0); run(m, 2); m.sleep();
  assert.ok(['sueno1', 'sueno2'].includes(m.frame(0)));
  m.wake();
  assert.equal(m.frame(0, true), 'quieto');
});

test('a veces se sube sola de un salto a una tarjeta a la vista', () => {
  const w = world({ obstacle: () => null });
  w.cards.c1 = { left: 40, right: 360, top: 380 };
  let n = 0;
  const m = new PetMotion(w, 64, () => [0.05, 0.5, 0.5][n++ % 3]);
  m.placeOnFloor(200);
  run(m, 4);
  assert.equal(m.on, 'c1');
  assert.equal(m.y, m.yOn(380));
  // Una tarjeta demasiado alta no se alcanza.
  const w2 = world({ obstacle: () => null });
  w2.cards.c1 = { left: 40, right: 360, top: 20 };
  const m2 = new PetMotion(w2, 64, () => 0.05);
  m2.placeOnFloor(200);
  assert.equal(m2.climb(), false);
});

// ---------- Logros ----------
import { readFileSync } from 'node:fs';
import { ACHIEVEMENTS, sortAchievements, type AchievementRow } from '../lib/pets/achievements';

test('los logros de la app son los mismos que calcula la base', () => {
  const sql = readFileSync('supabase/schema_v16.sql', 'utf8');
  const ids = [...sql.matchAll(/\('([a-z_0-9]+)', (?:least\([^)]*\)|[a-z_]+), \d+, \d+\)/g)].map((m) => m[1]).filter((x) => !(x in ITEM_RULES));
  assert.deepEqual(ids.sort(), Object.keys(ACHIEVEMENTS).sort());
  for (const a of Object.values(ACHIEVEMENTS)) assert.ok(!a.title.includes('—') && !a.desc.includes('—'));
});

test('orden de logros: conseguidos recientes primero, luego por avance', () => {
  const r = (id: any, p: number, g: number, at: string | null): AchievementRow => ({ id, progress: p, goal: g, reward: 10, unlocked_at: at, is_new: false });
  const out = sortAchievements([r('tareas_25', 5, 25, null), r('primera_tarea', 1, 1, '2026-10-10T00:00:00Z'), r('dia_5', 4, 5, null), r('ropa_3', 3, 3, '2026-10-12T00:00:00Z')]);
  assert.deepEqual(out.map((x) => x.id), ['ropa_3', 'primera_tarea', 'dia_5', 'tareas_25']);
});

test('un logro nuevo celebra y ofrece verlo; en enfoque solo cambia la cara', () => {
  const r = react({ type: 'logro', title: 'Con estilo', reward: 30 }, initialBrain(), 'perro', T0, 0);
  assert.equal(r?.say, '¡LOGRO NUEVO! Con estilo. +30');
  assert.deepEqual(r?.actions, ['logros']);
  assert.equal(react({ type: 'logro', title: 'X', reward: 1 }, { ...initialBrain(), focusing: true }, 'perro', T0, 0)?.say, undefined);
});
