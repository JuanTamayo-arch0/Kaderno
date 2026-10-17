// Ajustes de la mascota (en la pantalla Mascota y en Ajustes).
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { C } from '../../lib/theme';
import { isMutedToday, muteToday, savePetPrefs, usePets } from '../../lib/pets/store';
import { friendlyError, toast } from '../../lib/feedback';
import { Toggle } from '../ds';

function Choice<K extends string>({ label, hint, value, items, onChange }: { label: string; hint?: string; value: K; items: { key: K; label: string }[]; onChange: (k: K) => void }) {
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 8 }}>
      <View>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {!!hint && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{hint}</Text>}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {items.map((it) => {
          const on = it.key === value;
          return (
            <Pressable key={it.key} onPress={() => onChange(it.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
              <Text style={{ color: on ? C.onBrand : C.text, fontSize: 13.5, fontWeight: on ? '700' : '600' }}>{it.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const Divider = () => <View style={{ height: 1, backgroundColor: C.line, marginLeft: 14 }} />;

export function PetSettings() {
  const { prefs } = usePets();
  const save = (p: Parameters<typeof savePetPrefs>[0]) => savePetPrefs(p).catch((e) => toast(friendlyError(e), { tone: 'bad' }));
  return (
    <View>
      <Toggle label="Mostrar la mascota" hint="Te acompaña en todas las pantallas. Solo en la versión web por ahora." value={prefs.enabled} onChange={(v) => save({ enabled: v })} />
      {prefs.enabled && (
        <>
          <Divider />
          <Choice label="Movimiento" hint="Con 'reducir movimiento' del sistema se queda quieta siempre." value={prefs.move}
            items={[{ key: 'pasea', label: 'Pasea por la pantalla' }, { key: 'quieta', label: 'Quieta en su esquina' }]} onChange={(k) => save({ move: k })} />
          <Divider />
          <Choice label="Cuánto habla" value={prefs.talk}
            items={[{ key: 'importa', label: 'Solo cuando importa' }, { key: 'conversador', label: 'Conversador' }]} onChange={(k) => save({ talk: k })} />
          <Divider />
          <Toggle label="Silenciar por hoy" hint="No habla sola hasta mañana. Si la tocas, sí responde." value={isMutedToday(prefs)}
            onChange={(v) => { muteToday(v).catch((e) => toast(friendlyError(e), { tone: 'bad' })); }} />
        </>
      )}
    </View>
  );
}
