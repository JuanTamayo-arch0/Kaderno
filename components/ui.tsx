import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { C, S, R, shadow } from '../lib/theme';

// ============================================================
//  Piezas de UI compartidas por todas las pantallas.
//  Antes vivían dentro de app/(tabs)/index.tsx y las demás pantallas las
//  importaban desde ahí (una pantalla importando de otra pantalla). Ahora viven
//  aquí; index.tsx las vuelve a exportar para no romper esos imports.
// ============================================================

export function Header({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <View style={{ paddingTop: 58, paddingHorizontal: S.lg, paddingBottom: S.md, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: 0.2 }}>{title}</Text>
        <Text style={{ color: C.muted, fontSize: 13.5, marginTop: 3 }}>{subtitle}</Text>
      </View>
      {right}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      paddingVertical: 8, paddingHorizontal: 14, borderRadius: R.pill, marginRight: S.sm, borderWidth: 1,
      backgroundColor: active ? C.brand : C.surface2, borderColor: active ? C.brand : C.line,
      opacity: pressed ? 0.7 : 1,
    })}>
      <Text style={{ color: active ? '#0b0d11' : C.text, fontSize: 12.5, fontWeight: active ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingVertical: 3, paddingHorizontal: 10, borderRadius: R.pill, borderWidth: 1, borderColor: color + '55', backgroundColor: color + '14' }}>
      <Text style={{ color, fontSize: 11, fontWeight: '500' }}>{text}</Text>
    </View>
  );
}

export function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 78, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.md, padding: 12 }}>
      <Text style={{ color: color ?? C.text, fontSize: 22, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ---------- Estilos compartidos ----------
export const card = { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.lg, padding: 14, marginBottom: 10, ...shadow } as const;
export const check = { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: C.muted, marginTop: 2, alignItems: 'center', justifyContent: 'center' } as const;
export const fab = { position: 'absolute', right: 18, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: C.brand, shadowOpacity: 0.5, shadowRadius: 10 } as const;
export const sheet = { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30, borderTopColor: C.line, borderTopWidth: 1 } as const;
export const input = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 12, fontSize: 14, marginBottom: 4 } as const;
export const lbl = { color: C.muted, fontSize: 12, marginTop: 12, marginBottom: 6 } as const;
export const btnPrimary = { backgroundColor: C.brand, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 18 } as const;
export const secLbl = { color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', marginTop: 16, marginBottom: 8 } as const;
export const resItem = { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.md, padding: 12, marginBottom: 8 } as const;
