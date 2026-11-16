import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button, Segmented } from '../ds';
import { TEAM_MIN_SEATS, cardBrand, cardError, cop, formatCard, formatExp, nequiOk, planLabel, priceOf, seatsProrated, type Period } from '../../lib/billing';
import { billingConfig, forgetPlan, getMyPlan, nequiTokenStatus, startCheckout, subscribe, tokenizeCard, tokenizeNequi, updateSource, waitPayment, type BillingConfig } from '../../lib/billingDb';
import { friendlyError } from '../../lib/feedback';

// ============================================================
//  Pagar con Wompi (v24, fase 2).
//  · Pagar una vez: la página segura de Wompi (Nequi, tarjeta, PSE,
//    Bancolombia, Daviplata). Vuelve a "Tu plan" con el resultado.
//  · Renovar solo: tarjeta o Nequi guardados en Wompi; se cobra cada mes o
//    cada año y se apaga cuando quieras. La tarjeta va directo a Wompi.
// ============================================================

type Step = 'choose' | 'card' | 'nequi' | 'nequi-wait' | 'working' | 'done';
export type PayIntent = { plan: 'pro' | 'team'; period: Period; seats: number; kind?: 'checkout' | 'seats' | 'source'; periodEnd?: string | null; method?: 'CARD' | 'NEQUI' };

