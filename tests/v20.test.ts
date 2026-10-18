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

// ---------- Enfocar juntos ----------
import {
  normalizeCode, formatCode, joinLink, personState, mergePeople, groupProgress, makeProposal, proposalOpen, joinPlan,
  parseProposal, parsePresence, myPresence, stateCounts, proposalText, type PresenceInfo,
} from '../lib/roomsLogic';

test('códigos de sala: se limpian y se rechazan los ambiguos', () => {
  assert.equal(normalizeCode(' kd7-x4p '), 'KD7X4P');
  assert.equal(normalizeCode('ABC12'), null);       // corto
  assert.equal(normalizeCode('ABCDE1'), null);      // el 1 no existe en los códigos
  assert.equal(normalizeCode('ABCDEO'), null);      // ni la O
  assert.equal(formatCode('KD7X4P'), 'KD7-X4P');
  assert.equal(joinLink('https://kaderno.app/', 'KD7X4P'), 'https://kaderno.app/sala/unirse?codigo=KD7X4P');
});

const P = (o: Partial<PresenceInfo>): PresenceInfo => ({ uid: 'u', name: 'X', pet: null, outfit: null, state: 'idle', endsAt: null, remainingMs: null, task: null, at: 0, ...o });

test('estado de cada persona en la sala', () => {
  const now = 1_000_000;
  assert.deepEqual(personState(undefined, now), { state: 'away', label: 'Fuera', detail: '' });
  assert.equal(personState(P({ state: 'work', endsAt: now + 12 * 60000 - 1 }), now).detail, 'quedan 12 min');
  assert.equal(personState(P({ state: 'break', remainingMs: 90_000 }), now).detail, 'vuelve en 2 min');
  assert.equal(personState(P({ state: 'idle' }), now).label, 'En la sala');
});

test('lista de la sala: tú primero, luego enfocados, descanso, en la sala y fuera', () => {
  const now = 0;
  const people = [
    { user_id: 'a', name: 'Ana', pomodoros: 2, minutes: 50 },
    { user_id: 'b', name: 'Beto', pomodoros: 1, minutes: 25 },
    { user_id: 'c', name: 'Caro', pomodoros: 0, minutes: 0 },
    { user_id: 'me', name: 'Yo', pomodoros: 1, minutes: 25 },
  ];
  const online = { b: P({ uid: 'b', state: 'break' }), c: P({ uid: 'c', state: 'work', endsAt: 60000 * 5 }), me: P({ uid: 'me' }), n: P({ uid: 'n', name: 'Nuevo' }) };
  const rows = mergePeople(people, online, 'me', now);
  assert.deepEqual(rows.map((r) => r.user_id), ['me', 'c', 'b', 'n', 'a']);
  assert.equal(stateCounts(rows), '1 enfocado, 1 en descanso, 2 en la sala');
  const g = groupProgress(people, 8);
  assert.equal(g.label, 'Juntos hoy: 4 de 8 pomodoros');
  assert.equal(groupProgress(people, 3).reached, true);
});

test('Empezar juntos: todos terminan a la misma hora', () => {
  const now = 1_000_000;
  const p = makeProposal('a', 'Ana', 25, now, 0.5);
  assert.equal(p.startAt, now + 10_000);
  assert.deepEqual(joinPlan(p, now + 4000), { waitMs: 6000, endsAt: now + 10_000 + 25 * 60000, lateMin: 0 });
  // Unirse tarde: termina igual que los demás.
  const late = joinPlan(p, now + 10_000 + 3 * 60000 + 5);
  assert.equal(late.waitMs, 0); assert.equal(late.lateMin, 3); assert.equal(late.endsAt, now + 10_000 + 25 * 60000);
  assert.equal(proposalOpen(p, now + 10_000 + 23 * 60000), true);
  assert.equal(proposalOpen(p, now + 10_000 + 24 * 60000 + 1), false);
  assert.match(proposalText(p, now), /^Ana propone un pomodoro de 25 min\. Empieza en 10 s\.$/);
  assert.match(proposalText(p, now + 10_000 + 60000), /Quedan 24 min/);
});

test('lo que llega por el canal se valida', () => {
  const now = 1_000_000;
  assert.equal(parseProposal(null, now), null);
  assert.equal(parseProposal({ id: 'x', by: 'a', name: 'A', workMin: 999, startAt: now }, now), null);
  assert.equal(parseProposal({ id: 'x', by: 'a', name: 'A', workMin: 25, startAt: now + 10 * 60000 }, now), null); // muy en el futuro
  assert.ok(parseProposal({ id: 'x', by: 'a', name: 'A'.repeat(99), workMin: 25, startAt: now + 5000 }, now)!.name.length <= 40);
  const pr = parsePresence({ uid: 'u', name: 5, state: 'hackeando', endsAt: 'x', task: 'T' });
  assert.equal(pr!.state, 'idle'); assert.equal(pr!.name, 'Alguien'); assert.equal(pr!.endsAt, null);
});

