import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase, SUPABASE_READY } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { C, currentTheme, inkOn, RAD } from '../lib/theme';
import { BRAND } from '../lib/brand';
import { KadernoWordmark } from '../components/brand/KadernoLogo';
import { KadernoWrites } from '../components/brand/KadernoWrites';
import { t } from '../lib/i18n';

type Mode = 'in' | 'up';

// Cada modo tiene su propia identidad visual y sus propios textos, para que
// "entrar" y "crear cuenta" no se confundan nunca.
const COPY = {
  in: {
    title: t('Hola de nuevo'),
    sub: t('Entra para seguir donde lo dejaste.'),
    cta: t('Entrar'),
    icon: 'log-in-outline' as const,
    panelTitle: t('Tu semestre, bajo control.'),
    panelSub: t('Sigue donde lo dejaste: tus tareas, apuntes y horario te esperan.'),
  },
  up: {
    title: t('Crea tu cuenta'),
    sub: t('Organiza tus materias en menos de un minuto.'),
    cta: t('Crear cuenta'),
    icon: 'sparkles-outline' as const,
    panelTitle: t('Empieza gratis hoy.'),
    panelSub: t('Sin tarjeta. Tus datos se guardan y se sincronizan entre dispositivos.'),
  },
};

const FEATURES = [
  { icon: 'calendar-outline' as const, t: t('Todo lo que entregas, en una sola vista') },
  { icon: 'camera-outline' as const, t: t('Digitaliza apuntes con la cámara') },
  { icon: 'sparkles-outline' as const, t: t('El Oráculo responde sobre tus materias') },
];

function strengthOf(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  const map = [
    { label: t('Muy débil'), color: C.bad },
    { label: t('Débil'), color: C.bad },
    { label: t('Aceptable'), color: C.warn },
    { label: t('Buena'), color: C.good },
    { label: t('Excelente'), color: C.good },
  ];
  return { score: s, ...map[s] };
}

