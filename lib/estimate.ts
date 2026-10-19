// ============================================================
//  Tu tiempo real (v20, sección F). Puro, con pruebas.
//  Compara lo que estimas con lo que de verdad te enfocas en cada tarea.
// ============================================================

export type EstimateRow = { estimate_min: number | null | undefined; focus_min: number };

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Mediana de (enfocado / estimado) en tus últimas 20 tareas hechas con
 * estimado de 10 min o más y 5 min o más de enfoque. Se necesitan 5.
 * `rows` va de la más reciente a la más vieja.
 */
export function estimateRatio(rows: EstimateRow[]): number | null {
  const ok = rows.filter((r) => (r.estimate_min ?? 0) >= 10 && r.focus_min >= 5).slice(0, 20);
  if (ok.length < 5) return null;
  const m = median(ok.map((r) => r.focus_min / (r.estimate_min as number)));
  return m == null ? null : Math.round(m * 100) / 100;
}

/** Entre 0,8 y 1,2 no vale la pena decir nada. */
export function isMeaningful(r: number | null | undefined): r is number {
  return r != null && Number.isFinite(r) && (r < 0.8 || r > 1.2);
}

export function suggestEstimate(est: number, r: number): number {
  return Math.max(5, Math.min(10000, Math.round((est * r) / 5) * 5));
}

/** "1,6 veces" con coma decimal. */
export function ratioText(r: number): string {
  const v = Math.round(r * 10) / 10;
  return `${String(v).replace('.', ',')} veces`;
}

export function fmtMinutes(m: number): string {
  const v = Math.max(0, Math.round(m));
  if (v < 60) return `${v} min`;
  const h = Math.floor(v / 60), r = v % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Frase para la sugerencia al poner un estimado (null si no aplica). */
export function estimateHint(est: number | null | undefined, r: number | null | undefined): { text: string; value: number } | null {
  if (!est || !isMeaningful(r)) return null;
  const value = suggestEstimate(est, r);
  if (value === est) return null;
  return { text: `Sueles tardar ${ratioText(r)} lo que calculas. ¿Pongo ${fmtMinutes(value)}?`, value };
}

/** "Te tomó 50 min (calculaste 30)" al completar (null si no hay datos). */
export function tookText(focus: number | null | undefined, est: number | null | undefined): string | null {
  if (!est || !focus || focus < 5) return null;
  return `Te tomó ${fmtMinutes(focus)} (calculaste ${fmtMinutes(est)})`;
}

/** "La semana pasada planeaste 6 h y estudiaste 4 h 30" (para el ritual del lunes). */
export function planVsReal(planned: number, real: number): string | null {
  if (planned < 30) return null;
  const f = (m: number) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? (r ? `${h} h ${r}` : `${h} h`) : `${r} min`; };
  return `La semana pasada planeaste ${f(planned)} y estudiaste ${f(real)}.`;
}
