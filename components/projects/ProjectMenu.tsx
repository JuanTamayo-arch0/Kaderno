import { useRef } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R, shadow } from '../../lib/theme';
import { isWeb } from './projectUi';

// ============================================================
//  Menú "Opciones" y botones del encabezado de la pantalla de proyecto.
//  (Separado de app/proyectos/[id].tsx en la versión 23.)
// ============================================================

export type MenuItem = { icon: string; label: string; hint?: string; onPress: () => void };

// Menú de opciones del proyecto, agrupado. En computador se abre como lista
// desplegable bajo el botón "Opciones"; en el celular, como hoja desde abajo.
export function MoreMenu({ visible, groups, anchor, onClose }: {
  visible: boolean; onClose: () => void; anchor: { x: number; y: number } | null;
  groups: { title: string; items: MenuItem[] }[];
}) {
  const list = groups.filter((g) => g.items.length > 0);
  const body = list.map((g, gi) => (
    <View key={g.title} style={{ paddingTop: gi === 0 ? 0 : 6, marginTop: gi === 0 ? 0 : 6, borderTopWidth: gi === 0 ? 0 : 1, borderTopColor: C.line }}>
      <Text style={{ color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2 }}>{g.title}</Text>
      {g.items.map((it) => (
        <Pressable key={it.label} onPress={() => { onClose(); it.onPress(); }} accessibilityRole="menuitem"
          style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: pressed || hovered ? C.surface2 : 'transparent' })}>
          <Ionicons name={it.icon as any} size={19} color={C.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{it.label}</Text>
            {it.hint ? <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>{it.hint}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  ));
  if (anchor) {
    return (
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <Pressable onPress={onClose} style={{ flex: 1 }}>
          <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }} accessibilityRole="menu"
            style={{ position: 'absolute', top: anchor.y, right: anchor.x, width: 330, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 6, ...shadow, ...(isWeb ? { boxShadow: '0 16px 40px rgba(0,0,0,0.35)' } as any : null) }}>
            {body}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }} style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 10, paddingBottom: 26, borderTopWidth: 1, borderColor: C.line }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 8 }} />
          {body}
          <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 10, paddingVertical: 8 }}>
            <Text style={{ color: C.muted }}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Botón "Opciones" (computador) o "···" (celular). Devuelve dónde abrir el menú.
export function OptionsButton({ wide, open, onPress }: { wide: boolean; open: boolean; onPress: (anchor: { x: number; y: number } | null) => void }) {
  const ref = useRef<any>(null);
  function press() {
    let anchor: { x: number; y: number } | null = null;
    try {
      const r = (ref.current as HTMLElement)?.getBoundingClientRect?.();
      if (r && typeof window !== 'undefined') anchor = { x: Math.max(8, window.innerWidth - r.right), y: r.bottom + 6 };
    } catch { /* nativo */ }
    onPress(anchor);
  }
  return (
    <Pressable ref={ref} onPress={press} hitSlop={6} accessibilityRole="button" accessibilityLabel="Opciones del proyecto" accessibilityState={{ expanded: open }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: open ? C.brand : C.line, backgroundColor: open ? C.brand + '18' : C.surface2, borderRadius: R.pill, paddingVertical: wide ? 7 : 10, paddingHorizontal: wide ? 12 : 11 }}>
      <Ionicons name={wide ? 'options-outline' : 'ellipsis-horizontal'} size={15} color={open ? C.brand : C.muted} />
      {wide && <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>Opciones</Text>}
      {wide && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={C.muted} />}
    </Pressable>
  );
}

export function HeaderBtn({ icon, label, wide, onPress }: { icon: string; label: string; wide: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2, borderRadius: R.pill, paddingVertical: wide ? 7 : 10, paddingHorizontal: wide ? 12 : 11 }}>
      <Ionicons name={icon as any} size={15} color={C.muted} />
      {wide && <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>}
    </Pressable>
  );
}

// ============================================================
//  Vista TABLERO
// ============================================================
