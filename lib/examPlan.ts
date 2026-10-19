// ============================================================
//  Plan de repaso del parcial (v20, sección G). Puro, con pruebas.
//  Sesiones a 14, 7, 4, 2 y 1 días del examen (las que quepan), con un
//  tipo según su lugar: preparar, mezclar, simulacro y repaso ligero.
// ============================================================

export const OFFSETS = [14, 7, 4, 2, 1];
export type SessionKind = 'prep' | 'mix' | 'sim' | 'light';
export type PlannedSession = { offset: number; day: Date; kind: SessionKind; title: string; minutes: number };

export const KIND_TEXT: Record<SessionKind, { short: string; long: string }> = {
  prep: { short: 'Preparar', long: 'Preparar: repasa tus notas y crea tarjetas' },
  mix: { short: 'Tarjetas y ejercicios', long: 'Tarjetas y ejercicios mezclados' },
  sim: { short: 'Simulacro', long: 'Simulacro' },
  light: { short: 'Repaso ligero', long: 'Repaso ligero, 20 min, y descansa' },
};

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function daysUntil(exam: Date, now: Date): number {
  return Math.round((startOfDay(exam).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** ¿Se ofrece armar el plan? Examen o quiz a 3 días o más. */
export function shouldOffer(type: string | null | undefined, dueISO: string | null | undefined, now: Date): boolean {
  if (!dueISO || !['examen', 'quiz'].includes(String(type))) return false;
  const [y, m, d] = dueISO.split('-').map(Number);
  return daysUntil(new Date(y, m - 1, d), now) >= 3;
}

/** Las sesiones del plan, de la primera a la última. */
export function planSessions(exam: Date, now: Date): PlannedSession[] {
  const D = daysUntil(exam, now);
  const ex = startOfDay(exam);
  if (D < 1) return [];
  if (D <= 2) {
    // Examen mañana o pasado: simulacro rápido hoy y repaso ligero el día antes (hoy si es mañana).
    return [
      { offset: D, day: startOfDay(now), kind: 'sim', title: 'Simulacro rápido', minutes: 30 },
      { offset: 1, day: addDays(ex, -1), kind: 'light', title: KIND_TEXT.light.short, minutes: 20 },
    ];
  }
  const offs = OFFSETS.filter((o) => o < D).slice(0, 5);
  const n = offs.length;
  return offs.map((offset, i) => {
    let kind: SessionKind;
    if (i === n - 1) kind = 'light';
    else if (i === n - 2) kind = 'sim';
    else if (i === 0) kind = 'prep';
    else kind = 'mix';
    return { offset, day: addDays(ex, -offset), kind, title: KIND_TEXT[kind].short, minutes: kind === 'light' ? 20 : 50 };
  });
}

export function sessionTitle(kind: SessionKind, examTitle: string, quick = false): string {
  const base = quick && kind === 'sim' ? 'Simulacro rápido' : KIND_TEXT[kind].short;
  return `${base} · ${examTitle.trim().slice(0, 120)}`;
}

/** "2 de 4 sesiones hechas". */
export function planProgress(sessions: { status?: string | null }[]): { done: number; total: number; text: string } {
  const total = sessions.length;
  const done = sessions.filter((s) => s.status === 'done').length;
  return { done, total, text: `Plan de repaso: ${done} de ${total} ${total === 1 ? 'sesión hecha' : 'sesiones hechas'}` };
}

/**
 * Si cambia la fecha del examen: corre las sesiones pendientes los mismos
 * días. Las que quedarían en el pasado o el día del examen o después no se
 * mueven (se devuelven en `drop`).
 */
export function shiftSessions(
  sessions: { id: string; status?: string | null; due_date: string | null; plan_at?: string | null }[],
  deltaDays: number, now: Date, newExam: Date,
): { move: { id: string; due_date: string; plan_at: string | null }[]; drop: string[] } {
  const move: { id: string; due_date: string; plan_at: string | null }[] = [];
  const drop: string[] = [];
  const today = startOfDay(now);
  const ex = startOfDay(newExam);
  for (const s of sessions) {
    if (s.status === 'done' || !s.due_date) continue;
    const [y, m, d] = s.due_date.split('-').map(Number);
    const nd = addDays(new Date(y, m - 1, d), deltaDays);
    if (nd < today || nd >= ex) { drop.push(s.id); continue; }
    let plan: string | null = null;
    if (s.plan_at) { const p = new Date(s.plan_at); p.setDate(p.getDate() + deltaDays); plan = p.getTime() > now.getTime() ? p.toISOString() : null; }
    move.push({ id: s.id, due_date: `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`, plan_at: plan });
  }
  return { move, drop };
}
