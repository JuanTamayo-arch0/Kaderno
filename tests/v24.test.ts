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