export function PayModal({ intent, onClose, onPaid }: { intent: PayIntent | null; onClose: () => void; onPaid: () => void }) {
  const [step, setStep] = useState<Step>('choose');
  const [period, setPeriod] = useState<Period>('year');
  const [seats, setSeats] = useState(TEAM_MIN_SEATS);
  const [cfg, setCfg] = useState<BillingConfig | null>(null);
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  const [card, setCard] = useState({ number: '', exp: '', cvc: '', holder: '' });
  const [phone, setPhone] = useState('');
  const [terms, setTerms] = useState(false);
  const [data, setData] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!intent) return;
    cancelled.current = false;
    setStep('choose'); setErr(null); setResult(null); setTerms(false); setData(false); setBusy(false);
    setPeriod(intent.period); setSeats(Math.max(intent.plan === 'team' && intent.kind !== 'seats' ? TEAM_MIN_SEATS : 1, intent.seats));
    setCfgErr(null);
    if (intent.kind === 'source') setStep(intent.method === 'NEQUI' ? 'nequi' : 'card');
    billingConfig().then(setCfg).catch((e) => setCfgErr(friendlyError(e)));
    return () => { cancelled.current = true; };
  }, [intent]);

  if (!intent) return null;
  const isSeats = intent.kind === 'seats';
  const isSource = intent.kind === 'source';
  const amount = isSeats ? seatsProrated(intent.period, intent.periodEnd ?? new Date(), seats) : priceOf(intent.plan, period, seats);
  const every = period === 'month' ? 'cada mes' : 'cada año';
  const title = isSource ? 'Cambiar medio de pago' : isSeats ? 'Agregar puestos' : `Pagar ${intent.plan === 'pro' ? 'Pro' : 'Equipo'}`;
  const needData = !!cfg?.acceptance.data;
  const accepted = terms && (!needData || data);
  const close = () => { cancelled.current = true; onClose(); };

  async function payOnce() {
    setBusy(true); setErr(null);
    try {
      const r = await startCheckout({ plan: intent!.plan, period: isSeats ? intent!.period : period, seats, kind: isSeats ? 'seats' : 'checkout' });
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign(r.url);
      else { await Linking.openURL(r.url); close(); }
    } catch (e) { setErr(friendlyError(e)); setBusy(false); }
  }

  async function finish(reference: string) {
    setStep('working'); setMsg('Confirmando el pago con Wompi…');
    const p = await waitPayment({ reference }, 90_000);
    forgetPlan(); await getMyPlan(true).catch(() => null);
    if (p.status === 'APPROVED') { setResult({ ok: true, text: `Listo: pago aprobado. Tienes ${intent!.plan === 'pro' ? 'Pro' : 'Equipo'} y se renueva solo ${every}.` }); onPaid(); }
    else if (p.status === 'PENDING') setResult({ ok: true, text: 'Wompi sigue procesando el pago. Te avisamos cuando se apruebe; puedes cerrar esta ventana.' });
    else setResult({ ok: false, text: `El pago no se aprobó${p.error ? ` (${p.error})` : ''}. No se te cobró nada. Prueba con otro medio.` });
    setStep('done');
  }

  async function payCard() {
    const e = cardError(card);
    if (e) { setErr(e); return; }
    if (!accepted) { setErr('Acepta los términos de Wompi para seguir.'); return; }
    if (!cfg) return;
    setBusy(true); setErr(null); setStep('working'); setMsg('Guardando la tarjeta en Wompi…');
    try {
      const t = await tokenizeCard(cfg, card);
      if (isSource) {
        const label = await updateSource({ type: 'CARD', token: t.token, acceptance_token: cfg.acceptance.terms.token, accept_personal_auth: cfg.acceptance.data?.token ?? null, brand: t.brand, last4: t.last4 });
        setCard({ number: '', exp: '', cvc: '', holder: '' });
        setResult({ ok: true, text: `Listo: la renovación queda con ${label}. No se cobró nada ahora.` }); setStep('done'); onPaid(); return;
      }
      setMsg('Haciendo el primer cobro…');
      const r = await subscribe({ plan: intent!.plan, period, seats, type: 'CARD', token: t.token, acceptance_token: cfg.acceptance.terms.token, accept_personal_auth: cfg.acceptance.data?.token ?? null, brand: t.brand, last4: t.last4 });
      setCard({ number: '', exp: '', cvc: '', holder: '' });
      await finish(r.reference);
    } catch (e2) { setErr(friendlyError(e2)); setStep('card'); }
    finally { setBusy(false); }
  }

  async function payNequi() {
    if (!nequiOk(phone)) { setErr('El número de Nequi tiene 10 dígitos y empieza por 3.'); return; }
    if (!accepted) { setErr('Acepta los términos de Wompi para seguir.'); return; }
    if (!cfg) return;
    setBusy(true); setErr(null);
    try {
      const id = await tokenizeNequi(cfg, phone);
      setStep('nequi-wait');
      const t0 = Date.now();
      let st = 'PENDING';
      while (st === 'PENDING' && Date.now() - t0 < 5 * 60_000 && !cancelled.current) {
        await new Promise((r) => setTimeout(r, 3000));
        st = await nequiTokenStatus(cfg, id).catch(() => 'PENDING');
      }
      if (cancelled.current) return;
      if (st !== 'APPROVED') { setErr(st === 'PENDING' ? 'No llegó la aceptación en Nequi. Intenta de nuevo.' : 'La suscripción se rechazó en Nequi.'); setStep('nequi'); return; }
      if (isSource) {
        setStep('working'); setMsg('Guardando…');
        const label = await updateSource({ type: 'NEQUI', token: id, acceptance_token: cfg.acceptance.terms.token, accept_personal_auth: cfg.acceptance.data?.token ?? null, phone });
        setResult({ ok: true, text: `Listo: la renovación queda con ${label}. No se cobró nada ahora.` }); setStep('done'); onPaid(); return;
      }
      setStep('working'); setMsg('Haciendo el primer cobro…');
      const r = await subscribe({ plan: intent!.plan, period, seats, type: 'NEQUI', token: id, acceptance_token: cfg.acceptance.terms.token, accept_personal_auth: cfg.acceptance.data?.token ?? null, phone });
      await finish(r.reference);
    } catch (e) { setErr(friendlyError(e)); setStep('nequi'); }
    finally { setBusy(false); }
  }

  const sandbox = cfg?.env === 'sandbox';
  const summary = isSource ? (
    <Text style={{ color: C.muted, fontSize: 13 }}>Se usa en la próxima renovación. No se cobra nada ahora.</Text>
  ) : (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.surface2, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{isSeats ? `${seats} ${seats === 1 ? 'puesto extra' : 'puestos extra'}` : planLabel(intent.plan, period, seats)}</Text>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{cop(amount)}</Text>
      </View>
      <Text style={{ color: C.muted, fontSize: 12.5 }}>{isSeats ? 'Lo que falta del periodo actual. Desde la renovación se cobran con el resto.' : intent.plan === 'team' ? `${cop(priceOf('team', period, 1) / 2)} por persona` : period === 'year' ? 'Un año completo' : 'Un mes'}</Text>
    </View>
  );

  const acceptBoxes = cfg && (
    <View style={{ gap: 8 }}>
      <Check value={terms} onChange={setTerms} label="Acepto los términos y condiciones de Wompi" url={cfg.acceptance.terms.url} />
      {needData && <Check value={data} onChange={setData} label="Autorizo el tratamiento de mis datos personales" url={cfg.acceptance.data!.url} />}
    </View>
  );

  return (
    <Sheet visible={!!intent} onClose={close} title={title} subtitle={step === 'choose' ? 'Pagos seguros con Wompi (Bancolombia)' : undefined} maxWidth={560}>
      {cfgErr && <Text style={{ color: C.badText, fontSize: 13.5 }}>{cfgErr}</Text>}
      {sandbox && step !== 'done' && (
        <View style={{ padding: 10, borderRadius: 10, backgroundColor: C.warn + '22', gap: 2 }}>
          <Text style={{ color: C.warnText, fontSize: 12.5, fontWeight: '800' }}>Modo de pruebas: no se cobra plata de verdad</Text>
          <Text style={{ color: C.text, fontSize: 12 }}>Tarjeta 4242 4242 4242 4242 (aprueba) o 4111 1111 1111 1111 (rechaza), cualquier fecha futura y CVC. Nequi 3991111111 (aprueba).</Text>
        </View>
      )}

      {step === 'choose' && (
        <>
          {!isSeats && (
            <Segmented<Period> items={[{ key: 'month', label: 'Mensual' }, { key: 'year', label: 'Anual' }]} value={period} onChange={setPeriod} />
          )}
          {(intent.plan === 'team') && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{isSeats ? 'Puestos que agregas' : 'Personas en el equipo (contándote)'}</Text>
              <Stepper value={seats} min={isSeats ? 1 : TEAM_MIN_SEATS} max={200} onChange={setSeats} />
            </View>
          )}
          {summary}
          <Option icon="flash-outline" title="Pagar una vez" text={isSeats ? 'Nequi, tarjeta, PSE, Bancolombia o Daviplata en la página de Wompi.' : 'Nequi, tarjeta, PSE, Bancolombia o Daviplata en la página de Wompi. No se renueva solo: te avisamos antes de que termine.'}
            busy={busy} disabled={!cfg} onPress={payOnce} />
          {!isSeats && (
            <>
              <Option icon="card-outline" title={`Renovar solo ${every} con tarjeta`} text="Crédito o débito. Cancelas cuando quieras." disabled={!cfg || busy} onPress={() => { setErr(null); setStep('card'); }} />
              <Option icon="phone-portrait-outline" title={`Renovar solo ${every} con Nequi`} text="Aceptas una vez en la app de Nequi." disabled={!cfg || busy} onPress={() => { setErr(null); setStep('nequi'); }} />
            </>
          )}
        </>
      )}

      {step === 'card' && (
        <>
          {summary}
          <Input label="Número de la tarjeta" value={formatCard(card.number)} onChange={(v) => setCard({ ...card, number: v })} placeholder="1234 5678 9012 3456" keyboard="number-pad" auto="cc-number"
            right={cardBrand(card.number) ? <Text style={{ color: C.muted, fontSize: 12, fontWeight: '800' }}>{cardBrand(card.number)}</Text> : null} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Input label="Vence" value={formatExp(card.exp)} onChange={(v) => setCard({ ...card, exp: v })} placeholder="MM/AA" keyboard="number-pad" auto="cc-exp" /></View>
            <View style={{ flex: 1 }}><Input label="CVC" value={card.cvc} onChange={(v) => setCard({ ...card, cvc: v.replace(/\D/g, '').slice(0, 4) })} placeholder="123" keyboard="number-pad" auto="cc-csc" secure /></View>
          </View>
          <Input label="Nombre en la tarjeta" value={card.holder} onChange={(v) => setCard({ ...card, holder: v })} placeholder="Como aparece en la tarjeta" auto="cc-name" />
          {acceptBoxes}
          <Text style={{ color: C.muted, fontSize: 12 }}>Los datos de la tarjeta van directo a Wompi; Kaderno solo guarda la marca y los últimos 4 números.</Text>
        </>
      )}

      {step === 'nequi' && (
        <>
          {summary}
          <Input label="Celular de Nequi" value={phone} onChange={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder="3001234567" keyboard="phone-pad" auto="tel" />
          {acceptBoxes}
          <Text style={{ color: C.muted, fontSize: 12 }}>Te llega una solicitud en la app de Nequi: acéptala para que Kaderno pueda cobrar {every}.</Text>
        </>
      )}

      {step === 'nequi-wait' && (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
          <Ionicons name="phone-portrait-outline" size={40} color={C.brand} />
          <Text style={{ color: C.text, fontSize: 15.5, fontWeight: '800', textAlign: 'center' }}>Abre Nequi y acepta la suscripción de Kaderno</Text>
          <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>Esperando la respuesta… (puede tardar un minuto)</Text>
          <ActivityIndicator color={C.brand} />
        </View>
      )}

      {step === 'working' && (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
          <ActivityIndicator color={C.brand} size="large" />
          <Text style={{ color: C.text, fontSize: 14 }}>{msg}</Text>
        </View>
      )}

      {step === 'done' && result && (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 18 }}>
          <Ionicons name={result.ok ? 'checkmark-circle' : 'close-circle'} size={48} color={result.ok ? C.good : C.bad} />
          <Text style={{ color: C.text, fontSize: 15, textAlign: 'center', lineHeight: 21 }}>{result.text}</Text>
        </View>
      )}

      {err && <Text style={{ color: C.badText, fontSize: 13.5 }} accessibilityLiveRegion="polite">{err}</Text>}

      {(step === 'card' || step === 'nequi') && (
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {!isSource && <Button label="Atrás" kind="ghost" onPress={() => { setErr(null); setStep('choose'); }} />}
          {isSource && step === 'card' && <Button label="Usar Nequi" kind="ghost" onPress={() => { setErr(null); setStep('nequi'); }} />}
          {isSource && step === 'nequi' && <Button label="Usar tarjeta" kind="ghost" onPress={() => { setErr(null); setStep('card'); }} />}
          <Button label={step === 'card' ? (isSource ? 'Guardar tarjeta' : `Pagar ${cop(amount)}`) : 'Enviar a Nequi'} icon="lock-closed-outline" busy={busy} disabled={!accepted} onPress={step === 'card' ? payCard : payNequi} />
        </View>
      )}
      {step === 'done' && <Button label={result?.ok ? 'Listo' : 'Volver'} onPress={result?.ok ? close : () => { setStep(isSource ? 'card' : 'choose'); setResult(null); }} />}
    </Sheet>
  );
}

