// ============================================================
//  Planes y pagos (v24). Puro, con pruebas: qué dice la pantalla
//  "Tu plan" según lo que devuelve my_plan() de schema_v23.
// ============================================================
export * from '../supabase/functions/_shared/plans';
import { cop as copBase } from '../supabase/functions/_shared/plans';
/** Pesos con el separador de miles del idioma: "$9.900" o "$9,900". */
export const cop = (n: number): string => copBase(n, lang() === 'en' ? ',' : '.');
import { LIMITS, limitText, PRICES, type LimitKey, type Period, type PlanId } from '../supabase/functions/_shared/plans';
import { t, monthsShort, dayMonth, lang } from './i18n';

export type MyPlan = {
  plan: PlanId; own_plan?: PlanId; status?: 'none' | 'trial' | 'active' | 'past_due' | 'canceled';
  period?: Period | null; period_end?: string | null; auto_renew?: boolean; trial_available?: boolean;
  seats?: number; seats_used?: number; source_label?: string | null; source_kind?: 'CARD' | 'NEQUI' | null;
  next_charge_at?: string | null; retries?: number; via_team?: { owner: string; until: string } | null;
};

const MONTHS = monthsShort();
export const shortDate = (iso: string | Date) => { const d = new Date(iso); return `${dayMonth(d.getDate(), MONTHS[d.getMonth()])}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`; };
const daysUntil = (iso: string, now: Date) => Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000));

export type PlanView = { name: string; badge: 'free' | 'trial' | 'pro' | 'team' | 'warn'; line: string; daysLeft: number | null; canPay: boolean; isPaid: boolean };

/** Nombre, etiqueta y la frase que explica el estado del plan. */
export function planView(mp: MyPlan | null | undefined, now = new Date()): PlanView {
  const plan = mp?.plan ?? 'free';
  if (plan === 'free') {
    const ended = mp?.own_plan && mp.own_plan !== 'free' && mp.period_end && new Date(mp.period_end) <= now;
    return {
      name: t('Gratis'), badge: 'free', daysLeft: null, canPay: true, isPaid: false,
      line: ended ? t('Tu plan {v}terminó el {shortDate}. Todo lo tuyo sigue aquí.', { v: mp!.status === 'trial' ? t('de prueba ') : '', shortDate: shortDate(mp!.period_end!) }) : mp?.trial_available !== false ? t('Puedes probar Pro 7 días sin tarjeta.') : t('Todo lo básico, con topes diarios de IA.'),
    };
  }
  if (mp?.via_team) {
    return { name: t('Equipo'), badge: 'team', daysLeft: daysUntil(mp.via_team.until, now), canPay: false, isPaid: true, line: t('Lo paga el equipo de {owner}, hasta el {until}.', { owner: mp.via_team.owner, until: shortDate(mp.via_team.until) }) };
  }
  const end = mp?.period_end ?? null;
  const left = end ? daysUntil(end, now) : null;
  const name = plan === 'team' ? t('Equipo') : 'Pro';
  if (mp?.status === 'trial') {
    return { name: t('Pro'), badge: 'trial', daysLeft: left, canPay: true, isPaid: false, line: left != null ? t('Prueba gratis: {v} (hasta el {shortDate}).', { v: left <= 1 ? t('termina mañana') : t('te quedan {left} días', { left }), shortDate: shortDate(end!) }) : t('Prueba gratis.') };
  }
  if (mp?.status === 'past_due') {
    const next = mp.next_charge_at ? t(' Lo intentamos de nuevo el {next_charge_at}.', { next_charge_at: shortDate(mp.next_charge_at) }) : '';
    const keep = end && new Date(end) > now ? t(' Tu plan sigue hasta el {end}.', { end: shortDate(end) }) : t(' Mientras tanto conservas tu plan.');
    return { name, badge: 'warn', daysLeft: left, canPay: true, isPaid: true, line: t('No pudimos cobrar la renovación{v}.{next}{keep}', { v: mp.source_label ? ` a ${mp.source_label}` : '', next, keep }) };
  }
  if (mp?.auto_renew && end) {
    return { name, badge: plan === 'team' ? 'team' : 'pro', daysLeft: left, canPay: false, isPaid: true, line: t('Se renueva el {end}{v}.', { end: shortDate(end), v: mp.source_label ? t(' con {v}', { v: mp.source_label }) : '' }) };
  }
  return { name, badge: plan === 'team' ? 'team' : 'pro', daysLeft: left, canPay: true, isPaid: true, line: end ? t('Pagado hasta el {end}. No se renueva solo: te avisamos antes.', { end: shortDate(end) }) : t('Activo.') };
}

/** Filas de la comparación de planes. */
export type CompareRow = { label: string; free: string | boolean; pro: string | boolean; team: string | boolean };
const lim = (k: LimitKey, unit?: string) => ({ label: cap(limitText(k, lang())) + t(' al día'), free: String(LIMITS.free[k]) + (unit ?? ''), pro: String(LIMITS.pro[k]) + (unit ?? ''), team: String(LIMITS.pro[k]) + (unit ?? '') });
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
export const COMPARE: CompareRow[] = [
  { label: t('Materias, tareas, notas, horario, enfoque, repaso, proyectos y mascota'), free: true, pro: true, team: true },
  lim('summary'), lim('flashcards'), lim('quiz'), lim('ocr'), lim('class_summary'), lim('meeting'),
  { label: t('Calendarios externos'), free: '2', pro: '10', team: '10' },
  { label: t('Registro de horas con informe en PDF'), free: false, pro: true, team: true },
  { label: t('Horas de todo el equipo en un proyecto'), free: false, pro: false, team: true },
  { label: t('Un solo pago para varias personas'), free: false, pro: false, team: true },
];

