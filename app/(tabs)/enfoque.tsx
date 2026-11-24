import { useCallback, useEffect, useState, useMemo } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ProgressRing } from '../../components/Ring';
import { C } from '../../lib/theme';
import { focusRingSize } from '../../lib/mobileLayout';
import { useResponsive } from '../../lib/responsive';
import { Subject, Task, FocusSession, getSubjects, getTasks, getFocusDetail } from '../../lib/db';
import { useFocusTimer, startFocus, pauseFocus, resetFocus, skipFocus, configureFocus, setFocusStyle, FLOW_CAP_MIN, type FocusStyle } from '../../lib/focusTimer';
import { toast } from '../../lib/feedback';
import { compareDue, fmtDue } from '../../lib/time';
import { Screen, Button, Card, SectionLabel, Dot, Toggle, StatValue } from '../../components/ds';
import { SubjectPicker } from '../../components/SubjectPicker';
import { ActionMenu } from '../../components/ActionMenu';
import { fmtMin } from '../../components/TaskRow';
import { SoundRow, MixerSheet } from '../../components/focus/AmbientControls';
import { BreakCoach, ParkButton, ParkedList, PomodoroSummary } from '../../components/focus/FocusParts';
import { unlockAmbient } from '../../lib/ambient';
import { RoomsCard } from '../../components/focus/RoomsCard';
import { useStudyStreak, StreakMini } from '../../components/streaks/Streak';
import { weeksLabel } from '../../lib/streaks';
import { useMode } from '../../lib/mode';
import { getProjects, type Project } from '../../lib/projects';
import { useSpaceFilter } from '../../lib/useSpace';
import { t, trn, dateLocale } from '../../lib/i18n';

// ============================================================
//  Enfoque (Pomodoro).
//  El reloj vive en lib/focusTimer.ts: no se atrasa con la pestaña en
//  segundo plano, sigue corriendo al cambiar de pantalla y suena al
//  terminar. Se puede elegir una tarea para sumarle el tiempo.
//
//  v20: sonido de fondo con mezclador (lib/ambient.ts), pausa guiada en
//  el descanso y "Anotar para después" (tecla D) durante el enfoque.
// ============================================================

const RAD = 100;
const CIRC = 2 * Math.PI * RAD;

