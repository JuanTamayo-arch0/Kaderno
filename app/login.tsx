import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Redirect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase, SUPABASE_READY } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { C, currentTheme, shadow, inkOn } from '../lib/theme';

type Mode = 'in' | 'up';

// Cada modo tiene su propia identidad visual y sus propios textos, para que
// "entrar" y "crear cuenta" no se confundan nunca.
const COPY = {
  in: {
    title: 'Hola de nuevo',
    sub: 'Entra para seguir donde lo dejaste.',
    cta: 'Entrar',
    icon: 'log-in-outline' as const,
    panelTitle: 'Tu semestre, bajo control.',
    panelSub: 'Tareas, apuntes y horario en un solo lugar.',
  },
  up: {
    title: 'Crea tu cuenta',
    sub: 'Organiza tus materias en menos de un minuto.',
    cta: 'Crear cuenta',
    icon: 'sparkles-outline' as const,
    panelTitle: 'Empieza gratis hoy.',
    panelSub: 'Sin tarjeta. Tus datos se sincronizan entre dispositivos.',
  },
};

const FEATURES = [
  { icon: 'calendar-outline' as const, t: 'Todo lo que entregas, en una sola vista' },
  { icon: 'camera-outline' as const, t: 'Digitaliza apuntes con la cámara' },
  { icon: 'sparkles-outline' as const, t: 'El Oráculo responde sobre tus materias' },
];

function strengthOf(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  const map = [
    { label: 'Muy débil', color: C.bad },
    { label: 'Débil', color: C.bad },
    { label: 'Aceptable', color: C.warn },
    { label: 'Buena', color: C.good },
    { label: 'Excelente', color: C.good },
  ];
  return { score: s, ...map[s] };
}

