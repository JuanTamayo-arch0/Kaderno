import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { RequireAuth } from '../../components/RequireAuth';
import {
  Subject, Task, Note, Grade, Step, getSubjects, getTasks, getNotes, toggleTask, deleteTask, getGrades, deleteGrade, addNote, getStepsFor, hasV14,
} from '../../lib/db';
import { subjectAverage, neededFor } from '../../lib/grades';
import { compareDue } from '../../lib/time';
import { exportSubjectPdf } from '../../lib/exportPdf';
import { confirm, notify, toast, friendlyError } from '../../lib/feedback';
import { removeTask } from '../../lib/taskActions';
import { openTask, onDataChanged } from '../../lib/uiBus';
import { refreshNavCounts } from '../../lib/navCounts';
import { Screen, Button, Card, EmptyState, IconButton, Segmented, SectionLabel, Skeleton } from '../../components/ds';
import { TaskRow } from '../../components/TaskRow';
import { MiniCalendar } from '../../components/MiniCalendar';
import { SubjectFiles } from '../../components/SubjectFiles';
import { SubjectIcon, iconChar } from '../../components/SubjectIcon';
import { SubjectModal, GradeModal } from '../../components/SubjectModal';
import { ActionMenu } from '../../components/ActionMenu';

type Tab = 'tareas' | 'notas' | 'cal' | 'files';