test('mi presencia solo muestra la tarea si lo permito', () => {
  const meP = { uid: 'me', name: 'Yo', pet: 'gato' };
  const f = { running: true, mode: 'work' as const, endsAt: 5000, remainingMs: 4000, taskTitle: 'Informe', startedPomodoro: false };
  assert.equal(myPresence(meP, f, false, 0).task, null);
  assert.equal(myPresence(meP, f, true, 0).task, 'Informe');
  const paused = myPresence(meP, { ...f, running: false, startedPomodoro: true }, true, 0);
  assert.equal(paused.state, 'work'); assert.equal(paused.endsAt, null); assert.equal(paused.remainingMs, 4000);
  assert.equal(myPresence(meP, { ...f, running: false, startedPomodoro: false }, true, 0).state, 'idle');
});

// ---------- Patio de mascotas ----------
import { PatioSim, slotX, frameFor, moodFor, ballPos, pickFriends, type PatioMember } from '../lib/pets/patio';
import { cleanOutfit, parseGreeting } from '../lib/roomsLogic';

const M = (uid: string, state: PatioMember['state'], me = false): PatioMember => ({ uid, name: uid.toUpperCase(), species: 'gato', outfit: {}, state, left: 10, me });
const run = (sim: PatioSim, ms: PatioMember[], secs: number, t0 = 0) => { let now = t0; for (let i = 0; i < secs * 20; i++) { now += 50; sim.step(ms, 0.05, now); } return now; };
const seq = () => { let x = 0.37; return () => (x = (x * 9301 + 49297) % 233280 / 233280); };

test('patio: enfocada va a su puesto y se queda quieta; fuera duerme sin moverse', () => {
  const sim = new PatioSim(120, seq());
  const ms = [M('a', 'online'), M('b', 'online')];
  run(sim, ms, 3);
  const work = [M('a', 'work'), M('b', 'away')];
  const bx = sim.actors.get('b')!.x;
  const now = run(sim, work, 8);
  assert.ok(Math.abs(sim.actors.get('a')!.x - slotX(0, 2, 120)) < 1, 'no llegó a su puesto');
  assert.equal(sim.actors.get('b')!.x, bx, 'la que duerme se movió');
  assert.equal(frameFor(sim.actors.get('a')!, 'work', now).startsWith('paso'), false);
  assert.match(frameFor(sim.actors.get('b')!, 'away', now), /^sueno/);
  assert.equal(moodFor('work'), 'concentrado');
  assert.equal(moodFor('away'), 'dormido');
});

test('patio: en el descanso juegan con la pelota (solo si son dos o más)', () => {
  const sim = new PatioSim(160, seq());
  run(sim, [M('a', 'break')], 2);
  assert.equal(sim.ball, null, 'pelota con una sola');
  const ms = [M('a', 'break'), M('b', 'break'), M('c', 'work')];
  const receivers = new Set<string>();
  let now = 0;
  for (let i = 0; i < 400; i++) { now += 50; sim.step(ms, 0.05, now); const bl: any = sim.ball; if (bl) { receivers.add(bl.to); const p = ballPos(bl); assert.ok(p.h >= 0 && p.h <= 16.01); } }
  assert.ok(sim.ball, 'no hay pelota');
  assert.ok(!receivers.has('c'), 'le pasaron la pelota a quien está enfocada');
  assert.ok(receivers.has('a') && receivers.has('b'), 'no se la pasan entre las dos');
  run(sim, [M('a', 'break'), M('b', 'work'), M('c', 'work')], 1, now);
  assert.equal(sim.ball, null, 'la pelota siguió con una sola en descanso');
});

test('patio: saludo y celebración', () => {
  const sim = new PatioSim(120, seq());
  const ms = [M('a', 'online'), M('b', 'work')];
  run(sim, ms, 1);
  sim.greet('a', 'b', 'Ana', 'Beto', ms, 1000);
  assert.equal(sim.actors.get('a')!.say, '¡Hola, Beto!');
  assert.equal(sim.actors.get('b')!.say, '¡Hola, Ana!');
  assert.ok(sim.actors.get('b')!.hopT >= 0);
  sim.celebrate(5000, 2000);
  sim.step(ms, 0.05, 5050);
  assert.equal(moodFor('work', sim.actors.get('b')!, 5100), 'feliz');
  // Quien se va de la sala desaparece del patio.
  sim.step([M('a', 'online')], 0.05, 6000);
  assert.equal(sim.actors.has('b'), false);
});

test('ropa y saludos que llegan por el canal se validan', () => {
  assert.deepEqual(cleanOutfit({ cabeza: 'gorro', ojos: 'corona', cuello: 'x' }), { cabeza: 'gorro' });
  assert.equal(cleanOutfit('nada'), null);
  const now = 1_000_000;
  assert.equal(parseGreeting({ id: 'g', from: 'a', fromName: 'A', to: 'b', at: now - 10 * 60000 }, now), null);
  assert.equal(parseGreeting({ id: 'g', from: 'a', fromName: 'A', to: 'b', at: now }, now)!.to, 'b');
});

test('mascotas sueltas: primero las que juegan, con tope y orden estable', () => {
  const L = [{ uid: 'd', state: 'away' as const }, { uid: 'c', state: 'work' as const }, { uid: 'b', state: 'online' as const }, { uid: 'a', state: 'break' as const }, { uid: 'e', state: 'break' as const }];
  assert.deepEqual(pickFriends(L, 3, false).map((x) => x.uid), ['a', 'b', 'e']);
  assert.deepEqual(pickFriends(L, 6, true).map((x) => x.uid), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(pickFriends(L, 6, false).map((x) => x.uid), ['a', 'b', 'c', 'e']);
});
