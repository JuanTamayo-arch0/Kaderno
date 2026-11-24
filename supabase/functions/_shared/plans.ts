// ============================================================
//  Planes de Kaderno (v24). TypeScript puro: lo usan las funciones del
//  servidor ("ai", "ocr", "billing") y la app. Los precios también están en
//  schema_v23.sql (billing_price), que es el que cobra; una prueba revisa
//  que coincidan.
// ============================================================

export type PlanId = 'free' | 'pro' | 'team';
export type Period = 'month' | 'year';

/** Precio en pesos (COP), precio final. En Equipo es por persona. */
export const PRICES: Record<'pro' | 'team', Record<Period, number>> = {
  pro: { month: 9_900, year: 89_000 },
  team: { month: 14_900, year: 149_000 },
};
export const TEAM_MIN_SEATS = 2;
export const TEAM_MAX_SEATS = 200;
export const TRIAL_DAYS = 7;

/** Usos de IA por día. "team" usa los de Pro. */
export type LimitKey = 'summary' | 'flashcards' | 'quiz' | 'recall' | 'grade' | 'class_summary' | 'meeting' | 'steps' | 'ocr';
export const LIMITS: Record<'free' | 'pro', Record<LimitKey, number>> = {
  free: { summary: 10, flashcards: 8, quiz: 2, recall: 5, grade: 10, class_summary: 2, meeting: 2, steps: 15, ocr: 20 },
  pro: { summary: 60, flashcards: 40, quiz: 8, recall: 25, grade: 50, class_summary: 8, meeting: 8, steps: 80, ocr: 80 },
};
export const LIMIT_TEXT: Record<LimitKey, string> = {
  summary: 'resúmenes', flashcards: 'creaciones de tarjetas', quiz: 'simulacros', recall: 'pruebas de notas', grade: 'correcciones',
  class_summary: 'resúmenes de clase', meeting: 'actas de reunión', steps: 'divisiones en pasos', ocr: 'páginas leídas',
};
/** v30: lo mismo en inglés. */
export const LIMIT_TEXT_EN: Record<LimitKey, string> = {
  summary: 'summaries', flashcards: 'card creations', quiz: 'mock exams', recall: 'note tests', grade: 'gradings',
  class_summary: 'class summaries', meeting: 'meeting minutes', steps: 'step breakdowns', ocr: 'pages read',
};
export const limitText = (key: LimitKey, lang: 'es' | 'en' = 'es') => (lang === 'en' ? LIMIT_TEXT_EN : LIMIT_TEXT)[key];
/** Calendarios externos conectados. */
export const CALENDARS: Record<'free' | 'pro', number> = { free: 2, pro: 10 };

export const limitTier = (plan: PlanId | string | null | undefined): 'free' | 'pro' => (plan === 'pro' || plan === 'team' ? 'pro' : 'free');
export const limitOf = (plan: PlanId | string | null | undefined, key: LimitKey): number => LIMITS[limitTier(plan)][key];

/** Mensaje cuando se acaba el cupo del día. Con Gratis invita a Pro (la app muestra el botón "Ver planes"). */
export function limitMessage(plan: PlanId | string | null | undefined, key: LimitKey, lang: 'es' | 'en' = 'es'): string {
  const tier = limitTier(plan);
  const n = LIMITS[tier][key], txt = limitText(key, lang);
  if (lang === 'en') {
    if (tier === 'free') return `You reached today's limit (${n} ${txt}). It resets tomorrow, or with Kaderno Pro you get ${LIMITS.pro[key]} a day.`;
    return `You reached today's limit (${n} ${txt}). It resets tomorrow.`;
  }
  if (tier === 'free') return `Llegaste al límite de hoy (${n} ${txt}). Mañana se renueva, o con Kaderno Pro tienes ${LIMITS.pro[key]} al día.`;
  return `Llegaste al límite de hoy (${n} ${txt}). Mañana se renueva.`;
}

/** Precio total en pesos de un pago. */
export function priceOf(plan: 'pro' | 'team', period: Period, seats = 1): number {
  const s = plan === 'team' ? Math.max(TEAM_MIN_SEATS, Math.min(TEAM_MAX_SEATS, Math.round(seats))) : 1;
  return PRICES[plan][period] * s;
}

/** Cuánto se ahorra al año frente a pagar 12 meses (en pesos y en %). */
export function yearlySaving(plan: 'pro' | 'team'): { pesos: number; pct: number } {
  const m = PRICES[plan].month * 12, y = PRICES[plan].year;
  return { pesos: m - y, pct: Math.round(((m - y) / m) * 100) };
}

/** "$9.900" */
export function cop(n: number): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-$' : '$') + s;
}
