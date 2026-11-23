import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- Fase 1: cobrar ----------
test('cobrar: número y valor en letras', async () => {
  const { numberLabel, pesosEnLetras, pesos } = await import('../lib/invoice');
  assert.equal(numberLabel('CC', 7), 'CC-0007'); assert.equal(numberLabel('', 12), '0012');
  assert.equal(pesos(1250000), '$1.250.000');
  const cases: [number, string][] = [
    [1_000_000, 'un millón de pesos'], [2_000_000, 'dos millones de pesos'], [1_250_000, 'un millón doscientos cincuenta mil pesos'],
    [100_000, 'cien mil pesos'], [150_000, 'ciento cincuenta mil pesos'], [21_000, 'veintiún mil pesos'], [1_000, 'mil pesos'],
    [999_999, 'novecientos noventa y nueve mil novecientos noventa y nueve pesos'], [45_500, 'cuarenta y cinco mil quinientos pesos'],
    [3_016_200, 'tres millones dieciséis mil doscientos pesos'], [0, 'cero pesos'],
  ];
  for (const [n, w] of cases) assert.equal(pesosEnLetras(n), w, String(n));
});

test('cobrar: líneas desde las horas del cliente', async () => {
  const { draftItems, clientSessions, itemsTotal, itemAmount } = await import('../lib/invoice');
  const S = (id: string, minutes: number, project_id: string | null, subject_id: string | null) => ({ id, minutes, created_at: '2026-11-10T15:00:00Z', project_id, subject_id });
  const list = [S('1', 90, 'p1', 's9'), S('2', 60, 'p1', null), S('3', 45, null, 's1'), S('4', 30, 'p2', 's1'), S('5', 20, null, 's2')];
  const client = { project_ids: ['p1'], subject_ids: ['s1'], rate: 50_000 };
  assert.deepEqual(clientSessions(list, client).map((s) => s.id), ['1', '2', '3'], 'p2 es de otro cliente aunque su área sea s1');
  const items = draftItems(list, client, { p1: { name: 'Web Acme' }, s1: { name: 'Soporte' } }, { p1: 60_000 });
  assert.deepEqual(items, [
    { concept: 'Horas de trabajo: Web Acme', hours: 2.5, rate: 60_000, amount: 150_000 },
    { concept: 'Horas de trabajo: Soporte', hours: 0.75, rate: 50_000, amount: 37_500 },
  ]);
  assert.equal(itemsTotal([...items, { concept: 'Hosting', amount: 20_000.4 }]), 207_500);
  assert.equal(itemAmount({ concept: 'x', hours: 1.33, rate: 45_000, amount: 1 }), 59_850, 'igual que el servidor: round(horas por tarifa)');
});

test('cobrar: datos que faltan y documento', async () => {
  const { profileMissing, invoiceHtml, invoiceShareText } = await import('../lib/invoice');
  assert.deepEqual(profileMissing(null), ['tu nombre', 'tu documento', 'la ciudad', 'la cuenta donde te pagan']);
  assert.deepEqual(profileMissing({ full_name: 'Juan', doc_number: '1', city: 'Medellín', account_number: '123' }), []);
  const inv: any = {
    id: 'i', client_id: 'c', prefix: 'CC', number: 7, issued_on: '2026-11-30', period_from: '2026-11-01', period_to: '2026-11-30',
    issuer: { full_name: 'Juan Tamayo', doc_type: 'CC', doc_number: '1000', city: 'Medellín', bank_name: 'Bancolombia', account_type: 'ahorros', account_number: '123-45', note: 'Declaro que no soy responsable de IVA.' },
    client: { name: 'Acme S.A.S.', tax_id: '900123456-7' }, items: [{ concept: 'Horas <web>', hours: 2.5, rate: 60000, amount: 150000 }], total: 150000,
    note: null, status: 'emitida', paid_on: null, created_at: '',
  };
  const html = invoiceHtml(inv);
  assert.match(html, /CUENTA DE COBRO No\. CC-0007/); assert.match(html, /Medellín, 30 de noviembre de 2026/);
  assert.match(html, /<b>\$150\.000<\/b> \(ciento cincuenta mil pesos m\/cte\)/);
  assert.match(html, /Favor consignar en cuenta de ahorros de Bancolombia número 123-45, a nombre de Juan Tamayo/);
  assert.match(html, /Horas &lt;web&gt;/, 'escapa el HTML'); assert.match(html, /Times New Roman/);
  assert.doesNotMatch(html, /—/); assert.doesNotMatch(html, /ANULADA/);
  assert.match(invoiceHtml({ ...inv, status: 'anulada' }), /ANULADA/);
  assert.match(invoiceHtml({ ...inv, issuer: { ...inv.issuer, account_type: 'nequi', account_number: '3001234567' } }), /consignar en Nequi número 3001234567/);
  assert.match(invoiceShareText(inv), /^Hola Acme S\.A\.S\., te comparto la cuenta de cobro CC-0007 por \$150\.000 \(del 1 de noviembre de 2026 al 30 de noviembre de 2026\)\./);
});
