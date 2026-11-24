import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { C } from '../../lib/theme';
import { tileWidth } from '../../lib/mobileLayout';
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
import { useMode, getMode } from '../../lib/mode';
import { ensureOpenTerm, useGradeScale } from '../../lib/termsDb';
import { useSpaceFilter } from '../../lib/useSpace';
import { fmtGrade } from '../../lib/terms';
import { vtNavigate, vtRef } from '../../lib/motion';
import { t } from '../../lib/i18n';

// ============================================================
//  Materias: tarjetas con lo pendiente, la próxima entrega y el promedio.
//  Tocar una abre su página (tareas, notas, calificaciones y archivos).
//  En el celular, el Horario es la segunda vista de esta pestaña.
// ============================================================

export default function Materias() {
  const router = useRouter();
  const { v: mv, work } = useMode();
  const scale = useGradeScale();
  const { isWide, width } = useResponsive();
  const { session } = useAuth();
  // Foto de la última visita para pintar al instante.
  const [snap] = useState(() => snapshotFor<{ s: Subject[]; t: Task[]; n: { id: string; subject_id: string | null }[]; g: Grade[] }>(session ? `materias:${session.user.id}` : null));
  const [allSubjects, setSubjects] = useState<Subject[] | null>(snap.initial?.s ?? null);
  // v26: con "Los dos", solo las del espacio abierto.
  const sp = useSpaceFilter();
  const subjects = allSubjects ? sp.subjects(allSubjects) : null;
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
      // v26: las materias nuevas de Estudio quedan en el semestre abierto.
      if (getMode() !== 'trabajo' && s.some((x) => !x.term_id)) ensureOpenTerm().catch(() => {});
    } catch (e) { setError(friendlyError(e)); setSubjects((x) => x ?? []); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onDataChanged(load), [load]);

  const cols = !isWide ? 1 : width >= 1400 ? 3 : 2;
  const cardW = cols === 1 ? '100%' : `${100 / cols - 1.5}%`;

  return (
    <Screen title={mv.subjects} subtitle={subjects?.length ? mv.subjectsCount(subjects.length) : mv.subjectLower === 'área' ? t('Organiza por área o cliente') : t('Organiza por asignatura')} maxWidth={1180}
      right={<View style={{ flexDirection: 'row', gap: 8 }}>
        {!work && <Button label={isWide ? t('Historial') : ''} icon="ribbon-outline" size="sm" kind="secondary" onPress={() => router.push('/historial' as any)} accessibilityLabel={t('Historial académico')} />}
        {isWide && <Button label={mv.newSubject} icon="add" size="sm" onPress={() => setModal(true)} />}
      </View>}
      header={!isWide ? <Segmented value="materias" onChange={(k) => { if (k === 'horario') router.navigate('/horario'); }}
        items={[{ key: 'materias', label: mv.subjectsTab, icon: (mv.subjectIcon + '-outline') as any }, { key: 'horario', label: mv.schedule, icon: 'grid-outline' }]} /> : undefined}>
      {!isWide && <View style={{ height: 14 }} />}
      {subjects === null ? (
        [0, 1, 2].map((i) => <Skeleton key={i} height={96} />)
      ) : error && !subjects.length ? (
        <ErrorState message={error} onRetry={load} />
      ) : subjects.length === 0 ? (
        <EmptyState icon={(mv.subjectIcon + '-outline') as any} title={mv.noSubjects}
          text={mv.noSubjectsText}
          action={{ label: mv.newSubject, icon: 'add', onPress: () => setModal(true) }} />
      ) : (
        <>
        <Summary subjects={subjects} tasks={tasks} grades={grades} slots={slots} isWide={isWide} work={work} scaleMax={scale.max} decimals={scale.decimals} onOpen={(id) => router.push(`/materia/${id}`)} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {subjects.map((s) => {
            const st = tasks.filter((t) => t.subject_id === s.id && t.status !== 'done').sort(compareDue);
            const next = st.find((t) => t.due_date || t.due_at);
            const overdue = st.filter((t) => bucketOf(t) === 'overdue').length;
            const notesN = notes.filter((n) => n.subject_id === s.id).length;
            const { avg } = subjectAverage(grades.filter((g) => g.subject_id === s.id), scale.max);
            const days = classDays(slots, s.id).label;
            const nc = nextClass(slots, s.id, SCHEDULE.blocks);
            const soon = nc && (nc.now || dayWord(nc.start) === 'Hoy' || dayWord(nc.start) === 'Mañana');
            const who = [s.teacher, days].filter(Boolean).join(' · ');
            return (
              <Card key={s.id} onPress={() => vtNavigate(() => router.push(`/materia/${s.id}`))} accessibilityLabel={t('Abrir {name}', { name: s.name })}
                style={{ width: cardW as any, borderLeftWidth: 4, borderLeftColor: s.color }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View ref={vtRef(`subj-${s.id}`)} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: s.color + '26', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <SubjectIcon icon={s.icon} box={44} emoji={21} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{s.name}</Text>
                    <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
                      {who || `${s.credits && !work ? t('{credits} créditos · ', { credits: s.credits }) : ''}${notesN} ${notesN === 1 ? 'nota' : 'notas'}`}
                    </Text>
                  </View>
                  {!work && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: avg == null ? C.muted : avg < scale.pass ? C.badText : C.text, fontSize: avg == null ? 12.5 : 18, fontWeight: '800' }}>{avg == null ? t('Sin notas') : fmtGrade(avg, scale)}</Text>
                      {avg != null && <Text style={{ color: C.muted, fontSize: 11 }}>{t('promedio')}</Text>}
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, flexWrap: 'wrap' }}>
                  <Text style={{ color: st.length ? C.text : C.muted, fontSize: 13, fontWeight: '600' }}>{st.length ? `${st.length} ${st.length === 1 ? 'pendiente' : 'pendientes'}` : t('Nada pendiente')}</Text>
                  {overdue > 0 && <Text style={{ color: C.badText, fontSize: 13, fontWeight: '700' }}>{overdue} {overdue === 1 ? 'vencida' : 'vencidas'}</Text>}
                  {next && <Text style={{ color: C.muted, fontSize: 13, flex: 1, textAlign: 'right' }} numberOfLines={1}>{t('Próxima: {next}', { next: fmtDue(next) })}</Text>}
                </View>
                {soon && nc && (
                  <Text style={{ color: nc.now ? C.goodText : C.muted, fontSize: 12.5, fontWeight: '600', marginTop: 8 }} numberOfLines={1}>
                    {nc.now ? (work ? t('En reunión ahora') : t('En clase ahora')) : `${work ? t('Reunión') : t('Clase')} ${dayWord(nc.start).toLowerCase()} ${fmtHour(`${String(nc.start.getHours()).padStart(2, '0')}:${String(nc.start.getMinutes()).padStart(2, '0')}`)}`}{s.room ? ` · ${s.room}` : ''}
                  </Text>
                )}
              </Card>
            );
          })}
        </View>
        </>
      )}
      {!isWide && subjects && subjects.length > 0 && <Button label={mv.newSubject} icon="add" kind="secondary" onPress={() => setModal(true)} style={{ marginTop: 14 }} full />}
      <SubjectModal visible={modal} onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); }} />
    </Screen>
  );
}

