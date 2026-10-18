import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { savePrefs, fetchPrefs } from '../../lib/db';
import {
  SOUNDS, CHIP_SOUNDS, type SoundId, type OnBreak, activeIds, tapChip, setLevel, savePreset, removePreset, mixLabel, isSilent,
} from '../../lib/ambientMix';
import {
  ambientSupported, getAmbientPrefs, getAmbientStatus, subscribeAmbient, updateAmbient, hydrateAmbient, unlockAmbient,
} from '../../lib/ambient';
import { Button, ChipRow, focusRingStyle } from '../ds';

// ============================================================
//  Controles del sonido de fondo: fila de chips en la tarjeta del reloj
//  y la hoja "Mezclar" con un deslizador por sonido.
// ============================================================

export function useAmbient() {
  const [, force] = useState(0);
  useEffect(() => subscribeAmbient(() => force((n) => n + 1)), []);
  return { prefs: getAmbientPrefs(), status: getAmbientStatus() };
}

const save = { savePrefs };

function Chip({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: any }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} dataSet={{ press: '1' }}
      style={({ pressed, focused }: any) => [{
        flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, marginRight: 8,
        backgroundColor: on ? '#22305a' : C.surface2, borderColor: on ? C.brand : C.line, opacity: pressed ? 0.8 : 1,
      }, focused ? focusRingStyle() : null]}>
      {icon ? <Ionicons name={icon} size={14} color={on ? '#dfe6ff' : C.muted} /> : null}
      <Text style={{ color: on ? '#dfe6ff' : C.text, fontSize: 13.5, fontWeight: on ? '700' : '600' }}>{label}</Text>
    </Pressable>
  );
}

/** Fila "Sonido de fondo" de la tarjeta del reloj. */
export function SoundRow({ running, onMix }: { running: boolean; onMix: () => void }) {
  const { prefs, status } = useAmbient();
  useEffect(() => { hydrateAmbient(fetchPrefs); }, []);
  if (!ambientSupported()) return null;
  const act = activeIds(prefs.mix);
  const mixed = act.length > 1 || act.some((id) => !CHIP_SOUNDS.includes(id));
  const pick = (id: SoundId | 'silencio') => updateAmbient({ mix: tapChip(prefs.mix, id), muted: false }, { preview: !running, ...save });
  return (
    <View style={{ width: '100%', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', flex: 1 }}>Sonido de fondo</Text>
        {status.playing && !status.needsTap && (
          <Text style={{ color: C.muted, fontSize: 12 }} accessibilityLiveRegion="polite">{status.preview ? `Probando: ${status.label}` : `Suena: ${status.label}`}</Text>
        )}
      </View>
      {status.needsTap && (
        <Pressable onPress={unlockAmbient} accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#22305a', borderWidth: 1, borderColor: C.brand }}>
          <Ionicons name="volume-high-outline" size={16} color="#dfe6ff" />
          <Text style={{ color: '#dfe6ff', fontSize: 13, fontWeight: '700', flex: 1 }}>Toca para activar el sonido</Text>
        </Pressable>
      )}
      <View accessibilityRole="radiogroup" accessibilityLabel="Sonido de fondo">
        <ChipRow>
          <Chip label="Silencio" on={isSilent(prefs.mix)} onPress={() => pick('silencio')} icon="volume-mute-outline" />
          {CHIP_SOUNDS.map((id) => (
            <Chip key={id} label={SOUNDS.find((s) => s.id === id)!.label} on={!mixed && act[0] === id} onPress={() => pick(id)} />
          ))}
          <Chip label={mixed ? mixLabel(prefs.mix) : 'Mezclar'} on={mixed} onPress={onMix} icon="options-outline" />
        </ChipRow>
      </View>
    </View>
  );
}

/** Deslizador 0..100. En la web es un <input type="range"> (accesible con teclado). */
function Slider({ value, onChange, label, color = C.brand }: { value: number; onChange: (v: number) => void; label: string; color?: string }) {
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'range', min: 0, max: 100, step: 1, value: Math.round(value * 100), 'aria-label': label,
      onChange: (e: any) => onChange(Number(e.target.value) / 100),
      style: { flex: 1, minWidth: 0, accentColor: color, height: 28, cursor: 'pointer', background: 'transparent' },
    });
  }
  const step = (d: number) => onChange(Math.min(1, Math.max(0, Math.round((value + d) * 10) / 10)));
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable onPress={() => step(-0.1)} accessibilityLabel={`Bajar ${label}`}><Ionicons name="remove-circle-outline" size={24} color={C.muted} /></Pressable>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.surface2 }}><View style={{ width: `${value * 100}%`, height: 6, borderRadius: 3, backgroundColor: color }} /></View>
      <Pressable onPress={() => step(0.1)} accessibilityLabel={`Subir ${label}`}><Ionicons name="add-circle-outline" size={24} color={C.muted} /></Pressable>
    </View>
  );
}

const BREAK_OPTS: { k: OnBreak; label: string }[] = [
  { k: 'silencio', label: 'Silencio' }, { k: 'pajaros', label: 'Pájaros' }, { k: 'igual', label: 'Lo mismo' },
];

