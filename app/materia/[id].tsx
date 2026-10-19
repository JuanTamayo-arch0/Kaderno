import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { RequireAuth } from '../../components/RequireAuth';
import {
  Subject, Task, Note, Grade, Step, Slot, getSubjects, getTasks, getNotes, toggleTask, getGrades, deleteGrade, addNote, getStepsFor,
  getSchedule, getSubjectStudy,
} from '../../lib/db';
import { subjectAverage, neededFor } from '../../lib/grades';
import { bucketOf } from '../../lib/time';
import { SCHEDULE } from '../../lib/schedule';
import { classDays, countdown, nextClass, nextEvaluation, sortNotes } from '../../lib/subjectInfo';
import { exportSubjectPdf } from '../../lib/exportPdf';
import { confirm, notify, toast, friendlyError } from '../../lib/feedback';
import { removeTask } from '../../lib/taskActions';
import { openTask, onDataChanged } from '../../lib/uiBus';
import { refreshNavCounts } from '../../lib/navCounts';
import { startFocus } from '../../lib/focusTimer';
import { Screen, Button, Card, EmptyState, IconButton, SectionLabel, Skeleton, useGoBack } from '../../components/ds';
import { emitPetEvent, refreshCoinsSoon } from '../../lib/pets/store';
import { SubjectFiles } from '../../components/SubjectFiles';
import { iconChar } from '../../components/SubjectIcon';
import { SubjectModal, GradeModal } from '../../components/SubjectModal';
import { ActionMenu } from '../../components/ActionMenu';
import { useAuth } from '../../lib/auth';
import { snapshotFor } from '../../lib/snapshot';
import {
  SubjectTopBar, SubjectHero, SubjectStats, SubjectTabs, SubjectCompactBar, type TabKey, type StatsData,
} from '../../components/subject/SubjectParts';
import { SubjectRail } from '../../components/subject/SubjectRail';
import { QuickTaskInput, SubjectTaskList } from '../../components/subject/SubjectTasks';
import { NotesList } from '../../components/notes/NotesList';
import { NoteDocument } from '../../components/notes/NoteDocument';
import { preloadNoteEditor } from '../../components/notes/NoteEditor';
import { getQuizzes, getSessions, type QuizRow, type SessionTask } from '../../lib/quizDb';
import { prepText } from '../../lib/quiz';
import { planProgress } from '../../lib/examPlan';
import { getGoal, type Goal } from '../../lib/ritualsDb';
import { WoopSheet } from '../../components/goals/WoopSheet';
import { TemplatePicker } from '../../components/notes/TemplatePicker';
import { openClassNote } from '../../lib/notesDb';
import Ionicons from '@expo/vector-icons/Ionicons';

// ============================================================
//  Página de una materia.
//  Arriba, la ficha (profesor, salón, días de clase, aula virtual) y cuatro
//  indicadores que no cambian al pasar de pestaña. En el computador, una
//  columna derecha fija con la próxima clase, el calendario, notas y archivos.
//  En Notas (computador): lista a la izquierda y la nota abierta al lado,
//  sin salir de la materia.
// ============================================================

const TABS: TabKey[] = ['tareas', 'notas', 'cal', 'files'];

