import { Platform, Text, View } from 'react-native';
import { C } from '../lib/theme';

// Barra de progreso porcentual. Se usa en las tarjetas de tarea (microtareas)
// y sirve para cualquier otro avance (proyectos, kanban).
export function ProgressBar({
  done, total, height = 6, showLabel = true, color, compact = false,
}: {
  done: number; total: number; height?: number; showLabel?: boolean; color?: string; compact?: boolean;
}) {
  const safeTotal = Math.max(0, total);
  const safeDone = Math.min(Math.max(0, done), safeTotal);
  const pct = safeTotal === 0 ? 0 : Math.round((safeDone / safeTotal) * 100);
  const full = safeTotal > 0 && safeDone === safeTotal;
  const tone = color ?? (full ? C.good : C.brand);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, height, borderRadius: height, backgroundColor: C.surface2, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: height, backgroundColor: tone, ...(Platform.OS === 'web' ? { transitionProperty: 'width, background-color', transitionDuration: '400ms', transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)' } as any : null) }} />
      </View>
      {showLabel && (
        <Text style={{ color: full ? C.good : C.muted, fontSize: compact ? 10.5 : 11.5, fontWeight: '700', minWidth: compact ? 30 : 58, textAlign: 'right' }}>
          {compact ? `${pct}%` : `${safeDone}/${safeTotal} · ${pct}%`}
        </Text>
      )}
    </View>
  );
}
