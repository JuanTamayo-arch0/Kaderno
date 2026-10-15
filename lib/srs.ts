// ============================================================
//  Repetición espaciada (variante de SM-2, la de Anki simplificada).
//
//  Cuatro botones: 0 "Otra vez", 1 "Difícil", 2 "Bien", 3 "Fácil".
//  - Otra vez: la tarjeta vuelve mañana y baja su facilidad.
//  - Las demás alargan el intervalo según la facilidad (ease).
//  También se calcula `box` (1 a 5) para que la versión anterior de la app,
//  que usaba cajas Leitner, siga mostrando algo razonable.
// ============================================================

export type SrsCard = { ease?: number | null; interval_days?: number | null; reps?: number | null; lapses?: number | null; box?: number | null };
export type SrsUpdate = {
  ease: number; interval_days: number; reps: number; lapses: number; box: number;
  due_date: string; last_reviewed_at: string;
};

const MIN_EASE = 1.3;

export function localISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function sm2(card: SrsCard, grade: 0 | 1 | 2 | 3, now: Date): SrsUpdate {
  let ease = card.ease ?? 2.5;
  let interval = card.interval_days ?? 0;
  let reps = card.reps ?? 0;
  let lapses = card.lapses ?? 0;
  // Tarjetas viejas (solo con caja): se estima el intervalo desde la caja.
  if (!card.interval_days && card.box && card.box > 1) interval = [0, 1, 2, 4, 7, 15][Math.min(5, card.box)];

  if (grade === 0) {
    lapses += 1;
    reps = 0;
    ease = Math.max(MIN_EASE, ease - 0.2);
    interval = 1;
  } else {
    // Equivalencia con la escala 0..5 de SM-2: difícil 3, bien 4, fácil 5.
    const q = grade + 2;
    ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    if (reps === 0) interval = grade === 3 ? 3 : 1;
    else if (reps === 1) interval = grade === 1 ? 3 : grade === 3 ? 8 : 6;
    else interval = Math.round(interval * (grade === 1 ? 1.2 : grade === 3 ? ease * 1.3 : ease));
    interval = Math.max(1, Math.min(365, interval));
    reps += 1;
  }
  const due = new Date(now);
  due.setDate(due.getDate() + interval);
  const box = interval <= 1 ? 1 : interval <= 3 ? 2 : interval <= 7 ? 3 : interval <= 15 ? 4 : 5;
  return {
    ease: Math.round(ease * 100) / 100,
    interval_days: interval,
    reps, lapses, box,
    due_date: localISODate(due),
    last_reviewed_at: now.toISOString(),
  };
}

/** Texto para cada botón: "en 1 día", "en 6 días"... */
export function nextLabel(card: SrsCard, grade: 0 | 1 | 2 | 3): string {
  const d = sm2(card, grade, new Date()).interval_days;
  if (grade === 0) return 'mañana';
  if (d < 30) return d === 1 ? '1 día' : `${d} días`;
  const m = Math.round(d / 30);
  return m === 1 ? '1 mes' : `${m} meses`;
}
