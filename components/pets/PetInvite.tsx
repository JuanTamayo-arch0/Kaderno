// Invitación en Hoy para quien todavía no tiene mascota (se puede descartar).
import React, { useEffect, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../../lib/theme';
import { usePets } from '../../lib/pets/store';
import { Button, Card } from '../ds';
import { PetImage } from './PetArt';
import { t } from '../../lib/i18n';

const KEY = 'pet_invite_closed';

export function PetInvite() {
  const router = useRouter();
  const s = usePets();
  const [closed, setClosed] = useState<boolean | null>(null);
  // v29: en un celular angosto los botones van debajo; si no, el título se partía a mitad de palabra.
  const narrow = useWindowDimensions().width < 420;
  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => setClosed(!!v)).catch(() => setClosed(false)); }, []);
  if (closed !== false || !s.loaded || s.available !== true || s.pets.length > 0 || !s.prefs.enabled) return null;
  const buttons = (
    <View style={narrow ? { flexDirection: 'row', gap: 8, marginTop: 12 } : { gap: 6 }}>
      <Button label={t('Elegir')} size="sm" onPress={() => router.push('/mascota')} />
      <Button label={t('Ahora no')} size="sm" kind="ghost" onPress={() => { setClosed(true); AsyncStorage.setItem(KEY, '1').catch(() => {}); }} />
    </View>
  );
  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', marginLeft: -6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <PetImage species="pinguino" size={48} />
          <View style={{ marginLeft: -14 }}><PetImage species="gato" size={48} /></View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{t('Elige tu compañero de estudio')}</Text>
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{t('Una mascota pixel que te acompaña, celebra lo que terminas y gana monedas contigo.')}</Text>
        </View>
        {!narrow && buttons}
      </View>
      {narrow && buttons}
    </Card>
  );
}