export default function Enfoque() {
  const { isWide, height: winH, width: winW } = useResponsive();
  // v29: en celulares bajos (SE) el reloj se achica para que "Empezar" quede a la vista.
  const ring = isWide ? 228 : focusRingSize(winW, winH);
  const f = useFocusTimer();
  const s = f.state;
  const [allSubjects, setSubjects] = useState<Subject[]>([]);
  // v26: con "Los dos", solo las materias o áreas del espacio abierto.
  const sp = useSpaceFilter();
  const subjects = useMemo(() => sp.subjects(allSubjects), [allSubjects, sp.space, sp.both]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [detail, setDetail] = useState<{ todayMin: number; weekMin: number; streak: number; byDay: { label: string; min: number }[]; recent: FocusSession[] }>({ todayMin: 0, weekMin: 0, streak: 0, byDay: [], recent: [] });
  const [pickTask, setPickTask] = useState(false);
  const [pickProject, setPickProject] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const { v: mv, work } = useMode();
  useEffect(() => { if (work) getProjects().then(setProjects).catch(() => {}); }, [work]);
  const [mixer, setMixer] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const streak = useStudyStreak();
  const router = useRouter();

  const load = useCallback(() => {
    getSubjects().then(setSubjects).catch(() => {});
    getTasks().then((t) => setTasks(t.filter((x) => x.status !== 'done').sort(compareDue))).catch(() => {});
    getFocusDetail().then(setDetail).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); setOnScreen(true); return () => setOnScreen(false); }, [load]));
  // Al cerrar un pomodoro, refresca las cifras (el guardado tarda un instante).
  const lastAt = s.last?.at ?? 0;
  useEffect(() => {
    if (!lastAt) return;
    const t = setTimeout(() => getFocusDetail().then(setDetail).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [lastAt]);

  // Desde el aviso del plan: /enfoque?tarea=<id> deja elegida esa tarea.
  const params = useLocalSearchParams<{ tarea?: string }>();
  useEffect(() => {
    const id = params.tarea;
    if (!id || s.running) return;
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    configureFocus({ taskId: t.id, taskTitle: t.title, subjectId: t.subject_id });
    router.setParams({ tarea: undefined } as any);
  }, [params.tarea, tasks]);

  const subjName = (sid: string | null) => subjects.find((x) => x.id === sid)?.name ?? t('Sin materia');
  const subjColor = (sid: string | null) => subjects.find((x) => x.id === sid)?.color ?? C.muted;
  const started = s.running || f.remaining < f.total;
  const modeColor = s.mode === 'work' ? C.brand : C.good;

  const style: FocusStyle = s.style ?? 'pomodoro';
  const STYLES: { k: FocusStyle; label: string; hint: string }[] = [
    { k: 'pomodoro', label: t('Pomodoro'), hint: t('Bloques cortos con pausa; pausa larga cada 4.') },
    { k: '52-17', label: '52/17', hint: t('52 minutos de trabajo y 17 de pausa.') },
    { k: 'flujo', label: t('Flujo'), hint: t('Cuenta hacia arriba hasta que pares (máximo {FLOW_CAP_MIN} min). La pausa es un quinto de lo trabajado.', { FLOW_CAP_MIN }) },
  ];
  const styleSwitch = (
    <View style={{ width: '100%', gap: 6 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('Forma de enfocarte')} style={{ flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line }}>
        {STYLES.map((it) => {
          const on = it.k === style;
          return (
            <Pressable key={it.k} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: started && !on }}
              onPress={() => { if (!setFocusStyle(it.k)) toast(t('Termina o reinicia el bloque en curso para cambiar la forma de enfocarte.')); }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9, backgroundColor: on ? C.surface : 'transparent', borderWidth: 1, borderColor: on ? C.line : 'transparent', opacity: started && !on ? 0.5 : 1 }}>
              <Text style={{ color: on ? C.text : C.muted, fontSize: 13, fontWeight: on ? '700' : '600' }}>{it.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>{STYLES.find((x) => x.k === style)!.hint}</Text>
    </View>
  );
  const timer = (
    <Card style={{ alignItems: 'center', gap: 16, paddingVertical: 24, width: isWide ? 420 : '100%' }}>
      {styleSwitch}
      {style === 'pomodoro' && <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={t('Pomodoro {v} de 4', { v: s.cycle + 1 })}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i < s.cycle ? C.brand : C.surface2, borderWidth: 1, borderColor: i < s.cycle ? C.brand : C.line }} />
        ))}
      </View>}
      <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="timer" accessibilityLabel={`${s.mode === 'work' ? t('Enfoque') : t('Descanso')}, ${f.countsUp ? trn('llevas {v}', { v: f.label }) : trn('quedan {v}', { v: f.label })}`}>
        <ProgressRing size={ring} stroke={ring < 200 ? 12 : 14} inset={ring < 200 ? 6 : 7} frac={f.frac} color={modeColor} color2={s.mode === 'work' ? C.brand2 : C.good} track={C.surface2} />
        <Text style={{ color: C.text, fontSize: Math.round(ring * 0.2), fontWeight: '800', fontVariant: ['tabular-nums'] }}>{f.label}</Text>
        <Text style={{ color: s.mode === 'work' ? C.muted : C.goodText, marginTop: 2, fontSize: 14, fontWeight: '600' }}>{s.mode === 'work' ? (f.countsUp ? t('En flujo') : t('Enfoque')) : style === 'pomodoro' && s.cycle === 0 ? t('Descanso largo') : t('Descanso')}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
        <Button label={s.running ? t('Pausar') : started ? t('Seguir') : t('Empezar')} icon={s.running ? 'pause' : 'play'} size="lg"
          onPress={() => { if (s.running) pauseFocus(); else { unlockAmbient(); startFocus(); } }} style={{ flex: winW < 380 ? 1.4 : 2 }} />
        <Button label={t('Reiniciar')} kind="secondary" size="lg" onPress={resetFocus} disabled={!started} style={{ flex: 1 }} />
      </View>
      {started && <Button label={s.mode === 'work' ? t('Terminar y descansar') : t('Saltar descanso')} kind={f.countsUp ? 'secondary' : 'ghost'} size="sm" onPress={skipFocus} />}

      {s.mode === 'break' && s.running ? <BreakCoach s={s} /> : <ParkButton s={s} active={onScreen} />}
      <SoundRow running={s.running} onMix={() => setMixer(true)} />

      <View style={{ width: '100%', gap: 10 }}>
        <View>
          <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>{t('¿En qué vas a trabajar?')}</Text>
          <Pressable onPress={() => setPickTask(true)} accessibilityRole="button" accessibilityLabel={t('Elegir tarea')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 44 }}>
            <Ionicons name="checkbox-outline" size={18} color={C.muted} />
            <Text style={{ color: s.taskTitle ? C.text : C.muted, flex: 1 }} numberOfLines={1}>{s.taskTitle ?? t('Elegir una tarea (opcional)')}</Text>
            {s.taskId ? (
              <Pressable onPress={() => configureFocus({ taskId: null, taskTitle: null })} accessibilityLabel={t('Quitar tarea')} hitSlop={8}><Ionicons name="close-circle" size={18} color={C.muted} /></Pressable>
            ) : <Ionicons name="chevron-down" size={18} color={C.muted} />}
          </Pressable>
        </View>
        {!s.taskId && <SubjectPicker subjects={subjects} value={s.subjectId} onChange={(v) => configureFocus({ subjectId: v })} placeholder={t('Sin {subjectLower}', { subjectLower: mv.subjectLower })} />}
        {(work || s.projectId) && (
          <Pressable onPress={() => setPickProject(true)} accessibilityRole="button" accessibilityLabel={t('Elegir proyecto para el registro de horas')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 44 }}>
            <Ionicons name="briefcase-outline" size={18} color={C.muted} />
            <Text style={{ color: s.projectTitle ? C.text : C.muted, flex: 1 }} numberOfLines={1}>{s.projectTitle ?? t('Contar para un proyecto (opcional)')}</Text>
            {s.projectId ? (
              <Pressable onPress={() => configureFocus({ projectId: null, projectTitle: null })} accessibilityLabel={t('Quitar proyecto')} hitSlop={8}><Ionicons name="close-circle" size={18} color={C.muted} /></Pressable>
            ) : <Ionicons name="chevron-down" size={18} color={C.muted} />}
          </Pressable>
        )}
      </View>

      {style === 'pomodoro' && <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
        <NumField label={t('Enfoque')} value={s.workMin} onChange={(n) => configureFocus({ workMin: n })} />
        <NumField label={t('Descanso')} value={s.breakMin} onChange={(n) => configureFocus({ breakMin: n })} />
        <NumField label={t('Desc. largo')} value={s.longBreakMin} onChange={(n) => configureFocus({ longBreakMin: n })} />
      </View>}
      <View style={{ width: '100%', borderTopWidth: 1, borderTopColor: C.line, marginTop: 4 }}>
        <Toggle label={t('Sonido al terminar')} value={s.sound} onChange={(v) => configureFocus({ sound: v })} />
      </View>
      {Platform.OS === 'web' && typeof Notification !== 'undefined' && Notification.permission === 'default' && (
        <Button label={t('Avisarme aunque esté en otra pestaña')} kind="ghost" size="sm" icon="notifications-outline" onPress={() => Notification.requestPermission()} />
      )}
    </Card>
  );

  const maxMin = Math.max(30, ...detail.byDay.map((d) => d.min));
  const stats = (
    <View style={{ flex: 1, minWidth: 0, gap: 14, width: isWide ? undefined : '100%' }}>
      <PomodoroSummary s={s} todayMin={detail.todayMin} />
      {(s.mode === 'break' || !s.running) && <ParkedList parked={s.parked ?? []} />}
      <RoomsCard />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label={t('Hoy')} value={fmtMin(detail.todayMin).replace(' min', 'm').replace(' h ', 'h ')} />
        <Stat label={t('7 días')} value={fmtMin(detail.weekMin).replace(' min', 'm').replace(' h ', 'h ')} />
        {streak.s
          ? <Stat label={t('Racha semanal')} value={weeksLabel(streak.s.weekly)} tone={streak.s.weekly ? C.goodText : undefined} />
          : <Stat label={t('Racha')} value={`${detail.streak} ${detail.streak === 1 ? t('día') : t('días')}`} tone={detail.streak ? C.goodText : undefined} />}
      </View>
      {streak.s && <Card><StreakMini s={streak.s} onPress={() => router.push('/estudiar')} /></Card>}
      <Card>
        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700', marginBottom: 12 }}>{t('Últimos 7 días')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 110 }}>
          {detail.byDay.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }} accessibilityLabel={t('{label}: {min} minutos', { label: d.label, min: d.min })}>
              {d.min > 0 && <Text style={{ fontSize: 10.5, color: C.muted }}>{d.min}</Text>}
              <View style={{ width: '60%', height: `${Math.max(3, (d.min / maxMin) * 85)}%`, backgroundColor: d.label === 'Hoy' ? C.brand : C.line, borderRadius: 6 }} />
              <Text style={{ fontSize: 11, color: C.muted }}>{d.label}</Text>
            </View>
          ))}
        </View>
      </Card>
      <Card>
        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700', marginBottom: 6 }}>{t('Sesiones recientes')}</Text>
        {detail.recent.length === 0 ? <Text style={{ color: C.muted, fontSize: 13 }}>{t('Aún no hay sesiones. Tu primer pomodoro aparecerá aquí.')}</Text> : detail.recent.map((sess) => (
          <View key={sess.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.surface2 }}>
            <Dot color={subjColor(sess.subject_id)} />
            <Text style={{ flex: 1, color: C.text, fontSize: 13.5 }} numberOfLines={1}>
              {sess.assignment_id ? (tasks.find((t) => t.id === sess.assignment_id)?.title ?? subjName(sess.subject_id)) : subjName(sess.subject_id)}
            </Text>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('{minutes} min · {toLocaleDateString}', { minutes: sess.minutes, toLocaleDateString: new Date(sess.created_at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) })}</Text>
          </View>
        ))}
      </Card>
    </View>
  );

  return (
    <Screen title={t('Enfoque')} subtitle={t('Trabaja en bloques con pausas: Pomodoro, 52/17 o en flujo')} maxWidth={1100} back={isWide ? undefined : '/estudiar'}>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        {timer}
        {stats}
      </View>
      <MixerSheet visible={mixer} onClose={() => setMixer(false)} running={s.running} />
      <ActionMenu visible={pickProject} title={t('Contar el tiempo para')} onClose={() => setPickProject(false)}
        actions={[...projects.slice(0, 15).map((p) => ({
          label: p.name, icon: 'briefcase-outline' as const, hint: t('Suma al registro de horas'),
          onPress: () => configureFocus({ projectId: p.id, projectTitle: `${p.icon ? p.icon + ' ' : ''}${p.name}` }),
        })), { label: t('Ver registro de horas'), icon: 'time-outline' as const, onPress: () => router.push('/horas' as any) }]} />
      <ActionMenu visible={pickTask} title={t('Elegir tarea')} onClose={() => setPickTask(false)}
        actions={tasks.slice(0, 12).map((t) => ({
          label: t.title, icon: 'ellipse-outline', hint: fmtDue(t),
          onPress: () => configureFocus({ taskId: t.id, taskTitle: t.title, subjectId: t.subject_id }),
        }))} />
    </Screen>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const [txt, setTxt] = useState(String(value));
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>{t('{label} (min)', { label })}</Text>
      <TextInput keyboardType="number-pad" value={txt} accessibilityLabel={t('{label} en minutos', { label })}
        onChangeText={(v) => { const clean = v.replace(/\D/g, '').slice(0, 3); setTxt(clean); const n = parseInt(clean || '0', 10); if (n >= 1 && n <= 180) onChange(n); }}
        onBlur={() => setTxt(String(value))}
        style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 11, fontSize: 15, minHeight: 44 }} />
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 14 }}>
      <Text style={{ color: C.muted, fontSize: 12 }}>{label}</Text>
      <StatValue value={value} color={tone ?? C.text} size={20} style={{ marginTop: 4 }} />
    </View>
  );
}
