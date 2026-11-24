import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { useMode, type Space } from '../lib/mode';
import { switchSpace } from '../lib/spaceSwitch';
import { t, trn } from '../lib/i18n';

// ============================================================
//  Estudio | Trabajo (v26, fase 2). Solo aparece con "Los dos".
// ============================================================

const ITEMS: { key: Space; label: string; icon: string }[] = [
  { key: 'estudio', label: t('Estudio'), icon: 'school-outline' },
  { key: 'trabajo', label: t('Trabajo'), icon: 'briefcase-outline' },
];

export function SpaceSwitch({ compact = false }: { compact?: boolean }) {
  const { both, space } = useMode();
  if (!both) return null;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('Espacio')}
      style={{ flexDirection: 'row', padding: 3, gap: 3, borderRadius: 11, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line }}>
      {ITEMS.map((it) => {
        const on = space === it.key;
        return (
          <Pressable key={it.key} onPress={() => switchSpace(it.key)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={trn('Espacio {label}', { label: it.label })}
            style={({ hovered }: any) => ({ flex: compact ? undefined : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: compact ? 10 : 6, minHeight: 34, borderRadius: 8, backgroundColor: on ? C.brand : hovered ? C.surface : 'transparent' })}>
            <Ionicons name={it.icon as any} size={14} color={on ? C.onBrand : C.muted} />
            {(!compact || on) && <Text style={{ color: on ? C.onBrand : C.text, fontSize: 12.5, fontWeight: '700' }}>{it.label}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}
