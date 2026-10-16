import React from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import type { IconName } from './ds';

export type MenuAction = { label: string; icon: IconName; onPress: () => void; danger?: boolean; hint?: string };

// Menú de acciones: hoja inferior en el celular, cuadro pequeño en computador.
export function ActionMenu({ visible, title, actions, onClose }: { visible: boolean; title?: string; actions: MenuAction[]; onClose: () => void }) {
  const { isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={isWide || Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: isWide ? 'center' : 'flex-end', alignItems: isWide ? 'center' : 'stretch' }}>
        <Pressable onPress={() => {}} accessibilityViewIsModal dataSet={{ anim: 'sheet' }}
          style={isWide
            ? { width: 320, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingVertical: 8 }
            : { backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 10, paddingBottom: 10 + insets.bottom, borderTopWidth: 1, borderColor: C.line }}>
          {!isWide && <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 8 }} />}
          {!!title && <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600', paddingHorizontal: 18, paddingVertical: 8 }} numberOfLines={1}>{title}</Text>}
          {actions.map((a) => (
            <Pressable key={a.label} onPress={() => { onClose(); setTimeout(a.onPress, 0); }} accessibilityRole="menuitem"
              style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 18, minHeight: 48, backgroundColor: pressed || hovered ? C.surface2 : 'transparent' })}>
              <Ionicons name={a.icon} size={19} color={a.danger ? C.badText : C.muted} />
              <Text style={{ color: a.danger ? C.badText : C.text, fontSize: 15, flex: 1 }}>{a.label}</Text>
              {!!a.hint && <Text style={{ color: C.muted, fontSize: 12.5 }}>{a.hint}</Text>}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
