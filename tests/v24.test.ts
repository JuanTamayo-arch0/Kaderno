import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- Fase 1: planes y topes ----------
const NOW = new Date(2026, 10, 15, 10, 0);
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

test('planes: precios, ahorro anual y pesos', async () => {
  const { priceOf, yearlySaving, cop, perMonth, PRICES } = await import('../lib/billing');
  assert.equal(priceOf('pro', 'month'), 9_900);
  assert.equal(priceOf('pro', 'year'), 89_000);
  assert.equal(priceOf('team', 'month', 5), 74_500, 'Equipo es por persona');
  assert.equal(priceOf('team', 'month', 1), 29_800, 'Equipo cobra mínimo 2 personas');
  assert.ok(PRICES.pro.month < 10_100, 'Pro mensual queda por debajo de Spotify Estudiantes');
  assert.deepEqual(yearlySaving('pro'), { pesos: 29_800, pct: 25 });
  assert.equal(cop(1234567), '$1.234.567');
  assert.equal(cop(0), '$0');
  assert.equal(perMonth('pro', 'year'), 7_400);
});

test('planes: topes por plan y el mensaje que invita a Pro', async () => {
  const { limitOf, limitMessage, isUpsell, LIMITS } = await import('../lib/billing');
  assert.equal(limitOf('free', 'quiz'), LIMITS.free.quiz);
  assert.equal(limitOf('team', 'quiz'), LIMITS.pro.quiz, 'Equipo usa los topes de Pro');
  assert.equal(limitOf(null, 'ocr'), LIMITS.free.ocr);
  for (const k of Object.keys(LIMITS.free) as (keyof typeof LIMITS.free)[]) assert.ok(LIMITS.pro[k] > LIMITS.free[k], `Pro da más ${k}`);
  assert.ok(isUpsell(limitMessage('free', 'quiz')));
  assert.ok(!isUpsell(limitMessage('pro', 'quiz')), 'a quien ya tiene Pro no se le ofrece Pro');
  assert.match(limitMessage('free', 'ocr'), /20 páginas leídas/);
});

test('planes: lo que dice "Tu plan" en cada estado', async () => {
  const { planView } = await import('../lib/billing');
  assert.equal(planView(null, NOW).name, 'Gratis');
  assert.match(planView({ plan: 'free', trial_available: true }, NOW).line, /7 días/);
  const tr = planView({ plan: 'pro', status: 'trial', period_end: inDays(5) }, NOW);
  assert.equal(tr.badge, 'trial'); assert.equal(tr.daysLeft, 5); assert.match(tr.line, /te quedan 5 días/); assert.ok(tr.canPay);
  assert.match(planView({ plan: 'pro', status: 'trial', period_end: inDays(0.5) }, NOW).line, /termina mañana/);
  const ar = planView({ plan: 'pro', status: 'active', auto_renew: true, period_end: inDays(20), source_label: 'Nequi •••• 1111' }, NOW);
  assert.match(ar.line, /^Se renueva el 5 dic con Nequi •••• 1111\.$/); assert.ok(!ar.canPay);
  assert.match(planView({ plan: 'pro', status: 'canceled', period_end: inDays(20) }, NOW).line, /Pagado hasta el 5 dic\. No se renueva/);
  const pd = planView({ plan: 'pro', status: 'past_due', period_end: inDays(2), next_charge_at: inDays(1), source_label: 'Visa •••• 4242' }, NOW);
  assert.equal(pd.badge, 'warn'); assert.match(pd.line, /No pudimos cobrar la renovación a Visa •••• 4242\. Lo intentamos de nuevo el 16 nov/);
  const vt = planView({ plan: 'team', via_team: { owner: 'Ana', until: inDays(10) } }, NOW);
  assert.equal(vt.name, 'Equipo'); assert.match(vt.line, /equipo de Ana/); assert.ok(!vt.canPay);
  assert.match(planView({ plan: 'free', own_plan: 'pro', status: 'trial', period_end: inDays(-1), trial_available: false }, NOW).line, /Tu plan de prueba terminó el 14 nov/);
});