function MateriaDetalle() {
  const { id, tab: tabParam, nota, titulo } = useLocalSearchParams<{ id: string; tab?: string; nota?: string; titulo?: string }>();
  const router = useRouter();
  const goBack = useGoBack('/materias');
  const { isWide, width } = useResponsive();
  const { session } = useAuth();
  const [snap] = useState(() => snapshotFor<{ s: Subject; t: Task[]; n: Note[]; g: Grade[] }>(session && id ? `materia:${session.user.id}:${id}` : null));
  const [subject, setSubject] = useState<Subject | null | undefined>(snap.initial?.s ?? undefined);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[]>(snap.initial?.t ?? []);
  const [steps, setSteps] = useState<Record<string, Step[]>>({});
  const [notes, setNotes] = useState<Note[]>(snap.initial?.n ?? []);
  const [grades, setGrades] = useState<Grade[]>(snap.initial?.g ?? []);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [study, setStudy] = useState<{ weekMin: number; dueCards: number } | null>(null);
  const [tab, setTabState] = useState<TabKey>((TABS.includes(tabParam as TabKey) ? tabParam : 'tareas') as TabKey);
  const [openNote, setOpenNote] = useState<string | null>(nota ?? null);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  const [busyNew, setBusyNew] = useState(false);
  const [editModal, setEditModal] = useState<false | { field?: 'teacher' | 'room' | 'link' }>(false);
  const [gradeModal, setGradeModal] = useState(false);
  const [editGrade, setEditGrade] = useState<Grade | null>(null);
  const [menu, setMenu] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [examSessions, setExamSessions] = useState<SessionTask[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [woop, setWoop] = useState(false);
  const [picker, setPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const [subs, t, n, g] = await Promise.all([getSubjects(), getTasks(id), getNotes(id), getGrades(id)]);
      const sub = subs.find((s) => s.id === id) ?? null;
      setSubject(sub); setAllSubjects(subs);
      setTasks(t); setNotes(n); setGrades(g); setHidden(new Set());
      if (sub) snap.save({ s: sub, t, n: n.slice(0, 60), g });
      getStepsFor(t.filter((x) => x.status !== 'done').map((x) => x.id)).then(setSteps).catch(() => {});
      getSchedule().then(setSlots).catch(() => setSlots([]));
      getSubjectStudy(id).then(setStudy).catch(() => {});
      getQuizzes(id, 5).then(setQuizzes).catch(() => {});
      getGoal(id).then(setGoal).catch(() => {});
      const today = new Date().toISOString().slice(0, 10);
      const exam = t.filter((x) => x.status !== 'done' && ['examen', 'quiz'].includes(String(x.type)) && x.due_date && x.due_date >= today).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
      if (exam) getSessions(exam.id).then(setExamSessions).catch(() => {}); else setExamSessions([]);
    } catch (e) { notify('No se pudo cargar', friendlyError(e)); setSubject((s) => s ?? null); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onDataChanged(load), [load]);
  useEffect(() => { if (Platform.OS === 'web') { const h = setTimeout(preloadNoteEditor, 1500); return () => clearTimeout(h); } }, []);
  useEffect(() => { if (tabParam && TABS.includes(tabParam as TabKey)) setTabState(tabParam as TabKey); }, [tabParam]);
  useEffect(() => { if (nota) setOpenNote(nota); }, [nota]);

  function setTab(k: TabKey) {
    setTabState(k);
    router.setParams({ tab: k } as any);
  }

  // Notas: en el computador se abren al lado; si no hay ninguna elegida, la más reciente.
  const sortedNotes = useMemo(() => sortNotes(notes), [notes]);
  const wideNotes = isWide && tab === 'notas';
  const shownNote = wideNotes ? (openNote && notes.some((n) => n.id === openNote) ? openNote : sortedNotes[0]?.id ?? null) : null;

  function pickNote(n: Note) {
    if (isWide) { setOpenNote(n.id); router.setParams({ tab: 'notas', nota: n.id } as any); }
    else router.push(`/nota/${n.id}`);
  }
  function patchNote(p: Partial<Note> & { id: string }) {
    setNotes((xs) => {
      if (p.subject_id !== undefined && p.subject_id !== id) return xs.filter((x) => x.id !== p.id);
      return xs.map((x) => (x.id === p.id ? { ...x, ...p } : x));
    });
  }

  async function toggle(t: Task) {
    const done = t.status !== 'done';
    setTasks((xs) => xs.map((x) => x.id === t.id ? { ...x, status: done ? 'done' : 'pending' } : x));
    try { await toggleTask(t.id, done); refreshNavCounts(true); if (done) { emitPetEvent({ type: 'tarea_hecha', allDone: false }); refreshCoinsSoon(); } if (done) toast(`Hecha: ${t.title}`, { tone: 'good', actionLabel: 'Deshacer', onAction: () => toggle({ ...t, status: 'done' }) }); }
    catch (e) { setTasks((xs) => xs.map((x) => x.id === t.id ? t : x)); toast(friendlyError(e), { tone: 'bad' }); }
  }
  function remove(t: Task) { removeTask(t, () => setHidden((h) => new Set(h).add(t.id))); }
  function newNote() { if (!busyNew) setPicker(true); }
  async function classNote() {
    try {
      const r = await openClassNote(id);
      if (isWide) { setOpenNote(r.id); setTabState('notas'); router.setParams({ tab: 'notas', nota: r.id } as any); load(); }
      else router.push({ pathname: '/nota/[id]', params: { id: r.id, edit: '1' } } as any);
    } catch (e) { notify('No se pudo abrir', friendlyError(e)); }
  }
  async function createNote(content: string) {
    if (busyNew) return;
    setBusyNew(true);
    try {
      const nid = await addNote({ subject_id: id, title: 'Nota sin título', content, image_path: null });
      if (isWide) {
        const now = new Date().toISOString();
        setNotes((xs) => [{ id: nid, subject_id: id, title: 'Nota sin título', content, image_path: null, ocr_status: 'done', created_at: now, updated_at: now, summary: null }, ...xs]);
        setNewNoteId(nid); setOpenNote(nid); setTabState('notas');
        router.setParams({ tab: 'notas', nota: nid } as any);
      } else router.push({ pathname: '/nota/[id]', params: { id: nid, edit: '1' } } as any);
    } catch (e) { notify('No se pudo crear la nota', friendlyError(e)); }
    finally { setBusyNew(false); }
  }
  async function removeGrade(g: Grade) {
    if (!(await confirm(`¿Borrar ${g.name}?`, undefined, 'Borrar'))) return;
    try { await deleteGrade(g.id); load(); } catch (e) { notify('No se pudo borrar', friendlyError(e)); }
  }

  if (subject === undefined) return <Screen back="/materias" nav="materias" title="Materia"><Skeleton height={120} /><Skeleton /><Skeleton /></Screen>;
  if (subject === null) return (
    <Screen back="/materias" nav="materias" title="Materia">
      <EmptyState icon="help-circle-outline" title="No encontramos esta materia" text="Puede que esté archivada. Búscala en la Papelera."
        action={{ label: 'Ir a Materias', onPress: () => router.replace('/materias') }} />
    </Screen>
  );

  const live = tasks.filter((t) => !hidden.has(t.id));
  const pending = live.filter((t) => t.status !== 'done');
  const done = live.filter((t) => t.status === 'done');
  const scale = grades[0]?.max_score ?? 5;
  const { avg, doneWeight } = subjectAverage(grades, scale);
  const passMark = scale === 100 ? 60 : scale * 0.6;
  const { needed, remainingWeight } = neededFor(grades, passMark, scale);
  const fmt = (n: number) => n.toFixed(2);
  const neededText = !grades.length ? 'Agrega tus evaluaciones con su peso'
    : remainingWeight <= 0 ? (avg != null && avg >= passMark ? 'Materia ganada' : 'Ya están todas las notas')
    : needed == null ? '' : needed <= 0 ? `Ya aseguraste el ${fmt(passMark)}`
    : needed > scale ? `No alcanza para ${fmt(passMark)} con el ${remainingWeight}% que falta`
    : `Necesitas ${fmt(needed)} en el ${remainingWeight}% que falta`;
  const nextEval = nextEvaluation(live, grades);
  const stats: StatsData = {
    avg, scale, passMark, neededText, next: nextEval, pending: pending.length,
    overdue: pending.filter((t) => bucketOf(t) === 'overdue').length, done: done.length,
    weekMin: study?.weekMin ?? null, dueCards: study?.dueCards ?? null,
  };
  const days = slots ? classDays(slots, subject.id).label : null;
  const nextCls = slots ? nextClass(slots, subject.id, SCHEDULE.blocks) : null;
  const counts = { tareas: pending.length, notas: notes.length };
  const showRail = isWide && width >= 1180;

  const actions = {
    onFocus: () => { startFocus({ subjectId: subject.id }); router.push('/enfoque'); },
    onOracle: () => router.push({ pathname: '/oraculo', params: { mode: 'subject', subjectId: subject.id } } as any),
    onNew: () => openTask(null, { subjectId: id }),
    onMenu: () => setMenu(true),
  };
  const openEval = () => {
    const t = nextEval?.taskId ? live.find((x) => x.id === nextEval.taskId) : null;
    if (t) openTask(t); else setTab('cal');
  };

  const modals = (
    <>
      <SubjectModal visible={!!editModal} editSubject={subject} focusField={editModal ? editModal.field : undefined} onClose={() => setEditModal(false)} onSaved={() => { setEditModal(false); load(); }}
        onArchived={() => { setEditModal(false); router.replace('/materias'); }} />
      <TemplatePicker visible={picker} subjectId={subject.id} onClose={() => setPicker(false)} onPick={createNote} />
      <WoopSheet visible={woop} onClose={() => setWoop(false)} subjectId={subject.id} subject={subject.name} scale={scale} goal={goal} onSaved={setGoal} />
      <GradeModal visible={gradeModal} subjectId={subject.id} defaultScale={scale} editGrade={editGrade} onClose={() => { setGradeModal(false); setEditGrade(null); }} onSaved={() => { setGradeModal(false); setEditGrade(null); load(); }} />
      <ActionMenu visible={menu} title={subject.name} onClose={() => setMenu(false)} actions={[
        { label: 'Editar materia', icon: 'create-outline', onPress: () => setEditModal({}) },
        { label: 'Nueva nota', icon: 'document-text-outline', onPress: newNote },
        { label: 'Exportar notas en PDF', icon: 'share-outline', onPress: () => exportSubjectPdf(subject.name, iconChar(subject.icon, '📘'), notes).catch((e) => notify('No se pudo exportar', friendlyError(e))) },
        { label: 'Archivar materia', icon: 'archive-outline', danger: true, onPress: () => setEditModal({}) },
      ]} />
    </>
  );

  // ---------- Notas en el computador: lista + nota abierta ----------
  if (wideNotes) {
    const summary = [avg != null ? `${fmt(avg)} / ${scale}` : null, nextEval?.due ? `${nextEval.title}: ${countdown(nextEval.due).toLowerCase()}` : null].filter(Boolean).join(' · ');
    return (
      <Screen nav="materias" scroll={false} padded={false}>
        <View style={{ paddingHorizontal: 28, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line, marginTop: -14 }}>
          <SubjectCompactBar subject={subject} summary={summary} onBack={goBack}
            tabs={<SubjectTabs value={tab} onChange={setTab} counts={counts} accent={subject.color} pills />} />
        </View>
        <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
          <View style={{ width: 300, borderRightWidth: 1, borderRightColor: C.line }}>
            <ScrollColumn>
              <NotesList notes={notes} selectedId={shownNote} onOpen={pickNote} onNew={newNote} busyNew={busyNew}
                onScan={() => router.push({ pathname: '/capturar', params: { subjectId: id } } as any)} />
            </ScrollColumn>
          </View>
          {shownNote ? (
            <NoteDocument key={shownNote} noteId={shownNote} subjects={allSubjects.length ? allSubjects : [subject]} scroll side={width >= 1600} focusHeading={shownNote === nota ? titulo ?? null : null}
              startEditing={shownNote === newNoteId} onNoteChange={patchNote}
              onDeleted={(n) => { setNotes((xs) => xs.filter((x) => x.id !== n.id)); setOpenNote(null); router.setParams({ nota: undefined } as any); }} />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState icon="document-text-outline" title="Tus apuntes de esta materia van aquí" text="Escribe una nota con fórmulas, tablas e imágenes, o digitaliza una página de tu cuaderno."
                action={{ label: 'Nueva nota', icon: 'add', onPress: newNote }} />
            </View>
          )}
        </View>
        {modals}
      </Screen>
    );
  }

  // ---------- Vista normal: ficha + indicadores + pestañas ----------
  const body = (
    <>
      {tab === 'tareas' && (
        <View style={{ gap: 4 }}>
          <QuickTaskInput subject={subject} onCreated={load} />
          <SubjectTaskList pending={pending} done={done} steps={steps} onToggle={toggle} onRemove={remove}
            onStepsChange={(tid, next) => setSteps((s) => ({ ...s, [tid]: next }))} />
        </View>
      )}
      {tab === 'notas' && (
        <NotesList notes={notes} onOpen={pickNote} onNew={newNote} busyNew={busyNew} roomy
          onScan={() => router.push({ pathname: '/capturar', params: { subjectId: id } } as any)} />
      )}
      {tab === 'cal' && (
        <Grades subject={subject} grades={grades} avg={avg} doneWeight={doneWeight} scale={scale} passMark={passMark} target={goal?.target_grade != null ? Number(goal.target_grade) : null}
          onAdd={() => { setEditGrade(null); setGradeModal(true); }} onEdit={(g) => { setEditGrade(g); setGradeModal(true); }} onRemove={removeGrade} />
      )}
      {tab === 'files' && <SubjectFiles subjectId={subject.id} />}
    </>
  );

  return (
    <Screen nav="materias" maxWidth={1180}>
      <View style={{ gap: isWide ? 22 : 16 }}>
        <SubjectTopBar compact={!isWide} onBack={goBack} {...actions} />
        <SubjectHero subject={subject} days={days} isWide={isWide} onEdit={(f) => setEditModal({ field: f })} onSchedule={() => router.push('/horario')} />
        <SubjectStats d={stats} accent={subject.color} isWide={isWide}
          onGrades={() => setTab('cal')} onNext={openEval} onTasks={() => setTab('tareas')}
          onStudy={() => (study?.dueCards ? router.push('/repaso') : actions.onFocus())} />
        {nextCls?.now && (
          <Pressable onPress={classNote} accessibilityRole="button" style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: hovered ? subject.color + '30' : subject.color + '1c', borderWidth: 1, borderColor: subject.color + '66' })}>
            <Ionicons name="create-outline" size={18} color={subject.color} />
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', flex: 1 }}>Clase de {subject.name} ahora · Abrir apuntes de hoy</Text>
            <Ionicons name="chevron-forward" size={16} color={C.muted} />
          </Pressable>
        )}
        <GoalRow goal={goal} accent={subject.color} onPress={() => setWoop(true)} />
        <PrepRow text={prepText(quizzes) ?? (notes.length ? 'Ponte a prueba antes del parcial: un simulacro con preguntas de tus notas.' : null)}
          plan={examSessions.length ? planProgress(examSessions).text : null} accent={subject.color}
          onSim={() => router.push({ pathname: '/simulacro', params: { materia: subject.id } } as any)} />
        <SubjectTabs value={tab} onChange={setTab} counts={counts} accent={subject.color} pills={!isWide} short={!isWide} />
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{body}</View>
          {showRail && (
            <View style={{ width: 320 }}>
              <SubjectRail subject={subject} nextCls={nextCls} scheduleLoaded={!!slots} tasks={live} notes={notes}
                onOpenNote={pickNote} onAllNotes={() => setTab('notas')} onQuickNote={newNote} onAllFiles={() => setTab('files')}
                onTask={(t) => openTask(t)} onSchedule={() => router.push('/horario')} />
            </View>
          )}
        </View>
      </View>
      {modals}
    </Screen>
  );
}