/** Hoja "Mezclar": un deslizador por sonido, volumen general, descanso y mezclas guardadas. */
export function MixerSheet({ visible, onClose, running }: { visible: boolean; onClose: () => void; running: boolean }) {
  const { prefs } = useAmbient();
  const { isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);
  useEffect(() => { if (!visible) { setNaming(false); setName(''); } }, [visible]);
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [visible, onClose]);

  const set = (patch: Parameters<typeof updateAmbient>[0]) => updateAmbient({ ...patch, muted: false }, { preview: !running, ...save });
  const pct = (v: number) => (v > 0 ? `${Math.round(v * 100)}%` : 'No');

  return (
    <Modal visible={visible} transparent animationType={isWide || Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: isWide ? 'center' : 'flex-end', alignItems: isWide ? 'center' : 'stretch', padding: isWide ? 24 : 0 }}>
        <Pressable onPress={() => {}} accessibilityViewIsModal accessibilityLabel="Mezclar sonidos" dataSet={{ anim: 'sheet' }}
          style={isWide
            ? { width: '100%', maxWidth: 480, maxHeight: '88%', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line }
            : { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', borderTopWidth: 1, borderColor: C.line, paddingBottom: insets.bottom }}>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
            {!isWide && <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center' }} />}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', flex: 1 }} accessibilityRole="header">Mezclar</Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={8}><Ionicons name="close" size={22} color={C.muted} /></Pressable>
            </View>
            {!running && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: -6 }}>Cada cambio suena unos segundos para que lo pruebes. Con el reloj andando suena todo el pomodoro.</Text>}

            <View style={{ gap: 4 }}>
              {SOUNDS.map((s) => {
                const v = prefs.mix[s.id] ?? 0;
                return (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 }}>
                    <View style={{ width: 96 }}>
                      <Text style={{ color: v ? C.text : C.muted, fontSize: 14, fontWeight: v ? '700' : '500' }}>{s.label}</Text>
                    </View>
                    <Slider value={v} label={s.label} onChange={(n) => set({ mix: setLevel(prefs.mix, s.id, n) })} color="#8fa6ff" />
                    <Text style={{ width: 42, textAlign: 'right', color: C.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{pct(v)}</Text>
                  </View>
                );
              })}
            </View>

            <View style={{ height: 1, backgroundColor: C.line }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 }}>
              <Text style={{ width: 96, color: C.text, fontSize: 14, fontWeight: '700' }}>Volumen</Text>
              <Slider value={prefs.master} label="Volumen general" onChange={(n) => set({ master: n })} />
              <Text style={{ width: 42, textAlign: 'right', color: C.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{Math.round(prefs.master * 100)}%</Text>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>En el descanso</Text>
              <View style={{ flexDirection: 'row' }} accessibilityRole="radiogroup" accessibilityLabel="Sonido en el descanso">
                {BREAK_OPTS.map((o) => <Chip key={o.k} label={o.label} on={prefs.onBreak === o.k} onPress={() => updateAmbient({ onBreak: o.k }, save)} />)}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>Tus mezclas</Text>
              {prefs.presets.length === 0 && !naming && <Text style={{ color: C.muted, fontSize: 13 }}>Guarda hasta 3 mezclas para volver a ellas con un toque.</Text>}
              {prefs.presets.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
                  {prefs.presets.map((p) => (
                    <View key={p.name} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 }}>
                      <Pressable onPress={() => set({ mix: p.mix })} accessibilityRole="button" accessibilityLabel={`Usar mezcla ${p.name}: ${mixLabel(p.mix)}`}
                        style={{ paddingLeft: 13, paddingRight: 6, minHeight: 36, justifyContent: 'center' }}>
                        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>{p.name}</Text>
                      </Pressable>
                      <Pressable onPress={() => updateAmbient(removePreset(prefs, p.name), save)} accessibilityRole="button" accessibilityLabel={`Borrar mezcla ${p.name}`} hitSlop={6}
                        style={{ paddingRight: 10, paddingLeft: 2, minHeight: 36, justifyContent: 'center' }}>
                        <Ionicons name="close" size={14} color={C.muted} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              {naming ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput value={name} onChangeText={setName} placeholder="Nombre, p. ej. Biblioteca lluviosa" placeholderTextColor={C.muted} autoFocus maxLength={30}
                    accessibilityLabel="Nombre de la mezcla"
                    onSubmitEditing={() => { if (name.trim()) { updateAmbient(savePreset(prefs, name), save); setNaming(false); setName(''); } }}
                    style={{ flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, paddingHorizontal: 12, minHeight: 40, fontSize: 14 }} />
                  <Button label="Guardar" size="sm" disabled={!name.trim()} onPress={() => { updateAmbient(savePreset(prefs, name), save); setNaming(false); setName(''); }} />
                </View>
              ) : (
                <Button label={prefs.presets.length >= 3 ? 'Guardar (reemplaza la más vieja)' : 'Guardar esta mezcla'} kind="secondary" size="sm" icon="bookmark-outline"
                  disabled={isSilent(prefs.mix)} onPress={() => setNaming(true)} style={{ alignSelf: 'flex-start' }} />
              )}
            </View>

            <Text style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>Sin música con letra ni voces: distraen al leer. Los sonidos se crean en tu navegador, así que funcionan sin conexión.</Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
