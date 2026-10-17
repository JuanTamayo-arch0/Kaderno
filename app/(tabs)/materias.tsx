import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { Subject, Task, Grade, Slot, getSubjects, getTasks, getNoteRefs, getAllGrades, getSchedule } from '../../lib/db';
import { SCHEDULE, fmtHour } from '../../lib/schedule';
import { classDays, nextClass, dayWord } from '../../lib/subjectInfo';
import { snapshotFor } from '../../lib/snapshot';
import { useAuth } from '../../lib/auth';
import { subjectAverage, semesterAverage } from '../../lib/grades';
import { compareDue, fmtDue, bucketOf } from '../../lib/time';
import { friendlyError } from '../../lib/feedback';
import { onDataChanged } from '../../lib/uiBus';
import { Screen, Button, Card, EmptyState, ErrorState, Segmented, Skeleton } from '../../components/ds';
import { SubjectIcon } from '../../components/SubjectIcon';
import { SubjectModal } from '../../components/SubjectModal';

// ============================================================
//  Materias: tarjetas con lo pendiente, la próxima entrega y el promedio.
//  Tocar una abre su página (tareas, notas, calificaciones y archivos).
//  En el celular, el Horario es la segunda vista de esta pestaña.
// ============================================================

export default function Materias() {
  const router = useRouter();
  const { isWide, width } = useResponsive();
  const { session } = useAuth();
  // Foto de la última visita para pintar al instante.
  const [snap] = useState(() => snapshotFor<{ s: Subject[]; t: Task[]; n: { id: string; subject_id: string | null }[]; g: Grade[] }>(session ? `materias:${session.user.id}` : null));
  const [subjects, setSubjects] = useState<Subject[] | null>(snap.initial?.s ?? null);
  const [tasks, setTasks] = useState<Task[]>(snap.initial?.t ?? []);
  const [notes, setNotes] = useState<{ id: string; subject_id: string | null }[]>(snap.initial?.n ?? []);
  const [grades, setGrades] = useState<Grade[]>(snap.initial?.g ?? []);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, t, n, g] = await Promise.all([getSubjects(), getTasks(), getNoteRefs(), getAllGrades()]);
      setSubjects(s); setTasks(t); setNotes(n); setGrades(g); setError(null);
      snap.save({ s, t, n, g });
      getSchedule().then(setSlots).catch(() => {});
    } catch (e) { setError(friendlyError(e)); setSubjects((x) => x ?? []); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onDataChanged(load), [load]);

  const cols = !isWide ? 1 : width >= 1400 ? 3 : 2;
  const cardW = cols === 1 ? '100%' : `${100 / cols - 1.5}%`;

  return (
    <Screen title="Materias" subtitle={subjects?.length ? `${subjects.length} este semestre` : 'Organiza por asignatura'} maxWidth={1180}
      right={isWide ? <Button label="Nueva materia" icon="add" size="sm" onPress={() => setModal(true)} /> : undefined}
      header={!isWide ? <Segmented value="materias" onChange={(k) => { if (k === 'horario') router.navigate('/horario'); }}
        items={[{ key: 'materias', label: 'Materias', icon: 'book-outline' }, { key: 'horario', label: 'Horario', icon: 'grid-outline' }]} /> : undefined}>
      {!isWide && <View style={{ height: 14 }} />}
      {subjects === null ? (
        [0, 1, 2].map((i) => <Skeleton key={i} height={96} />)
      ) : error && !subjects.length ? (
        <ErrorState message={error} onRetry={load} />
      ) : subjects.length === 0 ? (
        <EmptyState icon="book-outline" title="Aún no tienes materias"
          text="Crea las materias del semestre para organizar tareas, notas y calificaciones."
          action={{ label: 'Crear materia', icon: 'add', onPress: () => setModal(true) }} />
      ) : (
        <>
        <Summary subjects={subjects} tasks={tasks} grades={grades} slots={slots} isWide={isWide} onOpen={(id) => router.push(`/materia/${id}`)} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {subjects.map((s) => {
            const st = tasks.filter((t) => t.subject_id === s.id && t.status !== 'done').sort(compareDue);
            const next = st.find((t) => t.due_date || t.due_at);
            const overdue = st.filter((t) => bucketOf(t) === 'overdue').length;
            const notesN = notes.filter((n) => n.subject_id === s.id).length;
            const { avg } = subjectAverage(grades.filter((g) => g.subject_id === s.id));
            const days = classDays(slots, s.id).label;
            const nc = nextClass(slots, s.id, SCHEDULE.blocks);
            const soon = nc && (nc.now || dayWord(nc.start) === 'Hoy' || dayWord(nc.start) === 'Mañana');
            const who = [s.teacher, days].filter(Boolean).join(' · ');
            return (
              <Card key={s.id} onPress={() => router.push(`/materia/${s.id}`)} accessibilityLabel={`Abrir ${s.name}`}
                style={{ width: cardW as any, borderLeftWidth: 4, borderLeftColor: s.color }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: s.color + '26', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <SubjectIcon icon={s.icon} box={44} emoji={21} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{s.name}</Text>
                    <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
                      {who || `${s.credits ? `${s.credits} créditos · ` : ''}${notesN} ${notesN === 1 ? 'nota' : 'notas'}`}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: avg == null ? C.muted : avg < 3 ? C.badText : C.text, fontSize: avg == null ? 12.5 : 18, fontWeight: '800' }}>{avg == null ? 'Sin notas' : avg.toFixed(1)}</Text>
                    {avg != null && <Text style={{ color: C.muted, fontSize: 11 }}>promedio</Text>}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, flexWrap: 'wrap' }}>
                  <Text style={{ color: st.length ? C.text : C.muted, fontSize: 13, fontWeight: '600' }}>{st.length ? `${st.length} ${st.length === 1 ? 'pendiente' : 'pendientes'}` : 'Nada pendiente'}</Text>
                  {overdue > 0 && <Text style={{ color: C.badText, fontSize: 13, fontWeight: '700' }}>{overdue} {overdue === 1 ? 'vencida' : 'vencidas'}</Text>}
                  {next && <Text style={{ color: C.muted, fontSize: 13, flex: 1, textAlign: 'right' }} numberOfLines={1}>Próxima: {fmtDue(next)}</Text>}
                </View>
                {soon && nc && (
                  <Text style={{ color: nc.now ? C.goodText : C.muted, fontSize: 12.5, fontWeight: '600', marginTop: 8 }} numberOfLines={1}>
                    {nc.now ? 'En clase ahora' : `Clase ${dayWord(nc.start).toLowerCase()} ${fmtHour(`${String(nc.start.getHours()).padStart(2, '0')}:${String(nc.start.getMinutes()).padStart(2, '0')}`)}`}{s.room ? ` · ${s.room}` : ''}
                  </Text>
                )}
              </Card>
            );
          })}
        </View>
        </>
      )}
      {!isWide && subjects && subjects.length > 0 && <Button label="Nueva materia" icon="add" kind="secondary" onPress={() => setModal(true)} style={{ marginTop: 14 }} full />}
      <SubjectModal visible={modal} onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); }} />
    </Screen>
  );
}