// Meta WOOP de la materia (o la invitación a ponerse una).
function GoalRow({ goal, accent, onPress }: { goal: Goal | null; accent: string; onPress: () => void }) {
  if (!goal) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, minHeight: 34, borderRadius: 99, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
        <Ionicons name="flag-outline" size={15} color={accent} />
        <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>Ponerte una meta</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Meta: ${goal.wish}. Editar`}
      style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: accent + '55', backgroundColor: hovered ? C.surface2 : accent + '10' })}>
      <Ionicons name="flag" size={18} color={accent} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>Meta: {goal.wish}</Text>
        {!!goal.plan && <Text style={{ color: C.muted, fontSize: 12.5, fontStyle: 'italic' }}>{goal.plan}</Text>}
      </View>
      <Ionicons name="create-outline" size={16} color={C.muted} />
    </Pressable>
  );
}

// Preparación para el parcial: último simulacro y avance del plan de repaso.
function PrepRow({ text, plan, accent, onSim }: { text: string | null; plan: string | null; accent: string; onSim: () => void }) {
  if (!text && !plan) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, flexWrap: 'wrap' }}>
      <Ionicons name="clipboard-outline" size={20} color={accent} />
      <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
        {!!text && <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>{text}</Text>}
        {!!plan && <Text style={{ color: C.muted, fontSize: 12.5 }}>{plan}</Text>}
      </View>
      <Pressable onPress={onSim} accessibilityRole="button" style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
        <Ionicons name="play-outline" size={15} color={C.brand} />
        <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>Hacer simulacro</Text>
      </Pressable>
    </View>
  );
}

function ScrollColumn({ children }: { children: React.ReactNode }) {
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

// ---------- Calificaciones ----------
function Grades({ subject, grades, avg, doneWeight, scale, passMark, target, onAdd, onEdit, onRemove }: {
  subject: Subject; grades: Grade[]; avg: number | null; doneWeight: number; scale: number; passMark: number; target?: number | null;
  onAdd: () => void; onEdit: (g: Grade) => void; onRemove: (g: Grade) => void;
}) {
  const totalWeight = grades.reduce((a, g) => a + (g.weight || 0), 0);
  const missing = Math.max(0, 100 - totalWeight);
  return (
    <View style={{ maxWidth: 760 }}>
      <Card style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <View>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>Promedio actual</Text>
            <Text style={{ color: C.text, fontSize: 32, fontWeight: '800' }}>{avg == null ? 'Sin notas' : avg.toFixed(2)}{avg != null && <Text style={{ color: C.muted, fontSize: 15, fontWeight: '600' }}> / {scale}</Text>}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>Calificado</Text>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{doneWeight}%</Text>
          </View>
        </View>
        {/* Barra del semestre: lo calificado, lo pendiente y lo que falta registrar. */}
        <View style={{ height: 10, borderRadius: 8, backgroundColor: C.surface2, flexDirection: 'row', overflow: 'hidden' }} accessibilityLabel={`Calificado ${doneWeight}%, pendiente ${Math.max(0, totalWeight - doneWeight)}%, sin registrar ${missing}%`}>
          <View style={{ width: `${Math.min(100, doneWeight)}%`, backgroundColor: subject.color }} />
          <View style={{ width: `${Math.min(100, Math.max(0, totalWeight - doneWeight))}%`, backgroundColor: subject.color + '55' }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          <Legend color={subject.color} text={`Calificado ${doneWeight}%`} />
          {totalWeight - doneWeight > 0 && <Legend color={subject.color + '55'} text={`Por calificar ${totalWeight - doneWeight}%`} />}
          {missing > 0 && <Legend color={C.surface2} text={`Sin registrar ${missing}%`} />}
        </View>
        <Simulator key={String(target ?? '')} grades={grades} scale={scale} passMark={target ?? passMark} />
      </Card>
      {missing > 0 && grades.length > 0 && (
        <Text style={{ color: C.muted, fontSize: 13, marginBottom: 6, lineHeight: 18 }}>
          Te falta registrar el {missing}% de la nota. Agrega las evaluaciones que faltan (aunque no tengan nota) para que el cálculo sea exacto.
        </Text>
      )}
      <SectionLabel text="Evaluaciones" count={grades.length} right={<Button label="Agregar" icon="add" size="sm" kind="secondary" onPress={onAdd} />} />
      {grades.length === 0 && <EmptyState compact icon="ribbon-outline" title="Sin evaluaciones" text="Agrega los parciales, talleres y quices con su peso. Puedes dejar la nota vacía hasta que te la den." />}
      {grades.map((g) => (
        <Card key={g.id} style={{ marginBottom: 8, paddingVertical: 12 }} onPress={() => onEdit(g)} accessibilityLabel={`Editar ${g.name}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }}>{g.name}</Text>
              <Text style={{ color: C.muted, fontSize: 12.5 }}>Peso {g.weight}%{g.score != null ? ` · aporta ${((g.score / g.max_score) * scale * g.weight / 100).toFixed(2)}` : ''}</Text>
            </View>
            <Text style={{ color: g.score == null ? C.muted : g.score / g.max_score < 0.6 ? C.badText : C.text, fontSize: 16, fontWeight: '700' }}>{g.score == null ? 'Pendiente' : g.score}<Text style={{ color: C.muted, fontWeight: '500', fontSize: 13 }}>{g.score == null ? '' : ` / ${g.max_score}`}</Text></Text>
            <IconButton icon="create-outline" label={`Editar ${g.name}`} onPress={() => onEdit(g)} />
            <IconButton icon="trash-outline" label={`Borrar ${g.name}`} onPress={() => onRemove(g)} />
          </View>
          <View style={{ height: 5, backgroundColor: C.surface2, borderRadius: 6, marginTop: 6 }}>
            <View style={{ height: '100%', width: `${g.score == null ? 0 : Math.min(100, (g.score / g.max_score) * 100)}%`, backgroundColor: subject.color, borderRadius: 6 }} />
          </View>
        </Card>
      ))}
    </View>
  );
}
function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, borderWidth: 1, borderColor: C.line }} />
      <Text style={{ color: C.muted, fontSize: 12.5 }}>{text}</Text>
    </View>
  );
}