export default function Login() {
  const { session } = useAuth();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // v29: en celulares bajos (SE) la franja se achica para que el formulario se vea sin desplazar.
  const short = height < 700;
  // v28: pantalla completa, sin tarjeta en el centro. En pantallas anchas la
  // mitad izquierda es la hoja de cuaderno con el logo que se escribe; en las
  // angostas, la hoja va arriba como una franja y el formulario debajo.
  const wide = width >= 900;
  const xl = width >= 1360;
  const [replay, setReplay] = useState(0);

  const [mode, setMode] = useState<Mode>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [sent, setSent] = useState(false); // pantalla "revisa tu correo"

  // IMPORTANTE: todos los hooks van ANTES de cualquier "return" temprano.
  // Si no, al aparecer la sesión React ve menos hooks y revienta (error #300).
  const pwInfo = useMemo(() => strengthOf(password), [password]);

  if (session) return <Redirect href="/(tabs)" />;

  const copy = COPY[mode];
  // v28: un solo acento (el de la marca); los dos modos se distinguen por el texto.
  const accent = C.brand;

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m); setMsg(null); setSent(false); setConfirm('');
    setReplay((n) => n + 1); // el lápiz vuelve a escribir la K
  }

  function validate(): string | null {
    if (!SUPABASE_READY) return t('La app no tiene configurado Supabase. Revisa kaderno-config.js en el servidor.');
    if (mode === 'up' && !name.trim()) return t('Escribe tu nombre.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return t('Ese correo no parece válido.');
    if (password.length < 6) return t('La contraseña debe tener al menos 6 caracteres.');
    if (mode === 'up' && password !== confirm) return t('Las contraseñas no coinciden.');
    return null;
  }

  async function submit() {
    const bad = validate();
    if (bad) { setMsg({ kind: 'error', text: bad }); return; }
    setBusy(true); setMsg(null);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: name.trim() } },
        });
        if (error) throw error;
        // Si el proyecto exige confirmar el correo no llega sesión todavía.
        if (data.user && !data.session) setSent(true);
      }
    } catch (e: any) {
      setMsg({ kind: 'error', text: traducirError(e?.message ?? t('No se pudo autenticar')) });
    } finally {
      setBusy(false);
    }
  }

  async function recuperar() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setMsg({ kind: 'error', text: t('Escribe tu correo arriba y vuelve a tocar aquí.') });
      return;
    }
    setBusy(true);
    try {
      const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setMsg({ kind: 'ok', text: t('Te enviamos un enlace para restablecer la contraseña.') });
    } catch (e: any) {
      setMsg({ kind: 'error', text: traducirError(e?.message ?? t('No se pudo enviar el correo')) });
    } finally { setBusy(false); }
  }

  const web = Platform.OS === 'web';
  const h = React.createElement;
  // La hoja de cuaderno: tinta, renglones tenues y la raya del margen, que se dibuja al entrar.
  const notebook = (lineLeft: number) => (web
    ? h('div', { style: { position: 'absolute', inset: 0, backgroundColor: BRAND.ink,
        backgroundImage: 'repeating-linear-gradient(180deg, transparent 0 39px, rgba(255,255,255,0.055) 39px 40px)' } },
        h('div', { 'data-anim': 'line', style: { position: 'absolute', top: 0, bottom: 0, left: lineLeft, width: 3, background: BRAND.margin } }))
    : <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BRAND.ink }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: lineLeft, width: 3, backgroundColor: BRAND.margin }} />
      </View>);

  // El logo que se escribe y el nombre, como en el banner de la marca.
  const brandRow = (mark: number, word: number) => (
    <View dataSet={{ anim: 'rise' }} style={{ flexDirection: 'row', alignItems: 'center', gap: Math.round(mark * 0.22) }}>
      <KadernoWrites size={mark} tone="papel" replay={replay} />
      <View style={{ flexShrink: 1 }}>
        <KadernoWordmark size={word} color="#fff" style={{ lineHeight: Math.round(word * 1.05) }} />
        <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: Math.max(13, Math.round(word * 0.24)), marginTop: 4 }}>{t('Tus tareas, apuntes, horario y estudio.')}</Text>
      </View>
    </View>
  );

  // Vista previa "de cristal" de Hoy: enseña cómo se ve la app por dentro.
  const glass = (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', gap: 11 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="today-outline" size={15} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', flex: 1 }}>{t('Hoy')}</Text>
        <View style={{ backgroundColor: 'rgba(242,103,78,0.22)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: '#FFB4A6', fontSize: 10.5, fontWeight: '700' }}>{t('2 pendientes')}</Text>
        </View>
      </View>
      {[
        { t: t('Cálculo II · Taller 3'), d: t('Mañana'), done: false },
        { t: t('Química · Informe de lab'), d: t('Viernes'), done: false },
        { t: 'Historia · Lectura cap. 4', d: t('Hecho'), done: true },
      ].map((r) => (
        <View key={r.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: r.done ? BRAND.margin : 'rgba(255,255,255,0.6)',
            alignItems: 'center', justifyContent: 'center', backgroundColor: r.done ? BRAND.margin : 'transparent' }}>
            {r.done && <Ionicons name="checkmark" size={11} color="#fff" />}
          </View>
          <Text numberOfLines={1} style={{ color: r.done ? 'rgba(255,255,255,0.5)' : '#fff', fontSize: 12.5, flex: 1, textDecorationLine: r.done ? 'line-through' : 'none' }}>{r.t}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{r.d}</Text>
        </View>
      ))}
    </View>
  );

  // ---------------- La mitad de la marca (pantallas anchas) ----------------
  const panel = (
    <View style={{ flex: 1.08, overflow: 'hidden', paddingLeft: xl ? 132 : 104, paddingRight: xl ? 72 : 52, paddingVertical: 48, justifyContent: 'center' }}>
      {notebook(xl ? 72 : 56)}
      {brandRow(xl ? 120 : 100, xl ? 76 : 62)}
      <View key={mode} dataSet={{ anim: 'swap' }} style={{ marginTop: xl ? 56 : 44, maxWidth: 520 }}>
        <Text dataSet={{ head: '1' }} style={{ color: '#fff', fontSize: xl ? 34 : 29, fontWeight: '800', lineHeight: xl ? 41 : 35 }}>{copy.panelTitle}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15.5, marginTop: 10, lineHeight: 22 }}>{copy.panelSub}</Text>
      </View>
      <View dataSet={{ anim: 'rise', i: '3' }} style={{ marginTop: 30, maxWidth: 440 }}>{glass}</View>
      <View style={{ gap: 12, marginTop: 26, maxWidth: 440 }}>
        {FEATURES.map((f, i) => (
          <View key={f.t} dataSet={{ anim: 'rise', i: String(4 + i) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={f.icon} size={16} color="#FFB4A6" />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, flex: 1 }}>{f.t}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  // ---------------- La franja de la marca (pantallas angostas) ----------------
  const band = (
    <View style={{ overflow: 'hidden', paddingLeft: width < 420 ? 46 : 64, paddingRight: 22, paddingTop: insets.top + (short ? 22 : 44), paddingBottom: short ? 20 : 30 }}>
      {notebook(width < 420 ? 22 : 30)}
      {brandRow(short ? 52 : width < 420 ? 64 : 76, short ? 32 : width < 420 ? 40 : 48)}
      {!short && <Text key={mode} dataSet={{ anim: 'swap', head: '1' }} style={{ color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 22, lineHeight: 27 }}>{copy.panelTitle}</Text>}
    </View>
  );

  // ---------------- Estado "revisa tu correo" ----------------
  const okScreen = (
    <View dataSet={{ anim: 'rise' }} style={{ alignItems: 'center', paddingVertical: 22 }}>
      <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: C.good + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="mail-open-outline" size={30} color={C.goodText} />
      </View>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', marginTop: 16 }}>{t('Revisa tu correo')}</Text>
      <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
        {t('Te enviamos un enlace de confirmación a')}{'\n'}
        <Text style={{ color: C.text, fontWeight: '700' }}>{email}</Text>
      </Text>
      <Pressable onPress={() => { setSent(false); switchMode('in'); }} style={{ marginTop: 22 }}>
        <Text style={{ color: accent, fontWeight: '700' }}>{t('Volver a iniciar sesión')}</Text>
      </Pressable>
    </View>
  );

  // ---------------- Formulario ----------------
  const form = (
    <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
      <ModeSwitch mode={mode} onChange={switchMode} />

      {sent ? okScreen : (
        <View key={mode} dataSet={{ anim: 'swap' }}>
          <Text dataSet={{ head: '1' }} accessibilityRole="header" style={{ color: C.text, fontSize: 28, fontWeight: '800', marginTop: 30 }}>{copy.title}</Text>
          <Text style={{ color: C.muted, fontSize: 14.5, marginTop: 6, marginBottom: 20 }}>{copy.sub}</Text>

          {!SUPABASE_READY && (
            <Banner kind="error" text={t('Falta configurar Supabase (kaderno-config.js o .env). El login no funcionará.')} />
          )}
          {msg && <Banner kind={msg.kind} text={msg.text} />}

          {mode === 'up' && (
            <Field label={t('Nombre')} icon="person-outline">
              <Input value={name} onChangeText={setName} placeholder={t('Tu nombre')} autoComplete="name" />
            </Field>
          )}

          <Field label={t('Correo')} icon="mail-outline">
            <Input value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
              autoComplete="email" placeholder="tucorreo@ejemplo.com" enterKeyHint="next" />
          </Field>

          <Field label={t('Contraseña')} icon="lock-closed-outline">
            <Input value={password} onChangeText={setPassword} secureTextEntry={!showPw}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="••••••••" onSubmitEditing={mode === 'in' ? submit : undefined} enterKeyHint={mode === 'in' ? 'go' : 'next'}
              right={<Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10} style={{ width: 40, height: 40, marginRight: -10, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={showPw ? t('Ocultar contraseña') : t('Mostrar contraseña')}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={19} color={C.muted} />
              </Pressable>} />
          </Field>

          {mode === 'up' && (
            <>
              {/* Medidor de seguridad: solo aparece al registrarse */}
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 10 }} accessibilityLabel={password ? `Seguridad: ${pwInfo.label}` : undefined}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < pwInfo.score ? pwInfo.color : C.line, ...(web ? { transitionProperty: 'background-color', transitionDuration: '250ms' } as any : null) }} />
                ))}
              </View>
              {password.length > 0 && (
                <Text style={{ color: pwInfo.color, fontSize: 11.5, marginTop: 5, fontWeight: '600' }}>{pwInfo.label}</Text>
              )}

              <Field label={t('Confirmar contraseña')} icon="checkmark-done-outline">
                <Input value={confirm} onChangeText={setConfirm} secureTextEntry={!showPw} placeholder={t('Repite la contraseña')} onSubmitEditing={submit} enterKeyHint="go"
                  tone={confirm.length > 0 ? (confirm === password ? 'good' : 'bad') : undefined} />
              </Field>
            </>
          )}

          {mode === 'in' && (
            <Pressable onPress={recuperar} style={{ alignSelf: 'flex-end', marginTop: 12 }} hitSlop={8}>
              <Text style={{ color: C.muted, fontSize: 13 }}>{t('¿Olvidaste tu contraseña?')}</Text>
            </Pressable>
          )}

          <Pressable onPress={submit} disabled={busy} accessibilityRole="button"
            style={({ pressed, hovered }: any) => ({
              backgroundColor: accent, borderRadius: RAD.btn + 3, paddingVertical: 15, alignItems: 'center',
              marginTop: mode === 'in' ? 18 : 24, opacity: busy ? 0.7 : 1,
              flexDirection: 'row', justifyContent: 'center', gap: 8,
              transform: [{ translateY: hovered && !pressed && !busy ? -1 : 0 }, { scale: pressed ? 0.985 : 1 }],
              ...(web ? { transitionProperty: 'transform, box-shadow', transitionDuration: '160ms',
                boxShadow: hovered && !busy ? `0 8px 22px ${accent}55` : `0 2px 8px ${accent}33` } as any : null),
            })}>
            {busy ? <ActivityIndicator color={inkOn(accent)} size="small" /> : <Ionicons name={copy.icon} size={18} color={inkOn(accent)} />}
            <Text style={{ color: inkOn(accent), fontWeight: '800', fontSize: 15.5 }}>{busy ? t('Un momento…') : copy.cta}</Text>
          </Pressable>

          {mode === 'up' && (
            <Text style={{ color: C.muted, fontSize: 11.5, textAlign: 'center', marginTop: 14, lineHeight: 17 }}>
              {t('Al crear la cuenta aceptas que guardemos tus apuntes y tareas para sincronizarlos entre tus dispositivos.')}</Text>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 22 }}>
            <Text style={{ color: C.muted, fontSize: 13.5 }}>
              {mode === 'in' ? t('¿Aún no tienes cuenta?') : t('¿Ya tienes cuenta?')}
            </Text>
            <Pressable onPress={() => switchMode(mode === 'in' ? 'up' : 'in')} hitSlop={6}>
              <Text style={{ color: accent, fontSize: 13.5, fontWeight: '800' }}>
                {mode === 'in' ? t('Regístrate') : t('Entra')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  const body = wide ? (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {panel}
      <View style={{ flex: 1, backgroundColor: currentTheme().palette.bg }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: xl ? 80 : 56, paddingVertical: 48 }}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View dataSet={{ anim: 'rise', i: '2' }}>{form}</View>
        </ScrollView>
      </View>
    </View>
  ) : (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      {band}
      <View dataSet={{ anim: 'rise', i: '2' }} style={{ paddingHorizontal: 24, paddingTop: short ? 18 : 26, paddingBottom: 36 + insets.bottom }}>{form}</View>
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: currentTheme().palette.bg }}>
      {body}
    </KeyboardAvoidingView>
  );
}

