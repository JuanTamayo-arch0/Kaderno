import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { fetchPrefs, savePrefs, exportMyData, hasV14 } from '../lib/db';
import { DEFAULT_URGENT_DAYS, URGENT_DAY_OPTIONS, cleanUrgentDays } from '../lib/eisenhower';
import { dataChanged } from '../lib/uiBus';
import { CalendarCard } from '../components/CalendarCard';
import { ExternalCalendars } from '../components/ExternalCalendars';
import { soundEnabled, setSoundEnabled } from '../lib/sound';
import { updateMyProfile } from '../lib/projects';
import { getPushStatus, enablePush, disablePush, testLocalNotification, isStandalone, type PushStatus } from '../lib/push';
import { canPromptInstall, onInstallChange, promptInstall, isIOSWeb } from '../lib/pwa';
import { confirm, notify, toast, friendlyError, flushPendingDeletes } from '../lib/feedback';
import { saveFile } from '../lib/fileIO';
import { Screen, Button, Card, Field, IconButton, ListRow, SectionLabel, Toggle } from '../components/ds';
import { LangPicker } from '../components/LangPicker';
import { showLangPicker } from '../lib/i18nApp';
import { Avatar } from '../components/SideNav';
import { PetSettings } from '../components/pets/PetSettings';
import { StudySettings } from '../components/cards/StudySettings';
import { SemesterRitual } from '../components/ritual/SemesterRitual';
import { getRitualPrefs, saveRitualPrefs } from '../lib/ritualsDb';
import { clearHoyHidden, resetHoyHiddenCache, saveHoyVista } from '../lib/hoyHidden';
import { usePlan } from '../lib/billingDb';
import { planView } from '../lib/billing';
import { MODES, saveMode, useMode } from '../lib/mode';
import { t } from '../lib/i18n';

// ============================================================
//  Ajustes: cuenta, apariencia, avisos, calendario, instalar la app,
//  datos y cerrar sesión.
// ============================================================

type Notif = { daily: boolean; daily_hour: number; weekly: boolean; tz: string; monday?: boolean; close?: boolean; close_hour?: number };
const DEFAULT_NOTIF: Notif = { daily: true, daily_hour: 7, weekly: true, tz: 'America/Bogota', monday: false };

/** Mide cuánto tarda el servidor (Supabase) en responder desde aquí. */
function ConnectionTest() {
  const [res, setRes] = useState<{ ms: number; min: number; max: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    setBusy(true); setErr(null);
    try {
      const times: number[] = [];
      for (let i = 0; i < 6; i++) {
        const t0 = performance.now();
        const { error } = await supabase.from('user_prefs').select('user_id').limit(1);
        if (error) throw error;
        if (i > 0) times.push(performance.now() - t0); // la primera abre la conexión
      }
      times.sort((a, b) => a - b);
      setRes({ ms: Math.round(times[Math.floor(times.length / 2)]), min: Math.round(times[0]), max: Math.round(times[times.length - 1]) });
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }
  const verdict = !res ? null : res.ms < 150 ? { t: t('Rápida'), c: C.goodText } : res.ms < 300 ? { t: t('Aceptable'), c: C.warnText } : { t: t('Lenta'), c: C.badText };
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="pulse-outline" size={22} color={C.brand} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{t('Probar conexión')}</Text>
          <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{t('Cuánto tarda el servidor en responder desde donde estás.')}</Text>
        </View>
        <Button label={res ? t('Repetir') : t('Probar')} size="sm" kind="secondary" busy={busy} onPress={run} />
      </View>
      {res && verdict && (
        <Text style={{ color: C.text, fontSize: 14 }}>
          <Text style={{ color: verdict.c, fontWeight: '800' }}>{t('{t}: {ms} ms', { t: verdict.t, ms: res.ms })}</Text>
          <Text style={{ color: C.muted }}>{t(' por consulta (entre {min} y {max} ms en 5 pruebas).{v}', { min: res.min, max: res.max, v: res.ms >= 300 ? t(' Conviene mudar la base a una región más cercana (ver RUNBOOK, versión 18).') : '' })}</Text>
        </Text>
      )}
      {err && <Text style={{ color: C.badText, fontSize: 13 }}>{err}</Text>}
    </Card>
  );
}

