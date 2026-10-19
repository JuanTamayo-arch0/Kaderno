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

// ---------- Repaso nuevo (FSRS) ----------
import { schedule, preview, stateOf, dueOf, fromSm2, spanLabel, dueLabel, dateToDue } from '../lib/fsrs';
import {
  normalize, jaccard, similarCard, clozeParts, clozeText, cardError, convertKind, toDrafts, cardsWanted,
  buildQueue, cramQueue, secondsPerCard, estimateLabel, retentionPct, forecast, type CardLike,
} from '../lib/cards';

test('FSRS: una nueva pasa por los pasos cortos y luego a repaso', () => {
  const now = new Date(2026, 9, 19, 10, 0);
  const nueva = { fsrs_state: 0 };
  const again = schedule(nueva, 1, now);
  assert.equal(again.patch.fsrs_state, 1);
  assert.equal(Math.round((Date.parse(again.patch.due_at) - now.getTime()) / 60000), 1);
  assert.equal(again.log.state_before, 0);
  const good = schedule(nueva, 3, now);
  assert.equal(good.patch.fsrs_state, 1);
  assert.equal(Math.round((Date.parse(good.patch.due_at) - now.getTime()) / 60000), 10);
  const easy = schedule(nueva, 4, now);
  assert.equal(easy.patch.fsrs_state, 2);
  assert.ok(easy.patch.scheduled_days >= 1);
  // Después del paso de 10 min, "Bien" la gradúa a repaso.
  const t2 = new Date(Date.parse(good.patch.due_at));
  const grad = schedule(good.patch, 3, t2);
  assert.equal(grad.patch.fsrs_state, 2);
  assert.ok(grad.patch.scheduled_days >= 1);
});

test('FSRS: los botones dan intervalos crecientes y fallar manda a reaprender', () => {
  const now = new Date(2026, 9, 19, 10, 0);
  const row = { fsrs_state: 2, stability: 10, difficulty: 5, due_at: now.toISOString(), last_reviewed_at: new Date(now.getTime() - 10 * 86_400_000).toISOString(), reps: 4, scheduled_days: 10 };
  const p = preview(row, now);
  assert.ok(p[1].due < p[2].due && p[2].due < p[3].due && p[3].due < p[4].due);
  const fail = schedule(row, 1, now);
  assert.equal(fail.patch.fsrs_state, 3);
  assert.equal(fail.patch.lapses, 1);
  // Más retención = intervalos más cortos.
  assert.ok(schedule(row, 3, now, 0.95).patch.scheduled_days < schedule(row, 3, now, 0.85).patch.scheduled_days);
});

test('FSRS: migración desde SM-2 sin perder el avance', () => {
  assert.deepEqual(fromSm2(2.5, 12), { stability: 12, difficulty: 5 });
  assert.equal(fromSm2(1.3, 0).difficulty, 9.8);
  assert.equal(fromSm2(3.5, 30).difficulty, 1);
  const vieja = { reps: 3, interval_days: 6, ease: 2.5, due_date: '2026-10-25' };
  assert.equal(stateOf(vieja), 2);
  assert.equal(dueOf(vieja)!.getDate(), 25);
  assert.equal(stateOf({ reps: 0 }), 0);
  assert.equal(dueOf({ fsrs_state: 0 }), null);
  const s = schedule(vieja, 3, dateToDue('2026-10-25'));
  assert.ok(s.patch.scheduled_days > 6, 'no respetó la estabilidad heredada');
});

test('etiquetas de tiempo', () => {
  assert.equal(spanLabel(60_000), '1 min');
  assert.equal(spanLabel(10 * 60_000), '10 min');
  assert.equal(spanLabel(86_400_000), '1 día');
  assert.equal(spanLabel(6 * 86_400_000), '6 días');
  assert.equal(spanLabel(61 * 86_400_000), '2 meses');
  const now = new Date(2026, 9, 19, 10);
  assert.equal(dueLabel({ fsrs_state: 0 }, now), 'Nueva');
  assert.equal(dueLabel({ fsrs_state: 2, due_at: new Date(2026, 9, 20, 9).toISOString() }, now), 'Mañana');
  assert.equal(dueLabel({ fsrs_state: 2, due_at: new Date(2026, 9, 25, 9).toISOString() }, now), 'En 6 días');
  assert.equal(dueLabel({ fsrs_state: 2, due_at: new Date(2026, 9, 18).toISOString() }, now), 'Para hoy');
});

