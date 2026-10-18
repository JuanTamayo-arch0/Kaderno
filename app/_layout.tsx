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
  PERSONALIZE, DEFAULTS, currentTheme,
  loadPersonalizeNative, savePersonalize, scaleOf,
} from '../lib/theme';
import { fetchPrefs, savePrefs, getSubjects, updateSubject } from '../lib/db';
import { shrinkToSquare, BIG_ICON_CHARS } from '../lib/imageResize';

async function compactSubjectIcons() {
  const subs = await getSubjects();
  for (const s of subs) {
    if (!s.icon || !s.icon.startsWith('data:image') || s.icon.length < BIG_ICON_CHARS) continue;
    const small = await shrinkToSquare(s.icon);
    if (small.length < s.icon.length) await updateSubject(s.id, { icon: small });
  }
}
import { loadTaskTypes, taskTypeList } from '../lib/taskTypes';
import { SCHEDULE, applyRemoteSchedule, loadScheduleNative } from '../lib/schedule';
import { AppBackground } from '../components/AppBackground';
import { FeedbackHost } from '../components/FeedbackHost';
import { GlobalPanels } from '../components/GlobalPanels';
import { AppSideNav } from '../components/SideNav';
import { preloadScreens } from '../lib/preload';
import { toast } from '../lib/feedback';
import { beep, loadFocus, setFocusCompleteHandler, getFocus } from '../lib/focusTimer';
import { duckAmbient, initAmbient } from '../lib/ambient';
import { tipById } from '../lib/breakTips';
import { registerServiceWorker } from '../lib/push';
import { installMotion } from '../lib/motion';
import { celebrate } from '../lib/celebrate';
import { PetBuddy } from '../components/pets/PetBuddy';
import { emitPetEvent, refreshCoinsSoon } from '../lib/pets/store';

// Animaciones CSS (solo web): se inyectan una vez, antes del primer render.
installMotion();

// Al terminar un pomodoro o un descanso: sonido, aviso del navegador y mensaje.
setFocusCompleteHandler((mode, s) => {
  if (s.sound) { duckAmbient(); beep(); }
  const title = mode === 'work' ? 'Pomodoro terminado' : 'Fin del descanso';
  const body = mode === 'work' ? `Buen trabajo. Descanso de ${s.cycle === 0 ? s.longBreakMin : s.breakMin} min.` : 'Cuando quieras, empieza el siguiente pomodoro.';
  toast(`${title}. ${body}`, { tone: 'good', duration: 8000 });
  if (mode === 'work') {
    emitPetEvent({ type: 'enfoque_fin', minutes: Math.max(1, s.workMin) }); refreshCoinsSoon(1500);
    // Después de felicitar, la mascota sugiere qué hacer en la pausa.
    const tipId = s.tipId;
    setTimeout(() => {
      const f = getFocus();
      const tip = tipById(f.tipId);
      if (f.mode === 'break' && f.running && tip && f.tipId === tipId) emitPetEvent({ type: 'pausa', tip: tip.pet });
    }, 5200);
  }
  // Pomodoro completo con la pestaña a la vista: un poco de confeti.
  if (mode === 'work' && Platform.OS === 'web' && typeof document !== 'undefined' && !document.hidden) celebrate();
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { new Notification(title, { body, icon: '/icon-192.png' }); } catch { /* noop */ }
  }
});

// Habilita animaciones de layout suaves en Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Inyecta las fuentes de Google (solo web) una sola vez.

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
    loadFocus();
    initAmbient();
    registerServiceWorker();
    preloadScreens();
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
    // Solo se remonta si cambiaron: remontar recarga TODAS las pantallas (antes
    // pasaba siempre al abrir la app y cada pantalla pedía sus datos dos veces).
    // Fotos de materias guardadas grandes (versiones anteriores): se achican una vez.
    if (Platform.OS === 'web') setTimeout(() => { compactSubjectIcons().catch(() => {}); }, 3000);
    const typesBefore = JSON.stringify(taskTypeList());
    loadTaskTypes().then(() => { if (!cancel && JSON.stringify(taskTypeList()) !== typesBefore) setRev((n) => n + 1); }).catch(() => { });

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
        const schedBefore = JSON.stringify(SCHEDULE);
        if (schedule) applyRemoteSchedule(schedule);
        const schedChanged = JSON.stringify(SCHEDULE) !== schedBefore;
        // Solo las claves de personalización: el mismo jsonb guarda también avisos,
        // vista de Hoy, etc. Con esas claves la comparación nunca daba igual y la
        // app se remontaba entera en cada arranque.
        const pick = (o: Record<string, any>) => Object.fromEntries((Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]).map((k) => [k, o[k] ?? DEFAULTS[k]])) as typeof DEFAULTS;
        const merged = pick({ ...DEFAULTS, ...pers });
        if (JSON.stringify(merged) === JSON.stringify(pick(PERSONALIZE as any))) {
          if (schedChanged) setRev((n) => n + 1);
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
          <AppSideNav />
          {session ? <GlobalPanels /> : null}
          {session ? <PetBuddy /> : null}
          <FeedbackHost />
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
