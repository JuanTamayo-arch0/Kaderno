import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Alert, LayoutAnimation, Modal, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { C, S, R } from '../../lib/theme';
import { useResponsive, SIDEBAR_W } from '../../lib/responsive';
import { iconChar } from '../../components/SubjectIcon';
import { MiniCalendar } from '../../components/MiniCalendar';
import { TaskCard } from '../../components/TaskCard';
import { Header, Chip, MiniStat, secLbl, resItem, fab } from '../../components/ui';
import { TaskModal } from '../../components/TaskModal';
import {
  Subject, Task, Note, Grade, Step, getSubjects, getTasks, getStepsFor, toggleTask, deleteTask,
  countDueFlashcards, search, getFocusDetail, getAllGrades, fetchPrefs,
} from '../../lib/db';
import { MyProjectTask, getMyProjectTasks } from '../../lib/projects';

// Header, Chip, Pill, MiniStat y los estilos compartidos vivían aquí dentro; ahora
// están en components/ui.tsx y TaskModal en components/TaskModal.tsx, así ninguna
// pantalla tiene que importar de otra pantalla.

// Clasifica una tarea en un grupo de urgencia por su fecha.
const BUCKETS = ['Vencidas', 'Hoy', 'Mañana', 'Esta semana', 'Próxima semana', 'Más adelante', 'Sin fecha'];
function bucketOf(due: string | null): string {
  if (!due) return 'Sin fecha';
  const d = new Date(due + 'T00:00:00'); const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff < 0) return 'Vencidas';
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff <= 7) return 'Esta semana';
  if (diff <= 14) return 'Próxima semana';
  return 'Más adelante';
}
function bucketColor(b: string): string {
  if (b === 'Vencidas') return C.bad;
  if (b === 'Hoy') return C.warn;
  if (b === 'Mañana') return C.brand;
  return C.muted;
}

// Anima suavemente los cambios de lista (agregar, completar, borrar).
function animate() { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); }