test('duplicados: sin tildes ni signos, por palabras', () => {
  assert.equal(normalize('¿Qué es la FRL?'), 'que es la frl');
  assert.ok(jaccard('¿Qué hace la unidad FRL?', 'que hace la unidad frl') === 1);
  const ex = [{ id: '1', front: '¿Qué hace la unidad FRL?' }, { id: '2', front: 'Ley de Ohm' }];
  assert.equal(similarCard('Qué hace la unidad FRL', ex)?.id, '1');
  assert.equal(similarCard('¿Qué mide un manómetro?', ex), null);
});

test('completar: un solo espacio, se oculta y se revela', () => {
  assert.deepEqual(clozeParts('La unidad {{FRL}} filtra el aire'), { before: 'La unidad ', answer: 'FRL', after: ' filtra el aire' });
  assert.equal(clozeParts('sin espacio'), null);
  assert.equal(clozeParts('{{a}} y {{b}}'), null);
  assert.equal(clozeText('La unidad {{FRL}} filtra', false), 'La unidad [ … ] filtra');
  assert.equal(clozeText('La unidad {{FRL}} filtra', true), 'La unidad **FRL** filtra');
  assert.equal(cardError({ kind: 'cloze', front: 'sin marca', back: '' }), 'Marca la palabra que se oculta con {{ }}.');
  assert.equal(cardError({ kind: 'basic', front: 'P', back: '' }), 'Falta la respuesta.');
  assert.equal(cardError({ kind: 'basic', front: 'P', back: 'R' }), null);
  assert.deepEqual(convertKind({ kind: 'basic', front: 'La unidad FRL filtra el aire', back: 'FRL' }, 'cloze'), { kind: 'cloze', front: 'La unidad {{FRL}} filtra el aire', back: '' });
  assert.deepEqual(convertKind({ kind: 'cloze', front: 'La unidad {{FRL}} filtra', back: '' }, 'basic'), { kind: 'basic', front: 'La unidad ___ filtra', back: 'FRL' });
});

test('borradores de la IA: repetidas desmarcadas y cuántas pedir', () => {
  const d = toDrafts([
    { kind: 'basic', front: '¿Qué hace la unidad FRL?', back: 'Filtra' },
    { kind: 'cloze', front: 'La presión es {{fuerza sobre área}}', back: '' },
    { kind: 'basic', front: '¿Qué hace la unidad FRL?', back: 'Otra' },
    { kind: 'cloze', front: 'mal formada', back: '' },
  ], [{ id: 'x', front: 'Ley de Ohm' }]);
  assert.deepEqual(d.map((x) => x.keep), [true, true, false, false]);
  assert.equal(d[2].similarTo?.id, 'nueva-0');
  assert.equal(cardsWanted('palabra '.repeat(100)), 4);
  assert.equal(cardsWanted('palabra '.repeat(2000)), 12);
  assert.equal(cardsWanted('palabra '.repeat(10), true), 1);
});