// Resumen del semestre arriba de las tarjetas: promedio ponderado, pendientes,
// próxima entrega y próxima clase (de cualquier materia).
function Summary({ subjects, tasks, grades, slots, isWide, work, scaleMax, decimals, onOpen }: {
  subjects: Subject[]; tasks: Task[]; grades: Grade[]; slots: Slot[]; isWide: boolean; work: boolean; scaleMax: number; decimals: 1 | 2; onOpen: (id: string) => void;
}) {
  const sem = semesterAverage(subjects, grades, scaleMax);
  const { width: winW } = useResponsive();
  const tileW = tileWidth(winW);
  const pending = tasks.filter((t) => t.status !== 'done' && subjects.some((s) => s.id === t.subject_id));
  const overdue = pending.filter((t) => bucketOf(t) === 'overdue').length;
  const next = [...pending].sort(compareDue).find((t) => bucketOf(t) !== 'overdue' && (t.due_date || t.due_at));
  const classes = subjects.map((s) => ({ s, n: nextClass(slots, s.id, SCHEDULE.blocks) })).filter((x) => x.n).sort((a, b) => a.n!.start.getTime() - b.n!.start.getTime());
  const nc = classes[0];
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const nextSub = next ? subjects.find((s) => s.id === next.subject_id) : null;
  const tiles: { k: string; label: string; big: string; sub: string; tone?: string; onPress?: () => void }[] = [
    // v26: en Trabajo no hay promedio; se ve cuántas áreas o clientes hay activos.
    work
      ? { k: 'avg', label: t('Áreas y clientes'), big: String(subjects.length), sub: t('{length} con pendientes', { length: subjects.filter((s) => tasks.some((t) => t.subject_id === s.id && t.status !== 'done')).length }) }
      : { k: 'avg', label: t('Promedio del semestre'), big: fmtGrade(sem.avg, { decimals }), sub: sem.avg == null ? t('Agrega notas en cada materia') : t('Ponderado por créditos ({credits})', { credits: sem.credits }) },
    { k: 'pend', label: t('Pendientes'), big: String(pending.length), sub: overdue ? `${overdue} ${overdue === 1 ? 'vencida' : 'vencidas'}` : t('Ninguna vencida'), tone: overdue ? C.badText : undefined },
    { k: 'next', label: t('Próxima entrega'), big: next ? next.title : t('Nada pronto'), sub: next ? `${nextSub?.name ?? ''} · ${fmtDue(next)}` : t('Todo al día'), onPress: next?.subject_id ? () => onOpen(next.subject_id!) : undefined },
    { k: 'class', label: work ? t('Próxima reunión') : t('Próxima clase'), big: nc ? nc.s.name : work ? t('Sin agenda') : t('Sin horario'), sub: nc ? (nc.n!.now ? t('Ahora') : `${dayWord(nc.n!.start)}, ${fmtHour(hhmm(nc.n!.start))}`) + (nc.s.room ? ` · ${nc.s.room}` : '') : work ? t('Arma tu agenda para verla') : t('Arma tu horario para verla'), onPress: nc ? () => onOpen(nc.s.id) : undefined },
  ];
  const tile = (t: typeof tiles[number]) => (
    <Card key={t.k} onPress={t.onPress} accessibilityLabel={t.label} style={isWide ? { flex: 1, padding: 14 } : { width: tileW, padding: 14 }}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{t.label}</Text>
      <Text style={{ color: C.text, fontSize: t.k === 'avg' || t.k === 'pend' ? 24 : 16, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>{t.big}</Text>
      <Text style={{ color: t.tone ?? C.muted, fontSize: 12.5, marginTop: 2, fontWeight: t.tone ? '700' : '400' }} numberOfLines={isWide ? 1 : 2}>{t.sub}</Text>
    </Card>
  );
  if (isWide) return <View style={{ flexDirection: 'row', gap: 12, marginBottom: 18 }}>{tiles.map(tile)}</View>;
  // v29: en el celular, cuadrícula de 2 (4 en tableta): se ven todas sin cortar.
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>{tiles.map(tile)}</View>;
}