test('planes: uso de hoy muestra lo básico y lo que se usó', async () => {
  const { usageRows } = await import('../lib/billing');
  const rows = usageRows('free', { quiz: 2, meeting: 1 });
  assert.deepEqual(rows.map((r) => r.key), ['summary', 'flashcards', 'quiz', 'ocr', 'meeting']);
  assert.equal(rows.find((r) => r.key === 'quiz')!.limit, 2);
});

// ---------- Fase 2: Wompi ----------
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

test('wompi: firma de integridad y verificación de eventos', async () => {
  const { integritySignature, verifyEvent, eventChecksum } = await import('../supabase/functions/_shared/wompi');
  assert.equal(await integritySignature('KD-C-1', 990000, 'COP', 'test_integrity_x'), sha('KD-C-1990000COPtest_integrity_x'));
  assert.equal(await integritySignature('KD-C-1', 990000, 'COP', 's', '2026-12-01T00:00:00.000Z'), sha('KD-C-1990000COP2026-12-01T00:00:00.000Zs'));
  const ev: any = {
    event: 'transaction.updated', timestamp: 1763251200,
    data: { transaction: { id: '1234-1610641025-49201', status: 'APPROVED', amount_in_cents: 990000, reference: 'KD-C-1' } },
    signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum: '' },
  };
  ev.signature.checksum = sha('1234-1610641025-49201APPROVED9900001763251200test_events_abc');
  assert.equal(await eventChecksum(ev, 'test_events_abc'), ev.signature.checksum);
  assert.ok(await verifyEvent(ev, 'test_events_abc'));
  assert.ok(await verifyEvent({ ...ev, signature: { ...ev.signature, checksum: 'x' } }, 'test_events_abc', ev.signature.checksum.toUpperCase()), 'vale la cabecera X-Event-Checksum');
  assert.ok(!(await verifyEvent(ev, 'otro_secreto')), 'otro secreto');
  const tampered = JSON.parse(JSON.stringify(ev)); tampered.data.transaction.amount_in_cents = 100;
  assert.ok(!(await verifyEvent(tampered, 'test_events_abc')), 'monto cambiado');
  assert.ok(!(await verifyEvent({ ...ev, signature: { properties: [], checksum: ev.signature.checksum } }, 'test_events_abc')), 'sin propiedades no vale');
  assert.ok(!(await verifyEvent(ev, '')), 'sin secreto configurado no se acepta nada');
});

test('wompi: checkout, referencias y etiquetas', async () => {
  const { checkoutUrl, newReference, sourceLabel, apiBase, envOfKey, isFinal } = await import('../supabase/functions/_shared/wompi');
  const u = checkoutUrl({ publicKey: 'pub_test_X', amountInCents: 990000, reference: 'KD-C-1', signature: 'abc', redirectUrl: 'https://kaderno.app/plan?ref=KD-C-1', email: 'a@b.co' });
  assert.ok(u.startsWith('https://checkout.wompi.co/p/?public-key=pub_test_X&currency=COP&amount-in-cents=990000&reference=KD-C-1&signature:integrity=abc'));
  assert.match(u, /redirect-url=https%3A%2F%2Fkaderno\.app%2Fplan%3Fref%3DKD-C-1/);
  assert.match(u, /customer-data:email=a%40b\.co/);
  const a = newReference('renewal'), b = newReference('renewal');
  assert.match(a, /^KD-R-[0-9A-Z]+-[0-9A-Z]{8}$/); assert.notEqual(a, b);
  assert.equal(sourceLabel('CARD', { brand: 'VISA', last4: '4242' }), 'Visa •••• 4242');
  assert.equal(sourceLabel('NEQUI', { phone: '3991111111' }), 'Nequi •••• 1111');
  assert.equal(apiBase('sandbox'), 'https://sandbox.wompi.co/v1');
  assert.equal(envOfKey('pub_prod_abc'), 'production'); assert.equal(envOfKey('pub_test_abc'), 'sandbox');
  assert.ok(isFinal('DECLINED') && !isFinal('PENDING'));
});