test('cola del día: tope de nuevas, examen primero, suspendidas fuera', () => {
  const now = new Date(2026, 9, 19, 10);
  const C = (id: string, o: Partial<CardLike>): CardLike => ({ id, front: id, back: '', subject_id: 'a', ...o });
  const cards = [
    C('n1', { fsrs_state: 0, created_at: '2026-10-01', subject_id: 'a' }),
    C('n2', { fsrs_state: 0, created_at: '2026-10-02', subject_id: 'fis' }),
    C('n3', { fsrs_state: 0, created_at: '2026-10-03', subject_id: 'a' }),
    C('r1', { fsrs_state: 2, due_at: new Date(2026, 9, 18).toISOString() }),
    C('r2', { fsrs_state: 2, due_at: new Date(2026, 9, 15).toISOString() }),
    C('r3', { fsrs_state: 2, due_at: new Date(2026, 9, 25).toISOString() }),
    C('l1', { fsrs_state: 1, due_at: new Date(2026, 9, 19, 10, 5).toISOString() }),
    C('s1', { fsrs_state: 2, due_at: new Date(2026, 9, 10).toISOString(), suspended: true }),
  ];
  const q = buildQueue({ cards, now, newPerDay: 2, newDoneToday: 0, examDays: { fis: 4 } });
  assert.deepEqual(q.due.map((c) => c.id), ['r2', 'r1']);
  assert.deepEqual(q.fresh.map((c) => c.id), ['n2', 'n1']);
  assert.deepEqual(q.learning.map((c) => c.id), ['l1']);
  assert.equal(buildQueue({ cards, now, newPerDay: 2, newDoneToday: 5 }).fresh.length, 0);
  assert.deepEqual(buildQueue({ cards, now, newPerDay: 10, newDoneToday: 0, subjectId: 'fis' }).fresh.map((c) => c.id), ['n2']);
  assert.deepEqual(cramQueue(cards, 'a').map((c) => c.id).slice(-2), ['n1', 'n3']);
});

test('estadísticas: tiempo estimado, retención y pronóstico', () => {
  assert.equal(secondsPerCard([]), 10);
  const rs = Array.from({ length: 10 }, (_, i) => ({ reviewed_at: new Date(2026, 9, 18).toISOString(), rating: i < 8 ? 3 : 1, duration_ms: 8000, state_before: 2 }));
  assert.equal(secondsPerCard(rs), 8);
  assert.equal(estimateLabel(30, 8), 'unos 4 min');
  assert.equal(retentionPct(rs, 0), 80);
  const now = new Date(2026, 9, 19, 10);
  const f = forecast([
    { id: 'a', front: '', back: '', subject_id: null, fsrs_state: 2, due_at: new Date(2026, 9, 10).toISOString() },
    { id: 'b', front: '', back: '', subject_id: null, fsrs_state: 2, due_at: new Date(2026, 9, 20, 9).toISOString() },
    { id: 'c', front: '', back: '', subject_id: null, fsrs_state: 0 },
  ], now, 7);
  assert.deepEqual(f.slice(0, 2).map((x) => x.n), [1, 1]);
});

test('IA de tarjetas: instrucciones y validación de lo que devuelve', async () => {
  const { flashcardPrompt, parseCards } = await import('../supabase/functions/_shared/cards');
  const p = flashcardPrompt('El aire comprimido...', 3, ['¿Qué es la FRL?'], 'note');
  assert.match(p, /exactamente 3 tarjetas/);
  assert.match(p, /NO repitas[\s\S]*¿Qué es la FRL\?/);
  const got = parseCards('Aquí van: [{"kind":"basic","front":"¿P?","back":"R"},{"kind":"cloze","front":"La {{FRL}} filtra","back":"x"},{"kind":"cloze","front":"sin espacio","back":""},{"kind":"basic","front":"sin respuesta","back":""},{"kind":"raro","front":"a","back":"b"}] listo');
  assert.deepEqual(got, [{ kind: 'basic', front: '¿P?', back: 'R' }, { kind: 'cloze', front: 'La {{FRL}} filtra', back: '' }]);
  assert.deepEqual(parseCards('no es json'), []);
  assert.equal(parseCards(JSON.stringify(Array.from({ length: 20 }, () => ({ front: 'a', back: 'b' })))).length, 12);
});

test('sesión: una nueva cada 3 repasos y titulo del fragmento', async () => {
  const { interleave, headingBefore } = await import('../lib/cards');
  assert.deepEqual(interleave(['r1', 'r2', 'r3', 'r4'], ['n1', 'n2']), ['r1', 'r2', 'r3', 'n1', 'r4', 'n2']);
  assert.deepEqual(interleave([], ['n1']), ['n1']);
  const md = '# Tema\n\nintro\n\n## Fuerza limitada\n\nLa fuerza depende del **área**.\n\n## Ruido\n\n85 dB';
  assert.equal(headingBefore(md, 'La fuerza depende del área'), 'Fuerza limitada');
  assert.equal(headingBefore(md, '85 dB'), 'Ruido');
  assert.equal(headingBefore(md, 'no está'), null);
});

