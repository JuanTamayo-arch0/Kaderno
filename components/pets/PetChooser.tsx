// Elegir la primera mascota (bienvenida y pantalla Mascota).
import React, { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { C } from '../../lib/theme';
import { SPECIES, type Species } from '../../lib/pets/art';
import { DEFAULT_NAMES } from '../../lib/pets/economy';
import { adoptPet, type Pet } from '../../lib/pets/store';
import { friendlyError, notify } from '../../lib/feedback';
import { useResponsive } from '../../lib/responsive';
import { Button } from '../ds';
import { CoinIcon, PetImage, PetSprite } from './PetArt';

export const PERSONALITY: Record<Species, { trait: string; sample: string }> = {
  pinguino: { trait: 'Ordenado y constante', sample: 'Paso a paso. Hoy van 2 de 4.' },
  gato: { trait: 'Tranquilo, algo sarcástico', sample: 'Esa tarea lleva 3 días mirándote.' },
  perro: { trait: 'Entusiasta, celebra todo', sample: '¡Terminaste! ¡Vamos por otra!' },
  loro: { trait: 'Curioso, pregunta y repite', sample: '¿Repasamos 5 tarjetas? ¿5 tarjetas?' },
};

export function PetChooser({ onDone }: { onDone?: (p: Pet) => void }) {
  const { isWide } = useResponsive();
  const [sp, setSp] = useState<Species>('pinguino');
  const [name, setName] = useState(DEFAULT_NAMES.pinguino);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  function pick(s: Species) {
    setSp(s);
    if (!touched) setName(DEFAULT_NAMES[s]);
  }
  async function adopt() {
    setBusy(true);
    try { const p = await adoptPet(sp, name.trim() || DEFAULT_NAMES[sp]); onDone?.(p); }
    catch (e) { notify('No se pudo adoptar', friendlyError(e)); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} accessibilityRole="radiogroup">
        {(Object.keys(SPECIES) as Species[]).map((s) => {
          const on = s === sp;
          return (
            <Pressable key={s} onPress={() => pick(s)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${SPECIES[s].name}: ${PERSONALITY[s].trait}`}
              dataSet={{ press: '1' }}
              style={({ focused }: any) => [{
                flexBasis: isWide ? '22%' : '46%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 10,
                borderRadius: 18, borderWidth: 2, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand + '18' : C.surface,
              }, focused ? ({ outlineColor: C.focus, outlineWidth: 2, outlineStyle: 'solid' } as any) : null]}>
              {on ? <PetSprite species={s} size={96} /> : <PetImage species={s} size={96} />}
              <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{SPECIES[s].name}</Text>
              <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', textAlign: 'center' }}>{PERSONALITY[s].trait}</Text>
              {isWide && <Text style={{ color: C.text, fontSize: 13, textAlign: 'center', backgroundColor: C.surface2, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, marginTop: 4 }}>“{PERSONALITY[s].sample}”</Text>}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <CoinIcon species={s} size={16} />
                <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '700' }}>Gana {SPECIES[s].coin.many}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 10, alignItems: isWide ? 'center' : 'stretch' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12 }}>
          <Text style={{ color: C.muted, fontSize: 14 }}>Nombre</Text>
          <TextInput value={name} onChangeText={(v) => { setName(v.slice(0, 24)); setTouched(true); }} maxLength={24} accessibilityLabel="Nombre de tu mascota"
            onSubmitEditing={adopt} placeholder={DEFAULT_NAMES[sp]} placeholderTextColor={C.muted}
            style={[{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700', paddingVertical: 12, minHeight: 46 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
        </View>
        <Button label={`Adoptar a ${name.trim() || DEFAULT_NAMES[sp]}`} icon="paw" onPress={adopt} busy={busy} size="lg" />
      </View>
      <Text style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>
        La primera es gratis. Las demás las adoptas después con lo que ganes estudiando. Puedes cambiarle el nombre o apagarla cuando quieras.
      </Text>
    </View>
  );
}
