import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { tipById, parkedTitle, type Parked } from '../../lib/breakTips';
import { nextTip, parkThought, removeParked, type FocusState } from '../../lib/focusTimer';
import { openAdd } from '../../lib/uiBus';
import { Card, focusRingStyle } from '../ds';
import { useResponsive } from '../../lib/responsive';
import { fmtMin } from '../TaskRow';

// ============================================================
//  Partes del Enfoque v20: pausa guiada, "Anotar para después",
//  la lista de lo anotado y el resumen del pomodoro.
// ============================================================

/** Sugerencia del descanso, dentro de la tarjeta del reloj. */
export function BreakCoach({ s }: { s: FocusState }) {
  const tip = tipById(s.tipId);
  const [done, setDone] = useState(false);
  useEffect(() => { setDone(false); }, [s.tipId]);
  if (!tip) return null;
  return (
    <View style={{ width: '100%', flexDirection: 'row', gap: 14, padding: 14, borderRadius: 14, backgroundColor: '#142a22', borderWidth: 1, borderColor: '#22604a' }}
      accessibilityLabel={`Sugerencia para el descanso: ${tip.title}`}>
      <Ionicons name={done ? 'checkmark-circle' : (tip.icon as any)} size={28} color="#5fd8a4" style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: C.text, fontSize: 15.5, fontWeight: '800' }}>{done ? 'Bien hecho' : tip.title}</Text>
        <Text style={{ color: '#b9dccb', fontSize: 13, lineHeight: 18 }}>{done ? 'Disfruta lo que queda del descanso.' : tip.body}</Text>
        {!done && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <SmallBtn label="Hecho" solid onPress={() => setDone(true)} />
            <SmallBtn label="Otra idea" onPress={nextTip} />
          </View>
        )}
      </View>
    </View>
  );
}

function SmallBtn({ label, onPress, solid, icon }: { label: string; onPress: () => void; solid?: boolean; icon?: any }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} dataSet={{ press: '1' }}
      style={({ pressed, focused }: any) => [{
        flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 12, borderRadius: 9,
        backgroundColor: solid ? '#37c98b' : 'transparent', borderWidth: solid ? 0 : 1, borderColor: '#2f6e57', opacity: pressed ? 0.8 : 1,
      }, focused ? focusRingStyle() : null]}>
      {icon ? <Ionicons name={icon} size={15} color={solid ? '#0b1a14' : C.text} /> : null}
      <Text style={{ color: solid ? '#0b1a14' : C.text, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Botón "Anotar para después" (atajo D en computador). Se abre un campo de una
 * línea: Enter guarda y vuelve al enfoque; Escape cierra.
 */
export function ParkButton({ s, active }: { s: FocusState; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const input = useRef<TextInput>(null);
  const { isWide } = useResponsive();

  // Atajo D (solo mientras se ve la pantalla de Enfoque).
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 30); }, [open]);
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 1800); return () => clearTimeout(t); }, [saved]);

  const commit = () => {
    if (text.trim()) { parkThought(text); setSaved(true); }
    setText(''); setOpen(false);
  };

  if (open) {
    return (
      <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 6, minHeight: 46, borderRadius: 12, borderWidth: 1.5, borderColor: C.brand, backgroundColor: C.surface2 }}>
        <Ionicons name="bookmark-outline" size={16} color={C.muted} />
        <TextInput ref={input} value={text} onChangeText={setText} placeholder="¿Qué se te vino a la cabeza?" placeholderTextColor={C.muted}
          accessibilityLabel="Anotar para después" maxLength={200} returnKeyType="done" blurOnSubmit
          onSubmitEditing={commit}
          onKeyPress={(e: any) => { if (e.nativeEvent?.key === 'Escape') { setText(''); setOpen(false); } }}
          style={{ flex: 1, color: C.text, fontSize: 14.5, minHeight: 40, outlineStyle: 'none' } as any} />
        <Pressable onPress={commit} accessibilityRole="button" accessibilityLabel="Guardar"
          style={{ height: 34, paddingHorizontal: 12, borderRadius: 9, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.onBrand, fontWeight: '800', fontSize: 13 }}>Guardar</Text>
        </Pressable>
      </View>
    );
  }
  const n = s.parked?.length ?? 0;
  return (
    <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Anotar para después${n ? `, ${n} anotadas` : ''}`} dataSet={{ press: '1' }}
      style={({ pressed, focused, hovered }: any) => [{
        width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 42, borderRadius: 12,
        borderWidth: 1, borderStyle: 'dashed', borderColor: hovered ? C.muted : C.line, opacity: pressed ? 0.8 : 1,
      }, focused ? focusRingStyle() : null]}>
      <Ionicons name={saved ? 'checkmark' : 'add'} size={16} color={saved ? C.goodText : C.muted} />
      <Text style={{ color: saved ? C.goodText : C.muted, fontSize: 13.5, fontWeight: '600' }}>{saved ? 'Anotado. Sigue con lo tuyo.' : 'Anotar para después'}</Text>
      {!saved && Platform.OS === 'web' && isWide && (
        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, borderWidth: 1, borderColor: C.line }}><Text style={{ color: C.muted, fontSize: 11, fontWeight: '700' }}>D</Text></View>
      )}
      {!saved && n > 0 && <Text style={{ color: C.muted, fontSize: 12 }}>· {n}</Text>}
    </Pressable>
  );
}

/** Lo anotado, en la pausa o con el reloj quieto. */
export function ParkedList({ parked }: { parked: Parked[] }) {
  if (!parked?.length) return null;
  return (
    <Card>
      <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', marginBottom: 8 }} accessibilityRole="header">{parkedTitle(parked.length)}</Text>
      {parked.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.surface2 }}>
          <Text style={{ flex: 1, color: C.text, fontSize: 13.5 }}>{p.text}</Text>
          <Pressable onPress={() => { removeParked(p.id); openAdd(p.text); }} accessibilityRole="button" accessibilityLabel={`Hacer tarea: ${p.text}`}
            style={({ hovered }: any) => ({ minHeight: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: hovered ? C.surface2 : 'transparent', justifyContent: 'center' })}>
            <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>Hacer tarea</Text>
          </Pressable>
          <Pressable onPress={() => removeParked(p.id)} accessibilityRole="button" accessibilityLabel={`Borrar: ${p.text}`} hitSlop={6}
            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={16} color={C.muted} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

/** Resumen del último pomodoro, mientras dura el descanso. */
export function PomodoroSummary({ s, todayMin }: { s: FocusState; todayMin: number }) {
  const l = s.last;
  if (!l || s.mode !== 'break') return null;
  const items: [string, string][] = [
    ['Enfocado', l.minutes >= 1 ? `${l.minutes} min` : 'Menos de 1 min'],
    ['Distracciones', String(l.distractions)],
    ['Hoy en total', fmtMin(todayMin)],
  ];
  return (
    <Card>
      <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', marginBottom: 10 }} accessibilityRole="header">
        {l.n > 0 ? `Pomodoro ${l.n} de hoy terminado` : 'Pomodoro terminado'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {items.map(([k, v]) => (
          <View key={k} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: C.surface2 }}>
            <Text style={{ color: C.muted, fontSize: 11.5 }}>{k}</Text>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '800', marginTop: 2 }}>{v}</Text>
          </View>
        ))}
      </View>
      {l.distractions > 0 && (
        <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 10, lineHeight: 17 }}>
          Anotar lo que te distrae y seguir es justo lo que hay que hacer. Míralo ahora, en la pausa.
        </Text>
      )}
    </Card>
  );
}