function Ajustes() {
  const router = useRouter();
  const { s: section } = useLocalSearchParams<{ s?: string }>();
  const { session } = useAuth();
  const email = session?.user?.email ?? '';
  const [name, setName] = useState<string>((session?.user?.user_metadata?.full_name as string) ?? '');
  const [nameDirty, setNameDirty] = useState(false);
  const [hoyProy, setHoyProy] = useState(true);
  const [sound, setSound] = useState(soundEnabled());
  const [hiddenN, setHiddenN] = useState(0);
  const [notif, setNotif] = useState<Notif>(DEFAULT_NOTIF);
  const [push, setPush] = useState<PushStatus>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  const scroller = React.useRef<any>(null);
  const [mondayRitual, setMondayRitual] = useState(true);
  const [semester, setSemester] = useState(false);
  const { plan } = usePlan();
  const pv = planView(plan);
  const { mode, study } = useMode();
  const [urgentDays, setUrgentDays] = useState(DEFAULT_URGENT_DAYS);
  const [limit135, setLimit135] = useState(false);

  useFocusEffect(useCallback(() => {
    resetHoyHiddenCache();
    fetchPrefs().then((p) => {
      if (!p) return;
      if (p.hoyProyectos === false) setHoyProy(false);
      const ho = p.hoyOcultas ?? {};
      setHiddenN((Array.isArray(ho.tasks) ? ho.tasks.length : 0) + (Array.isArray(ho.projects) ? ho.projects.length : 0));
      setNotif({ ...DEFAULT_NOTIF, ...(p.notif ?? {}) });
      setUrgentDays(cleanUrgentDays(p.urgentDays));
      setLimit135(!!p.limit135);
    }).catch(() => {});
    getPushStatus().then(setPush).catch(() => {});
    getRitualPrefs().then((r) => setMondayRitual(r.monday)).catch(() => {});
  }, []));
  useEffect(() => onInstallChange(() => setCanInstall(canPromptInstall())), []);

  // Guarda la zona horaria del navegador para que los avisos lleguen a la hora local.
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== notif.tz) { const next = { ...notif, tz }; setNotif(next); savePrefs({ notif: next }).catch(() => {}); }
    } catch { /* noop */ }
  }, []);

  function saveNotif(patch: Partial<Notif>) {
    const next = { ...notif, ...patch };
    setNotif(next);
    savePrefs({ notif: next }).then(() => toast(t('Preferencia guardada'))).catch((e) => toast(friendlyError(e), { tone: 'bad' }));
  }
  async function saveName() {
    try {
      await supabase.auth.updateUser({ data: { full_name: name.trim() } });
      await updateMyProfile({ display_name: name.trim() }).catch(() => {});
      setNameDirty(false); toast(t('Nombre guardado'), { tone: 'good' });
    } catch (e) { notify(t('No se pudo guardar'), friendlyError(e)); }
  }
  async function togglePush() {
    setPushBusy(true);
    try {
      const st = push === 'on' ? await disablePush() : await enablePush();
      setPush(st);
      if (st === 'on') toast(t('Notificaciones activadas'), { tone: 'good' });
      if (st === 'denied') notify(t('Notificaciones bloqueadas'), t('Las bloqueaste en el navegador. Ábrelas desde el candado junto a la dirección del sitio y permite las notificaciones.'));
    } catch (e) { notify(t('No se pudieron activar'), friendlyError(e)); }
    finally { setPushBusy(false); }
  }
  async function exportData() {
    try {
      const data = await exportMyData();
      await saveFile(t('kaderno-mis-datos-{slice}.json', { slice: new Date().toISOString().slice(0, 10) }), JSON.stringify(data, null, 2), 'application/json');
    } catch (e) { notify(t('No se pudo exportar'), friendlyError(e)); }
  }
  async function logout() {
    if (!(await confirm(t('¿Cerrar sesión?'), t('Tus datos quedan guardados en tu cuenta.'), t('Cerrar sesión')))) return;
    flushPendingDeletes();
    try { await disablePushLocalOnly(); } catch { /* noop */ }
    await supabase.auth.signOut().catch(() => {});
    router.replace('/login');
  }

  const pushText: Record<PushStatus, string> = {
    on: t('Activadas en este dispositivo.'),
    off: t('Recibe recordatorios aunque Kaderno esté cerrado.'),
    denied: t('Bloqueadas en el navegador. Permítelas desde el candado de la barra de direcciones.'),
    'no-key': t('Falta configurar la llave de notificaciones en el servidor (ver RUNBOOK).'),
    'needs-install': t('En iPhone primero instala Kaderno en la pantalla de inicio (abajo).'),
    unsupported: Platform.OS === 'web' ? t('Este navegador no permite notificaciones.') : t('En el celular se usan los avisos del sistema.'),
  };

  const me = name.trim() || email.split('@')[0] || t('Tú');
  const parts = me.split(/[\s._-]+/).filter(Boolean);
  const initials = (parts.length >= 2 ? parts[0][0] + parts[1][0] : me.slice(0, 2)).toUpperCase();
  const hours = [5, 6, 7, 8, 9, 10, 12, 18, 20];

  return (
    <Screen title={t('Ajustes')} back="/" nav="ajustes" maxWidth={720}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar initials={initials} size={52} />
        <View style={{ flex: 1 }}>
          <Field value={name} onChangeText={(v) => { setName(v); setNameDirty(true); }} placeholder={t('Tu nombre')} label={t('Nombre')} style={{ marginBottom: 4 }}
            right={nameDirty ? <Button label={t('Guardar')} size="sm" onPress={saveName} style={{ marginRight: 4 }} /> : undefined} />
          <Text style={{ color: C.muted, fontSize: 13 }}>{email}</Text>
        </View>
      </Card>

      <SectionLabel text={t('Plan')} />
      <Card padded={false}>
        <ListRow title={t('Tu plan: {name}', { name: pv.name })} subtitle={pv.line} left={<Ionicons name={pv.badge === 'free' ? 'leaf-outline' : 'sparkles'} size={20} color={pv.badge === 'warn' ? C.badText : pv.badge === 'free' ? C.muted : C.brand} />}
          onPress={() => router.push('/plan' as any)} />
      </Card>

      <SectionLabel text={t('Para qué usas Kaderno')} />
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
          {MODES.map((m) => {
            const on = mode === m.key;
            return (
              <Pressable key={m.key} onPress={() => saveMode(m.key).then(() => toast(m.key === 'estudio' ? t('Modo Estudio') : m.key === 'trabajo' ? t('Modo Trabajo: materias pasan a ser áreas o clientes') : t('Los dos: cambia entre Estudio y Trabajo arriba de la barra'))).catch((e) => notify(t('No se pudo guardar'), friendlyError(e)))}
                accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${m.label}: ${m.hint}`}
                style={({ hovered }: any) => ({ flexGrow: 1, flexBasis: 150, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? C.brand : C.line, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
                <Ionicons name={m.icon as any} size={20} color={on ? C.brand : C.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{m.label}</Text>
                  <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={2}>{m.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: C.muted, fontSize: 12 }}>{t('Con Los dos, Kaderno tiene dos espacios: Estudio (materias, calificaciones, repaso) y Trabajo (áreas, proyectos, horas, cobros), cada uno con su tema. Se cambia arriba de la barra o con Alt+1 y Alt+2. No borra nada.')}</Text>
      </Card>

      {showLangPicker() && (
        <>
          <SectionLabel text={t('Idioma')} />
          <Card style={{ gap: 10 }}>
            <LangPicker />
            <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 17 }}>{t('Cambia los textos de la app, las fechas, los avisos y las respuestas de la IA. Lo que escribes no se traduce. La app se recarga.')}</Text>
          </Card>
        </>
      )}

      <SectionLabel text={t('Apariencia y organización')} />
      <Card padded={false}>
        <ListRow title={t('Tema, fondo y letra')} subtitle={t('Kaderno claro u oscuro, color de acento y más')} left={<Ionicons name="color-palette-outline" size={20} color={C.muted} />} onPress={() => router.push('/personalizar')} />
        <Divider />
        {study && <ListRow title={t('Historial y escala de notas')} subtitle={t('Tus semestres, el promedio acumulado y la escala de tu institución')} left={<Ionicons name="ribbon-outline" size={20} color={C.muted} />} onPress={() => router.push('/historial' as any)} />}
        {study && <Divider />}
        <ListRow title={t('Tipos de tarea')} subtitle={t('Laboratorio, exposición, lectura…')} left={<Ionicons name="pricetags-outline" size={20} color={C.muted} />} onPress={() => router.push('/tipos')} />
        <Divider />
        <Toggle label={t('Sonidos')} hint={t('Al completar tareas y pasos, mover tarjetas y borrar. Solo en este dispositivo.')} value={sound}
          onChange={(v) => { setSound(v); setSoundEnabled(v); }} />
        <Divider />
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{t('Urgente en la Matriz')}</Text>
          <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 17 }}>{t('En la vista Matriz de Hoy, cuenta como urgente lo vencido y lo que vence en estos días.')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }} accessibilityRole="radiogroup" accessibilityLabel={t('Días que cuentan como urgente')}>
            {URGENT_DAY_OPTIONS.map((n) => {
              const on = n === urgentDays;
              return (
                <Pressable key={n} onPress={() => { setUrgentDays(n); savePrefs({ urgentDays: n }).then(() => { dataChanged(); toast(t('Preferencia guardada')); }).catch((e) => toast(friendlyError(e), { tone: 'bad' })); }}
                  accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
                  <Text style={{ color: on ? C.onBrand : C.text, fontSize: 13, fontWeight: '700' }}>{n === 1 ? t('1 día') : t('{n} días', { n })}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Divider />
        <Toggle label={t('Regla 1-3-5 en Mi día')} hint={t('Avisa si un día tiene más de 1 tarea grande, 3 medianas o 5 pequeñas (por el tiempo estimado).')} value={limit135}
          onChange={(v) => { setLimit135(v); savePrefs({ limit135: v }).then(() => dataChanged()).catch((e) => toast(friendlyError(e), { tone: 'bad' })); }} />
        <Divider />
        <Toggle label={t('Tareas de proyectos en Hoy')} hint={t('También se cambia en Hoy con Todo, Materias o Proyectos.')} value={hoyProy}
          onChange={(v) => { setHoyProy(v); saveHoyVista(v ? 'todo' : 'materias').catch(() => {}); }} />
        {hiddenN > 0 && (
          <>
            <Divider />
            <ListRow title={t('{hiddenN} {v} en Hoy', { hiddenN, v: hiddenN === 1 ? t('oculta') : t('ocultas') })} subtitle={t('Tareas o proyectos que escondiste de Hoy. Siguen en sus tableros.')}
              left={<Ionicons name="eye-off-outline" size={20} color={C.muted} />} chevron={false}
              right={<Button label={t('Mostrar todo')} kind="secondary" size="sm" onPress={async () => { try { await clearHoyHidden(); setHiddenN(0); toast(t('Listo: vuelven a aparecer en Hoy')); } catch (e) { notify(t('No se pudo'), friendlyError(e)); } }} />} />
          </>
        )}
      </Card>

      <SectionLabel text={t('Estudio')} />
      <Card padded={false}>
        <StudySettings />
        <Divider />
        <Toggle label={t('Ritual del lunes')} hint={t('El lunes (o el domingo en la noche), "Planea tu semana" en Hoy: lo importante y cuándo lo haces.')} value={mondayRitual}
          onChange={(v) => { setMondayRitual(v); saveRitualPrefs({ monday: v }).then(() => toast(t('Preferencia guardada'))).catch((e) => toast(friendlyError(e), { tone: 'bad' })); }} />
        <Divider />
        <ListRow title={t('Empezar semestre')} subtitle={t('La nota que quieres en cada materia, tu meta semanal y una meta del semestre')} left={<Ionicons name="flag-outline" size={20} color={C.muted} />} onPress={() => setSemester(true)} />
      </Card>
      <SemesterRitual visible={semester} onClose={() => setSemester(false)} />

      <SectionLabel text={t('Mascota')} />
      <Card padded={false}>
        <ListRow title={t('Mascota y tienda')} subtitle={t('Elegir, vestir, adoptar y ver su nivel')} left={<Ionicons name="paw-outline" size={20} color={C.muted} />} onPress={() => router.push('/mascota')} />
        <Divider />
        <PetSettings />
      </Card>

      <SectionLabel text={t('Avisos')} />
      <Card padded={false} style={section === 'avisos' ? { borderColor: C.brand } : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
          <Ionicons name={push === 'on' ? 'notifications' : 'notifications-outline'} size={20} color={push === 'on' ? C.brand : C.muted} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{t('Notificaciones')}</Text>
            <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{pushText[push]}</Text>
          </View>
          {(push === 'on' || push === 'off') && <Button label={push === 'on' ? t('Desactivar') : t('Activar')} kind={push === 'on' ? 'secondary' : 'primary'} size="sm" busy={pushBusy} onPress={togglePush} />}
        </View>
        {push === 'on' && <><Divider /><ListRow title={t('Enviar aviso de prueba')} left={<Ionicons name="paper-plane-outline" size={20} color={C.muted} />} onPress={() => { testLocalNotification().then((ok) => { if (!ok) notify(t('No se pudo mostrar el aviso')); }); }} chevron={false} /></>}
        <Divider />
        <Toggle label={t('Resumen del día')} hint={t('Qué entregas tienes hoy, a la hora que elijas.')} value={notif.daily} onChange={(v) => saveNotif({ daily: v })} />
        {notif.daily && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingBottom: 12 }}>
            {hours.map((h) => {
              const on = notif.daily_hour === h;
              return (
                <Pressable key={h} onPress={() => saveNotif({ daily_hour: h })} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
                  <Text style={{ color: on ? C.onBrand : C.text, fontSize: 13, fontWeight: on ? '700' : '500' }}>{h <= 12 ? `${h}:00 ${h === 12 ? 'pm' : 'am'}` : `${h - 12}:00 pm`}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <Divider />
        <Toggle label={t('Resumen de la semana')} hint={t('El domingo a las 7 pm: lo que hiciste y lo que viene.')} value={notif.weekly} onChange={(v) => saveNotif({ weekly: v })} />
        <Divider />
        <Toggle label={t('Aviso del lunes')} hint={t('El lunes a las 8 am, si aún no has planeado la semana.')} value={!!notif.monday} onChange={(v) => saveNotif({ monday: v })} />
        <Divider />
        <Toggle label={t('Cerrar el día')} hint={t('Aviso para el cierre del día (1 minuto). En Hoy aparece desde esa hora.')} value={!!notif.close} onChange={(v) => saveNotif({ close: v })} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingBottom: 12 }}>
          {[18, 19, 20, 21, 22].map((h) => {
            const on = (notif.close_hour ?? 18) === h;
            return (
              <Pressable key={h} onPress={() => saveNotif({ close_hour: h })} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
                <Text style={{ color: on ? C.onBrand : C.text, fontSize: 13, fontWeight: on ? '700' : '500' }}>{t('{v}:00 pm', { v: h - 12 })}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={{ color: C.muted, fontSize: 12, paddingHorizontal: 14, paddingBottom: 12 }}>{t('Los recordatorios de cada tarea se eligen al crearla. Todos los avisos también quedan en la campana.{v}', { v: !hasV14() ? t(' Requiere actualizar la base de datos (schema_v14).') : '' })}</Text>
      </Card>

      <SectionLabel text={t('Conexión')} />
      <ConnectionTest />

      <SectionLabel text={t('Calendario')} />
      <CalendarCard />
      <View style={{ height: 10 }} />
      <ExternalCalendars />

      {Platform.OS === 'web' && !isStandalone() && (
        <>
          <SectionLabel text={t('Instalar')} />
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="phone-portrait-outline" size={22} color={C.brand} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{t('Kaderno como app')}</Text>
              <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>
                {isIOSWeb() ? t('En Safari toca Compartir y luego "Agregar a inicio".') : canInstall ? t('Ícono propio, pantalla completa y abre más rápido.') : t('En Chrome o Edge: menú, "Instalar Kaderno". En Android: "Agregar a la pantalla principal".')}
              </Text>
            </View>
            {canInstall && <Button label={t('Instalar')} size="sm" onPress={() => promptInstall()} />}
          </Card>
        </>
      )}

      <SectionLabel text={t('Datos')} />
      <Card padded={false}>
        <ListRow title={t('Importar cronograma')} subtitle={t('Todas las entregas del semestre: pega el cronograma o sube un archivo')} left={<Ionicons name="download-outline" size={20} color={C.muted} />} onPress={() => router.push('/importar')} />
        <Divider />
        <ListRow title={t('Papelera')} subtitle={t('Lo borrado se guarda 30 días')} left={<Ionicons name="trash-outline" size={20} color={C.muted} />} onPress={() => router.push('/papelera')} />
        <Divider />
        <ListRow title={t('Descargar mis datos')} subtitle={t('Un archivo JSON con todo lo tuyo')} left={<Ionicons name="cloud-download-outline" size={20} color={C.muted} />} onPress={exportData} chevron={false} />
        <Divider />
        <ListRow title={t('Cambiar contraseña')} left={<Ionicons name="key-outline" size={20} color={C.muted} />} onPress={() => setPwModal(true)} />
      </Card>

      {Platform.OS === 'web' && (
        <>
          <SectionLabel text={t('Atajos de teclado')} />
          <Card>
            {[['Ctrl K o /', t('Buscar o ir a cualquier pantalla')], ['N', t('Agregar una tarea')], [t('Espacio'), t('Voltear tarjeta en Repaso')], ['1 a 4', t('Responder en Repaso')], ['Esc', t('Cerrar ventanas')]].map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ color: C.text, fontSize: 13, fontWeight: '700', width: 110 }}>{k}</Text>
                <Text style={{ color: C.muted, fontSize: 13, flex: 1 }}>{v}</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      <Button label={t('Cerrar sesión')} icon="log-out-outline" kind="danger" onPress={logout} style={{ marginTop: 24 }} full />
      <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 12 }}>{t('Kaderno, versión 12')}</Text>

      <PasswordModal visible={pwModal} onClose={() => setPwModal(false)} />
    </Screen>
  );
}

async function disablePushLocalOnly() {
  // Al cerrar sesión se quita la suscripción de este navegador para que no le
  // lleguen avisos de la cuenta anterior a la siguiente persona.
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
}

function Divider() { return <View style={{ height: 1, backgroundColor: C.line, marginLeft: 14 }} />; }

function PasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setA(''); setB(''); setErr(null); } }, [visible]);
  async function save() {
    if (a.length < 6) { setErr(t('Usa al menos 6 caracteres.')); return; }
    if (a !== b) { setErr(t('Las contraseñas no coinciden.')); return; }
    setBusy(true);
    try { const { error } = await supabase.auth.updateUser({ password: a }); if (error) throw error; toast(t('Contraseña cambiada'), { tone: 'good' }); onClose(); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }} style={{ width: '100%', maxWidth: 420, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', flex: 1 }}>{t('Cambiar contraseña')}</Text>
            <IconButton icon="close" label={t('Cerrar')} onPress={onClose} />
          </View>
          <Field label={t('Nueva contraseña')} value={a} onChangeText={setA} secureTextEntry autoFocus />
          <Field label={t('Repítela')} value={b} onChangeText={setB} secureTextEntry error={err} onSubmitEditing={save} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Button label={t('Cancelar')} kind="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button label={t('Guardar')} onPress={save} busy={busy} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function AjustesProtegida() {
  return <RequireAuth><Ajustes /></RequireAuth>;
}
