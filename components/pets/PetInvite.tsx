// Invitación en Hoy para quien todavía no tiene mascota (se puede descartar).
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../../lib/theme';
import { usePets } from '../../lib/pets/store';
import { Button, Card } from '../ds';
import { PetImage } from './PetArt';

const KEY = 'pet_invite_closed';

export function PetInvite() {
  const router = useRouter();
  const s = usePets();
  const [closed, setClosed] = useState<boolean | null>(null);
  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => setClosed(!!v)).catch(() => setClosed(false)); }, []);
  if (closed !== false || !s.loaded || s.available !== true || s.pets.length > 0 || !s.prefs.enabled) return null;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', marginLeft: -6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <PetImage species="pinguino" size={48} />
        <View style={{ marginLeft: -14 }}><PetImage species="gato" size={48} /></View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Elige tu compañero de estudio</Text>
        <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>Una mascota pixel que te acompaña, celebra lo que terminas y gana monedas contigo.</Text>
      </View>
      <View style={{ gap: 6 }}>
        <Button label="Elegir" size="sm" onPress={() => router.push('/mascota')} />
        <Button label="Ahora no" size="sm" kind="ghost" onPress={() => { setClosed(true); AsyncStorage.setItem(KEY, '1').catch(() => {}); }} />
      </View>
    </Card>
  );
}