function Simulator({ grades, scale, passMark }: { grades: Grade[]; scale: number; passMark: number }) {
  const [target, setTarget] = useState(passMark.toFixed(1));
  const t = parseFloat(target.replace(',', '.'));
  const { needed, remainingWeight } = neededFor(grades, isNaN(t) ? passMark : t, scale);
  let msg = 'Ya están todas las notas.';
  if (remainingWeight > 0 && needed != null) {
    if (needed <= 0) msg = `Ya aseguraste el ${isNaN(t) ? passMark : t}. Bien hecho.`;
    else if (needed > scale) msg = `Con el ${remainingWeight}% que falta no alcanza para ${t}. El máximo posible es menor.`;
    else msg = `Necesitas ${needed.toFixed(2)} en promedio en el ${remainingWeight}% que falta.`;
  }
  return (
    <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Text style={{ color: C.muted, fontSize: 13.5 }}>Quiero sacar</Text>
      <TextInput value={target} onChangeText={setTarget} keyboardType="decimal-pad" accessibilityLabel="Nota final deseada"
        style={{ width: 64, textAlign: 'center', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 8, color: C.text, padding: 8, fontSize: 15, fontWeight: '700' }} />
      <Text style={{ color: C.text, fontSize: 13.5, flex: 1, minWidth: 200 }}>{msg}</Text>
    </View>
  );
}

export default function MateriaProtegida() {
  return <RequireAuth><MateriaDetalle /></RequireAuth>;
}
