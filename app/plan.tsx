import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { Screen, Button, Card, Badge, Segmented, SectionLabel, Skeleton } from '../components/ds';
import { useResponsive } from '../lib/responsive';
import { COMPARE, PRICES, TEAM_MIN_SEATS, cop, paymentKindText, paymentStatusText, perMonth, planView, shortDate, usageRows, yearlySaving, type Period } from '../lib/billing';
import { NEEDS_V23, addSeat, cancelRenewal, forgetPlan, getPayments, getSeats, removeSeat, resumeRenewal, startTrial, usageToday, usePlan, waitPayment, type PaymentRow } from '../lib/billingDb';
import { confirm, friendlyError, notify, toast } from '../lib/feedback';
import { PayModal, type PayIntent } from '../components/billing/PayModal';
import { t, trn } from '../lib/i18n';

// ============================================================
//  Tu plan (v24): el plan de hoy, la prueba gratis, los precios y lo que
//  llevas usado de la IA. Los pagos (Wompi) se abren desde aquí.
// ============================================================

const BADGE: Record<string, { text: string; color: string }> = {
  free: { text: t('Gratis'), color: C.muted }, trial: { text: t('Prueba'), color: C.warn }, pro: { text: t('Pro'), color: C.brand },
  team: { text: t('Equipo'), color: C.good }, warn: { text: t('Revisar pago'), color: C.bad },
};