export default function Login() {
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  // Puntos de corte por ancho REAL de ventana (no por "es móvil o no"): así una
  // ventana de escritorio pequeña o con zoom del sistema también se ve bien.
  const wide = width >= 820;                  // tarjeta partida con panel lateral
  const medium = !wide && width >= 560;       // tarjeta centrada con cabecera
  const compact = !wide && !medium;           // móvil
  const xl = width >= 1360;                   // monitor grande: la tarjeta respira más

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
  // El acento cambia según el modo: azul para entrar, violeta para registrarse.
  const accent = mode === 'in' ? C.brand : C.brand2;

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m); setMsg(null); setSent(false); setConfirm('');
  }

  function validate(): string | null {
    if (!SUPABASE_READY) return 'La app no tiene configurado Supabase. Revisa kaderno-config.js en el servidor.';
    if (mode === 'up' && !name.trim()) return 'Escribe tu nombre.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Ese correo no parece válido.';
    if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    if (mode === 'up' && password !== confirm) return 'Las contraseñas no coinciden.';
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
      setMsg({ kind: 'error', text: traducirError(e?.message ?? 'No se pudo autenticar') });
    } finally {
      setBusy(false);
    }
  }

  async function recuperar() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setMsg({ kind: 'error', text: 'Escribe tu correo arriba y vuelve a tocar aquí.' });
      return;
    }
    setBusy(true);
    try {
      const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setMsg({ kind: 'ok', text: 'Te enviamos un enlace para restablecer la contraseña.' });
    } catch (e: any) {
      setMsg({ kind: 'error', text: traducirError(e?.message ?? 'No se pudo enviar el correo') });
    } finally { setBusy(false); }
  }

  // Degradado de marca. En web es CSS (con transición al cambiar de modo);
  // en nativo se cae a un color sólido.
  const gradient = (extra?: any) => (Platform.OS === 'web'
    ? React.createElement('div', {
      style: {
        position: 'absolute', inset: 0,
        background: `linear-gradient(160deg, ${accent}, ${mode === 'in' ? C.brand2 : C.brand})`,
        transition: 'background 400ms ease', ...extra,
      },
    })
    : <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: accent }} />);

  // Luz ambiental de fondo en pantallas grandes: evita que la tarjeta quede
  // flotando sobre un vacío plano en un monitor de escritorio.
  const ambient = Platform.OS === 'web' && !compact
    ? React.createElement('div', {
      key: 'ambient',
      style: {
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background:
          `radial-gradient(1100px 700px at 8% -12%, ${accent}2e, transparent 62%),` +
          `radial-gradient(900px 700px at 104% 112%, ${mode === 'in' ? C.brand2 : C.brand}26, transparent 62%)`,
        transition: 'background 400ms ease',
      },
    })
    : null;

  // Círculos decorativos translúcidos del panel.
  const blobs = (
    <>
      <View style={{ position: 'absolute', top: -70, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.10)' }} />
      <View style={{ position: 'absolute', bottom: -90, left: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.08)' }} />
    </>
  );

  // ---------------- Panel de marca lateral (pantallas anchas) ----------------
  // Mini vista previa "de cristal": llena el centro del panel y enseña de un
  // vistazo cómo se ve la app por dentro.
  const glass = (
    <View style={{
      backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 14,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', gap: 11,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="today-outline" size={15} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', flex: 1 }}>Hoy</Text>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.26)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '700' }}>3 pendientes</Text>
        </View>
      </View>
      {[
        { t: 'Cálculo II · Taller 3', d: 'Mañana', done: false },
        { t: 'Química · Informe de lab', d: 'Viernes', done: false },
        { t: 'Historia · Lectura cap. 4', d: 'Hecho', done: true },
      ].map((r) => (
        <View key={r.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{
            width: 16, height: 16, borderRadius: 5, borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center',
            backgroundColor: r.done ? 'rgba(255,255,255,0.85)' : 'transparent',
          }}>
            {r.done && <Ionicons name="checkmark" size={11} color={accent} />}
          </View>
          <Text numberOfLines={1} style={{
            color: r.done ? 'rgba(255,255,255,0.6)' : '#fff', fontSize: 12.5, flex: 1,
            textDecorationLine: r.done ? 'line-through' : 'none',
          }}>{r.t}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>{r.d}</Text>
        </View>
      ))}
    </View>
  );

  const panel = (
    <View style={{
      flex: 0.95, minWidth: 320, maxWidth: xl ? 520 : 460,
      paddingHorizontal: xl ? 52 : 42, paddingVertical: xl ? 52 : 42,
      justifyContent: 'space-between', overflow: 'hidden',
    }}>
      {gradient()}
      {blobs}
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="book" size={20} color="#fff" />
          </View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Kaderno</Text>
        </View>
        <Text style={{ color: '#fff', fontSize: xl ? 38 : 33, fontWeight: '800', marginTop: xl ? 40 : 30, lineHeight: xl ? 45 : 39 }}>{copy.panelTitle}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.86)', fontSize: 15.5, marginTop: 12, lineHeight: 22 }}>{copy.panelSub}</Text>
      </View>

      <View style={{ marginTop: 26 }}>{glass}</View>

      <View style={{ gap: 13, marginTop: 26 }}>
        {FEATURES.map((f) => (
          <View key={f.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={f.icon} size={16} color="#fff" />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.94)', fontSize: 14, flex: 1 }}>{f.t}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  // -------- Cabecera de marca horizontal (tablet / ventana mediana) --------
  const bannerTop = (
    <View style={{ padding: 26, overflow: 'hidden' }}>
      {gradient()}
      {blobs}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="book" size={18} color="#fff" />
        </View>
        <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800' }}>Kaderno</Text>
      </View>
      <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 18, lineHeight: 29 }}>{copy.panelTitle}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, marginTop: 6 }}>{copy.panelSub}</Text>
    </View>
  );

  // ---------------- Estado "revisa tu correo" ----------------
  const okScreen = (
    <View style={{ alignItems: 'center', paddingVertical: 22 }}>
      <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: C.good + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="mail-open-outline" size={30} color={C.good} />
      </View>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', marginTop: 16 }}>Revisa tu correo</Text>
      <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
        Te enviamos un enlace de confirmación a{'\n'}
        <Text style={{ color: C.text, fontWeight: '700' }}>{email}</Text>
      </Text>
      <Pressable onPress={() => { setSent(false); setMode('in'); }} style={{ marginTop: 22 }}>
        <Text style={{ color: accent, fontWeight: '700' }}>Volver a iniciar sesión</Text>
      </Pressable>
    </View>
  );

  // ---------------- Formulario ----------------
  const form = (
    <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
      {compact && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 26 }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="book" size={19} color="#fff" />
          </View>
          <Text style={{ color: C.text, fontSize: 21, fontWeight: '800' }}>Kaderno</Text>
        </View>
      )}

      {/* Selector Entrar / Crear cuenta */}
      <View style={{ flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: C.line }}>
        {(['in', 'up'] as Mode[]).map((m) => {
          const on = mode === m;
          const col = m === 'in' ? C.brand : C.brand2;
          return (
            <Pressable key={m} onPress={() => switchMode(m)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center', backgroundColor: on ? col : 'transparent' }}>
              <Text style={{ color: on ? inkOn(accent) : C.muted, fontWeight: '800', fontSize: 14 }}>
                {m === 'in' ? 'Entrar' : 'Crear cuenta'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {sent ? okScreen : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 26 }}>
            <Ionicons name={copy.icon} size={22} color={accent} />
            <Text style={{ color: C.text, fontSize: 25, fontWeight: '800' }}>{copy.title}</Text>
          </View>
          <Text style={{ color: C.muted, fontSize: 14.5, marginTop: 6, marginBottom: 22 }}>{copy.sub}</Text>

          {!SUPABASE_READY && (
            <Banner kind="error" text="Falta configurar Supabase (kaderno-config.js o .env). El login no funcionará." />
          )}
          {msg && <Banner kind={msg.kind} text={msg.text} />}

          {mode === 'up' && (
            <Field label="Nombre" icon="person-outline">
              <TextInput value={name} onChangeText={setName} placeholder="Tu nombre"
                placeholderTextColor={C.muted} style={inputStyle} />
            </Field>
          )}

          <Field label="Correo" icon="mail-outline">
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
              autoComplete="email" placeholder="tucorreo@ejemplo.com" placeholderTextColor={C.muted} style={inputStyle} />
          </Field>

          <Field label="Contraseña" icon="lock-closed-outline">
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPw}
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                placeholder="••••••••" placeholderTextColor={C.muted} style={[inputStyle, { flex: 1 }]} />
              <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10} style={{ position: 'absolute', right: 12 }}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={19} color={C.muted} />
              </Pressable>
            </View>
          </Field>

          {mode === 'up' && (
            <>
              {/* Medidor de seguridad: solo aparece al registrarse */}
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 10 }}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < pwInfo.score ? pwInfo.color : C.line }} />
                ))}
              </View>
              {password.length > 0 && (
                <Text style={{ color: pwInfo.color, fontSize: 11.5, marginTop: 5, fontWeight: '600' }}>{pwInfo.label}</Text>
              )}

              <Field label="Confirmar contraseña" icon="checkmark-done-outline">
                <TextInput value={confirm} onChangeText={setConfirm} secureTextEntry={!showPw}
                  placeholder="Repite la contraseña" placeholderTextColor={C.muted}
                  style={[inputStyle, confirm.length > 0 && { borderColor: confirm === password ? C.good : C.bad }]} />
              </Field>
            </>
          )}

          {mode === 'in' && (
            <Pressable onPress={recuperar} style={{ alignSelf: 'flex-end', marginTop: 12 }} hitSlop={8}>
              <Text style={{ color: C.muted, fontSize: 13 }}>¿Olvidaste tu contraseña?</Text>
            </Pressable>
          )}

          <Pressable onPress={submit} disabled={busy}
            style={({ pressed }) => ({
              backgroundColor: accent, borderRadius: 13, paddingVertical: 15, alignItems: 'center',
              marginTop: mode === 'in' ? 18 : 24, opacity: busy ? 0.7 : pressed ? 0.88 : 1,
              flexDirection: 'row', justifyContent: 'center', gap: 8,
            })}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name={copy.icon} size={18} color="#fff" />}
            <Text style={{ color: inkOn(accent), fontWeight: '800', fontSize: 15.5 }}>{busy ? 'Un momento…' : copy.cta}</Text>
          </Pressable>

          {mode === 'up' && (
            <Text style={{ color: C.muted, fontSize: 11.5, textAlign: 'center', marginTop: 14, lineHeight: 17 }}>
              Al crear la cuenta aceptas que guardemos tus apuntes y tareas para sincronizarlos entre tus dispositivos.
            </Text>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 22 }}>
            <Text style={{ color: C.muted, fontSize: 13.5 }}>
              {mode === 'in' ? '¿Aún no tienes cuenta?' : '¿Ya tienes cuenta?'}
            </Text>
            <Pressable onPress={() => switchMode(mode === 'in' ? 'up' : 'in')} hitSlop={6}>
              <Text style={{ color: mode === 'in' ? C.brand2 : C.brand, fontSize: 13.5, fontWeight: '800' }}>
                {mode === 'in' ? 'Regístrate' : 'Entra'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  // Tres disposiciones según el ancho REAL de la ventana:
  //   >= 820  → tarjeta partida (panel de marca + formulario)
  //   >= 560  → tarjeta centrada con cabecera de marca arriba
  //   <  560  → móvil, a pantalla completa
  const body = wide ? (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: xl ? 48 : 32 }}>
      <View style={{
        flexDirection: 'row', width: '100%',
        maxWidth: xl ? 1220 : 1060, maxHeight: 820, minHeight: xl ? 660 : 580,
        borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
        backgroundColor: C.surface, ...shadow,
      }}>
        {panel}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: xl ? 64 : 48, paddingVertical: 36 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {form}
          </ScrollView>
        </View>
      </View>
    </View>
  ) : medium ? (
    <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }} keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: 460, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, ...shadow }}>
        {bannerTop}
        <View style={{ padding: 28 }}>{form}</View>
      </View>
    </ScrollView>
  ) : (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
      {form}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: currentTheme().palette.bg }}>
      {ambient}
      {body}
    </KeyboardAvoidingView>
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
  if (s.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (s.includes('email not confirmed')) return 'Todavía no confirmaste tu correo. Revisa tu bandeja de entrada.';
  if (s.includes('user already registered')) return 'Ya existe una cuenta con ese correo. Intenta entrar.';
  if (s.includes('password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (s.includes('failed to fetch') || s.includes('network')) return 'No hay conexión con el servidor. Revisa la configuración de Supabase.';
  if (s.includes('rate limit') || s.includes('too many')) return 'Demasiados intentos. Espera un momento.';
  return m;
}

const inputStyle = {
  backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12,
  color: C.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
} as const;