test('wompi: la tarjeta y el Nequi se validan antes de mandarlos', async () => {
  const { luhn, cardBrand, cardError, formatCard, formatExp, cardPayload, nequiOk } = await import('../lib/billing');
  const now = new Date(2026, 10, 15);
  assert.ok(luhn('4242 4242 4242 4242')); assert.ok(!luhn('4242 4242 4242 4241'));
  assert.equal(cardBrand('5555555555554444'), 'MASTERCARD'); assert.equal(cardBrand('2223003122003222'), 'MASTERCARD'); assert.equal(cardBrand('378282246310005'), 'AMEX');
  assert.equal(formatCard('4242424242424242'), '4242 4242 4242 4242'); assert.equal(formatCard('378282246310005'), '3782 822463 10005');
  assert.equal(formatExp('0829'), '08/29');
  const ok = { number: '4242424242424242', exp: '08/29', cvc: '123', holder: 'Juan Tamayo' };
  assert.equal(cardError(ok, now), null);
  assert.match(cardError({ ...ok, exp: '10/26' }, now)!, /vencida/);
  assert.equal(cardError({ ...ok, exp: '11/26' }, now), null, 'vale hasta el último día del mes');
  assert.match(cardError({ ...ok, cvc: '12' }, now)!, /3 números/);
  assert.match(cardError({ ...ok, number: '378282246310005', cvc: '123' }, now)!, /4 números/);
  assert.match(cardError({ ...ok, holder: 'J' }, now)!, /nombre/);
  assert.deepEqual(cardPayload(ok), { number: '4242424242424242', exp_month: '08', exp_year: '29', cvc: '123', card_holder: 'Juan Tamayo' });
  assert.ok(nequiOk('399 111 1111')); assert.ok(!nequiOk('6011111111'));
});

