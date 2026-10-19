import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { C } from '../../lib/theme';
import { getStudyPrefs, saveStudyPrefs, DEFAULT_STUDY, type StudyPrefs } from '../../lib/cardsDb';
import { toast, friendlyError } from '../../lib/feedback';
import { Toggle } from '../ds';

// Ajustes de Repaso: nuevas por día, retención deseada y escribir antes de ver.
export function StudySettings({ onChange }: { onChange?: (p: StudyPrefs) => void }) {
  const [p, setP] = useState<StudyPrefs>(DEFAULT_STUDY);
  const [txt, setTxt] = useState(String(DEFAULT_STUDY.newPerDay));
  useEffect(() => { getStudyPrefs().then((x) => { setP(x); setTxt(String(x.newPerDay)); }).catch(() => {}); }, []);
  const save = (patch: Partial<StudyPrefs>) => {
    const next = { ...p, ...patch };
    setP(next); onChange?.(next);
    saveStudyPrefs(patch).catch((e) => toast(friendlyError(e), { tone: 'bad' }));
  };
  const opt = (r: number, label: string) => {
    const on = p.retention === r;
    return (
      <Pressable key={r} onPress={() => save({ retention: r })} accessibilityRole="radio" accessibilityState={{ checked: on }}
        style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
        <Text style={{ color: on ? C.onBrand : C.text, fontSize: 13.5, fontWeight: on ? '700' : '600' }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Tarjetas nuevas por día</Text>
          <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>Entran poco a poco para que el repaso no se acumule. Primero las de materias con examen cerca.</Text>
        </View>
        <TextInput value={txt} keyboardType="number-pad" accessibilityLabel="Tarjetas nuevas por día" maxLength={3}
          onChangeText={(v) => setTxt(v.replace(/\D/g, ''))}
          onBlur={() => { const n = Math.max(0, Math.min(100, parseInt(txt || '0', 10))); setTxt(String(n)); if (n !== p.newPerDay) save({ newPerDay: n }); }}
          style={{ width: 64, textAlign: 'center', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 10, fontSize: 15 }} />
      </View>
      <View style={{ height: 1, backgroundColor: C.line, marginLeft: 14 }} />
      <View style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 8 }}>
        <View>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Retención deseada</Text>
          <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>Más alto = recuerdas más, pero repasas más seguido.</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }} accessibilityRole="radiogroup" accessibilityLabel="Retención deseada">
          {opt(0.85, '85%')}{opt(0.9, '90%')}{opt(0.95, '95%')}
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: C.line, marginLeft: 14 }} />
      <Toggle label="Escribir antes de ver" hint="Escribes tu respuesta y al voltear la ves al lado de la correcta." value={p.typeAnswer} onChange={(v) => save({ typeAnswer: v })} />
    </View>
  );
}
