import { Platform, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R } from '../../lib/theme';
import { PStep, PTask } from '../../lib/projects';
import { t, trn, dateLocale } from '../../lib/i18n';

// ============================================================
//  Piezas pequeñas compartidas por la pantalla de proyecto: puntero, fechas, casillas, etiquetas y estilos.
//  (Separado de app/proyectos/[id].tsx en la versión 23.)
// ============================================================

// ============================================================

export const isWeb = Platform.OS === 'web';

// ¿El dedo es el puntero? El arrastrar-y-soltar de HTML5 NO existe en los
// navegadores de celular: se puede arrastrar con el ratón, pero con el dedo el
// gesto se lo queda el scroll. Como Kaderno se entrega como web (también se
// abre desde el teléfono), no basta con preguntar por la plataforma: hay que
// preguntar por el puntero, y en ese caso mostrar el botón "mover".
export const COARSE_POINTER = (() => {
  try {
    return isWeb && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  } catch { return false; }
})();

export const NO_STEPS: PStep[] = [];

// Fecha en corto + color según lo apretado que esté. Devuelve null si no hay fecha.
// Si la tarea tiene hora (due_at distinta de las 11:59 p. m.), se muestra también.
export function dueInfo(t: Pick<PTask, 'due_date' | 'due_at'>, done: boolean): { label: string; color: string } | null {
  const at = t.due_at ? new Date(t.due_at) : null;
  const d = at && !isNaN(at.getTime()) ? new Date(at) : t.due_date ? new Date(t.due_date + 'T00:00:00') : null;
  if (!d || isNaN(d.getTime())) return null;
  const hasTime = !!at && !(at.getHours() === 23 && at.getMinutes() === 59);
  d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  let label = days === 0 ? trn('Hoy') : days === 1 ? trn('Mañana') : days === -1 ? trn('Ayer')
    : days < 0 ? trn('Hace {v}d', { v: -days })
    : d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
  if (hasTime && at) label += ` ${at.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' })}`;
  const late = at ? at.getTime() < Date.now() : days < 0;
  const color = done ? C.muted : late ? C.bad : days <= 2 ? C.warn : C.muted;
  return { label, color };
}

export function SelectBox({ on }: { on: boolean }) {
  return (
    <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: on ? C.brand : C.muted, backgroundColor: on ? C.brand : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 0.5 }}>
      {on && <Ionicons name="checkmark" size={13} color="#0f1115" />}
    </View>
  );
}

export function Pill({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: R.pill, backgroundColor: color + '22' }}>
      <Text style={{ color, fontSize: 11.5, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

// "hace 3 h". Sin librerías: son cuatro casos y no vale la pena traer moment.
export function hace(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const min = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (min < 1) return t('ahora');
  if (min < 60) return t('hace {min} min', { min });
  const h = Math.round(min / 60);
  if (h < 24) return t('hace {h} h', { h });
  const d = Math.round(h / 24);
  if (d < 30) return t('hace {d} d', { d });
  return new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
}



// ---------- estilos sueltos ----------

export function pad(n: number): string { return String(n).padStart(2, '0'); }

export const input = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 12, fontSize: 14 } as const;
export const lbl = { color: C.muted, fontSize: 12, marginTop: 14, marginBottom: 8 } as const;
export const btnPrimary = { backgroundColor: C.brand, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 } as const;
export const secTitle = { color: C.text, fontSize: 14.5, fontWeight: '700', marginBottom: 9, marginTop: 4 } as const;
