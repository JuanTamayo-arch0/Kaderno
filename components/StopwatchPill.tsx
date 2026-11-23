import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import { clock, discardStopwatch, elapsedMin, isForgotten, snoozeForgotten, stopStopwatch, useStopwatch } from '../lib/stopwatch';
import { fmtHours, parseDuration } from '../lib/hours';
import { Sheet } from './cards/CardForms';
import { Button, Field } from './ds';
import { friendlyError, notify, toast } from '../lib/feedback';
import { dataChanged } from '../lib/uiBus';

// ============================================================
//  Cronómetro corriendo (v25, fase 2): visible en cualquier pantalla, con
//  parar. Si lleva más de 3 horas, pregunta si se olvidó y deja corregir.
//  En computador va en la barra lateral, encima de Ajustes (no tapa nada).
//  En celular flota sobre las pestañas, salvo en pantallas con algo abajo
//  (escribir al Oráculo, calificar tarjetas, el editor, el chat de la sala).
// ============================================================

const HIDE_ON_PHONE = ['/oraculo', '/repaso', '/simulacro', '/nota/', '/sala/', '/enfoque', '/visor', '/solicitar', '/avance', '/login', '/bienvenida'];

export function StopwatchPill({ inline = false }: { inline?: boolean }) {
  const { sw, ms } = useStopwatch();
  const { isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const [fix, setFix] = useState(false);
  const [dur, setDur] = useState('');
  const [busy, setBusy] = useState(false);
  const forgotten = isForgotten(sw);
  useEffect(() => { if (forgotten) { setDur(String(Math.round(elapsedMin(sw!)))); } }, [forgotten]);
  if (!sw) return null;
  // Flotante solo en celular (en computador lo pone la barra lateral).
  if (!inline && (isWide || HIDE_ON_PHONE.some((x) => pathname.startsWith(x)))) return null;

  async function stop(minutes?: number) {
    setBusy(true);
    try {
      const r = await stopStopwatch(minutes);
      setFix(false);
      if (r.saved) { toast(`${fmtHours(r.minutes)} anotadas${sw!.title ? `: ${sw!.title}` : ''}`, { tone: 'good', actionLabel: 'Ver horas', onAction: () => router.push('/horas' as any) }); dataChanged(); }
      else toast('Menos de un minuto: no se anotó nada');
    } catch (e) { notify('No se pudo guardar el tiempo', `${friendlyError(e)} El cronómetro sigue corriendo para que no lo pierdas.`); }
    finally { setBusy(false); }
  }
  const pos: any = Platform.OS === 'web' ? { position: 'fixed' } : { position: 'absolute' };
  const where = inline ? { marginBottom: 10 } : { bottom: 66 + Math.max(insets.bottom, 6), left: 12, right: 12 };
  const min = parseDuration(dur);
  return (
    <>
      <View style={[inline ? null : pos, where, { zIndex: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 14, paddingRight: 8, borderRadius: 99, backgroundColor: C.surface, borderWidth: 1, borderColor: forgotten ? C.warn : C.brand, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }]}
        accessibilityLabel={`Cronómetro: ${clock(ms)}, ${sw.title}`}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: forgotten ? C.warn : C.bad }} />
        <Pressable onPress={() => (forgotten ? setFix(true) : router.push('/horas' as any))} style={{ flex: 1, minWidth: 0 }} accessibilityRole="button" accessibilityLabel={forgotten ? 'Revisar cronómetro olvidado' : 'Ver registro de horas'}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{clock(ms)}</Text>
          <Text style={{ color: forgotten ? C.warnText : C.muted, fontSize: 11.5 }} numberOfLines={1}>{forgotten ? '¿Se te olvidó pararlo?' : sw.title}</Text>
        </Pressable>
        <Pressable onPress={() => stop()} disabled={busy} accessibilityRole="button" accessibilityLabel="Parar cronómetro" hitSlop={6}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.bad, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
          <Ionicons name="stop" size={16} color="#fff" />
        </Pressable>
      </View>
      <Sheet visible={fix} onClose={() => setFix(false)} title="El cronómetro sigue corriendo" subtitle={`Empezó a las ${new Date(sw.startedAt).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })} (${fmtHours(elapsedMin(sw))}). ¿Cuánto trabajaste de verdad?`} maxWidth={460}
        footer={<>
          <Button label="Sigo trabajando" kind="ghost" onPress={() => { snoozeForgotten(); setFix(false); }} />
          <Button label="Descartar" kind="ghost" onPress={() => { discardStopwatch(); setFix(false); toast('Descartado: no se anotó nada'); }} />
          <View style={{ flex: 1 }} />
          <Button label={min ? `Anotar ${fmtHours(min)}` : 'Anotar'} busy={busy} disabled={!min || min > 720} onPress={() => stop(min!)} />
        </>}>
        <Field label="Duración real" value={dur} onChangeText={setDur} placeholder="2:30" hint={min ? `${fmtHours(min)}${min > 720 ? ' (máximo 12 horas)' : ''}` : 'Escribe 2:30, 2,5 o 150 (minutos)'} />
      </Sheet>
    </>
  );
}