/** "Pro mensual · $9.900" */
export function planLabel(plan: 'pro' | 'team', period: Period, seats = 1): string {
  return `${plan === 'pro' ? 'Pro' : t('Equipo ({seats} personas)', { seats })} ${period === 'month' ? t('mensual') : t('anual')}`;
}
/** Precio por mes de un plan anual (para comparar). */
export const perMonth = (plan: 'pro' | 'team', period: Period) => (period === 'month' ? PRICES[plan].month : Math.round(PRICES[plan].year / 12 / 100) * 100);

/** Uso de hoy: [tarea, usados, tope]. */
export function usageRows(plan: PlanId, used: Record<string, number>): { key: LimitKey; label: string; used: number; limit: number }[] {
  const tier = plan === 'free' ? 'free' : 'pro';
  const keys: LimitKey[] = ['summary', 'flashcards', 'quiz', 'recall', 'grade', 'ocr', 'class_summary', 'meeting', 'steps'];
  return keys.map((k) => ({ key: k, label: cap(limitText(k, lang())), used: used[k] ?? 0, limit: LIMITS[tier][k] }))
    .filter((r) => r.used > 0 || ['summary', 'flashcards', 'quiz', 'ocr'].includes(r.key));
}

/** ¿Es un mensaje de tope del día que invita a Pro? */
export const isUpsell = (msg: string | null | undefined) => /con Kaderno Pro/i.test(String(msg ?? ''));

// ---------- Fase 2: tarjeta y Nequi (se validan aquí y se mandan directo a Wompi) ----------
export const digits = (s: string) => String(s ?? '').replace(/\D/g, '');
export function luhn(num: string): boolean {
  const d = digits(num);
  if (d.length < 12 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}
export function cardBrand(num: string): 'VISA' | 'MASTERCARD' | 'AMEX' | 'DINERS' | null {
  const d = digits(num);
  if (/^4/.test(d)) return 'VISA';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return 'MASTERCARD';
  if (/^3[47]/.test(d)) return 'AMEX';
  if (/^3(0[0-5]|[68])/.test(d)) return 'DINERS';
  return null;
}
/** "4242 4242 4242 4242" (American Express: 4-6-5). */
export function formatCard(num: string): string {
  const d = digits(num).slice(0, 19);
  if (cardBrand(d) === 'AMEX') return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
  return d.replace(/(\d{4})(?=\d)/g, '$1 ');
}
/** "08/29" */
export function formatExp(s: string): string {
  const d = digits(s).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}
export type CardInput = { number: string; exp: string; cvc: string; holder: string };
/** Primer problema de la tarjeta, o null si se puede mandar. */
export function cardError(c: CardInput, now = new Date()): string | null {
  if (!luhn(c.number)) return t('Revisa el número de la tarjeta.');
  const [mm, yy] = formatExp(c.exp).split('/').map(Number);
  if (!mm || mm > 12 || yy == null || isNaN(yy)) return t('La fecha va como MM/AA.');
  const end = new Date(2000 + yy, mm, 1);
  if (end <= new Date(now.getFullYear(), now.getMonth(), 1)) return t('La tarjeta está vencida.');
  const cvcLen = cardBrand(c.number) === 'AMEX' ? 4 : 3;
  if (digits(c.cvc).length !== cvcLen) return t('El código de seguridad tiene {cvcLen} números.', { cvcLen });
  if (c.holder.trim().length < 5) return t('Escribe el nombre como aparece en la tarjeta.');
  return null;
}
/** Lo que pide Wompi en /tokens/cards. */
export function cardPayload(c: CardInput) {
  const [mm, yy] = formatExp(c.exp).split('/');
  return { number: digits(c.number), exp_month: mm.padStart(2, '0'), exp_year: yy.padStart(2, '0'), cvc: digits(c.cvc), card_holder: c.holder.trim().replace(/\s+/g, ' ') };
}
export const nequiOk = (phone: string) => /^3\d{9}$/.test(digits(phone));

/** Puestos extra a mitad de periodo: la parte que falta (igual que billing_new_payment). */
export function seatsProrated(period: Period, periodEnd: string | Date, seats: number, now = new Date()): number {
  const lenDays = period === 'year' ? 365 : 30;
  const frac = Math.min(1, Math.max(0, (new Date(periodEnd).getTime() - now.getTime()) / (lenDays * 86_400_000)));
  return Math.max(2000, Math.round((PRICES.team[period] * frac) / 100) * 100) * Math.max(1, seats);
}

const STATUS_TEXT: Record<string, string> = { PENDING: t('Pendiente'), APPROVED: t('Aprobado'), DECLINED: t('Rechazado'), VOIDED: t('Anulado'), ERROR: t('Con error') };
const KIND_TEXT: Record<string, string> = { checkout: t('Pago'), first: t('Primer cobro'), renewal: t('Renovación'), seats: t('Puestos extra') };
export const paymentStatusText = (s: string) => STATUS_TEXT[s] ?? s;
export const paymentKindText = (k: string) => KIND_TEXT[k] ?? k;