test('completar dentro de una fórmula usa un recuadro de LaTeX', async () => {
  const { clozeText } = await import('../lib/cards');
  assert.equal(clozeText('Newton: $F = {{m \\cdot a}}$', false), 'Newton: $F = \\boxed{\\;?\\;}$');
  assert.equal(clozeText('Newton: $F = {{m \\cdot a}}$', true), 'Newton: $F = \\boxed{m \\cdot a}$');
  assert.equal(clozeText('Cuesta \\$20 y la {{FRL}} filtra', false), 'Cuesta \\$20 y la [ … ] filtra');
});

// ---------- Fase 2: días de estudio y rachas ----------
const sd = (day: string, focus = 0, extra: Partial<{ tasks_done: number; cards: number; tests: number; protected: boolean }> = {}) =>
  ({ day, focus_min: focus, tasks_done: 0, cards: 0, tests: 0, protected: false, ...extra });

test('un día cuenta con 10 min, 1 tarea, 10 tarjetas o 1 prueba', async () => {
  const { dayCounts } = await import('../lib/streaks');
  assert.equal(dayCounts(sd('2026-10-19', 9)), false);
  assert.equal(dayCounts(sd('2026-10-19', 10)), true);
  assert.equal(dayCounts(sd('2026-10-19', 0, { tasks_done: 1 })), true);
  assert.equal(dayCounts(sd('2026-10-19', 0, { cards: 9 })), false);
  assert.equal(dayCounts(sd('2026-10-19', 0, { cards: 10 })), true);
  assert.equal(dayCounts(sd('2026-10-19', 0, { tests: 1 })), true);
});