export default function Hoy() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [steps, setSteps] = useState<Record<string, Step[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<string>('all');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(true);
  const [due, setDue] = useState(0);
  const [focus, setFocus] = useState({ todayMin: 0, streak: 0 });
  const [grades, setGrades] = useState<Grade[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  // Tareas de proyectos asignadas a mí. Se mezclan con las personales en los
  // mismos grupos de urgencia, porque una entrega de grupo se vence igual que
  // una individual y no debería esconderse en otra pestaña.
  const [pTasks, setPTasks] = useState<MyProjectTask[]>([]);
  const [showProj, setShowProj] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('onboarded').then((v) => { if (!v) setShowWelcome(true); }).catch(() => {});
  }, []);
  function dismissWelcome() { setShowWelcome(false); AsyncStorage.setItem('onboarded', '1').catch(() => {}); }

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([getSubjects(), getTasks()]);
      setSubjects(s); setTasks(t);
      // Microtareas de todas las tareas en UNA sola consulta.
      getStepsFor(t.map((x) => x.id)).then(setSteps).catch(() => {});
      countDueFlashcards().then(setDue).catch(() => {});
      getFocusDetail().then((d) => setFocus({ todayMin: d.todayMin, streak: d.streak })).catch(() => {});
      getAllGrades().then(setGrades).catch(() => {});
      // Si el usuario apagó la mezcla en Personalizar, ni siquiera se piden.
      fetchPrefs().then((p) => {
        const on = p?.hoyProyectos !== false;
        setShowProj(on);
        if (on) getMyProjectTasks().then(setPTasks).catch(() => {});
        else setPTasks([]);
      }).catch(() => {
        getMyProjectTasks().then(setPTasks).catch(() => {});
      });
    } catch (e: any) { Alert.alert('Error', e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onToggle(t: Task) { animate(); await toggleTask(t.id, t.status !== 'done'); load(); }
  async function onDelete(id: string) { animate(); await deleteTask(id); load(); }
  const subjOf = (id: string | null) => subjects.find((s) => s.id === id);

  function openNew() { setEditing(null); setModal(true); }
  function openEdit(t: Task) { setEditing(t); setModal(true); }
  function toggleExpand(t: Task) { animate(); setExpanded((p) => ({ ...p, [t.id]: !p[t.id] })); }
  function onStepsChange(taskId: string, next: Step[]) { setSteps((p) => ({ ...p, [taskId]: next })); }

  // Tarjeta de tarea con todo conectado (progreso, microtareas, acciones).
  function renderTaskCard(t: Task, wide = false) {
    return (
      <TaskCard
        key={t.id}
        task={t}
        subject={subjOf(t.subject_id)}
        steps={steps[t.id] ?? []}
        wide={wide}
        expanded={!!expanded[t.id]}
        bucket={wide ? bucketOf(t.due_date) : undefined}
        bucketColor={wide ? bucketColor(bucketOf(t.due_date)) : undefined}
        onToggle={onToggle}
        onEdit={openEdit}
        onDelete={onDelete}
        onToggleExpand={toggleExpand}
        onStepsChange={onStepsChange}
      />
    );
  }

  // Fila compacta para una tarea de proyecto. Es a propósito más liviana que
  // TaskCard: no se puede tachar ni editar desde aquí (eso vive en el tablero),
  // solo avisa que existe y lleva al proyecto de un toque.
  function renderProjectRow(t: MyProjectTask) {
    const color = t.project?.color ?? C.brand;
    return (
      <Pressable key={'p' + t.id} onPress={() => router.push(`/proyectos/${t.project_id}`)}
        accessibilityRole="button" accessibilityLabel={`${t.title}, del proyecto ${t.project?.name ?? 'sin nombre'}`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 11,
          backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderLeftWidth: 3,
          borderLeftColor: color, borderRadius: R.md, paddingVertical: 11, paddingHorizontal: 13,
          marginBottom: 8, opacity: pressed ? 0.85 : 1,
        })}>
        <Text style={{ fontSize: 17 }}>{t.project?.icon ?? '📦'}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600' }} numberOfLines={2}>{t.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <View style={{ backgroundColor: color + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{t.project?.name ?? 'Proyecto'}</Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 11.5 }} numberOfLines={1}>En equipo</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.muted} />
      </Pressable>
    );
  }

  // Las tareas de proyecto no tienen materia, así que al filtrar por una
  // materia se esconden en vez de colarse en todos los filtros.
  const projVisible = showProj && filter === 'all' ? pTasks : [];

  // ----- Datos del centro de mando -----
  const dLocal = new Date();
  const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayIso = isoOf(dLocal);
  const pendingToday = tasks.filter((t) => t.status !== 'done' && t.due_date === todayIso).length
    + projVisible.filter((t) => t.due_date === todayIso).length;
  const upcomingExams = tasks.filter((t) => t.type === 'examen' && t.status !== 'done' && t.due_date && t.due_date >= todayIso).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  const nextExam = upcomingExams[0] ?? null;
  const examDays = nextExam?.due_date ? Math.round((new Date(nextExam.due_date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / 86400000) : null;
  const gBy: Record<string, Grade[]> = {};
  grades.forEach((g) => { if (g.score != null && g.weight > 0) (gBy[g.subject_id] ??= []).push(g); });
  const credOf = (sid: string) => { const c = subjOf(sid)?.credits; return c && c > 0 ? c : 1; };
  const perSubj = Object.entries(gBy).map(([sid, items]) => { const w = items.reduce((a, i) => a + i.weight, 0); const avg = items.reduce((a, i) => a + (i.score as number) * i.weight, 0) / w; return { avg, cred: credOf(sid) }; });
  const totalCred = perSubj.reduce((a, p) => a + p.cred, 0);
  const overallAvg = perSubj.length ? perSubj.reduce((a, p) => a + p.avg * p.cred, 0) / totalCred : null;
  const weekAgenda = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayIso + 'T00:00:00'); d.setDate(d.getDate() + i);
    const iso = isoOf(d);
    const count = tasks.filter((t) => t.status !== 'done' && t.due_date === iso).length
      + projVisible.filter((t) => t.due_date === iso).length;
    const label = i === 0 ? 'Hoy' : ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'][d.getDay()];
    return { iso, label, count, dayNum: d.getDate() };
  });
  const QUICK = [
    { label: 'Capturar', icon: 'camera' as const, onPress: () => router.push('/capturar') },
    { label: 'Oráculo', icon: 'sparkles' as const, onPress: () => router.push('/oraculo') },
    { label: 'Proyectos', icon: 'people' as const, onPress: () => router.push('/proyectos') },
    { label: 'Buscar', icon: 'search' as const, onPress: () => router.push('/buscar') },
    { label: 'Tipos', icon: 'pricetags-outline' as const, onPress: () => router.push('/tipos') },
    { label: 'Nueva tarea', icon: 'add' as const, onPress: openNew },
  ];

  function ResumenCards() {
    return (
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <MiniStat label="Pendientes hoy" value={String(pendingToday)} />
        <MiniStat label="Próx. examen" value={examDays != null ? `${examDays}d` : '—'} color={examDays != null ? C.bad : undefined} />
        <MiniStat label="Promedio" value={overallAvg != null ? overallAvg.toFixed(1) : '—'} />
        <MiniStat label="Racha" value={`${focus.streak}d`} color={C.good} />
      </View>
    );
  }
  function ExamBanner() {
    if (!nextExam) return null;
    const su = subjOf(nextExam.subject_id);
    return (
      <Pressable onPress={() => openEdit(nextExam)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.bad + '18', borderColor: C.bad + '55', borderWidth: 1, borderRadius: R.lg, padding: 14, marginTop: 12 }}>
        <Text style={{ fontSize: 22 }}>📕</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontWeight: '700' }} numberOfLines={1}>{nextExam.title}</Text>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>{su ? su.name + ' · ' : ''}{examDays === 0 ? '¡Hoy!' : examDays === 1 ? 'Mañana' : `en ${examDays} días`}</Text>
        </View>
      </Pressable>
    );
  }
  function QuickGrid() {
    return (
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {QUICK.map((q) => (
          <Pressable key={q.label} onPress={q.onPress} style={({ pressed }) => ({ flex: 1, minWidth: 92, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', gap: 6, opacity: pressed ? 0.8 : 1 })}>
            <Ionicons name={q.icon} size={20} color={C.brand} />
            <Text style={{ color: C.text, fontSize: 12, fontWeight: '600' }}>{q.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  function WeekStrip() {
    return (
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {weekAgenda.map((d) => (
          <View key={d.iso} style={{ flex: 1, backgroundColor: d.count > 0 ? C.surface : C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ color: C.muted, fontSize: 11 }}>{d.label}</Text>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{d.dayNum}</Text>
            {d.count > 0 && <View style={{ marginTop: 3, minWidth: 18, paddingHorizontal: 5, height: 18, borderRadius: 9, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.bg, fontSize: 11, fontWeight: '700' }}>{d.count}</Text></View>}
          </View>
        ))}
      </View>
    );
  }

  // ===================== ESCRITORIO =====================
  if (isWide) {
    const pendingBy: Record<string, number> = {};
    subjects.forEach((su) => { pendingBy[su.id] = tasks.filter((t) => t.subject_id === su.id && t.status !== 'done').length; });
    const visible = tasks.filter((t) => t.status !== 'done' && (filter === 'all' || t.subject_id === filter));
    const groups = BUCKETS.map((b) => ({
      label: b,
      items: visible.filter((t) => bucketOf(t.due_date) === b),
      proj: projVisible.filter((t) => bucketOf(t.due_date) === b),
    })).filter((g) => g.items.length + g.proj.length > 0);
    const doneT = tasks.filter((t) => t.status === 'done' && (filter === 'all' || t.subject_id === filter));

    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: SIDEBAR_W }}>
        <ScrollView contentContainerStyle={{ paddingVertical: 36, paddingHorizontal: 44, paddingBottom: 60 }}>
          <View style={{ maxWidth: 1560, width: '100%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <View>
                <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>Hoy</Text>
                <Text style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>Todas tus entregas en un lugar</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => router.push('/buscar')} accessibilityLabel="Buscar" accessibilityRole="button"
                  style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="search" size={16} color={C.muted} />
                </Pressable>
              </View>
            </View>

            <ResumenCards />
            <ExamBanner />
            <View style={{ marginTop: 12, marginBottom: 20 }}><WeekStrip /></View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              <DesktopChip label="Todas" active={filter === 'all'} color={C.brand} onPress={() => setFilter('all')} />
              {subjects.filter((su) => pendingBy[su.id] > 0).map((su) => (
                <DesktopChip key={su.id} label={`${iconChar(su.icon)} ${su.name}`} count={pendingBy[su.id]} active={filter === su.id} color={su.color} onPress={() => setFilter(su.id)} />
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
              {/* Columna izquierda: tareas por urgencia */}
              <View style={{ flex: 1.6, minWidth: 0, gap: 22 }}>
                {groups.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingTop: 60 }}>
                    <Text style={{ fontSize: 34 }}>🎉</Text>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', marginTop: 10 }}>Todo al día</Text>
                    <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>No tienes tareas pendientes.</Text>
                  </View>
                ) : groups.map((g) => (
                  <View key={g.label}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>{g.label}</Text>
                    <View style={{ gap: 8 }}>
                      {g.items.map((t) => renderTaskCard(t, true))}
                    </View>
                    {g.proj.length > 0 && <View style={{ marginTop: g.items.length ? 8 : 0 }}>{g.proj.map(renderProjectRow)}</View>}
                  </View>
                ))}
              </View>

              {/* Columna derecha: panel */}
              <View style={{ width: 340, gap: 16 }}>
                {/* El calendario ya no es una pantalla aparte: vive aquí. */}
                <MiniCalendar tasks={tasks} subjects={subjects} embedded onTaskPress={openEdit} />

                <View style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 20 }}>
                  <Text style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Tu enfoque hoy</Text>
                  <Text style={{ fontSize: 30, fontWeight: '800', color: C.text }}>{focus.todayMin} <Text style={{ fontSize: 15, fontWeight: '600', color: C.muted }}>min</Text></Text>
                  {focus.streak > 0 && <Text style={{ fontSize: 13, color: C.good, marginTop: 6 }}>🔥 Racha de {focus.streak} día{focus.streak === 1 ? '' : 's'}</Text>}
                </View>

                <View style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>Repaso pendiente</Text>
                    <View style={{ backgroundColor: C.surface2, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 }}><Text style={{ color: C.warn, fontSize: 12, fontWeight: '700' }}>{due}</Text></View>
                  </View>
                  <Text style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Flashcards listas con repetición espaciada.</Text>
                  <Pressable onPress={() => router.push('/repaso')} style={{ backgroundColor: C.brand, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                    <Text style={{ color: C.bg, fontSize: 14, fontWeight: '700' }}>Repasar ahora</Text>
                  </Pressable>
                </View>

                <View style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 }}>
                  <Pressable onPress={() => router.push('/capturar')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10 }}>
                    <Ionicons name="camera-outline" size={16} color={C.muted} /><Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>Digitalizar apunte</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push('/tipos')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10 }}>
                    <Ionicons name="pricetags-outline" size={16} color={C.muted} /><Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>Tipos de tarea</Text>
                  </Pressable>
                  <Pressable onPress={openNew} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: C.surface2 }}>
                    <Ionicons name="add" size={18} color={C.text} /><Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>Nueva tarea</Text>
                  </Pressable>
                </View>

                {doneT.length > 0 && (
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4, marginBottom: 10 }}>Completadas</Text>
                    <View style={{ gap: 6 }}>
                      {doneT.map((t) => (
                        <Pressable key={t.id} onPress={() => onToggle(t)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 }}>
                          <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: C.good, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={11} color={C.bg} /></View>
                          <Text style={{ fontSize: 13, color: C.muted, textDecorationLine: 'line-through', flex: 1 }}>{t.title}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        <TaskModal visible={modal} subjects={subjects} editTask={editing} onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); }} />
        <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} />
        <WelcomeModal visible={showWelcome} onClose={dismissWelcome} />
      </View>
    );
  }

  // ===================== MÓVIL =====================
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Hoy" subtitle="Todas tus entregas en un lugar"
        right={(
          <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
            <Pressable onPress={() => setCalOpen((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Calendario">
              <Ionicons name={calOpen ? 'calendar' : 'calendar-outline'} size={22} color={calOpen ? C.brand : C.text} />
            </Pressable>
            <Pressable onPress={() => router.push('/buscar')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Buscar"><Ionicons name="search" size={22} color={C.text} /></Pressable>
            <Pressable onPress={() => router.push('/personalizar')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Personalizar"><Ionicons name="color-palette-outline" size={22} color={C.text} /></Pressable>
          </View>
        )} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Centro de mando */}
        <ResumenCards />
        <ExamBanner />
        <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 8 }}>Accesos rápidos</Text>
        <QuickGrid />
        <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 8 }}>Esta semana</Text>
        <WeekStrip />

        <View style={{ height: 12 }} />
        {/* Calendario del mes (antes era una pantalla aparte) */}
        <MiniCalendar
          tasks={tasks} subjects={subjects}
          open={calOpen} onOpenChange={setCalOpen}
          onTaskPress={openEdit}
        />

        {due > 0 && (
          <Pressable onPress={() => router.push('/repaso')}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.brand2 + '22', borderColor: C.brand2 + '55', borderWidth: 1, borderRadius: R.lg, padding: 14, marginBottom: 12, opacity: pressed ? 0.8 : 1 }]}>
            <Text style={{ fontSize: 22 }}>🃏</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: '700' }}>Repaso del día</Text>
              <Text style={{ color: C.muted, fontSize: 12.5 }}>Tienes {due} tarjeta{due === 1 ? '' : 's'} para repasar</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </Pressable>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <Chip label="Todas" active={filter === 'all'} onPress={() => setFilter('all')} />
          {subjects.map((s) => (
            <Chip key={s.id} label={`${iconChar(s.icon)} ${s.name}`} active={filter === s.id} onPress={() => setFilter(s.id)} />
          ))}
        </ScrollView>

        {(() => {
          const pending = tasks.filter((t) => t.status !== 'done' && (filter === 'all' || t.subject_id === filter));
          const doneList = tasks.filter((t) => t.status === 'done' && (filter === 'all' || t.subject_id === filter));
          const groups = BUCKETS.map((b) => ({
            label: b,
            items: pending.filter((t) => bucketOf(t.due_date) === b),
            proj: projVisible.filter((t) => bucketOf(t.due_date) === b),
          })).filter((g) => g.items.length + g.proj.length > 0);
          if (pending.length === 0 && doneList.length === 0 && projVisible.length === 0) {
            return (
              <View style={{ alignItems: 'center', paddingTop: 70 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Text style={{ fontSize: 34 }}>🎉</Text>
                </View>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Todo al día</Text>
                <Text style={{ color: C.muted, marginTop: 4, fontSize: 13 }}>No tienes tareas pendientes. Toca ＋ para agregar una.</Text>
              </View>
            );
          }
          return (
            <>
              {groups.map((g) => (
                <View key={g.label} style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6, marginBottom: 8 }}>{g.label}</Text>
                  {g.items.map((t) => renderTaskCard(t))}
                  {g.proj.map(renderProjectRow)}
                </View>
              ))}
              {doneList.length > 0 && (
                <View style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Completadas</Text>
                  {doneList.map((t) => renderTaskCard(t))}
                </View>
              )}
            </>
          );
        })()}
      </ScrollView>

      <Pressable onPress={openNew} accessibilityRole="button" accessibilityLabel="Nueva tarea"
        style={({ pressed }) => [fab, { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      <TaskModal
        visible={modal} subjects={subjects} editTask={editing}
        onClose={() => setModal(false)}
        onSaved={() => { setModal(false); load(); }}
      />
      <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} />
      <WelcomeModal visible={showWelcome} onClose={dismissWelcome} />
    </View>
  );
}

function WelcomeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const steps = [
    { icon: '📸', title: 'Digitaliza tu cuaderno', text: 'Toma foto de tus apuntes y la app extrae el texto, editable y organizado por materia.' },
    { icon: '📅', title: 'No pierdas una entrega', text: 'Crea tareas con fecha, descripción y microtareas; míralas todas juntas en “Hoy”.' },
    { icon: '🧠', title: 'Estudia mejor', text: 'Genera resúmenes y flashcards con IA, repásalas y enfócate con Pomodoro.' },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: C.surface, borderRadius: R.xl, padding: 24, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ color: C.text, fontSize: 24, fontWeight: '800', marginBottom: 4 }}>¡Bienvenido a Kaderno! 🎓</Text>
          <Text style={{ color: C.muted, fontSize: 14, marginBottom: 18 }}>Tu cuaderno, digital y organizado.</Text>
          {steps.map((s) => (
            <View key={s.title} style={{ flexDirection: 'row', gap: 14, marginBottom: 16, alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 26 }}>{s.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{s.title}</Text>
                <Text style={{ color: C.muted, fontSize: 13, marginTop: 2, lineHeight: 19 }}>{s.text}</Text>
              </View>
            </View>
          ))}
          <Pressable onPress={onClose} accessibilityRole="button"
            style={({ pressed }) => ({ backgroundColor: C.brand, borderRadius: R.md, padding: 15, alignItems: 'center', marginTop: 6, opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Empezar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SearchModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ notes: Note[]; tasks: Task[] }>({ notes: [], tasks: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setRes({ notes: [], tasks: [] }); return; }
    const id = setTimeout(async () => {
      setBusy(true);
      try { setRes(await search(q.trim())); } catch { /* noop */ } finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  function go(path: string) { onClose(); setQ(''); router.push(path); }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: 54 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.lg, marginBottom: S.md }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12 }}>
            <Ionicons name="search" size={18} color={C.muted} />
            <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Buscar en notas y tareas…"
              placeholderTextColor={C.muted} style={{ flex: 1, color: C.text, paddingVertical: 12, fontSize: 15 }} />
          </View>
          <Pressable onPress={onClose}><Text style={{ color: C.brand, fontWeight: '600' }}>Cerrar</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: S.lg, paddingTop: 0 }} keyboardShouldPersistTaps="handled">
          {busy && <Text style={{ color: C.muted }}>Buscando…</Text>}
          {!!res.notes.length && <Text style={secLbl}>Notas</Text>}
          {res.notes.map((n) => (
            <Pressable key={n.id} onPress={() => go(`/nota/${n.id}`)} style={resItem}>
              <Ionicons name="document-text-outline" size={18} color={C.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{n.title || 'Nota'}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>{n.content}</Text>
              </View>
            </Pressable>
          ))}
          {!!res.tasks.length && <Text style={secLbl}>Tareas</Text>}
          {res.tasks.map((t) => (
            <View key={t.id} style={resItem}>
              <Ionicons name="checkbox-outline" size={18} color={C.good} />
              <Text style={{ color: C.text, flex: 1 }} numberOfLines={1}>{t.title}</Text>
            </View>
          ))}
          {q.trim() !== '' && !busy && !res.notes.length && !res.tasks.length &&
            <Text style={{ color: C.muted, marginTop: 20, textAlign: 'center' }}>Sin resultados para “{q}”.</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

function DesktopChip({ label, count, active, color, onPress }: { label: string; count?: number; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: R.pill,
      backgroundColor: active ? color : C.surface2, opacity: pressed ? 0.8 : 1,
    })}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? C.bg : C.text }}>{label}</Text>
      {count != null && <Text style={{ fontSize: 13, fontWeight: '700', color: active ? C.bg : C.muted, opacity: 0.7 }}>{count}</Text>}
    </Pressable>
  );
}
