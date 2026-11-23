import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { C, R } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button } from '../ds';
import { getMinutesStyle, saveMinutesStyle } from '../../lib/meetingDb';
import { DEFAULT_MINUTES_STYLE, type MinutesStyle } from '../../lib/meeting';
import { friendlyError, notify, toast } from '../../lib/feedback';

// ============================================================
//  Formato del acta (v25, fase 5): breve, completa o detallada, y una
//  indicación propia ("siempre poner los riesgos", "en tercera persona").
// ============================================================

const FORMATS: { key: MinutesStyle['format']; label: string; hint: string }[] = [
  { key: 'breve', label: 'Breve', hint: 'Una a tres frases, decisiones y tareas.' },
  { key: 'completa', label: 'Completa', hint: 'Lo de siempre: resumen corto, decisiones, tareas y pendientes.' },
  { key: 'detallada', label: 'Detallada', hint: 'Los temas en orden y los datos que se dieron.' },
];

export function MinutesStyleSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [st, setSt] = useState<MinutesStyle>(DEFAULT_MINUTES_STYLE);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) getMinutesStyle().then(setSt).catch(() => {}); }, [visible]);

  async function save() {
    setBusy(true);
    try { await saveMinutesStyle(st); toast('Formato del acta guardado'); onClose(); }
    catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Formato del acta" subtitle="Así arma la IA tus próximas actas. Las que ya tienes no cambian." maxWidth={540}
      footer={<Button label="Guardar" busy={busy} onPress={save} />}>
      <View style={{ gap: 8 }}>
        {FORMATS.map((f) => {
          const on = st.format === f.key;
          return (
            <Pressable key={f.key} onPress={() => setSt({ ...st, format: f.key })} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ padding: 12, borderRadius: R.md, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand + '14' : 'transparent' }}>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>{f.label}</Text>
              <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{f.hint}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: 6, marginTop: 14 }}>
        <Text style={{ color: C.text, fontSize: 13, fontWeight: '800' }}>Indicación propia (opcional)</Text>
        <TextInput value={st.extra} onChangeText={(extra) => setSt({ ...st, extra: extra.slice(0, 300) })} multiline maxLength={300}
          placeholder="Por ejemplo: incluir siempre los riesgos y los números que se dijeron" placeholderTextColor={C.muted} accessibilityLabel="Indicación propia para el acta"
          style={{ minHeight: 70, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: 10, color: C.text, fontSize: 14, backgroundColor: C.surface, textAlignVertical: 'top' }} />
        <Text style={{ color: C.muted, fontSize: 12 }}>{st.extra.length}/300</Text>
      </View>
    </Sheet>
  );
}