function MateriaDetalle() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { isWide } = useResponsive();
  const [subject, setSubject] = useState<Subject | null | undefined>(undefined);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [steps, setSteps] = useState<Record<string, Step[]>>({});
  const [notes, setNotes] = useState<Note[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [tab, setTab] = useState<Tab>((['tareas', 'notas', 'cal', 'files'].includes(tabParam ?? '') ? tabParam : 'tareas') as Tab);
  const [editModal, setEditModal] = useState(false);
  const [gradeModal, setGradeModal] = useState(false);
  const [menu, setMenu] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [subs, t, n, g] = await Promise.all([getSubjects(), getTasks(id), getNotes(id), getGrades(id)]);
      setSubject(subs.find((s) => s.id === id) ?? null);
      setTasks(t); setNotes(n); setGrades(g); setHidden(new Set());
      getStepsFor(t.filter((x) => x.status !== 'done').map((x) => x.id)).then(setSteps).catch(() => {});
    } catch (e) { notify('No se pudo cargar', friendlyError(e)); setSubject((s) => s ?? null); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onDataChanged(load), [load]);

  async function toggle(t: Task) {
    const done = t.status !== 'done';
    setTasks((xs) => xs.map((x) => x.id === t.id ? { ...x, status: done ? 'done' : 'pending' } : x));
    try { await toggleTask(t.id, done); refreshNavCounts(true); if (done) toast(`Hecha: ${t.title}`, { tone: 'good', actionLabel: 'Deshacer', onAction: () => toggle({ ...t, status: 'done' }) }); }
    catch (e) { setTasks((xs) => xs.map((x) => x.id === t.id ? t : x)); toast(friendlyError(e), { tone: 'bad' }); }
  }
  function remove(t: Task) {
    removeTask(t, () => setHidden((h) => new Set(h).add(t.id)));
  }
  async function newNote() {
    try {
      const nid = await addNote({ subject_id: id, title: 'Nota sin título', content: '', image_path: null });
      router.push({ pathname: '/nota/[id]', params: { id: nid, edit: '1' } } as any);
    } catch (e) { notify('No se pudo crear la nota', friendlyError(e)); }
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
  const pending = live.filter((t) => t.status !== 'done').sort(compareDue);
  const done = live.filter((t) => t.status === 'done');
  const scale = grades[0]?.max_score ?? 5;
  const { avg, doneWeight } = subjectAverage(grades, scale);
  const passMark = scale === 100 ? 60 : scale * 0.6;

  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <IconButton icon="add" label="Nueva tarea" onPress={() => openTask(null, { subjectId: id })} color={C.text} />
      <IconButton icon="ellipsis-horizontal" label="Más opciones" onPress={() => setMenu(true)} color={C.text} />
    </View>
  );

  const tabs = (
    <Segmented value={tab} onChange={setTab} items={[
      { key: 'tareas', label: 'Tareas', count: pending.length },
      { key: 'notas', label: 'Notas', count: notes.length },
      { key: 'cal', label: 'Calificaciones' },
      { key: 'files', label: 'Archivos' },
    ]} />
  );

  return (
    <Screen back="/materias" nav="materias" title={subject.name} subtitle={subject.credits ? `${subject.credits} créditos` : undefined} right={head} header={tabs} maxWidth={1100}>
      <View style={{ height: 16 }} />
      {tab === 'tareas' && (
        <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0, width: isWide ? undefined : '100%' }}>
            <Button label="Nueva tarea o examen" icon="add" onPress={() => openTask(null, { subjectId: id })} style={{ marginBottom: 12, alignSelf: isWide ? 'flex-start' : 'stretch' }} />
            {pending.length === 0 ? (
              <EmptyState compact icon="checkmark-done-outline" title="Nada pendiente en esta materia" />
            ) : pending.map((t) => (
              <TaskRow key={t.id} task={t} showSubject={false} steps={steps[t.id]} onToggle={toggle} onOpen={(x) => openTask(x)}
                onStepsChange={(tid, next) => setSteps((s) => ({ ...s, [tid]: next }))}
                actions={[
                  { label: 'Abrir y editar', icon: 'create-outline', onPress: () => openTask(t) },
                  { label: 'Marcar hecha', icon: 'checkmark-circle-outline', onPress: () => toggle(t) },
                  { label: 'Borrar', icon: 'trash-outline', danger: true, onPress: () => remove(t) },
                ]} />
            ))}
            {done.length > 0 && (
              <>
                <Pressable onPress={() => setShowDone((v) => !v)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 }}>
                  <Ionicons name={showDone ? 'chevron-down' : 'chevron-forward'} size={16} color={C.muted} />
                  <Text style={{ color: C.muted, fontWeight: '600' }}>{done.length} {done.length === 1 ? 'completada' : 'completadas'}</Text>
                </Pressable>
                {showDone && done.map((t) => <TaskRow key={t.id} task={t} showSubject={false} onToggle={toggle} onOpen={(x) => openTask(x)} compact />)}
              </>
            )}
          </View>
          <View style={{ width: isWide ? 316 : '100%' }}>
            <MiniCalendar tasks={live} subjects={[subject]} embedded={isWide} onTaskPress={(t) => openTask(t)} />
          </View>
        </View>
      )}

      {tab === 'notas' && (
        <View>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <Button label="Nueva nota" icon="document-text-outline" onPress={newNote} />
            <Button label="Digitalizar apunte" icon="camera-outline" kind="secondary" onPress={() => router.push({ pathname: '/capturar', params: { subjectId: id } } as any)} />
          </View>
          {notes.length === 0 ? (
            <EmptyState compact icon="document-text-outline" title="Aún no hay notas" text="Escribe una nota o digitaliza una página de tu cuaderno." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {notes.map((n) => (
                <Card key={n.id} onPress={() => router.push(`/nota/${n.id}`)} accessibilityLabel={`Abrir nota ${n.title ?? ''}`} style={{ width: isWide ? '48.5%' : '100%' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name={n.image_path ? 'image-outline' : 'document-text-outline'} size={17} color={C.muted} />
                    <Text style={{ color: C.text, fontSize: 15, fontWeight: '700', flex: 1 }} numberOfLines={1}>{n.title || 'Nota'}</Text>
                    <Text style={{ color: C.muted, fontSize: 12 }}>{new Date(n.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</Text>
                  </View>
                  {!!n.content && <Text numberOfLines={2} style={{ color: C.muted, fontSize: 13, marginTop: 8, lineHeight: 18 }}>{n.content.replace(/[#>*_`]/g, '').trim()}</Text>}
                </Card>
              ))}
            </View>
          )}
        </View>
      )}

      {tab === 'cal' && (
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
            <View style={{ height: 8, backgroundColor: C.surface2, borderRadius: 8 }}>
              <View style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, ((avg ?? 0) / scale) * 100)}%`, backgroundColor: subject.color, borderRadius: 8 }} />
              <View style={{ position: 'absolute', left: `${(passMark / scale) * 100}%`, top: -3, width: 2, height: 14, backgroundColor: C.muted }} />
            </View>
            <Simulator grades={grades} scale={scale} passMark={passMark} />
          </Card>
          <SectionLabel text="Evaluaciones" count={grades.length} right={<Button label="Agregar" icon="add" size="sm" kind="secondary" onPress={() => setGradeModal(true)} />} />
          {grades.length === 0 && <EmptyState compact icon="ribbon-outline" title="Sin evaluaciones" text="Agrega los parciales, talleres y quices con su peso. Puedes dejar la nota vacía hasta que te la den." />}
          {grades.map((g) => (
            <Card key={g.id} style={{ marginBottom: 8, paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }}>{g.name}</Text>
                  <Text style={{ color: C.muted, fontSize: 12.5 }}>Peso {g.weight}%</Text>
                </View>
                <Text style={{ color: g.score == null ? C.muted : C.text, fontSize: 16, fontWeight: '700' }}>{g.score == null ? 'Pendiente' : g.score}<Text style={{ color: C.muted, fontWeight: '500', fontSize: 13 }}>{g.score == null ? '' : ` / ${g.max_score}`}</Text></Text>
                <IconButton icon="trash-outline" label={`Borrar ${g.name}`} onPress={() => removeGrade(g)} />
              </View>
              <View style={{ height: 5, backgroundColor: C.surface2, borderRadius: 6, marginTop: 6 }}>
                <View style={{ height: '100%', width: `${g.score == null ? 0 : Math.min(100, (g.score / g.max_score) * 100)}%`, backgroundColor: subject.color, borderRadius: 6 }} />
              </View>
            </Card>
          ))}
        </View>
      )}

      {tab === 'files' && <SubjectFiles subjectId={subject.id} />}

      <SubjectModal visible={editModal} editSubject={subject} onClose={() => setEditModal(false)} onSaved={() => { setEditModal(false); load(); }}
        onArchived={() => { setEditModal(false); router.replace('/materias'); }} />
      <GradeModal visible={gradeModal} subjectId={subject.id} defaultScale={scale} onClose={() => setGradeModal(false)} onSaved={() => { setGradeModal(false); load(); }} />
      <ActionMenu visible={menu} title={subject.name} onClose={() => setMenu(false)} actions={[
        { label: 'Editar materia', icon: 'create-outline', onPress: () => setEditModal(true) },
        { label: 'Exportar notas en PDF', icon: 'share-outline', onPress: () => exportSubjectPdf(subject.name, iconChar(subject.icon, '📘'), notes).catch((e) => notify('No se pudo exportar', friendlyError(e))) },
        { label: 'Preguntar al Oráculo sobre esta materia', icon: 'sparkles-outline', onPress: () => router.push({ pathname: '/oraculo', params: { mode: 'subject', subjectId: subject.id } } as any) },
        { label: 'Archivar materia', icon: 'archive-outline', danger: true, onPress: () => setEditModal(true) },
      ]} />
    </Screen>
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