// Resumen del semestre arriba de las tarjetas: promedio ponderado, pendientes,
// próxima entrega y próxima clase (de cualquier materia).
function Summary({ subjects, tasks, grades, slots, isWide, onOpen }: {
  subjects: Subject[]; tasks: Task[]; grades: Grade[]; slots: Slot[]; isWide: boolean; onOpen: (id: string) => void;
}) {
  const sem = semesterAverage(subjects, grades);
  const pending = tasks.filter((t) => t.status !== 'done' && subjects.some((s) => s.id === t.subject_id));
  const overdue = pending.filter((t) => bucketOf(t) === 'overdue').length;
  const next = [...pending].sort(compareDue).find((t) => bucketOf(t) !== 'overdue' && (t.due_date || t.due_at));
  const classes = subjects.map((s) => ({ s, n: nextClass(slots, s.id, SCHEDULE.blocks) })).filter((x) => x.n).sort((a, b) => a.n!.start.getTime() - b.n!.start.getTime());
  const nc = classes[0];
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const nextSub = next ? subjects.find((s) => s.id === next.subject_id) : null;
  const tiles: { k: string; label: string; big: string; sub: string; tone?: string; onPress?: () => void }[] = [
    { k: 'avg', label: 'Promedio del semestre', big: sem.avg == null ? '–' : sem.avg.toFixed(2), sub: sem.avg == null ? 'Agrega notas en cada materia' : `Ponderado por créditos (${sem.credits})` },
    { k: 'pend', label: 'Pendientes', big: String(pending.length), sub: overdue ? `${overdue} ${overdue === 1 ? 'vencida' : 'vencidas'}` : 'Ninguna vencida', tone: overdue ? C.badText : undefined },
    { k: 'next', label: 'Próxima entrega', big: next ? next.title : 'Nada pronto', sub: next ? `${nextSub?.name ?? ''} · ${fmtDue(next)}` : 'Todo al día', onPress: next?.subject_id ? () => onOpen(next.subject_id!) : undefined },
    { k: 'class', label: 'Próxima clase', big: nc ? nc.s.name : 'Sin horario', sub: nc ? (nc.n!.now ? 'Ahora' : `${dayWord(nc.n!.start)}, ${fmtHour(hhmm(nc.n!.start))}`) + (nc.s.room ? ` · ${nc.s.room}` : '') : 'Arma tu horario para verla', onPress: nc ? () => onOpen(nc.s.id) : undefined },
  ];
  const tile = (t: typeof tiles[number]) => (
    <Card key={t.k} onPress={t.onPress} accessibilityLabel={t.label} style={isWide ? { flex: 1, padding: 14 } : { width: 168, padding: 14 }}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{t.label}</Text>
      <Text style={{ color: C.text, fontSize: t.k === 'avg' || t.k === 'pend' ? 24 : 16, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>{t.big}</Text>
      <Text style={{ color: t.tone ?? C.muted, fontSize: 12.5, marginTop: 2, fontWeight: t.tone ? '700' : '400' }} numberOfLines={1}>{t.sub}</Text>
    </Card>
  );
  if (isWide) return <View style={{ flexDirection: 'row', gap: 12, marginBottom: 18 }}>{tiles.map(tile)}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginBottom: 14, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
      {tiles.map(tile)}
    </ScrollView>
  );
}