function PlanScreen() {
  const { plan, loading, reload } = usePlan();
  const { isWide } = useResponsive();
  const [period, setPeriod] = useState<Period>('year');
  const [used, setUsed] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState<PayIntent | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [returning, setReturning] = useState<{ state: 'wait' | 'ok' | 'bad' | 'pending'; text: string } | null>(null);
  const params = useLocalSearchParams<{ ref?: string; id?: string }>();
  const router = useRouter();

  const refresh = useCallback(() => { reload().catch(() => {}); usageToday().then(setUsed).catch(() => {}); getPayments().then(setPayments).catch(() => {}); }, []);
  useFocusEffect(refresh);

  // Al volver del checkout de Wompi: /plan?ref=KD-...&id=<transacción>
  useEffect(() => {
    const ref = typeof params.ref === 'string' ? params.ref : undefined;
    const id = typeof params.id === 'string' ? params.id : undefined;
    if (!ref && !id) return;
    setReturning({ state: 'wait', text: t('Confirmando tu pago con Wompi…') });
    waitPayment(id ? { id } : { reference: ref }, 60_000)
      .then((p) => {
        forgetPlan(); refresh();
        if (p.status === 'APPROVED') setReturning({ state: 'ok', text: t('Pago aprobado ({cop}). ¡Gracias por apoyar Kaderno!', { cop: cop(p.amount_in_cents / 100) }) });
        else if (p.status === 'PENDING') setReturning({ state: 'pending', text: t('Wompi sigue procesando el pago (con PSE puede tardar unos minutos). Te avisamos cuando se apruebe.') });
        else setReturning({ state: 'bad', text: t('El pago no se aprobó{v}. No se te cobró nada.', { v: p.error ? ` (${p.error})` : '' }) });
      })
      .catch((e) => setReturning({ state: 'bad', text: friendlyError(e) }));
    router.setParams({ ref: undefined, id: undefined, env: undefined } as any);
  }, [params.ref, params.id]);

  async function trial() {
    setBusy(true);
    try { await startTrial(); toast(t('Listo: tienes Pro 7 días. No te cobramos nada al terminar.')); }
    catch (e) { notify(t('No se pudo empezar la prueba'), friendlyError(e)); }
    finally { setBusy(false); }
  }
  function choose(p: 'pro' | 'team') {
    setPay({ plan: p, period, seats: p === 'team' ? Math.max(TEAM_MIN_SEATS, plan?.own_plan === 'team' ? plan?.seats ?? TEAM_MIN_SEATS : TEAM_MIN_SEATS) : 1 });
  }
  async function cancel() {
    if (!(await confirm(t('¿Apagar la renovación?'), t('Conservas {name} hasta el {v}. Después vuelves a Gratis sin perder nada.', { name: v.name, v: plan?.period_end ? shortDate(plan.period_end) : t('final del periodo') }), t('Apagar renovación')))) return;
    try { await cancelRenewal(); toast(t('Renovación apagada')); } catch (e) { notify(t('No se pudo'), friendlyError(e)); }
  }
  async function resume() {
    try { await resumeRenewal(); toast(t('Renovación prendida')); } catch (e) { notify(t('No se pudo'), friendlyError(e)); }
  }

  if (loading && !plan) return <Screen title={t('Tu plan')} back="/ajustes" maxWidth={920}><Skeleton height={120} /><Skeleton height={320} style={{ marginTop: 12 }} /></Screen>;
  const v = planView(plan);
  const b = BADGE[v.badge];
  const save = yearlySaving('pro');

  return (
    <Screen title={t('Tu plan')} subtitle={t('Lo que incluye Kaderno y cuánto cuesta')} back="/ajustes" maxWidth={920}>
      {!plan && (
        <Card style={{ marginBottom: 14 }}><Text style={{ color: C.warnText, fontSize: 13.5 }}>{NEEDS_V23}</Text></Card>
      )}

      {/* Plan de hoy */}
      <Card style={{ gap: 10, marginBottom: 18 }} accessibilityLabel={t('Tu plan de hoy')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name={v.badge === 'free' ? 'leaf-outline' : v.badge === 'team' ? 'people' : 'sparkles'} size={22} color={b.color} />
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{v.name}</Text>
          {(v.badge === 'trial' || v.badge === 'warn') && <Badge text={b.text} color={b.color} />}
        </View>
        <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{v.line}</Text>
        {plan?.trial_available && (
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button label={t('Probar Pro 7 días gratis')} icon="sparkles-outline" busy={busy} onPress={trial} />
            <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Sin tarjeta. Al terminar vuelves a Gratis solo.')}</Text>
          </View>
        )}
      </Card>

      {returning && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, borderColor: returning.state === 'ok' ? C.good : returning.state === 'bad' ? C.bad : C.line }} accessibilityLabel={t('Resultado del pago')}>
          {returning.state === 'wait' ? <ActivityIndicator color={C.brand} /> : <Ionicons name={returning.state === 'ok' ? 'checkmark-circle' : returning.state === 'bad' ? 'close-circle' : 'time-outline'} size={24} color={returning.state === 'ok' ? C.good : returning.state === 'bad' ? C.bad : C.warn} />}
          <Text style={{ color: C.text, fontSize: 14, flex: 1 }} accessibilityLiveRegion="polite">{returning.text}</Text>
          {returning.state !== 'wait' && <Pressable onPress={() => setReturning(null)} accessibilityRole="button" accessibilityLabel={t('Cerrar')} hitSlop={8}><Ionicons name="close" size={18} color={C.muted} /></Pressable>}
        </Card>
      )}

      {plan && plan.own_plan && plan.own_plan !== 'free' && plan.status !== 'trial' && !plan.via_team && (
        <>
          <SectionLabel text={t('Renovación')} />
          <Card style={{ gap: 10, marginBottom: 18 }}>
            {plan.auto_renew ? (
              <>
                <Text style={{ color: C.text, fontSize: 14 }}>{t('Se cobra {v}{v2}{v3}.', { v: plan.period === 'year' ? t('cada año') : t('cada mes'), v2: plan.source_label ? t(' a {source_label}', { source_label: plan.source_label }) : '', v3: plan.next_charge_at ? t(', el próximo el {next_charge_at}', { next_charge_at: shortDate(plan.next_charge_at) }) : '' })}</Text>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  <Button label={t('Cambiar medio de pago')} size="sm" kind="secondary" icon="card-outline" onPress={() => setPay({ plan: plan.own_plan === 'team' ? 'team' : 'pro', period: plan.period ?? 'month', seats: plan.seats ?? 1, kind: 'source', method: plan.source_kind ?? 'CARD' })} />
                  <Button label={t('Apagar renovación')} size="sm" kind="ghost" onPress={cancel} />
                </View>
              </>
            ) : plan.source_label && plan.period_end && new Date(plan.period_end) > new Date() ? (
              <>
                <Text style={{ color: C.text, fontSize: 14 }}>{t('La renovación está apagada. Tienes guardado {source_label}.', { source_label: plan.source_label })}</Text>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  <Button label={t('Renovar con {source_label}', { source_label: plan.source_label })} size="sm" onPress={resume} />
                  <Button label={t('Usar otro medio')} size="sm" kind="secondary" onPress={() => setPay({ plan: plan.own_plan === 'team' ? 'team' : 'pro', period: plan.period ?? 'month', seats: plan.seats ?? 1, kind: 'source' })} />
                </View>
              </>
            ) : (
              <Text style={{ color: C.muted, fontSize: 13.5 }}>{t('No se renueva solo. Antes de que termine te avisamos para que pagues otro periodo, o elige "Renovar solo" al pagar.')}</Text>
            )}
          </Card>
        </>
      )}

      {plan?.own_plan === 'team' && plan.period_end && new Date(plan.period_end) > new Date() && (
        <TeamSeats seats={plan.seats ?? TEAM_MIN_SEATS} onAddSeats={() => setPay({ plan: 'team', period: plan.period ?? 'month', seats: 1, kind: 'seats', periodEnd: plan.period_end })} onChanged={() => reload()} />
      )}

      {/* Precios */}
      <SectionLabel text={t('Planes')} right={
        <Segmented<Period> items={[{ key: 'month', label: t('Mensual') }, { key: 'year', label: trn('Anual (-{pct} %)', { pct: save.pct }) }]} value={period} onChange={setPeriod} style={{ borderBottomWidth: 0 }} />
      } />
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12, marginBottom: 20 }}>
        <PlanCard title={t('Gratis')} price="$0" note={t('Para siempre')} current={v.badge === 'free'}
          points={[t('Todo lo de estudiar y organizarte'), t('IA con topes diarios'), trn('2 calendarios externos')]} />
        <PlanCard title={t('Pro')} highlight price={cop(PRICES.pro[period])} note={period === 'month' ? t('al mes') : t('al año ({cop} al mes)', { cop: cop(perMonth('pro', 'year')) })}
          current={v.badge === 'pro' || v.badge === 'trial'}
          points={[t('Mucha más IA cada día'), t('Resúmenes de clase y actas de reunión'), trn('10 calendarios externos'), t('Informe de horas en PDF')]}
          action={v.canPay && v.badge !== 'team' ? <Button label={plan?.trial_available ? t('Pagar Pro') : v.isPaid ? t('Pagar otro periodo') : t('Pagar Pro')} full onPress={() => choose('pro')} /> : undefined} />
        <PlanCard title={t('Equipo')} price={cop(PRICES.team[period])} note={t('por persona {v} · desde {TEAM_MIN_SEATS}', { v: period === 'month' ? t('al mes') : t('al año'), TEAM_MIN_SEATS })}
          current={v.badge === 'team'}
          points={[t('Pro para cada persona'), t('Un solo pago para todos'), t('Horas de todo el equipo por proyecto')]}
          action={!plan?.via_team ? <Button label={plan?.own_plan === 'team' && v.isPaid ? t('Pagar otro periodo') : t('Pagar Equipo')} kind="secondary" full onPress={() => choose('team')} /> : undefined} />
      </View>

      {/* Comparación */}
      <SectionLabel text={t('Qué incluye cada uno')} />
      <Card padded={false} style={{ marginBottom: 20, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.surface2 }}>
          <Text style={{ flex: 1, color: C.muted, fontSize: 12, fontWeight: '700' }}> </Text>
          {[t('Gratis'), 'Pro', t('Equipo')].map((h) => <Text key={h} style={{ width: isWide ? 90 : 58, textAlign: 'center', color: C.text, fontSize: 12.5, fontWeight: '800' }}>{h}</Text>)}
        </View>
        {COMPARE.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < COMPARE.length - 1 ? 1 : 0, borderBottomColor: C.line }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 13 }}>{r.label}</Text>
            {[r.free, r.pro, r.team].map((x, k) => (
              <View key={k} style={{ width: isWide ? 90 : 58, alignItems: 'center' }}>
                {typeof x === 'boolean'
                  ? <Ionicons name={x ? 'checkmark-circle' : 'remove'} size={17} color={x ? C.good : C.muted} accessibilityLabel={x ? t('Incluido') : t('No incluido')} />
                  : <Text style={{ color: C.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{x}</Text>}
              </View>
            ))}
          </View>
        ))}
      </Card>

      {/* Uso de hoy */}
      <SectionLabel text={t('Tu uso de la IA hoy')} />
      <Card style={{ gap: 10, marginBottom: 20 }}>
        {usageRows(plan?.plan ?? 'free', used).map((r) => {
          const pct = Math.min(1, r.used / r.limit);
          return (
            <View key={r.key} style={{ gap: 4 }} accessibilityLabel={t('{label}: {used} de {limit}', { label: r.label, used: r.used, limit: r.limit })}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ flex: 1, color: C.text, fontSize: 13 }}>{r.label}</Text>
                <Text style={{ color: pct >= 1 ? C.badText : C.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{t('{used} de {limit}', { used: r.used, limit: r.limit })}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' }}>
                <View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: pct >= 1 ? C.bad : C.brand }} />
              </View>
            </View>
          );
        })}
        <Text style={{ color: C.muted, fontSize: 12 }}>{t('Se renueva cada día a medianoche (tu hora).')}</Text>
      </Card>

      {payments.length > 0 && (
        <>
          <SectionLabel text={t('Tus pagos')} />
          <Card padded={false} style={{ marginBottom: 20 }}>
            {payments.map((p, i) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i < payments.length - 1 ? 1 : 0, borderBottomColor: C.line }}>
                <Ionicons name={p.status === 'APPROVED' ? 'checkmark-circle' : p.status === 'PENDING' ? 'time-outline' : 'close-circle'} size={18} color={p.status === 'APPROVED' ? C.good : p.status === 'PENDING' ? C.warn : C.bad} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>{paymentKindText(p.kind)} · {p.plan === 'team' ? t('Equipo ({seats})', { seats: p.seats }) : 'Pro'} {p.kind === 'seats' ? '' : p.period === 'year' ? trn('anual') : trn('mensual')}</Text>
                  <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>{shortDate(p.created_at)} · {paymentStatusText(p.status)}{p.method ? ` · ${p.method}` : ''} · {p.reference}</Text>
                </View>
                <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{cop(p.amount_in_cents / 100)}</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 30 }}>
        {t('Precios finales en pesos colombianos. Pagas con Nequi, tarjeta, PSE o Bancolombia a través de Wompi; Kaderno nunca ve los datos de tu tarjeta. Cancelas cuando quieras y conservas el plan hasta el final del periodo pagado. Si vuelves a Gratis no se borra nada tuyo.')}</Text>
      <PayModal intent={pay} onClose={() => setPay(null)} onPaid={refresh} />
    </Screen>
  );
}

