// ============================================================
//  Cuándo avisar de una tarea.
//  El aviso se guarda como un momento exacto (assignments.remind_at); la
//  función "notify" del servidor lo envía cuando llega. Para la versión
//  anterior (y las notificaciones locales del celular) se sigue llenando
//  remind_days con el equivalente en días.
// ============================================================
import { fromISODate } from './time';

export type RemindChoice = 'none' | 'at' | '1h' | '3h' | 'evening' | '1d' | '2d' | '1w';

export const REMIND_OPTIONS: { key: RemindChoice; label: string; needsTime?: boolean }[] = [
  { key: 'none', label: 'Sin aviso' },
  { key: 'at', label: 'A la hora', needsTime: true },
  { key: '1h', label: '1 hora antes', needsTime: true },
  { key: '3h', label: '3 horas antes', needsTime: true },
  { key: 'evening', label: 'La noche anterior' },
  { key: '1d', label: '1 día antes' },
  { key: '2d', label: '2 días antes' },
  { key: '1w', label: '1 semana antes' },
];

/** Momento del aviso, o null si no hay aviso o ya pasó. */
export function remindAt(choice: RemindChoice, dueISODate: string | null, dueTime: string | null, now = new Date()): Date | null {
  if (choice === 'none' || !dueISODate) return null;
  const due = fromISODate(dueISODate);
  if (dueTime) { const [h, m] = dueTime.split(':').map(Number); due.setHours(h, m, 0, 0); }
  else due.setHours(9, 0, 0, 0); // sin hora: avisos a las 9 am
  const r = new Date(due);
  switch (choice) {
    case 'at': if (!dueTime) return null; break;
    case '1h': if (!dueTime) return null; r.setHours(r.getHours() - 1); break;
    case '3h': if (!dueTime) return null; r.setHours(r.getHours() - 3); break;
    case 'evening': r.setDate(r.getDate() - 1); r.setHours(20, 0, 0, 0); break;
    case '1d': r.setDate(r.getDate() - 1); break;
    case '2d': r.setDate(r.getDate() - 2); break;
    case '1w': r.setDate(r.getDate() - 7); break;
  }
  return r.getTime() > now.getTime() ? r : null;
}

/** Días equivalentes (para remind_days). */
export function remindDays(choice: RemindChoice): number {
  return choice === '1d' || choice === 'evening' ? 1 : choice === '2d' ? 2 : choice === '1w' ? 7 : 0;
}

/** Al editar: qué opción corresponde a un remind_at guardado. */
export function inferChoice(remindAtISO: string | null | undefined, remindDaysVal: number | null | undefined, dueISODate: string | null, dueTime: string | null): RemindChoice {
  if (remindAtISO && dueISODate) {
    const target = new Date(remindAtISO).getTime();
    for (const o of REMIND_OPTIONS) {
      if (o.key === 'none') continue;
      const r = remindAt(o.key, dueISODate, dueTime, new Date(0));
      if (r && Math.abs(r.getTime() - target) < 60000) return o.key;
    }
  }
  if (remindDaysVal === 1) return '1d';
  if (remindDaysVal === 2 || remindDaysVal === 3) return '2d';
  if (remindDaysVal === 7) return '1w';
  return remindAtISO ? '1d' : 'none';
}
