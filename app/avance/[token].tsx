import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { KadernoMark } from '../../components/brand/KadernoLogo';
import { publicView, type PublicView } from '../../lib/clientLinks';
import { HEALTH } from '../../lib/projectWork';
import { t, monthsShort, trn } from '../../lib/i18n';

// ============================================================
//  Avance del proyecto para el cliente (v25, fase 4): público y de solo
//  lectura. Sin nombres, comentarios, horas ni tareas marcadas #interno.
// ============================================================

const MONTHS = monthsShort();
const day = (iso: string) => { const [, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };

export default function Avance() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [v, setV] = useState<PublicView | null | undefined>(undefined);
  useEffect(() => { publicView(String(token)).then(setV).catch(() => setV(null)); }, [token]);
  useEffect(() => { if (Platform.OS === 'web' && typeof document !== 'undefined' && v) document.title = trn('Avance · {name}', { name: v.name }); }, [v]);
  const pct = v && v.total ? Math.round((v.done / v.total) * 100) : 0;
  const box = { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, gap: 8 } as const;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ alignItems: 'center', padding: 16, paddingTop: 40, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 680, gap: 14 }}>
        {v === undefined && <ActivityIndicator color={C.brand} />}
        {v === null && (
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 40 }}>
            <Ionicons name="lock-closed-outline" size={36} color={C.muted} />
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>{t('Este enlace no está disponible')}</Text>
            <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>{t('Puede que lo hayan apagado o cambiado.')}</Text>
          </View>
        )}
        {v && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: v.color + '26', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22 }}>{v.icon}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.muted, fontSize: 13 }}>{t('Avance del proyecto')}</Text>
                <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>{v.name}</Text>
              </View>
            </View>
            {v.intro ? <Text style={{ color: C.text, fontSize: 14.5, lineHeight: 21 }}>{v.intro}</Text> : null}
            <View style={box} accessibilityLabel={trn('{pct} % terminado', { pct })}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: 30, fontWeight: '800' }}>{pct} %</Text>
                <Text style={{ color: C.muted, fontSize: 13.5 }}>{t('{done} de {total} tareas terminadas', { done: v.done, total: v.total })}</Text>
              </View>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: C.surface2, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: 10, backgroundColor: C.good }} /></View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                {v.columns.map((c) => (
                  <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                    <Text style={{ color: C.muted, fontSize: 12.5 }}>{c.label}: {c.count}</Text>
                  </View>
                ))}
              </View>
            </View>
            {v.update && (
              <View style={[box, { borderColor: HEALTH[v.update.health].color }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={HEALTH[v.update.health].icon as any} size={17} color={HEALTH[v.update.health].color} />
                  <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800' }}>{HEALTH[v.update.health].label}</Text>
                  <Text style={{ color: C.muted, fontSize: 12.5 }}>· {day(v.update.at)}</Text>
                </View>
                <Text style={{ color: C.text, fontSize: 14, lineHeight: 21 }}>{v.update.body}</Text>
              </View>
            )}
            <View style={box}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>{t('Lo que viene')}</Text>
              {v.next.length === 0 ? <Text style={{ color: C.muted, fontSize: 13.5 }}>{t('Nada con fecha en las próximas tres semanas.')}</Text> : v.next.map((t, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ color: t.due < v.today ? C.badText : C.muted, fontSize: 13, width: 56, fontVariant: ['tabular-nums'] }}>{day(t.due)}</Text>
                  <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{t.title}</Text>
                </View>
              ))}
            </View>
            <View style={box}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>{t('Entregado en los últimos 30 días')}</Text>
              {v.delivered.length === 0 ? <Text style={{ color: C.muted, fontSize: 13.5 }}>{t('Todavía nada.')}</Text> : v.delivered.map((t, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Ionicons name="checkmark-circle" size={16} color={C.good} />
                  <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{t.title}</Text>
                  <Text style={{ color: C.muted, fontSize: 12.5 }}>{day(t.at)}</Text>
                </View>
              ))}
            </View>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <KadernoMark size={22} />
              <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>{t('Actualizado en tiempo real con Kaderno.')}</Text>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