// Entrar / Crear cuenta, con la marca que se desliza de un lado al otro.
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const web = Platform.OS === 'web';
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: C.line, position: 'relative' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 4, bottom: 4, width: '50%', left: mode === 'in' ? 4 : '50%', marginLeft: mode === 'in' ? 0 : -4,
        borderRadius: 11, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
        ...(web ? { transitionProperty: 'left, margin-left', transitionDuration: '260ms', transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)', boxShadow: '0 1px 4px rgba(0,0,0,.18)' } as any : null) }} />
      {(['in', 'up'] as Mode[]).map((m) => {
        const on = mode === m;
        return (
          <Pressable key={m} onPress={() => onChange(m)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' }}>
            <Text style={{ color: on ? C.text : C.muted, fontWeight: '800', fontSize: 14 }}>{m === 'in' ? t('Entrar') : t('Crear cuenta')}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Campo con borde que se enciende al escribir (y verde o rojo al confirmar).
function Input({ right, tone, style, ...props }: React.ComponentProps<typeof TextInput> & { right?: React.ReactNode; tone?: 'good' | 'bad' }) {
  const [focus, setFocus] = useState(false);
  const web = Platform.OS === 'web';
  const border = tone === 'good' ? C.good : tone === 'bad' ? C.bad : focus ? C.brand : C.line;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderColor: border, borderWidth: 1, borderRadius: RAD.field + 2,
      ...(web ? { transitionProperty: 'border-color, box-shadow', transitionDuration: '180ms', boxShadow: focus ? `0 0 0 3px ${C.brand}2e` : 'none' } as any : null) }}>
      <TextInput placeholderTextColor={C.muted} {...props}
        onFocus={(e) => { setFocus(true); props.onFocus?.(e); }} onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
        style={[{ flex: 1, minWidth: 0, color: C.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, ...(web ? { outlineStyle: 'none' } as any : null) }, style]} />
      {right ? <View style={{ paddingRight: 12 }}>{right}</View> : null}
    </View>
  );
}

function Field({ label, icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <Ionicons name={icon} size={13} color={C.muted} />
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

function Banner({ kind, text }: { kind: 'error' | 'ok'; text: string }) {
  const col = kind === 'error' ? C.bad : C.good;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: col + '18', borderWidth: 1, borderColor: col + '55', borderRadius: 11, padding: 12, marginBottom: 4 }}>
      <Ionicons name={kind === 'error' ? 'alert-circle' : 'checkmark-circle'} size={17} color={col} />
      <Text style={{ color: C.text, fontSize: 13, flex: 1, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

// Traduce los errores más comunes de Supabase.
function traducirError(m: string): string {
  const s = m.toLowerCase();
  if (s.includes('invalid login credentials')) return t('Correo o contraseña incorrectos.');
  if (s.includes('email not confirmed')) return t('Todavía no confirmaste tu correo. Revisa tu bandeja de entrada.');
  if (s.includes('user already registered')) return t('Ya existe una cuenta con ese correo. Intenta entrar.');
  if (s.includes('password should be')) return t('La contraseña debe tener al menos 6 caracteres.');
  if (s.includes('failed to fetch') || s.includes('network')) return t('No hay conexión con el servidor. Revisa la configuración de Supabase.');
  if (s.includes('rate limit') || s.includes('too many')) return t('Demasiados intentos. Espera un momento.');
  return m;
}

