import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { KadernoMark } from '../../components/brand/KadernoLogo';
import { Button, Field } from '../../components/ds';
import { publicFormInfo, submitRequest, type FormInfo } from '../../lib/clientLinks';
import { t } from '../../lib/i18n';

// ============================================================
//  Formulario de solicitudes (v25, fase 4): público y sin cuenta. Lo que
//  se envía entra como tarea en la columna "Solicitudes" del proyecto.
// ============================================================

export default function Solicitar() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [info, setInfo] = useState<FormInfo | null | undefined>(undefined);
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [title, setTitle] = useState(''); const [detail, setDetail] = useState('');
  const [due, setDue] = useState(''); const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [sent, setSent] = useState(false);
  useEffect(() => { publicFormInfo(String(token)).then(setInfo).catch(() => setInfo(null)); }, [token]);
  useEffect(() => { if (Platform.OS === 'web' && typeof document !== 'undefined' && info) document.title = `Solicitud · ${info.name}`; }, [info]);

  async function send() {
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) { setErr(t('La fecha va como AAAA-MM-DD.')); return; }
    setBusy(true); setErr(null);
    try { await submitRequest(String(token), { name, email, title, detail, due: due || null, trap }); setSent(true); }
    catch (e: any) { setErr(e?.message ?? t('No se pudo enviar.')); }
    finally { setBusy(false); }
  }
  const today = new Date(); const min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ alignItems: 'center', padding: 16, paddingTop: 40, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 560, gap: 14 }}>
        {info === undefined && <ActivityIndicator color={C.brand} />}
        {info === null && (
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 40 }}>
            <Ionicons name="lock-closed-outline" size={36} color={C.muted} />
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>{t('Este formulario no está disponible')}</Text>
            <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>{t('Puede que lo hayan apagado o cambiado. Pídele el enlace nuevo a quien te lo mandó.')}</Text>
          </View>
        )}
        {info && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: info.color + '26', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22 }}>{info.icon}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.muted, fontSize: 13 }}>{t('Solicitud para')}</Text>
                <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>{info.name}</Text>
              </View>
            </View>
            {info.intro ? <Text style={{ color: C.text, fontSize: 14.5, lineHeight: 21 }}>{info.intro}</Text> : null}
            {sent ? (
              <View style={{ alignItems: 'center', gap: 10, padding: 24, borderRadius: 16, borderWidth: 1, borderColor: C.good }}>
                <Ionicons name="checkmark-circle" size={44} color={C.good} />
                <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{t('¡Recibido!')}</Text>
                <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>{t('El equipo ya tiene tu solicitud y te responde a {trim}.', { trim: email.trim() })}</Text>
                <Button label={t('Enviar otra')} kind="secondary" onPress={() => { setSent(false); setTitle(''); setDetail(''); setDue(''); }} />
              </View>
            ) : (
              <View style={{ gap: 2 }}>
                <Field label={t('Tu nombre')} value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
                <Field label={t('Tu correo (para responderte)')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={120} />
                <Field label={t('¿Qué necesitas?')} value={title} onChangeText={setTitle} maxLength={200} placeholder={t('Ej: informe de ventas de noviembre')} />
                <Field label={t('Detalles (opcional)')} value={detail} onChangeText={setDetail} multiline maxLength={3000} inputStyle={{ minHeight: 100, textAlignVertical: 'top' }} />
                {Platform.OS === 'web' ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>{t('¿Para cuándo? (opcional)')}</Text>
                    {React.createElement('input', { type: 'date', value: due, min, 'aria-label': t('Para cuándo'), onChange: (e: any) => setDue(e.target.value),
                      style: { background: C.surface2, color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box' } })}
                  </View>
                ) : <Field label={t('¿Para cuándo? (AAAA-MM-DD, opcional)')} value={due} onChangeText={setDue} />}
                {/* Campo trampa para robots: invisible para las personas. */}
                <TextInput value={trap} onChangeText={setTrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} {...({ tabIndex: -1, autoComplete: 'off', 'aria-hidden': true } as any)} />
                {err && <Text style={{ color: C.badText, fontSize: 13.5, marginBottom: 8 }} accessibilityLiveRegion="polite">{err}</Text>}
                <Button label={t('Enviar solicitud')} icon="send" busy={busy} disabled={!name.trim() || !email.trim() || !title.trim()} onPress={send} />
              </View>
            )}
            <View style={{ alignItems: 'center', gap: 6, marginTop: 10 }}>
              <KadernoMark size={22} />
              <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>{t('Hecho con Kaderno. Tus datos solo los ve el equipo del proyecto.')}</Text>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