function Option({ icon, title, text, onPress, disabled, busy }: { icon: any; title: string; text: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }}
      style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: hovered && !disabled ? C.surface2 : 'transparent', opacity: disabled ? 0.55 : 1 })}>
      <Ionicons name={icon} size={22} color={C.brand} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{text}</Text>
      </View>
      {busy ? <ActivityIndicator color={C.brand} /> : <Ionicons name="chevron-forward" size={18} color={C.muted} />}
    </Pressable>
  );
}

function Input({ label, value, onChange, placeholder, keyboard, auto, secure, right }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: any; auto?: string; secure?: boolean; right?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10 }}>
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} keyboardType={keyboard} secureTextEntry={secure}
          autoComplete={auto as any} accessibilityLabel={label} autoCorrect={false}
          style={[{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 11 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
        {right}
      </View>
    </View>
  );
}

function Check({ value, onChange, label, url }: { value: boolean; onChange: (v: boolean) => void; label: string; url?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }} accessibilityLabel={label} hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <Ionicons name={value ? 'checkbox' : 'square-outline'} size={20} color={value ? C.brand : C.muted} />
        <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{label}</Text>
      </Pressable>
      {url ? <Pressable onPress={() => Linking.openURL(url)} accessibilityRole="link" hitSlop={6}><Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>Leer</Text></Pressable> : null}
    </View>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const btn = (d: number, icon: any, label: string) => (
    <Pressable onPress={() => onChange(Math.max(min, Math.min(max, value + d)))} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', opacity: (d < 0 ? value <= min : value >= max) ? 0.4 : 1 }}>
      <Ionicons name={icon} size={16} color={C.text} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {btn(-1, 'remove', 'Una persona menos')}
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">{value}</Text>
      {btn(1, 'add', 'Una persona más')}
    </View>
  );
}
