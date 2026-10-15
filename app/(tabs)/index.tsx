import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import {
  Subject, Task, Step, Slot, getSubjects, getTasks, getStepsFor, toggleTask, deleteTask, moveTaskDate,
  getSchedule, countDueFlashcards, fetchPrefs, getFocusDetail, getFocusByTask, hasV14,
} from '../../lib/db';
import { getMyProjectTasks, type MyProjectTask } from '../../lib/projects';
import { SCHEDULE } from '../../lib/schedule';
import {
  BUCKET_LABEL, BUCKET_ORDER, Bucket, bucketOf, compareDue, fmtLongDate, capitalize, isoDate, addDays,
  startOfDay, fmtDue, dueDay, dayDiff, DAY_SHORT,
} from '../../lib/time';
import { buildAgenda, nowAndNext, minToLabel, type AgendaItem } from '../../lib/agenda';
import { deleteWithUndo, toast, friendlyError } from '../../lib/feedback';
import { openAdd, openCommand, openInbox, openTask, onDataChanged } from '../../lib/uiBus';
import { refreshNavCounts, useNavCounts } from '../../lib/navCounts';
import { useFocusTimer, startFocus, pauseFocus } from '../../lib/focusTimer';
import { useAuth } from '../../lib/auth';
import { Screen, Button, Card, EmptyState, ErrorState, FilterChip, IconButton, SectionLabel, Skeleton, Dot } from '../../components/ds';
import { TaskRow } from '../../components/TaskRow';
import { MiniCalendar } from '../../components/MiniCalendar';
import { Avatar } from '../../components/SideNav';
import type { MenuAction } from '../../components/ActionMenu';

// ============================================================
//  Hoy.
//  Lo primero que se ve es lo que hay que hacer: una línea de resumen,
//  la clase de ahora, la semana como filtro y las tareas agrupadas por
//  cuándo vencen (las de proyectos incluidas). En computador, a la
//  derecha, la agenda del día, el repaso y el enfoque.
//  Un solo componente para celular y computador.
// ============================================================

type Row = { kind: 'task'; t: Task } | { kind: 'project'; p: MyProjectTask };

