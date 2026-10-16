import React, { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';
import { Button, Card } from './ds';
import { SUPABASE_URL, CALENDAR_URL } from '../lib/supabase';
import { getCalendarToken } from '../lib/db';
import { calendarLinks, diagnoseCalendar, type CalendarLinks, type Diagnosis } from '../lib/calendarLink';
import { buildMyIcs } from '../lib/calendarLocal';
import { confirm, friendlyError, notify, toast } from '../lib/feedback';
import { copyText, saveFile } from '../lib/fileIO';

// ============================================================
//  Ajustes, Calendario: enlace privado para suscribirse desde Google o
//  Apple, botón para probarlo (dice qué arreglar si falla) y descarga del
//  .ics generado en el dispositivo como plan B.
// ============================================================

export function CalendarCard() {
  const [links, setLinks] = useState<CalendarLinks | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnosis | null>(null);

  async function load(regen = false) {
    setBusy(regen ? 'regen' : 'get');
    try {
      const t = await getCalendarToken(regen);
      setLinks(calendarLinks(t, SUPABASE_URL, CALENDAR_URL));
      setDiag(null);
      if (regen) toast('Enlace nuevo creado. El anterior ya no funciona.');
    } catch (e) { notify('No se pudo crear el enlace', friendlyError(e)); }
    finally { setBusy(null); }
  }

  async function test() {
    if (!links) return;
    setBusy('test');
    let status = 0; let body = '';
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl?.abort(), 15000);
      // Sin encabezados de sesión, igual que lo pide Google o el iPhone.
      const r = await fetch(links.https, { method: 'GET', signal: ctrl?.signal, cache: 'no-store' as any });
      clearTimeout(timer);
      status = r.status; body = await r.text();
    } catch { status = 0; }
    setDiag(diagnoseCalendar(status, body, links.viaKaderno));
    setBusy(null);
  }

  async function download() {
    setBusy('download');
    try {
      const ics = await buildMyIcs();
      await saveFile('kaderno.ics', ics, 'text/calendar');
      toast('Calendario descargado. Ábrelo para importarlo (no se actualiza solo).');
    } catch (e) { notify('No se pudo generar el calendario', friendlyError(e)); }
    finally { setBusy(null); }
  }

  const open = (url: string) => Linking.openURL(url).catch(() => notify('No se pudo abrir', 'Copia el enlace y pégalo en tu calendario.'));

  return (
    <Card>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Ver tus entregas y clases en Google Calendar o Apple</Text>
      <Text style={{ color: C.muted, fontSize: 13, marginTop: 4, lineHeight: 19 }}>
        Kaderno crea un enlace privado que se actualiza solo. Usa los botones de abajo o pega el enlace en Google Calendar
        (Otros calendarios, Desde URL) o en el iPhone (Ajustes, Calendario, Cuentas, Agregar cuenta, Otra, Agregar calendario suscrito).
      </Text>

      {!links ? (
        <Button label="Obtener mi enlace" icon="calendar-outline" kind="secondary" size="sm" busy={busy === 'get'} onPress={() => load(false)} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
      ) : (
        <View style={{ marginTop: 12, gap: 10 }}>
          <Text selectable style={{ color: C.text, fontSize: 12.5, backgroundColor: C.surface2, padding: 10, borderRadius: 8, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>{links.https}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label="Copiar enlace" icon="copy-outline" size="sm" onPress={async () => { if (await copyText(links.https)) toast('Enlace copiado'); }} />
            <Button label="Google Calendar" icon="logo-google" kind="secondary" size="sm" onPress={() => open(links.google)} />
            <Button label="iPhone o Mac" icon="logo-apple" kind="secondary" size="sm" onPress={() => open(links.webcal)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label="Probar enlace" icon="pulse-outline" kind="ghost" size="sm" busy={busy === 'test'} onPress={test} />
            <Button label="Descargar .ics" icon="download-outline" kind="ghost" size="sm" busy={busy === 'download'} onPress={download} />
            <Button label="Crear enlace nuevo" icon="refresh" kind="ghost" size="sm" busy={busy === 'regen'}
              onPress={async () => { if (await confirm('¿Crear un enlace nuevo?', 'El enlace anterior dejará de funcionar en los calendarios donde lo hayas pegado.', 'Crear nuevo')) load(true); }} />
          </View>

          {busy === 'test' && !diag && <ActivityIndicator color={C.brand} />}
          {diag && (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: (diag.ok ? C.good : C.warn) + '66', backgroundColor: (diag.ok ? C.good : C.warn) + '14' }}>
              <Ionicons name={diag.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={diag.ok ? C.goodText : C.warnText} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 13.5 }}>{diag.title}</Text>
                <Text selectable style={{ color: C.text, fontSize: 12.5, marginTop: 3, lineHeight: 18 }}>{diag.detail}</Text>
              </View>
            </View>
          )}
          <Text style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>
            Si el iPhone dice "No se puede conectar mediante SSL" o Google no lo agrega, toca Probar enlace: casi nunca es el
            certificado, y aquí te dice qué falta. "Descargar .ics" sirve mientras tanto, pero es una copia de hoy que no se actualiza.
          </Text>
        </View>
      )}
    </Card>
  );
}
