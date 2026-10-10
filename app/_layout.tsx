import { useEffect, useState } from 'react';
import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, UIManager, View } from 'react-native';
import { enableScreens } from 'react-native-screens';
// En web, react-native-screens viene apagado y las pestañas inactivas quedan
// pintadas detrás (se ven a través de las pantallas translúcidas). Al habilitarlo,
// las inactivas se ocultan con display:none.
enableScreens(true);
import { AuthProvider, useAuth } from '../lib/auth';
import {
  GOOGLE_FONTS_HREF, PERSONALIZE, DEFAULTS, currentTheme,
  loadPersonalizeNative, savePersonalize, scaleOf,
} from '../lib/theme';
import { fetchPrefs, savePrefs } from '../lib/db';
import { loadTaskTypes } from '../lib/taskTypes';
import { SCHEDULE, applyRemoteSchedule, loadScheduleNative } from '../lib/schedule';
import { AppBackground } from '../components/AppBackground';

// Habilita animaciones de layout suaves en Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Inyecta las fuentes de Google (solo web) una sola vez.
function injectWebFonts() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('kaderno-fonts')) return;
  const link = document.createElement('link');
  link.id = 'kaderno-fonts';
  link.rel = 'stylesheet';
  link.href = GOOGLE_FONTS_HREF;
  document.head.appendChild(link);
}

function applyWebChrome() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  try {
    // "Tamaño de interfaz" = zoom del documento (escala fuentes y espaciado por igual).
    (document.documentElement.style as any).zoom = String(scaleOf(PERSONALIZE.sizeId));
    document.documentElement.style.background = currentTheme().palette.bg;
    document.body.style.background = currentTheme().palette.bg;
  } catch { /* noop */ }
}

function Shell() {
  const { session } = useAuth();
  // `rev` fuerza un remount completo cuando la personalización cambia
  // (así los estilos en línea vuelven a leer la paleta C).
  const [rev, setRev] = useState(0);

  useEffect(() => {
    injectWebFonts();
    if (Platform.OS === 'web') applyWebChrome();
    else {
      // En móvil no hay lectura síncrona: se traen las copias locales y se
      // repinta una vez con todo listo.
      Promise.all([loadPersonalizeNative(), loadScheduleNative()])
        .then(() => setRev((n) => n + 1))
        .catch(() => { });
    }
  }, []);

  // Al iniciar sesión: traer de la nube la personalización, el horario y los
  // tipos de tarea propios (o subir lo local si la nube está vacía).
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancel = false;

    // Los tipos propios se cargan aparte: taskTypeMeta() los lee de memoria
    // durante el render, así que hay que repintar cuando lleguen.
    loadTaskTypes().then(() => { if (!cancel) setRev((n) => n + 1); }).catch(() => { });

    fetchPrefs()
      .then((remote) => {
        if (cancel) return;
        if (!remote) {
          savePrefs({ ...PERSONALIZE, schedule: SCHEDULE }).catch(() => { });
          return;
        }
        // `schedule` vive en el mismo jsonb pero no es parte de la
        // personalización: se separa para que no acabe dentro de PSettings.
        const { schedule, ...pers } = remote as Record<string, any>;
        if (schedule) applyRemoteSchedule(schedule);
        const merged = { ...DEFAULTS, ...pers };
        if (JSON.stringify(merged) === JSON.stringify(PERSONALIZE)) {
          if (schedule) setRev((n) => n + 1);
          return;
        }
        savePersonalize(merged).then(() => {
          if (cancel) return;
          applyWebChrome();
          setRev((n) => n + 1);
        });
      })
      .catch(() => { });
    return () => { cancel = true; };
  }, [userId]);

  const scheme = currentTheme().scheme;
  // Tema de navegación con fondo TRANSPARENTE para que el fondo de pantalla
  // (AppBackground) se vea a través de las pantallas.
  const base = scheme === 'light' ? DefaultTheme : DarkTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: 'transparent', card: 'transparent' } };

  return (
    <>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <View key={rev} style={{ flex: 1, backgroundColor: currentTheme().palette.bg }}>
        <AppBackground />
        <ThemeProvider value={navTheme}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
        </ThemeProvider>
      </View>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
