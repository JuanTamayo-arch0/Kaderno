// ============================================================
//  Planes y pagos (v24). Puro, con pruebas: qué dice la pantalla
//  "Tu plan" según lo que devuelve my_plan() de schema_v23.
// ============================================================
export * from '../supabase/functions/_shared/plans';
import { LIMITS, LIMIT_TEXT, PRICES, type LimitKey, type Period, type PlanId } from '../supabase/functions/_shared/plans';

export type MyPlan = {
  plan: PlanId; own_plan?: PlanId; status?: 'none' | 'trial' | 'active' | 'past_due' | 'canceled';
  period?: Period | null; period_end?: string | null; auto_renew?: boolean; trial_available?: boolean;
  seats?: number; seats_used?: number; source_label?: string | null; source_kind?: 'CARD' | 'NEQUI' | null;
  next_charge_at?: string | null; retries?: number; via_team?: { owner: string; until: string } | null;
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const shortDate = (iso: string | Date) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`; };
const daysUntil = (iso: string, now: Date) => Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000));

export type PlanView = { name: string; badge: 'free' | 'trial' | 'pro' | 'team' | 'warn'; line: string; daysLeft: number | null; canPay: boolean; isPaid: boolean };

/** Nombre, etiqueta y la frase que explica el estado del plan. */
export function planView(mp: MyPlan | null | undefined, now = new Date()): PlanView {
  const plan = mp?.plan ?? 'free';
  if (plan === 'free') {
    const ended = mp?.own_plan && mp.own_plan !== 'free' && mp.period_end && new Date(mp.period_end) <= now;
    return {
      name: 'Gratis', badge: 'free', daysLeft: null, canPay: true, isPaid: false,
      line: ended ? `Tu plan ${mp!.status === 'trial' ? 'de prueba ' : ''}terminó el ${shortDate(mp!.period_end!)}. Todo lo tuyo sigue aquí.` : mp?.trial_available !== false ? 'Puedes probar Pro 7 días sin tarjeta.' : 'Todo lo básico, con topes diarios de IA.',
    };
  }
  if (mp?.via_team) {
    return { name: 'Equipo', badge: 'team', daysLeft: daysUntil(mp.via_team.until, now), canPay: false, isPaid: true, line: `Lo paga el equipo de ${mp.via_team.owner}, hasta el ${shortDate(mp.via_team.until)}.` };
  }
  const end = mp?.period_end ?? null;
  const left = end ? daysUntil(end, now) : null;
  const name = plan === 'team' ? 'Equipo' : 'Pro';
  if (mp?.status === 'trial') {
    return { name: 'Pro', badge: 'trial', daysLeft: left, canPay: true, isPaid: false, line: left != null ? `Prueba gratis: ${left <= 1 ? 'termina mañana' : `te quedan ${left} días`} (hasta el ${shortDate(end!)}).` : 'Prueba gratis.' };
  }
  if (mp?.status === 'past_due') {
    const next = mp.next_charge_at ? ` Lo intentamos de nuevo el ${shortDate(mp.next_charge_at)}.` : '';
    return { name, badge: 'warn', daysLeft: left, canPay: true, isPaid: true, line: `No pudimos cobrar la renovación${mp.source_label ? ` a ${mp.source_label}` : ''}.${next} Tu plan sigue hasta el ${shortDate(end!)}.` };
  }
  if (mp?.auto_renew && end) {
    return { name, badge: plan === 'team' ? 'team' : 'pro', daysLeft: left, canPay: false, isPaid: true, line: `Se renueva el ${shortDate(end)}${mp.source_label ? ` con ${mp.source_label}` : ''}.` };
  }
  return { name, badge: plan === 'team' ? 'team' : 'pro', daysLeft: left, canPay: true, isPaid: true, line: end ? `Pagado hasta el ${shortDate(end)}. No se renueva solo: te avisamos antes.` : 'Activo.' };
}

/** Filas de la comparación de planes. */
export type CompareRow = { label: string; free: string | boolean; pro: string | boolean; team: string | boolean };
const lim = (k: LimitKey, unit?: string) => ({ label: cap(LIMIT_TEXT[k]) + ' al día', free: String(LIMITS.free[k]) + (unit ?? ''), pro: String(LIMITS.pro[k]) + (unit ?? ''), team: String(LIMITS.pro[k]) + (unit ?? '') });
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
export const COMPARE: CompareRow[] = [
  { label: 'Materias, tareas, notas, horario, enfoque, repaso, proyectos y mascota', free: true, pro: true, team: true },
  lim('summary'), lim('flashcards'), lim('quiz'), lim('ocr'), lim('class_summary'), lim('meeting'),
  { label: 'Calendarios externos', free: '2', pro: '10', team: '10' },
  { label: 'Registro de horas con informe en PDF', free: false, pro: true, team: true },
  { label: 'Horas de todo el equipo en un proyecto', free: false, pro: false, team: true },
  { label: 'Un solo pago para varias personas', free: false, pro: false, team: true },
];

/** "Pro mensual · $9.900" */
export function planLabel(plan: 'pro' | 'team', period: Period, seats = 1): string {
  return `${plan === 'pro' ? 'Pro' : `Equipo (${seats} personas)`} ${period === 'month' ? 'mensual' : 'anual'}`;
}
/** Precio por mes de un plan anual (para comparar). */
export const perMonth = (plan: 'pro' | 'team', period: Period) => (period === 'month' ? PRICES[plan].month : Math.round(PRICES[plan].year / 12 / 100) * 100);

/** Uso de hoy: [tarea, usados, tope]. */
export function usageRows(plan: PlanId, used: Record<string, number>): { key: LimitKey; label: string; used: number; limit: number }[] {
  const tier = plan === 'free' ? 'free' : 'pro';
  const keys: LimitKey[] = ['summary', 'flashcards', 'quiz', 'recall', 'grade', 'ocr', 'class_summary', 'meeting', 'steps'];
  return keys.map((k) => ({ key: k, label: cap(LIMIT_TEXT[k]), used: used[k] ?? 0, limit: LIMITS[tier][k] }))
    .filter((r) => r.used > 0 || ['summary', 'flashcards', 'quiz', 'ocr'].includes(r.key));
}

/** ¿Es un mensaje de tope del día que invita a Pro? */
export const isUpsell = (msg: string | null | undefined) => /con Kaderno Pro/i.test(String(msg ?? ''));