test('wompi: los precios del SQL son los mismos de la app', async () => {
  const { PRICES } = await import('../lib/billing');
  const sql = readFileSync('supabase/schema_v23.sql', 'utf8');
  const fn = sql.slice(sql.indexOf('function public.billing_price'), sql.indexOf('$$;', sql.indexOf('function public.billing_price')));
  for (const plan of ['pro', 'team'] as const) for (const period of ['month', 'year'] as const) {
    const m = fn.match(new RegExp(`'${plan}/${period}' then (\\d+)`));
    assert.equal(Number(m?.[1]), PRICES[plan][period], `${plan}/${period}`);
  }
  assert.match(fn, /greatest\(2, least\(200/, 'Equipo: de 2 a 200 puestos, como TEAM_MIN_SEATS y TEAM_MAX_SEATS');
});

// ---------- Fase 3: modo Trabajo ----------
test('modo: nombres según estudio, trabajo o los dos', async () => {
  const { vocab, hasWork, hasStudy, parseMode } = await import('../lib/mode');
  assert.equal(vocab('estudio').subjects, 'Materias');
  assert.equal(vocab('trabajo').subjects, 'Áreas');
  assert.equal(vocab('trabajo').exam, 'Entrega');
  assert.equal(vocab('trabajo').record, 'Grabar reunión');
  assert.equal(vocab('ambos').subjectsTab, 'Materias', 'la pestaña del celular sigue corta');
  assert.equal(vocab('trabajo').subjectsCount(1), '1 activa');
  assert.equal(vocab(null).subject, 'Materia');
  assert.ok(hasWork('ambos') && hasWork('trabajo') && !hasWork('estudio'));
  assert.ok(hasStudy('ambos') && !hasStudy('trabajo'));
  assert.equal(parseMode('raro'), 'estudio');
});

test('modo: plantillas de notas y proyectos en el orden del modo', async () => {
  const { templatesFor, classNoteTitle } = await import('../lib/noteLinks');
  const { projectTemplatesFor } = await import('../lib/projectTemplates');
  assert.ok(templatesFor('estudio').every((t) => !t.work), 'en Estudio no salen las de trabajo');
  assert.equal(templatesFor('trabajo')[0].key, 'acta');
  assert.deepEqual(templatesFor('trabajo').filter((t) => t.work).map((t) => t.key), ['acta', 'uno-a-uno', 'retro', 'propuesta', 'informe']);
  assert.equal(templatesFor('ambos').length, templatesFor('estudio').length + 5);
  assert.deepEqual(projectTemplatesFor('trabajo').slice(0, 4).map((t) => t.key), ['blank', 'cliente', 'sprint', 'lanzamiento']);
  assert.ok(projectTemplatesFor('estudio').every((t) => !t.work));
  assert.equal(classNoteTitle(new Date(2026, 10, 23), true), 'Reunión del 23 nov');
  assert.equal(classNoteTitle(new Date(2026, 10, 23)), 'Clase del 23 nov');
});

// ---------- Fase 4: grabar la reunión ----------
test('reunión: el acta de la IA se valida', async () => {
  const { parseMeeting, meetingPrompt } = await import('../supabase/functions/_shared/meeting');
  const raw = 'Claro: {"title":"Revisión del lanzamiento","summary":["Se revisó el avance."],"attendees":["Ana","Luis"],"decisions":["Salimos el 1 de diciembre"],' +
    '"tasks":[{"title":"Enviar la propuesta","owner":"Ana","due":"2026-11-20","when":"el viernes"},{"title":"Revisar precios","owner":"nadie","due":"2026-02-30","when":null},{"title":"","owner":"x"}],"open":["¿Quién llama al cliente?"]}';
  const m = parseMeeting(raw)!;
  assert.equal(m.kind, 'meeting');
  assert.equal(m.tasks.length, 2, 'sin título no hay tarea');
  assert.deepEqual(m.tasks[0], { title: 'Enviar la propuesta', owner: 'Ana', due: '2026-11-20', when: 'el viernes' });
  assert.equal(m.tasks[1].owner, null, '"nadie" no es un responsable');
  assert.equal(m.tasks[1].due, null, 'fecha imposible');
  assert.equal(parseMeeting('no hay json'), null);
  assert.equal(parseMeeting('{"summary":[],"decisions":[],"tasks":[]}'), null, 'un acta vacía no sirve');
  const pr = meetingPrompt('hola', '', ['Ana María', 'Luis'], '2026-11-15');
  assert.match(pr, /Hoy es 2026-11-15/); assert.match(pr, /Ana María, Luis/);
  assert.doesNotMatch(meetingPrompt('hola', '', [], ''), /Hoy es|Personas del equipo/);
});

test('reunión: responsable, acta en Markdown y archivo', async () => {
  const { matchOwner, minutesMarkdown, minutesFileName, meetingTaskQuick, isMeeting } = await import('../lib/meeting');
  const people = [{ user_id: 'a', name: 'Ana María Gómez' }, { user_id: 'b', name: 'Luis Pérez' }, { user_id: 'c', name: 'Ana Ruiz' }, { user_id: 'd', name: 'Andrés' }];
  assert.equal(matchOwner('Luis', people), 'b');
  assert.equal(matchOwner('luis perez', people), 'b');
  assert.equal(matchOwner('Ana', people), null, 'dos Anas: no se adivina');
  assert.equal(matchOwner('Ana María', people), 'a');
  assert.equal(matchOwner('Ana Ruiz', people), 'c');
  assert.equal(matchOwner('ANDRÉS', people), 'd', 'sin tildes ni mayúsculas');
  assert.equal(matchOwner('Pedro', people), null);
  assert.equal(matchOwner(null, people), null);
  const m = { kind: 'meeting' as const, title: 'Revisión', summary: ['Se habló del avance.'], attendees: ['Ana', 'Luis'], decisions: ['Salimos el 1 dic'],
    tasks: [{ title: 'Enviar | propuesta', owner: 'Ana', due: '2026-11-20', when: 'el viernes' }, { title: 'Llamar al cliente', owner: null, due: null, when: 'mañana' }], open: ['Precios'] };
  const md = minutesMarkdown(m, '15 nov');
  assert.match(md, /^## Acta: Revisión · 15 nov/);
  assert.match(md, /\*\*Asistentes:\*\* Ana, Luis/);
  assert.match(md, /\| Enviar \/ propuesta \| Ana \| 20 nov \|/, 'sin romper la tabla');
  assert.match(md, /\| Llamar al cliente \| Sin asignar \| mañana \|/);
  assert.match(md, /- \[ \] Precios/);
  assert.doesNotMatch(minutesMarkdown(m, '15 nov', false), /^## Acta/);
  assert.equal(minutesFileName({ ...m, title: 'Plan: Q1/2027' }, new Date(2026, 10, 15)), 'Acta 15 nov - Plan Q1 2027.md');
  assert.equal(meetingTaskQuick(m.tasks[1]), 'Llamar al cliente mañana');
  assert.ok(isMeeting(m) && !isMeeting({ ideas: [] }) && !isMeeting(null));
});