export default function Hoy() {
  const router = useRouter();
  const { isWide, width } = useResponsive();
  const { session } = useAuth();
  const counts = useNavCounts();
  const focus = useFocusTimer();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [steps, setSteps] = useState<Record<string, Step[]>>({});
  const [ptasks, setPtasks] = useState<MyProjectTask[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [repaso, setRepaso] = useState(0);
  const [focusToday, setFocusToday] = useState<{ todayMin: number; streak: number }>({ todayMin: 0, streak: 0 });
  const [focusBy, setFocusBy] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const [s, t, sc, prefs] = await Promise.all([getSubjects(), getTasks(), getSchedule().catch(() => [] as Slot[]), fetchPrefs().catch(() => null)]);
      setSubjects(s); setTasks(t); setSlots(sc); setError(null);
      const pending = t.filter((x) => x.status !== 'done').map((x) => x.id);
      getStepsFor(pending).then(setSteps).catch(() => {});
      getFocusByTask(pending).then(setFocusBy).catch(() => {});
      if ((prefs as any)?.hoyProyectos !== false) getMyProjectTasks().then(setPtasks).catch(() => setPtasks([]));
      else setPtasks([]);
      countDueFlashcards().then(setRepaso).catch(() => {});
      getFocusDetail().then((d) => setFocusToday({ todayMin: d.todayMin, streak: d.streak })).catch(() => {});
      refreshNavCounts(true);
    } catch (e) { setError(friendlyError(e)); if (!tasks) setTasks([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); setNow(new Date()); }, [load]));
  useEffect(() => onDataChanged(load), [load]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);

  // Atajo del ícono instalado: "Agregar tarea".
  const params = useLocalSearchParams<{ agregar?: string }>();
  useEffect(() => { if (params.agregar === '1') { openAdd(); router.setParams({ agregar: undefined } as any); } }, [params.agregar]);

  // Primera vez: bienvenida en tres pasos.
  useEffect(() => {
    AsyncStorage.getItem('onboarded').then((v) => { if (!v) router.push('/bienvenida'); }).catch(() => {});
  }, []);

  const subjOf = (id: string | null | undefined) => subjects.find((s) => s.id === id) ?? null;

  // ---------- Acciones ----------
  async function toggle(t: Task) {
    const done = t.status !== 'done';
    setTasks((xs) => xs?.map((x) => x.id === t.id ? { ...x, status: done ? 'done' : 'pending', completed_at: done ? new Date().toISOString() : null } : x) ?? null);
    try {
      await toggleTask(t.id, done);
      refreshNavCounts(true);
      if (done) toast(`Hecha: ${t.title}`, { tone: 'good', actionLabel: 'Deshacer', onAction: () => toggle({ ...t, status: 'done' }) });
    } catch (e) {
      setTasks((xs) => xs?.map((x) => x.id === t.id ? t : x) ?? null);
      toast(friendlyError(e), { tone: 'bad' });
    }
  }
  function remove(t: Task) {
    deleteWithUndo({
      message: hasV14() ? 'Tarea enviada a la papelera' : 'Tarea borrada',
      hide: () => setHidden((h) => new Set(h).add(t.id)),
      restore: () => setHidden((h) => { const n = new Set(h); n.delete(t.id); return n; }),
      commit: async () => { await deleteTask(t.id); refreshNavCounts(true); },
    });
  }
  async function move(t: Task, iso: string | null, label: string) {
    try { await moveTaskDate(t, iso); toast(`Movida a ${label}`); load(); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  }
  const actionsFor = (t: Task): MenuAction[] => {
    const today = startOfDay(new Date());
    const list: MenuAction[] = [
      { label: 'Abrir y editar', icon: 'create-outline', onPress: () => openTask(t) },
      { label: 'Enfocarme en esta tarea', icon: 'timer-outline', onPress: () => { startFocus({ taskId: t.id, taskTitle: t.title, subjectId: t.subject_id }); router.push('/enfoque'); } },
      { label: 'Mover a hoy', icon: 'today-outline', onPress: () => move(t, isoDate(today), 'hoy') },
      { label: 'Mover a mañana', icon: 'arrow-forward-outline', onPress: () => move(t, isoDate(addDays(today, 1)), 'mañana') },
      { label: 'Mover a la próxima semana', icon: 'play-skip-forward-outline', onPress: () => move(t, isoDate(addDays(today, 7 - ((today.getDay() + 6) % 7))), 'el lunes') },
      { label: t.status === 'done' ? 'Marcar pendiente' : 'Marcar hecha', icon: 'checkmark-circle-outline', onPress: () => toggle(t) },
      { label: 'Borrar', icon: 'trash-outline', danger: true, onPress: () => remove(t) },
    ];
    return list;
  };

  // ---------- Datos derivados ----------
  const live = (tasks ?? []).filter((t) => !hidden.has(t.id) && (!t.subject_id || !subjects.length || subjects.some((s) => s.id === t.subject_id)));
  const pending = live.filter((t) => t.status !== 'done');
  const visibleTasks = pending.filter((t) => !filter || t.subject_id === filter)
    .filter((t) => !day || (dueDay(t) && isoDate(dueDay(t)!) === day));
  const visibleProj = ptasks.filter((p) => !filter || p.project?.id === filter || false)
    .filter((p) => !day || (dueDay(p) && isoDate(dueDay(p)!) === day));

  const groups = useMemo(() => {
    const map = new Map<Bucket, Row[]>();
    visibleTasks.forEach((t) => { const b = bucketOf(t, now); (map.get(b) ?? map.set(b, []).get(b)!).push({ kind: 'task', t }); });
    if (!filter) visibleProj.forEach((p) => { const b = bucketOf(p, now); (map.get(b) ?? map.set(b, []).get(b)!).push({ kind: 'project', p }); });
    const key = (r: Row) => r.kind === 'task' ? r.t : r.p;
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ b, rows: map.get(b)!.sort((x, y) => compareDue(key(x), key(y))) }));
  }, [visibleTasks, visibleProj, filter, now]);

  const doneRecent = live.filter((t) => t.status === 'done' && (!t.completed_at || dayDiff(new Date(), new Date(t.completed_at)) <= 7))
    .filter((t) => !filter || t.subject_id === filter);
  const todayCount = pending.filter((t) => bucketOf(t, now) === 'today').length + ptasks.filter((p) => bucketOf(p, now) === 'today').length;
  const overdueCount = pending.filter((t) => bucketOf(t, now) === 'overdue').length + ptasks.filter((p) => bucketOf(p, now) === 'overdue').length;
  const nextExam = pending.filter((t) => (t.type === 'examen' || t.type === 'quiz') && dueDay(t) && dayDiff(dueDay(t)!, now) >= 0).sort(compareDue)[0];
  const blocks = SCHEDULE.blocks;
  const { now: classNow, next: classNext } = nowAndNext(now, slots, blocks, subjects);
  const agenda = buildAgenda(day ? new Date(day + 'T12:00:00') : now, slots, blocks, subjects, [
    ...pending,
    ...ptasks.map((p) => ({ ...p, kind: 'project' as const, color: p.project?.color, project: p.project?.name, subject_id: null, status: p.done ? 'done' : 'pending' })),
  ]);

  const summary: React.ReactNode[] = [];
  summary.push(<Text key="t" style={{ color: C.text, fontWeight: '700' }}>{todayCount === 0 ? 'Nada para hoy' : todayCount === 1 ? '1 para hoy' : `${todayCount} para hoy`}</Text>);
  if (overdueCount) summary.push(<Text key="o" style={{ color: C.badText, fontWeight: '600' }}>{overdueCount === 1 ? '1 vencida' : `${overdueCount} vencidas`}</Text>);
  if (nextExam) {
    const dd = dayDiff(dueDay(nextExam)!, now);
    summary.push(<Text key="e">{`${nextExam.title.length > 32 ? nextExam.title.slice(0, 30) + '…' : nextExam.title} ${dd === 0 ? 'hoy' : dd === 1 ? 'mañana' : `en ${dd} días`}`}</Text>);
  }

  const me = (() => {
    const email = session?.user?.email ?? '';
    const name = (session?.user?.user_metadata?.full_name as string | undefined)?.trim() || email.split('@')[0] || '';
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    return { first: parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : '', initials: (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase() };
  })();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  const headerRight = isWide ? (
    <Button label="Nueva tarea" icon="add" onPress={() => openTask()} />
  ) : (
    <>
      <IconButton icon="search" label="Buscar" onPress={openCommand} color={C.text} />
      <IconButton icon={counts.unread ? 'notifications' : 'notifications-outline'} label="Avisos" onPress={openInbox} color={counts.unread ? C.brand : C.text} badge={counts.unread} />
      <Pressable onPress={() => router.push('/ajustes')} accessibilityRole="button" accessibilityLabel="Ajustes y cuenta" style={{ padding: 4 }}>
        <Avatar initials={me.initials || 'K'} size={32} />
      </Pressable>
    </>
  );

  // ---------- Piezas ----------
  const summaryLine = (
    <Text style={{ color: C.muted, fontSize: 14, marginTop: -4, marginBottom: 14, lineHeight: 20 }}>
      {summary.map((n, i) => <React.Fragment key={i}>{i > 0 ? '  ·  ' : ''}{n}</React.Fragment>)}
    </Text>
  );

  const focusCard = focus.state.running || focus.remaining < focus.total ? (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: focus.state.mode === 'work' ? C.brand : C.good }}>
      <Ionicons name="timer-outline" size={22} color={focus.state.mode === 'work' ? C.brand : C.goodText} />
      <Pressable style={{ flex: 1 }} onPress={() => router.push('/enfoque')} accessibilityRole="button" accessibilityLabel="Abrir enfoque">
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{focus.state.mode === 'work' ? 'Enfocado' : 'Descanso'}{focus.state.running ? '' : ' · en pausa'}</Text>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{focus.label}</Text>
        {!!focus.state.taskTitle && <Text style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={1}>{focus.state.taskTitle}</Text>}
      </Pressable>
      <Button label={focus.state.running ? 'Pausar' : 'Seguir'} kind="secondary" size="sm" icon={focus.state.running ? 'pause' : 'play'}
        onPress={() => focus.state.running ? pauseFocus() : startFocus()} />
    </Card>
  ) : null;

  const nowCard = !focusCard && (classNow || classNext) ? (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: (classNow ?? classNext)!.color }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {classNow ? `Ahora · hasta ${minToLabel(classNow.end!)}` : `Siguiente clase · ${minToLabel(classNext!.start)}`}
        </Text>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', marginTop: 2 }}>{(classNow ?? classNext)!.title}</Text>
        {classNow && classNext && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>Después: {classNext.title}, {minToLabel(classNext.start)}</Text>}
      </View>
      <Button label="Enfocar" kind="secondary" size="sm" icon="timer-outline" onPress={() => { startFocus({ subjectId: (classNow ?? classNext)!.subjectId ?? null }); router.push('/enfoque'); }} />
    </Card>
  ) : null;

  const week = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} contentContainerStyle={{ gap: 6, flexGrow: 1 }}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(startOfDay(now), i);
        const iso = isoDate(d);
        const n = pending.filter((t) => dueDay(t) && isoDate(dueDay(t)!) === iso).length + ptasks.filter((p) => dueDay(p) && isoDate(dueDay(p)!) === iso).length;
        const on = day === iso;
        return (
          <Pressable key={iso} onPress={() => setDay(on ? null : iso)} accessibilityRole="button" accessibilityState={{ selected: on }}
            accessibilityLabel={`${i === 0 ? 'Hoy' : DAY_SHORT[d.getDay()]} ${d.getDate()}, ${n} ${n === 1 ? 'entrega' : 'entregas'}`}
            style={{ flex: 1, minWidth: isWide ? 64 : 44, alignItems: 'center', paddingVertical: 7, borderRadius: 12, backgroundColor: on ? C.brand : i === 0 ? C.surface : 'transparent', borderWidth: 1, borderColor: on ? C.brand : i === 0 ? C.line : 'transparent' }}>
            <Text style={{ color: on ? C.onBrand : C.muted, fontSize: 11.5, fontWeight: '600' }}>{i === 0 ? 'Hoy' : capitalize(DAY_SHORT[d.getDay()])}</Text>
            <Text style={{ color: on ? C.onBrand : C.text, fontSize: 16, fontWeight: '800', marginTop: 1 }}>{d.getDate()}</Text>
            <View style={{ flexDirection: 'row', gap: 2, height: 6, marginTop: 3 }}>
              {Array.from({ length: Math.min(3, n) }, (_, k) => <View key={k} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: on ? C.onBrand : C.brand }} />)}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const filters = subjects.length > 1 ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 2 }}>
      <FilterChip label="Todas" active={!filter} onPress={() => setFilter(null)} />
      {subjects.map((s) => (
        <FilterChip key={s.id} label={s.name} color={s.color} active={filter === s.id} onPress={() => setFilter(filter === s.id ? null : s.id)} />
      ))}
    </ScrollView>
  ) : null;

  const repasoCard = repaso > 0 ? (
    <Card onPress={() => router.push('/repaso')} accessibilityLabel={`Repasar ${repaso} tarjetas`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: isWide ? 0 : 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.brand2 + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="albums-outline" size={18} color={C.brand2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontWeight: '700' }}>Repaso pendiente</Text>
        <Text style={{ color: C.muted, fontSize: 12.5 }}>{repaso} {repaso === 1 ? 'tarjeta' : 'tarjetas'}, unos {Math.max(1, Math.round(repaso * 0.4))} min</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Card>
  ) : null;

  const renderRow = (r: Row) => r.kind === 'task' ? (
    <TaskRow key={r.t.id} task={r.t} subject={subjOf(r.t.subject_id)} steps={steps[r.t.id]} focusMin={focusBy[r.t.id]}
      onToggle={toggle} onOpen={(t) => openTask(t)} actions={actionsFor(r.t)}
      onStepsChange={(id, next) => setSteps((s) => ({ ...s, [id]: next }))} />
  ) : (
    <ProjectRow key={'p' + r.p.id} p={r.p} onOpen={() => router.push(`/proyectos/${r.p.project_id}`)} />
  );

  const list = tasks === null ? (
    <View style={{ marginTop: 12 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} />)}</View>
  ) : error && !tasks.length ? (
    <ErrorState message={error} onRetry={load} />
  ) : subjects.length === 0 && live.length === 0 ? (
    <EmptyState icon="school-outline" title="Empecemos por tus materias"
      text="Crea las materias del semestre y luego anota tus entregas. También puedes importarlas del sílabo."
      action={{ label: 'Crear materias', icon: 'add', onPress: () => router.push('/bienvenida') }} />
  ) : groups.length === 0 ? (
    <EmptyState icon="checkmark-done-outline" title={day ? 'Nada para ese día' : filter ? 'Nada pendiente en esta materia' : 'Todo al día'}
      text={day || filter ? 'Toca de nuevo el filtro para ver todo.' : 'No tienes entregas pendientes. Agrega la próxima cuando te la pongan.'}
      action={{ label: 'Agregar tarea', icon: 'add', onPress: openAdd }} compact />
  ) : (
    groups.map(({ b, rows }) => (
      <View key={b}>
        <SectionLabel text={BUCKET_LABEL[b]} count={rows.length} tone={b === 'overdue' ? C.bad : undefined} />
        {rows.map(renderRow)}
      </View>
    ))
  );

  const doneBlock = doneRecent.length > 0 && !day ? (
    <View style={{ marginTop: 8 }}>
      <Pressable onPress={() => setShowDone((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showDone }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, marginBottom: 8, minHeight: 48 }}>
        <Text style={{ color: C.muted, fontSize: 13.5 }}>{doneRecent.length} {doneRecent.length === 1 ? 'completada' : 'completadas'} esta semana</Text>
        <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </Pressable>
      {showDone && doneRecent.map((t) => (
        <TaskRow key={t.id} task={t} subject={subjOf(t.subject_id)} onToggle={toggle} onOpen={(x) => openTask(x)} actions={actionsFor(t)} compact />
      ))}
    </View>
  ) : null;

  const agendaCard = (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 14.5, flex: 1 }}>{day ? `Agenda del ${capitalize(fmtLongDate(new Date(day + 'T12:00:00')))}` : 'Agenda de hoy'}</Text>
        <Pressable onPress={() => router.push('/horario')} accessibilityRole="link"><Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>Horario</Text></Pressable>
      </View>
      {agenda.timed.length === 0 && agenda.allDay.length === 0 ? (
        <Text style={{ color: C.muted, fontSize: 13 }}>Sin clases ni entregas con hora. {slots.length === 0 ? 'Carga tu horario para verlas aquí.' : ''}</Text>
      ) : (
        <>
          {agenda.timed.map((it, i) => <AgendaRow key={i} it={it} now={now} isToday={!day || day === isoDate(now)} />)}
          {agenda.allDay.length > 0 && (
            <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 6 }}>Durante el día: {agenda.allDay.map((t) => t.title).join(', ')}</Text>
          )}
        </>
      )}
    </Card>
  );

  const focusMini = (
    <Card>
      <Text style={{ color: C.text, fontWeight: '700', fontSize: 14.5 }}>Enfoque</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>{focusToday.todayMin >= 60 ? `${Math.floor(focusToday.todayMin / 60)} h ${focusToday.todayMin % 60} min` : `${focusToday.todayMin} min`}</Text>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>hoy{focusToday.streak > 0 ? ` · racha de ${focusToday.streak} ${focusToday.streak === 1 ? 'día' : 'días'}` : ''}</Text>
        </View>
        <Button label="Empezar" kind="secondary" size="sm" icon="play" onPress={() => { startFocus(); router.push('/enfoque'); }} />
      </View>
    </Card>
  );

  const left = (
    <>
      {summaryLine}
      {!isWide && (focusCard ?? nowCard)}
      {week}
      {filters}
      {list}
      {doneBlock}
      {!isWide && repasoCard}
    </>
  );

  return (
    <Screen eyebrow={capitalize(fmtLongDate(now))} title={me.first && isWide ? `${greet}, ${me.first}` : 'Hoy'} right={headerRight} maxWidth={isWide ? 1180 : undefined}>
      {isWide ? (
        <View style={{ flexDirection: 'row', gap: 28, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
          {width >= 1100 && (
            <View style={{ width: 340, gap: 14 }}>
              {focusCard ?? nowCard}
              {agendaCard}
              {repasoCard}
              {focusMini}
              <MiniCalendar tasks={pending} subjects={subjects} embedded onTaskPress={(t) => openTask(t)} />
            </View>
          )}
        </View>
      ) : left}
    </Screen>
  );
}

function AgendaRow({ it, now, isToday }: { it: AgendaItem; now: Date; isToday: boolean }) {
  const m = now.getHours() * 60 + now.getMinutes();
  const live = isToday && it.kind === 'class' && it.start <= m && (it.end ?? 0) > m;
  const past = isToday && (it.end ?? it.start) < m;
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 6, opacity: past ? 0.55 : 1 }}>
      <Text style={{ width: 66, color: C.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{minToLabel(it.start)}</Text>
      <View style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: it.color, paddingLeft: 9 }}>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: it.kind === 'class' ? '700' : '500' }} numberOfLines={1}>
          {it.kind === 'due' ? 'Entrega: ' : ''}{it.title}
        </Text>
        {it.kind === 'class' && <Text style={{ color: live ? C.brand : C.muted, fontSize: 12, fontWeight: live ? '700' : '400' }}>{live ? 'Ahora · ' : ''}hasta {minToLabel(it.end!)}</Text>}
        {it.project && <Text style={{ color: C.muted, fontSize: 12 }}>{it.project}</Text>}
      </View>
    </View>
  );
}

function ProjectRow({ p, onOpen }: { p: MyProjectTask; onOpen: () => void }) {
  const due = fmtDue(p);
  const b = bucketOf(p);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${p.title}, proyecto ${p.project?.name ?? ''}${due ? ', ' + due : ''}`}
      style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingLeft: 14, minHeight: 54, backgroundColor: hovered ? C.surface2 : C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 12, marginBottom: 8 })}>
      <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: (p.project?.color ?? C.brand) + '26', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12 }}>{p.project?.icon ?? '📦'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>{p.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Dot color={p.project?.color ?? C.brand} />
            <Text style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={1}>{p.project?.name ?? 'Proyecto'} · en equipo</Text>
          </View>
          {!!due && <Text style={{ color: b === 'overdue' ? C.badText : b === 'today' ? C.warnText : C.muted, fontSize: 12.5, fontWeight: b === 'overdue' || b === 'today' ? '700' : '500' }}>{due}</Text>}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}
