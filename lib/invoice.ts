// ============================================================
//  Cuentas de cobro (v25, fase 1). Puro, con pruebas: número, valor en
//  letras, líneas a partir de las horas, total igual al del servidor y el
//  documento para imprimir (sobrio: Times New Roman y en negro).
// ============================================================
import type { HourSession, Named, Rates } from './hours';

export type InvoiceItem = { concept: string; hours?: number | null; rate?: number | null; amount: number };
export type BillingProfile = {
  full_name: string | null; doc_type: 'CC' | 'CE' | 'NIT' | 'PP' | null; doc_number: string | null; city: string | null;
  phone: string | null; email: string | null; address: string | null; bank_name: string | null;
  account_type: 'ahorros' | 'corriente' | 'nequi' | 'daviplata' | null; account_number: string | null; note: string | null;
  prefix: string; next_number: number;
};
export type Client = {
  id: string; name: string; tax_id: string | null; email: string | null; phone: string | null; address: string | null;
  rate: number | null; project_ids: string[]; subject_ids: string[]; archived: boolean;
};
export type Invoice = {
  id: string; client_id: string | null; prefix: string; number: number; issued_on: string; period_from: string | null; period_to: string | null;
  issuer: Partial<BillingProfile>; client: Partial<Client>; items: InvoiceItem[]; total: number; note: string | null;
  status: 'emitida' | 'pagada' | 'anulada'; paid_on: string | null; created_at: string;
};

