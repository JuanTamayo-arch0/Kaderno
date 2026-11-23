// ============================================================
//  Formas de enfocarse (v27, fase 3). Puro, con pruebas.
//   · pomodoro: 25/5 con pausa larga cada 4 (configurable).
//   · 52-17: 52 de trabajo y 17 de pausa, sin pausa larga.
//   · flujo: cuenta hacia arriba hasta que pares (tope de 90 min); la pausa
//     es un quinto de lo trabajado, entre 5 y 20 min.
// ============================================================

export type FocusStyle = 'pomodoro' | '52-17' | 'flujo';
export const FLOW_CAP_MIN = 90;

/** Pausa del modo Flujo: un quinto de lo trabajado, entre 5 y 20 minutos. */
export function flowBreakMin(workedMin: number): number {
  return Math.max(5, Math.min(20, Math.round(workedMin / 5)));
}

/** Pausa que sigue a un bloque de trabajo según la forma de enfocarse. `cycle` es el ciclo ya avanzado (0 = toca la larga). */
export function breakAfter(style: FocusStyle | undefined, worked: number, cycle: number, s: { breakMin: number; longBreakMin: number }): number {
  if (style === 'flujo') return flowBreakMin(worked);
  if (style === '52-17') return 17;
  return cycle === 0 ? s.longBreakMin : s.breakMin;
}

/** Tiempos de cada forma. Pomodoro vuelve a los tuyos. */
export function styleTimes(style: FocusStyle, pomo: { work: number; brk: number; long: number }): { workMin: number; breakMin: number; longBreakMin: number } {
  if (style === 'flujo') return { workMin: FLOW_CAP_MIN, breakMin: 5, longBreakMin: 5 };
  if (style === '52-17') return { workMin: 52, breakMin: 17, longBreakMin: 17 };
  return { workMin: pomo.work, breakMin: pomo.brk, longBreakMin: pomo.long };
}