test('fechas: sumar días y lunes de la semana', async () => {
  const { addDaysISO, weekStartISO } = await import('../lib/streaks');
  assert.equal(addDaysISO('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysISO('2026-03-01', -1), '2026-02-28');
  assert.equal(weekStartISO('2026-10-19'), '2026-10-19'); // lunes
  assert.equal(weekStartISO('2026-10-25'), '2026-10-19'); // domingo
});

test('racha diaria: cuenta desde ayer si hoy aún no, y los escudos la sostienen', async () => {
  const { summarize } = await import('../lib/streaks');
  const rows = [sd('2026-10-14', 20), sd('2026-10-15', 20), sd('2026-10-16', 0, { protected: true }), sd('2026-10-17', 0, { tasks_done: 1 }), sd('2026-10-18', 30)];
  const s = summarize(rows, '2026-10-19', 4, 0);
  assert.equal(s.daily, 5);
  assert.equal(s.today.ok, false);
  assert.equal(s.repair, null);
  const s2 = summarize([...rows, sd('2026-10-19', 12)], '2026-10-19', 4, 0);
  assert.equal(s2.daily, 6);
});

test('meta semanal: semanas seguidas, la actual no rompe si aún no se cumple', async () => {
  const { summarize, addDaysISO } = await import('../lib/streaks');
  const rows = [];
  // Semanas del 28 sep, 5 oct y 12 oct con 4 días cada una; esta semana (19 oct) solo 1.
  for (const mon of ['2026-09-28', '2026-10-05', '2026-10-12']) for (let k = 0; k < 4; k++) rows.push(sd(addDaysISO(mon, k), 25));
  rows.push(sd('2026-10-19', 25));
  const s = summarize(rows, '2026-10-21', 4, 0);
  assert.equal(s.weekly, 3);
  assert.equal(s.weekDone, 1);
  assert.deepEqual(s.week.map((w) => w.state), ['done', 'missed', 'today', 'future', 'future', 'future', 'future']);
  assert.equal(summarize(rows, '2026-10-21', 5, 0).weekly, 0);
  // Cumplir la meta esta semana suma una más.
  rows.push(sd('2026-10-20', 25), sd('2026-10-21', 25), sd('2026-10-22', 25));
  assert.equal(summarize(rows, '2026-10-22', 4, 0).weekly, 4);
});

test('reparar y escudos: qué se ofrece cuando se rompe la racha', async () => {
  const { summarize, brokeMessage, repairProgress } = await import('../lib/streaks');
  const base = [sd('2026-10-15', 20), sd('2026-10-16', 20), sd('2026-10-17', 20)];
  // Ayer faltó, sin escudos: reparar.
  let s = summarize(base, '2026-10-19', 4, 0);
  assert.deepEqual(s.repair && { missed: s.repair.missed, prev: s.repair.prev }, { missed: 1, prev: 3 });
  assert.match(brokeMessage(s)!, /no saltarse dos/);
  assert.equal(repairProgress(s)!.frac, 0);
  // Con escudo: lo tapará al estudiar hoy, sin mensaje.
  s = summarize(base, '2026-10-19', 4, 1);
  assert.equal(s.shieldWillCover, 1);
  assert.equal(s.repair, null);
  // Hoy ya hizo 30 min sin escudo: sigue la oferta y el avance.
  s = summarize([...base, sd('2026-10-19', 30)], '2026-10-19', 4, 0);
  assert.equal(repairProgress(s)!.frac, 0.6);
  // Dos días: mensaje distinto. Tres: ya no se repara.
  assert.match(brokeMessage(summarize(base, '2026-10-20', 4, 0))!, /dos días/);
  assert.equal(summarize(base, '2026-10-21', 4, 2).repair, null);
});

// ---------- Fase 2: ¿Cuándo lo haces? ----------
test('huecos libres: fuera de clases, después de ahora y antes de la entrega', async () => {
  const { freeSlots } = await import('../lib/planSlots');
  const now = new Date(2026, 9, 19, 13, 10); // lunes 1:10 pm
  const due = new Date(2026, 9, 22);          // jueves, sin hora
  const classes = (d: Date) => d.getDay() === 2 ? [{ start: 14 * 60, end: 18 * 60 }] : [];
  const out = freeSlots({ now, due, classesFor: classes, habit: [16] });
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((d) => [d.getDate(), d.getHours(), d.getMinutes()]), [[19, 16, 0], [20, 10, 0], [21, 16, 0]]);
  // Hoy tarde y con plan a las 4: busca otra hora.
  const busy = [{ start: new Date(2026, 9, 19, 16).getTime(), end: new Date(2026, 9, 19, 16, 50).getTime() }];
  const out2 = freeSlots({ now, due, busy, habit: [16] });
  assert.notEqual(out2[0].getHours(), 16);
  // Entrega mañana a las 9 am: hoy o mañana antes de las 8.
  const out3 = freeSlots({ now, due: new Date(2026, 9, 20, 9, 0), dueHasTime: true });
  assert.ok(out3.length >= 1);
  assert.ok(out3.every((d) => d.getTime() + 50 * 60_000 <= new Date(2026, 9, 20, 8, 0).getTime()));
  assert.ok(out3.every((d) => d.getTime() > now.getTime()));
});

test('horas habituales desde las sesiones de enfoque', async () => {
  const { habitHours } = await import('../lib/planSlots');
  const at = (h: number, m: number) => new Date(2026, 9, 10, h, m).toISOString();
  assert.deepEqual(habitHours([
    { created_at: at(16, 25), minutes: 25 }, { created_at: at(16, 30), minutes: 25 }, { created_at: at(16, 40), minutes: 25 },
    { created_at: at(10, 50), minutes: 50 }, { created_at: at(10, 55), minutes: 50 }, { created_at: at(20, 0), minutes: 25 },
  ]), [16, 10]);
});

test('frase del plan y etiquetas', async () => {
  const { planPhrase, slotLabel, placePhrase, needsPlan, isStalled, mergePlaces } = await import('../lib/planSlots');
  const now = new Date(2026, 9, 19, 9, 0);
  assert.equal(planPhrase('Informe', new Date(2026, 9, 22, 16, 0), 'Biblioteca', now), 'Si son las 4:00 pm del jueves, empiezo "Informe" en la biblioteca.');
  assert.equal(planPhrase('Taller', new Date(2026, 9, 19, 13, 0), 'Casa', now), 'Si es la 1:00 pm de hoy, empiezo "Taller" en casa.');
  assert.equal(planPhrase('Taller', new Date(2026, 9, 20, 10, 30), null, now), 'Si son las 10:30 am de mañana, empiezo "Taller".');
  assert.equal(slotLabel(new Date(2026, 9, 19, 16), now), 'Hoy 4:00 pm');
  assert.equal(slotLabel(new Date(2026, 9, 20, 10), now), 'Mañana 10:00 am');
  assert.equal(slotLabel(new Date(2026, 9, 22, 14), now), 'Jue 2:00 pm');
  assert.equal(placePhrase('Café Juan Valdez'), 'en Café Juan Valdez');
  assert.equal(needsPlan('2026-10-19', now), false);
  assert.equal(needsPlan('2026-10-20', now), true);
  assert.equal(isStalled(new Date(2026, 9, 19, 8, 20).toISOString(), now, false), true);
  assert.equal(isStalled(new Date(2026, 9, 19, 8, 40).toISOString(), now, false), false);
  assert.equal(isStalled(new Date(2026, 9, 19, 8, 20).toISOString(), now, true), false);
  assert.deepEqual(mergePlaces(['biblioteca', 'Café', '', 'Café']), ['Casa', 'Biblioteca', 'Universidad', 'Café']);
});

// ---------- Fase 2: tu tiempo real ----------
test('tiempo real: mediana con al menos 5 tareas y sugerencia redondeada', async () => {
  const { estimateRatio, isMeaningful, estimateHint, tookText, planVsReal } = await import('../lib/estimate');
  const rows = [
    { estimate_min: 30, focus_min: 50 }, { estimate_min: 60, focus_min: 90 }, { estimate_min: 30, focus_min: 45 },
    { estimate_min: 20, focus_min: 40 }, { estimate_min: 5, focus_min: 60 }, { estimate_min: 30, focus_min: 3 },
  ];
  assert.equal(estimateRatio(rows), null); // solo 4 válidas
  const r = estimateRatio([...rows, { estimate_min: 40, focus_min: 64 }])!;
  assert.equal(r, 1.6);
  assert.equal(isMeaningful(1.1), false);
  assert.equal(isMeaningful(0.7), true);
  assert.deepEqual(estimateHint(30, r), { text: 'Sueles tardar 1,6 veces lo que calculas. ¿Pongo 50 min?', value: 50 });
  assert.equal(estimateHint(30, 1.1), null);
  assert.equal(tookText(50, 30), 'Te tomó 50 min (calculaste 30 min)');
  assert.equal(tookText(80, 60), 'Te tomó 1 h 20 min (calculaste 1 h)');
  assert.equal(tookText(3, 30), null);
  assert.equal(planVsReal(360, 270), 'La semana pasada planeaste 6 h y estudiaste 4 h 30.');
});

// ---------- Fase 3: plan del parcial ----------
test('plan del parcial: sesiones a 14, 7, 4, 2 y 1 días y su tipo', async () => {
  const { planSessions, shouldOffer, sessionTitle, planProgress } = await import('../lib/examPlan');
  const now = new Date(2026, 9, 19, 9, 0);
  const at = (n: number) => new Date(2026, 9, 19 + n);
  const kinds = (d: number) => planSessions(at(d), now).map((s) => `${s.offset}:${s.kind}`);
  assert.deepEqual(kinds(20), ['14:prep', '7:mix', '4:mix', '2:sim', '1:light']);
  assert.deepEqual(kinds(10), ['7:prep', '4:mix', '2:sim', '1:light']);
  assert.deepEqual(kinds(5), ['4:prep', '2:sim', '1:light']);
  assert.deepEqual(kinds(3), ['2:sim', '1:light']);
  assert.deepEqual(planSessions(at(2), now).map((s) => [s.title, s.day.getDate()]), [['Simulacro rápido', 19], ['Repaso ligero', 20]]);
  assert.deepEqual(planSessions(at(1), now).map((s) => s.day.getDate()), [19, 19]);
  assert.equal(planSessions(at(0), now).length, 0);
  assert.deepEqual(planSessions(at(20), now).map((s) => s.minutes), [50, 50, 50, 50, 20]);
  assert.equal(planSessions(at(20), now)[0].day.getDate(), 25);
  assert.equal(shouldOffer('examen', '2026-10-22', now), true);
  assert.equal(shouldOffer('examen', '2026-10-21', now), false);
  assert.equal(shouldOffer('tarea', '2026-10-30', now), false);
  assert.equal(sessionTitle('sim', 'Parcial 3'), 'Simulacro · Parcial 3');
  assert.equal(planProgress([{ status: 'done' }, { status: 'pending' }, { status: 'done' }, {}]).text, 'Plan de repaso: 2 de 4 sesiones hechas');
});

test('plan del parcial: si cambia la fecha, se corren las sesiones que faltan', async () => {
  const { shiftSessions } = await import('../lib/examPlan');
  const now = new Date(2026, 9, 19, 9, 0);
  const r = shiftSessions([
    { id: 'a', status: 'done', due_date: '2026-10-18' },
    { id: 'b', due_date: '2026-10-22', plan_at: new Date(2026, 9, 22, 16).toISOString() },
    { id: 'c', due_date: '2026-10-28' },
  ], 3, now, new Date(2026, 9, 31));
  assert.deepEqual(r.move.map((m) => [m.id, m.due_date]), [['b', '2026-10-25'], ['c', '2026-10-31']].slice(0, 1));
  assert.deepEqual(r.drop, ['c']);
  assert.equal(new Date(r.move[0].plan_at!).getHours(), 16);
  // Hacia atrás: la que cae en el pasado no se mueve.
  assert.deepEqual(shiftSessions([{ id: 'x', due_date: '2026-10-20' }], -3, now, new Date(2026, 9, 25)).drop, ['x']);
});

test('huecos de un solo día para las sesiones del plan', async () => {
  const { freeSlots } = await import('../lib/planSlots');
  const now = new Date(2026, 9, 19, 9, 0);
  const one = freeSlots({ now, day: new Date(2026, 9, 23), count: 1, duration: 20, habit: [18] });
  assert.equal(one.length, 1);
  assert.deepEqual([one[0].getDate(), one[0].getHours()], [23, 18]);
  assert.equal(freeSlots({ now, day: new Date(2026, 9, 18), count: 1 }).length, 0);
});

// ---------- Fase 3: simulacro y ponme a prueba ----------
test('IA del simulacro: lee preguntas válidas y descarta las malas', async () => {
  const { parseQuiz, quizPrompt, notesBlock, parseGrades, parseRecall } = await import('../supabase/functions/_shared/quiz');
  const txt = 'Aquí va:\n' + JSON.stringify([
    { type: 'mc', q: '¿Unidad de fuerza?', options: ['N', 'J', 'W', 'Pa'], answer: 0, explain: 'Newton.', note: 1 },
    { type: 'mc', q: 'Mala', options: ['a', 'b', 'c'], answer: 0 },
    { type: 'mc', q: 'Repetidas', options: ['a', 'a', 'b', 'c'], answer: 1 },
    { type: 'short', q: '¿Qué dice la primera ley?', answer: 'Inercia', explain: '', note: 7 },
    { type: 'num', q: 'Calcula', answer: 12.5, explain: 'x', note: 2 },
    { type: 'otro', q: 'x', answer: 'y' },
  ]);
  const qs = parseQuiz(txt, 20, 2);
  assert.deepEqual(qs.map((q) => [q.type, q.note]), [['mc', 0], ['short', null], ['num', 1]]);
  assert.equal(qs[2].answer, '12.5');
  assert.equal(parseQuiz('nada', 5, 1).length, 0);
  assert.match(quizPrompt([{ title: 'A', content: 'x' }], 10), /exactamente 10 preguntas/);
  assert.ok(notesBlock([{ title: 'A', content: 'a'.repeat(9000) }, { title: 'B', content: 'b'.repeat(9000) }]).length <= 12000 + 60);
  assert.deepEqual(parseGrades('[{"verdict":"ok","why":"bien"},{"verdict":"meh"}]', 3), [{ verdict: 'ok', why: 'bien' }, null, null]);
  const r = parseRecall('{"recalled":["F = ma"],"missing":[{"point":"Tercera ley","heading":"leyes de newton"}],"wrong":[],"score":140}', ['Leyes de Newton']);
  assert.deepEqual(r, { recalled: ['F = ma'], missing: [{ point: 'Tercera ley', heading: 'Leyes de Newton' }], wrong: [], score: 100 });
  assert.equal(parseRecall('sin json'), null);
});

test('simulacro: corrección automática, nota en la escala y desglose', async () => {
  const { autoGrade, numericClose, scoreQuiz, toScale, fmtGrade, byNote, errorDrafts, prepText, recallLabel, pickNotes, headingsOf, cycleVerdict } = await import('../lib/quiz');
  const qs: any[] = [
    { type: 'mc', q: 'A', options: ['1', '2', '3', '4'], answer: 2, explain: 'Porque sí', note: 0 },
    { type: 'num', q: 'B', answer: '12,5 m/s', explain: '', note: 1 },
    { type: 'short', q: 'C', answer: 'Inercia', explain: 'Primera ley', note: 1 },
  ];
  assert.equal(autoGrade(qs[0], 2), 'ok');
  assert.equal(autoGrade(qs[0], 1), 'wrong');
  assert.equal(autoGrade(qs[1], '12.4'), 'ok');
  assert.equal(autoGrade(qs[1], '15'), null);
  assert.equal(autoGrade(qs[2], 'inercia'), 'ok');
  assert.equal(autoGrade(qs[2], 'la de inercia'), null);
  assert.equal(autoGrade(qs[2], '  '), 'skip');
  assert.equal(numericClose('1 200 N', '1200'), true);
  const ans: any[] = [{ verdict: 'ok' }, { verdict: 'partial' }, { verdict: 'wrong' }];
  const { pct } = scoreQuiz(ans, 3);
  assert.equal(pct, 50);
  assert.equal(fmtGrade(toScale(76, 5), 5), '3,8 / 5');
  assert.equal(fmtGrade(toScale(76, 100), 100), '76 / 100');
  const notes = [{ id: 'n1', title: 'Leyes' }, { id: 'n2', title: 'Cinemática' }];
  assert.deepEqual(byNote(qs, ans, notes).map((r) => [r.title, r.points, r.total]), [['Cinemática', 0.5, 2], ['Leyes', 1, 1]]);
  assert.deepEqual(errorDrafts(qs, ans).map((d) => d.back), ['12,5 m/s', 'Inercia. Primera ley']);
  assert.equal(cycleVerdict('ok'), 'partial');
  assert.equal(prepText([{ score: 3.1, scale: 5, created_at: '2026-10-01' }, { score: 3.8, scale: 5, created_at: '2026-10-10' }]), 'Preparación: último simulacro 3,8 (antes 3,1)');
  assert.equal(recallLabel(new Date(2026, 9, 16, 20).toISOString(), 70, new Date(2026, 9, 19, 9)), 'Probada hace 3 días · 70%');
  const picked = pickNotes([
    { id: 'a', title: 'Vieja', content: 'x'.repeat(8000), created_at: '2026-09-01' },
    { id: 'b', title: 'Nueva', content: 'y'.repeat(8000), created_at: '2026-10-01' },
    { id: 'c', title: 'Corta', content: 'hola', created_at: '2026-10-05' },
  ], null);
  assert.deepEqual(picked.map((n) => [n.id, n.content.length]), [['b', 8000], ['a', 4000]]);
  assert.deepEqual(headingsOf('# Tema\ntexto\n## Fuerza neta ##\n### Ruido'), ['Tema', 'Fuerza neta', 'Ruido']);
});
