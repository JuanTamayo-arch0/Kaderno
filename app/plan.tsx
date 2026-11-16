import React, { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Platform, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { Screen, Button, Card, Badge, Segmented, SectionLabel, Skeleton } from '../components/ds';
import { useResponsive } from '../lib/responsive';
import { COMPARE, PRICES, TEAM_MIN_SEATS, cop, perMonth, planView, usageRows, yearlySaving, type Period } from '../lib/billing';
import { NEEDS_V23, startTrial, usageToday, usePlan } from '../lib/billingDb';
import { friendlyError, notify, toast } from '../lib/feedback';

// ============================================================
//  Tu plan (v24): el plan de hoy, la prueba gratis, los precios y lo que
//  llevas usado de la IA. Los pagos (Wompi) se abren desde aquí.
// ============================================================

const BADGE: Record<string, { text: string; color: string }> = {
  free: { text: 'Gratis', color: C.muted }, trial: { text: 'Prueba', color: C.warn }, pro: { text: 'Pro', color: C.brand },
  team: { text: 'Equipo', color: C.good }, warn: { text: 'Revisar pago', color: C.bad },
};

function PlanScreen() {
  const { plan, loading, reload } = usePlan();
  const { isWide } = useResponsive();
  const [period, setPeriod] = useState<Period>('year');
  const [used, setUsed] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { reload().catch(() => {}); usageToday().then(setUsed).catch(() => {}); }, []));

  async function trial() {
    setBusy(true);
    try { await startTrial(); toast('Listo: tienes Pro 7 días. No te cobramos nada al terminar.'); }
    catch (e) { notify('No se pudo empezar la prueba', friendlyError(e)); }
    finally { setBusy(false); }
  }
  function choose(_p: 'pro' | 'team') {
    notify('Pagos en camino', 'Los pagos con Wompi llegan en la siguiente actualización de Kaderno.');
  }

  if (loading && !plan) return <Screen title="Tu plan" back="/ajustes" maxWidth={920}><Skeleton height={120} /><Skeleton height={320} style={{ marginTop: 12 }} /></Screen>;
  const v = planView(plan);
  const b = BADGE[v.badge];
  const save = yearlySaving('pro');

  return (
    <Screen title="Tu plan" subtitle="Lo que incluye Kaderno y cuánto cuesta" back="/ajustes" maxWidth={920}>
      {!plan && (
        <Card style={{ marginBottom: 14 }}><Text style={{ color: C.warnText, fontSize: 13.5 }}>{NEEDS_V23}</Text></Card>
      )}

      {/* Plan de hoy */}
      <Card style={{ gap: 10, marginBottom: 18 }} accessibilityLabel="Tu plan de hoy">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name={v.badge === 'free' ? 'leaf-outline' : v.badge === 'team' ? 'people' : 'sparkles'} size={22} color={b.color} />
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{v.name}</Text>
          <Badge text={b.text} color={b.color} />
        </View>
        <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{v.line}</Text>
        {plan?.trial_available && (
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button label="Probar Pro 7 días gratis" icon="sparkles-outline" busy={busy} onPress={trial} />
            <Text style={{ color: C.muted, fontSize: 12.5 }}>Sin tarjeta. Al terminar vuelves a Gratis solo.</Text>
          </View>
        )}
      </Card>

      {/* Precios */}
      <SectionLabel text="Planes" right={
        <Segmented<Period> items={[{ key: 'month', label: 'Mensual' }, { key: 'year', label: `Anual (-${save.pct} %)` }]} value={period} onChange={setPeriod} style={{ borderBottomWidth: 0 }} />
      } />
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12, marginBottom: 20 }}>
        <PlanCard title="Gratis" price="$0" note="Para siempre" current={v.badge === 'free'}
          points={['Todo lo de estudiar y organizarte', 'IA con topes diarios', '2 calendarios externos']} />
        <PlanCard title="Pro" highlight price={cop(PRICES.pro[period])} note={period === 'month' ? 'al mes' : `al año (${cop(perMonth('pro', 'year'))} al mes)`}
          current={v.badge === 'pro' || v.badge === 'trial'}
          points={['Mucha más IA cada día', 'Resúmenes de clase y actas de reunión', '10 calendarios externos', 'Informe de horas en PDF']}
          action={v.canPay && v.badge !== 'team' ? <Button label={plan?.trial_available ? 'Pagar Pro' : v.isPaid ? 'Pagar otro periodo' : 'Pagar Pro'} full onPress={() => choose('pro')} /> : undefined} />
        <PlanCard title="Equipo" price={cop(PRICES.team[period])} note={`por persona ${period === 'month' ? 'al mes' : 'al año'} · desde ${TEAM_MIN_SEATS}`}
          current={v.badge === 'team'}
          points={['Pro para cada persona', 'Un solo pago para todos', 'Horas de todo el equipo por proyecto']}
          action={!plan?.via_team ? <Button label={plan?.own_plan === 'team' ? 'Administrar' : 'Pagar Equipo'} kind="secondary" full onPress={() => choose('team')} /> : undefined} />
      </View>

      {/* Comparación */}
      <SectionLabel text="Qué incluye cada uno" />
      <Card padded={false} style={{ marginBottom: 20, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.surface2 }}>
          <Text style={{ flex: 1, color: C.muted, fontSize: 12, fontWeight: '700' }}> </Text>
          {['Gratis', 'Pro', 'Equipo'].map((h) => <Text key={h} style={{ width: isWide ? 90 : 58, textAlign: 'center', color: C.text, fontSize: 12.5, fontWeight: '800' }}>{h}</Text>)}
        </View>
        {COMPARE.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < COMPARE.length - 1 ? 1 : 0, borderBottomColor: C.line }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 13 }}>{r.label}</Text>
            {[r.free, r.pro, r.team].map((x, k) => (
              <View key={k} style={{ width: isWide ? 90 : 58, alignItems: 'center' }}>
                {typeof x === 'boolean'
                  ? <Ionicons name={x ? 'checkmark-circle' : 'remove'} size={17} color={x ? C.good : C.muted} accessibilityLabel={x ? 'Incluido' : 'No incluido'} />
                  : <Text style={{ color: C.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{x}</Text>}
              </View>
            ))}
          </View>
        ))}
      </Card>

      {/* Uso de hoy */}
      <SectionLabel text="Tu uso de la IA hoy" />
      <Card style={{ gap: 10, marginBottom: 20 }}>
        {usageRows(plan?.plan ?? 'free', used).map((r) => {
          const pct = Math.min(1, r.used / r.limit);
          return (
            <View key={r.key} style={{ gap: 4 }} accessibilityLabel={`${r.label}: ${r.used} de ${r.limit}`}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ flex: 1, color: C.text, fontSize: 13 }}>{r.label}</Text>
                <Text style={{ color: pct >= 1 ? C.badText : C.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{r.used} de {r.limit}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' }}>
                <View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: pct >= 1 ? C.bad : C.brand }} />
              </View>
            </View>
          );
        })}
        <Text style={{ color: C.muted, fontSize: 12 }}>Se renueva cada día a medianoche (tu hora).</Text>
      </Card>

      <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 30 }}>
        Precios finales en pesos colombianos. Pagas con Nequi, tarjeta, PSE o Bancolombia a través de Wompi; Kaderno nunca ve los datos de tu tarjeta.
        Cancelas cuando quieras y conservas el plan hasta el final del periodo pagado. Si vuelves a Gratis no se borra nada tuyo.
      </Text>
    </Screen>
  );
}

function PlanCard({ title, price, note, points, current, highlight, action }: {
  title: string; price: string; note: string; points: string[]; current?: boolean; highlight?: boolean; action?: React.ReactNode;
}) {
  return (
    <Card style={[{ flex: 1, gap: 8, borderColor: highlight ? C.brand : C.line, borderWidth: highlight ? 2 : 1 }, Platform.OS === 'web' ? ({ minWidth: 0 } as any) : null]} accessibilityLabel={`Plan ${title}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{title}</Text>
        {current && <Badge text="Tu plan" color={C.good} />}
      </View>
      <Text style={{ color: C.text, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{price}</Text>
      <Text style={{ color: C.muted, fontSize: 12.5, marginTop: -4 }}>{note}</Text>
      <View style={{ gap: 6, marginTop: 4, flex: 1 }}>
        {points.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
            <Ionicons name="checkmark" size={15} color={C.good} style={{ marginTop: 2 }} />
            <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{p}</Text>
          </View>
        ))}
      </View>
      {action && <View style={{ marginTop: 6 }}>{action}</View>}
    </Card>
  );
}

export default function Page() { return <RequireAuth><PlanScreen /></RequireAuth>; }