export const numberLabel = (prefix: string | null | undefined, n: number) => `${prefix ? prefix + '-' : ''}${String(n).padStart(4, '0')}`;
export const pesos = (n: number) => (n < 0 ? '-$' : '$') + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---------- Valor en letras ----------
const U = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function under1000(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100;
  const rest = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : '');
  return [C[c], rest].filter(Boolean).join(' ');
}
/** 1.250.000 → "un millón doscientos cincuenta mil pesos". */
export function pesosEnLetras(value: number): string {
  let n = Math.round(Math.abs(value));
  if (n === 0) return 'cero pesos';
  const millions = Math.floor(n / 1_000_000), thousands = Math.floor((n % 1_000_000) / 1000), units = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'un millón' : `${millionsWords(millions)} millones`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${under1000(thousands)} mil`);
  if (units) parts.push(under1000(units));
  const words = parts.join(' ');
  // "un millón de pesos", "dos millones de pesos" (cuando no hay miles ni unidades).
  return `${words}${!thousands && !units ? ' de' : ''} pesos`;
}
function millionsWords(m: number): string {
  if (m < 1000) return under1000(m);
  const th = Math.floor(m / 1000), u = m % 1000;
  return [th === 1 ? 'mil' : `${under1000(th)} mil`, under1000(u)].filter(Boolean).join(' ');
}

// ---------- Líneas desde las horas ----------
/** Las sesiones que le corresponden a un cliente: sus proyectos, o sus áreas cuando no hay proyecto. */
export function clientSessions(list: HourSession[], c: Pick<Client, 'project_ids' | 'subject_ids'>): HourSession[] {
  return list.filter((s) => (s.project_id ? c.project_ids.includes(s.project_id) : !!s.subject_id && c.subject_ids.includes(s.subject_id)));
}
const round2 = (x: number) => Math.round(x * 100) / 100;
/** Una línea por proyecto (o área), con las horas y la tarifa (la del proyecto, la del área o la del cliente). */
export function draftItems(list: HourSession[], c: Pick<Client, 'project_ids' | 'subject_ids' | 'rate'>, names: Record<string, Named>, rates: Rates = {}): InvoiceItem[] {
  const map = new Map<string, { name: string; minutes: number; rate: number }>();
  for (const s of clientSessions(list, c)) {
    const key = s.project_id ?? s.subject_id!;
    const g = map.get(key) ?? { name: names[key]?.name ?? 'Trabajo', minutes: 0, rate: rates[key] || c.rate || 0 };
    g.minutes += s.minutes;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes).map((g) => {
    const hours = round2(g.minutes / 60);
    return { concept: `Horas de trabajo: ${g.name}`, hours, rate: g.rate, amount: Math.round(hours * g.rate) };
  });
}
/** Igual que invoice_create en el servidor: horas por tarifa, o el valor de la línea. */
export function itemAmount(it: InvoiceItem): number {
  return it.hours != null && it.rate != null ? Math.round(it.hours * it.rate) : Math.round(it.amount || 0);
}
export const itemsTotal = (items: InvoiceItem[]) => items.reduce((a, it) => a + itemAmount(it), 0);

/** Lo que falta en tus datos para poder cobrar. */
export function profileMissing(p: Partial<BillingProfile> | null): string[] {
  const out: string[] = [];
  if (!p?.full_name?.trim()) out.push('tu nombre');
  if (!p?.doc_number?.trim()) out.push('tu documento');
  if (!p?.city?.trim()) out.push('la ciudad');
  if (!p?.account_number?.trim()) out.push('la cuenta donde te pagan');
  return out;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}
const ACCOUNT: Record<string, string> = { ahorros: 'cuenta de ahorros', corriente: 'cuenta corriente', nequi: 'Nequi', daviplata: 'Daviplata' };
const DOC: Record<string, string> = { CC: 'C.C.', CE: 'C.E.', NIT: 'NIT', PP: 'Pasaporte' };
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** La cuenta de cobro para imprimir o guardar como PDF. */
export function invoiceHtml(inv: Invoice): string {
  const is = inv.issuer, cl = inv.client;
  const hasHours = inv.items.some((i) => i.hours != null);
  const pay = is.account_number ? `${ACCOUNT[is.account_type ?? ''] ?? 'cuenta'}${is.bank_name && !['nequi', 'daviplata'].includes(is.account_type ?? '') ? ` de ${esc(is.bank_name)}` : ''} número ${esc(is.account_number)}, a nombre de ${esc(is.full_name)}` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Cuenta de cobro ${numberLabel(inv.prefix, inv.number)}</title>
<style>
  body { font-family: "Times New Roman", Times, serif; color: #000; margin: 48px 56px; font-size: 12pt; line-height: 1.45; }
  h1 { font-size: 16pt; text-align: center; margin: 0 0 4px; } .c { text-align: center; } .r { text-align: right; }
  p { margin: 6px 0; } table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { border: 1px solid #000; padding: 5px 7px; font-size: 11pt; vertical-align: top; } th { text-align: left; }
  .sign { margin-top: 64px; } .line { border-top: 1px solid #000; width: 260px; padding-top: 4px; }
  ${inv.status === 'anulada' ? '.void { text-align: center; font-weight: bold; font-size: 14pt; border: 2px solid #000; padding: 6px; margin-bottom: 12px; }' : ''}
</style></head><body>
${inv.status === 'anulada' ? '<p class="void">ANULADA</p>' : ''}
<h1>CUENTA DE COBRO No. ${esc(numberLabel(inv.prefix, inv.number))}</h1>
<p class="c">${esc(is.city ? is.city + ', ' : '')}${esc(longDate(inv.issued_on))}</p>
<p style="margin-top:22px"><b>${esc(cl.name)}</b>${cl.tax_id ? `<br/>NIT o documento: ${esc(cl.tax_id)}` : ''}${cl.address ? `<br/>${esc(cl.address)}` : ''}</p>
<p style="margin-top:18px" class="c"><b>DEBE A</b></p>
<p class="c"><b>${esc(is.full_name)}</b><br/>${esc(DOC[is.doc_type ?? 'CC'] ?? '')} ${esc(is.doc_number)}</p>
<p style="margin-top:18px">La suma de <b>${pesos(inv.total)}</b> (${esc(pesosEnLetras(inv.total))} m/cte), por concepto de:</p>
<table><thead><tr><th>Concepto</th>${hasHours ? '<th class="r">Horas</th><th class="r">Tarifa</th>' : ''}<th class="r">Valor</th></tr></thead><tbody>
${inv.items.map((i) => `<tr><td>${esc(i.concept)}</td>${hasHours ? `<td class="r">${i.hours != null ? String(i.hours).replace('.', ',') : ''}</td><td class="r">${i.rate != null ? pesos(i.rate) : ''}</td>` : ''}<td class="r">${pesos(itemAmount(i))}</td></tr>`).join('\n')}
<tr><td${hasHours ? ' colspan="3"' : ''}><b>Total</b></td><td class="r"><b>${pesos(inv.total)}</b></td></tr>
</tbody></table>
${inv.period_from && inv.period_to ? `<p>Periodo: del ${esc(longDate(inv.period_from))} al ${esc(longDate(inv.period_to))}.</p>` : ''}
${pay ? `<p>Favor consignar en ${pay}.</p>` : ''}
${is.note ? `<p>${esc(is.note)}</p>` : ''}
${inv.note ? `<p>${esc(inv.note)}</p>` : ''}
<div class="sign"><div class="line">${esc(is.full_name)}<br/>${esc(DOC[is.doc_type ?? 'CC'] ?? '')} ${esc(is.doc_number)}${is.phone ? `<br/>Tel. ${esc(is.phone)}` : ''}${is.email ? `<br/>${esc(is.email)}` : ''}</div></div>
</body></html>`;
}

/** Texto corto para mandar por WhatsApp o correo. */
export function invoiceShareText(inv: Invoice): string {
  return `Hola${inv.client.name ? ` ${inv.client.name}` : ''}, te comparto la cuenta de cobro ${numberLabel(inv.prefix, inv.number)} por ${pesos(inv.total)}` +
    `${inv.period_from && inv.period_to ? ` (del ${longDate(inv.period_from)} al ${longDate(inv.period_to)})` : ''}.` +
    `${inv.issuer.account_number ? ` Puedes consignar en ${ACCOUNT[inv.issuer.account_type ?? ''] ?? 'la cuenta'} ${inv.issuer.account_number}.` : ''} Gracias.`;
}
