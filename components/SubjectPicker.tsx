import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R } from '../lib/theme';
import { Subject } from '../lib/db';
import { SubjectIcon } from './SubjectIcon';

// Selector de materia como desplegable (en vez de mostrar todos los chips).
export function SubjectPicker({ subjects, value, onChange, allowNone = true, placeholder = 'Elegir materia' }: {
  subjects: Subject[]; value: string | null; onChange: (id: string | null) => void; allowNone?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const sel = subjects.find((s) => s.id === value) ?? null;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 12 }}>
        {sel ? (
          <>
            <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: sel.color + '33', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><SubjectIcon icon={sel.icon} box={22} emoji={13} /></View>
            <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{sel.name}</Text>
          </>
        ) : (
          <Text style={{ color: C.muted, fontSize: 14, flex: 1 }}>{value === null && allowNone ? 'Ninguna' : placeholder}</Text>
        )}
        <Ionicons name="chevron-down" size={18} color={C.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 420, maxHeight: '70%', padding: 10 }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700', padding: 10 }}>Elegir materia</Text>
            <ScrollView>
              {allowNone && (
                <Row label="Ninguna" active={value === null} onPress={() => { onChange(null); setOpen(false); }} />
              )}
              {subjects.map((s) => (
                <Row key={s.id} icon={s.icon} color={s.color} label={s.name} active={value === s.id} onPress={() => { onChange(s.id); setOpen(false); }} />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Row({ label, icon, color, active, onPress }: { label: string; icon?: string; color?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: active ? C.brand + '22' : (pressed ? C.surface2 : 'transparent') })}>
      {icon ? <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: (color ?? C.brand) + '33', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><SubjectIcon icon={icon} box={28} emoji={14} /></View>
        : <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="remove" size={16} color={C.muted} /></View>}
      <Text style={{ color: active ? C.brand : C.text, fontSize: 14, fontWeight: active ? '700' : '500', flex: 1 }}>{label}</Text>
      {active && <Ionicons name="checkmark" size={18} color={C.brand} />}
    </Pressable>
  );
}