function TeamSeats({ seats, onAddSeats, onChanged }: { seats: number; onAddSeats: () => void; onChanged: () => void }) {
  const [list, setList] = useState<string[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => getSeats().then(setList), []);
  useEffect(() => { load(); }, [load]);
  const free = seats - 1 - (list?.length ?? 0);
  async function add() {
    if (!email.trim()) return;
    setBusy(true);
    try { await addSeat(email); setEmail(''); await load(); onChanged(); toast(t('Listo: esa persona ya tiene Pro con su cuenta de Kaderno')); }
    catch (e) { notify(t('No se pudo agregar'), friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function remove(m: string) {
    if (!(await confirm(t('¿Quitar a {m}?', { m }), t('Vuelve a Gratis enseguida. No se borra nada suyo.'), t('Quitar')))) return;
    try { await removeSeat(m); await load(); onChanged(); } catch (e) { notify(t('No se pudo'), friendlyError(e)); }
  }
  return (
    <>
      <SectionLabel text={t('Tu equipo')} count={(list?.length ?? 0) + 1} />
      <Card style={{ gap: 10, marginBottom: 18 }}>
        <Text style={{ color: C.text, fontSize: 13.5 }}>{t('{seats} puestos, contándote. {v}', { seats, v: free > 0 ? t('Te {v}.', { v: free === 1 ? t('queda 1 libre') : t('quedan {free} libres', { free }) }) : t('Todos están en uso.') })}</Text>
        {list === null && <ActivityIndicator color={C.brand} />}
        {list?.map((m) => (
          <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="person-circle-outline" size={20} color={C.muted} />
            <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>{m}</Text>
            <Pressable onPress={() => remove(m)} accessibilityRole="button" accessibilityLabel={t('Quitar a {m}', { m })} hitSlop={6}><Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Quitar')}</Text></Pressable>
          </View>
        ))}
        {free > 0 ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput value={email} onChangeText={setEmail} placeholder={t('correo@empresa.co')} placeholderTextColor={C.muted} keyboardType="email-address" autoCapitalize="none" accessibilityLabel={t('Correo de la persona')}
              onSubmitEditing={add} style={[{ flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 10, fontSize: 14 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
            <Button label={t('Agregar')} size="sm" busy={busy} onPress={add} />
          </View>
        ) : null}
        <Text style={{ color: C.muted, fontSize: 12 }}>{t('Cada persona entra a Kaderno con ese correo (si no tiene cuenta, la crea) y tiene Pro mientras tu plan esté vigente.')}</Text>
        <Button label={t('Agregar puestos')} size="sm" kind="secondary" icon="add" onPress={onAddSeats} style={{ alignSelf: 'flex-start' }} />
      </Card>
    </>
  );
}

function PlanCard({ title, price, note, points, current, highlight, action }: {
  title: string; price: string; note: string; points: string[]; current?: boolean; highlight?: boolean; action?: React.ReactNode;
}) {
  return (
    <Card style={[{ flex: 1, gap: 8, borderColor: highlight ? C.brand : C.line, borderWidth: highlight ? 2 : 1 }, Platform.OS === 'web' ? ({ minWidth: 0 } as any) : null]} accessibilityLabel={t('Plan {title}', { title })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{title}</Text>
        {current && <Badge text={t('Tu plan')} color={C.good} />}
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
