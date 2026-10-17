import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOME_ITEMS, HOME_ORDER, ROOM_W, ROOM_H, dayPart, homeHas, roomSvg, withItem, type HomeItemId } from '../lib/pets/home';
import { ITEM_RULES, homeItemState } from '../lib/pets/economy';
import { navKeyOf } from '../lib/navKey';

test('el catálogo de la casa es el mismo que en la base (schema_v17)', () => {
  const sql = readFileSync('supabase/schema_v17.sql', 'utf8');
  const rows = [...sql.matchAll(/\('([a-z_]+)', (\d+), (\d+), '([a-z]+)'\)/g)].map((m) => ({ id: m[1], price: +m[2], level: +m[3], slot: m[4] }));
  const home = rows.filter((r) => ['papel', 'piso', 'vista', 'mueble'].includes(r.slot));
  assert.equal(home.length, HOME_ORDER.length);
  for (const r of home) {
    const it = HOME_ITEMS[r.id as HomeItemId];
    assert.ok(it, r.id);
    assert.deepEqual([it.price, it.level, it.slot], [r.price, r.level, r.slot], r.id);
  }
  // La ropa sigue igual que en lib/pets/economy.ts.
  for (const r of rows.filter((x) => ['cabeza', 'ojos', 'cuello'].includes(x.slot))) {
    const it = ITEM_RULES[r.id as keyof typeof ITEM_RULES];
    assert.deepEqual([it.price, it.level, it.slot], [r.price, r.level, r.slot], r.id);
  }
});

test('el cuarto se dibuja y cambia con cada cosa y con la hora', () => {
  const base = roomSvg({}, { hour: 11 });
  assert.match(base, new RegExp(`viewBox="0 0 ${ROOM_W} ${ROOM_H}"`));
  assert.ok(base.length < 60_000, `pesa ${base.length}`);
  for (const id of HOME_ORDER) assert.notEqual(roomSvg(withItem({}, id), { hour: 11 }), base, id);
  assert.notEqual(roomSvg({}, { hour: 22 }), base);
  assert.deepEqual([dayPart(10), dayPart(18), dayPart(23), dayPart(4)], ['dia', 'tarde', 'noche', 'noche']);
});

test('poner cosas en la casa y su estado en la tienda', () => {
  const h = withItem(withItem({}, 'papel_rayas'), 'lampara');
  assert.ok(homeHas(h, 'papel_rayas') && homeHas(h, 'lampara') && !homeHas(h, 'planta'));
  assert.equal(withItem(h, 'papel_ladrillo').papel, 'papel_ladrillo');
  const pet = { xp: 300, coins: 100, home: h };
  const owned = new Set(['papel_rayas', 'lampara', 'planta']);
  assert.equal(homeItemState('lampara', pet, owned), 'puesta');
  assert.equal(homeItemState('planta', pet, owned), 'tuya');
  assert.equal(homeItemState('piso_baldosa', pet, owned), 'comprable');
  assert.equal(homeItemState('estante', pet, owned), 'cara');
  assert.equal(homeItemState('vista_espacio', pet, owned), 'bloqueada');
});

test('la barra lateral sabe en qué sección estás', () => {
  assert.equal(navKeyOf('/'), 'index');
  assert.equal(navKeyOf('/materia/abc'), 'materias');
  assert.equal(navKeyOf('/nota/x'), 'materias');
  assert.equal(navKeyOf('/proyectos/123'), 'proyectos');
  assert.equal(navKeyOf('/mascota'), 'mascota');
  assert.equal(navKeyOf('/ajustes'), 'ajustes');
  assert.equal(navKeyOf('/importar'), 'index');
  assert.equal(navKeyOf('/raro'), null);
});
