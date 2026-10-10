import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, S, R, shadow, fmtDate, dueTone } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import {
  Subject, Task, Note, Grade,
  getSubjects, getTasks, getNotes, toggleTask, deleteTask,
  getGrades, addGrade, deleteGrade, gradeSummary,
} from '../../lib/db';
import { exportSubjectPdf } from '../../lib/exportPdf';
import { SubjectFiles } from '../../components/SubjectFiles';
import { MiniCalendar } from '../../components/MiniCalendar';
import { SubjectIcon, iconChar } from '../../components/SubjectIcon';
import { TaskModal } from '../../components/TaskModal';
import { SubjectModal } from '../(tabs)/materias';
import { taskTypeMeta } from '../../lib/taskTypes';

type Tab = 'tareas' | 'notas' | 'notas_cal' | 'files';

export default function MateriaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isWide } = useResponsive();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [tab, setTab] = useState<Tab>('tareas');
  const [gradeModal, setGradeModal] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);

  const load = useCallback(async () => {
    try {
      const [subs, t, at, n, g] = await Promise.all([getSubjects(), getTasks(id), getTasks(), getNotes(id), getGrades(id)]);
      setSubject(subs.find((s) => s.id === id) ?? null); setAllSubjects(subs);
      setTasks(t); setAllTasks(at); setNotes(n); setGrades(g);
    } catch (e: any) { Alert.alert('Error', e.message); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const ordered = [...tasks].sort((a, b) =>
    Number(a.status === 'done') - Number(b.status === 'done') || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));

  async function doExport() {
    try { await exportSubjectPdf(subject?.name ?? 'Materia', iconChar(subject?.icon, '📘'), notes); }
    catch (e: any) { Alert.alert('Error al exportar', e.message); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={C.text} /></Pressable>
        {subject && <SubjectIcon icon={subject.icon} box={28} emoji={22} />}
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {subject ? subject.name : 'Materia'}
        </Text>
        <Pressable onPress={() => subject && setEditModal(true)} hitSlop={10} disabled={!subject} style={{ marginRight: 16 }}><Ionicons name="create-outline" size={22} color={C.muted} /></Pressable>
        <Pressable onPress={doExport} hitSlop={10}><Ionicons name="share-outline" size={22} color={C.muted} /></Pressable>
      </View>

      {/* Pestañas */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 14 }}>
        <Seg label="Tareas" active={tab === 'tareas'} onPress={() => setTab('tareas')} />
        <Seg label="Notas" active={tab === 'notas'} onPress={() => setTab('notas')} />
        <Seg label="Calif." active={tab === 'notas_cal'} onPress={() => setTab('notas_cal')} />
        <Seg label="Archivos" active={tab === 'files'} onPress={() => setTab('files')} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {tab === 'tareas' && (() => {
          const taskBtn = (
            <Pressable onPress={() => { setEditingTask(null); setTaskModal(true); }}
              style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand, borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <Ionicons name="add" size={18} color="#0f1115" />
              <Text style={{ color: '#0f1115', fontWeight: '700' }}>Nueva tarea o examen</Text>
            </Pressable>
          );
          const taskList = (
            <>
              {ordered.length === 0 && <Text style={{ color: C.muted, paddingVertical: 8 }}>Sin tareas en esta materia.</Text>}
              {ordered.map((t) => {
                const done = t.status === 'done';
                const tm = taskTypeMeta(t.type);
                return (
                  <View key={t.id} style={[card, { borderLeftWidth: 4, borderLeftColor: done ? C.line : tm.color }]}>
                    <Pressable onPress={async () => { await toggleTask(t.id, !done); load(); }}
                      style={[check, done && { backgroundColor: C.good, borderColor: C.good }]}>
                      {done && <Ionicons name="checkmark" size={15} color="#0b0d11" />}
                    </Pressable>
                    <Pressable style={{ flex: 1 }} onPress={() => { setEditingTask(t); setTaskModal(true); }}>
                      <Text style={{ color: done ? C.muted : C.text, fontWeight: '600', textDecorationLine: done ? 'line-through' : 'none' }}>{t.title}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 3, alignItems: 'center' }}>
                        {t.type && t.type !== 'tarea' && <Text style={{ color: tm.color, fontSize: 12, fontWeight: '700' }}>{tm.icon} {tm.label}</Text>}
                        <Text style={{ color: dueTone(t.due_date ?? '', done), fontSize: 12 }}>{fmtDate(t.due_date ?? '')}</Text>
                      </View>
                    </Pressable>
                    <Pressable onPress={async () => { await deleteTask(t.id); load(); }} hitSlop={10}>
                      <Ionicons name="trash-outline" size={18} color={C.muted} />
                    </Pressable>
                  </View>
                );
              })}
            </>
          );
          if (isWide) return (
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
              <View style={{ width: 316 }}><MiniCalendar tasks={allTasks} subjects={allSubjects} embedded /></View>
              <View style={{ flex: 1, minWidth: 0 }}>{taskBtn}{taskList}</View>
            </View>
          );
          return (
            <>
              <MiniCalendar tasks={allTasks} subjects={allSubjects} />
              {taskBtn}
              {taskList}
            </>
          );
        })()}

        {tab === 'notas' && (
          <>
            {notes.length === 0 && <Text style={{ color: C.muted, paddingVertical: 8 }}>Aún no hay notas. Ve a "Capturar".</Text>}
            {notes.map((n) => (
              <Pressable key={n.id} onPress={() => router.push(`/nota/${n.id}`)}
                style={({ pressed }) => [noteCard, { opacity: pressed ? 0.7 : 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ color: C.text, fontWeight: '600', flex: 1 }}>📝 {n.title}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.muted} />
                </View>
                <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={3}>{n.content}</Text>
                <Text style={{ color: C.brand, fontSize: 12, marginTop: 8 }}>Ver nota completa →</Text>
              </Pressable>
            ))}
          </>
        )}

        {tab === 'notas_cal' && (
          <GradesTab grades={grades} onAdd={() => setGradeModal(true)}
            onDelete={async (gid) => { await deleteGrade(gid); load(); }} />
        )}

        {tab === 'files' && <SubjectFiles subjectId={id} />}
      </ScrollView>

      <GradeModal visible={gradeModal} subjectId={id}
        onClose={() => setGradeModal(false)} onSaved={() => { setGradeModal(false); load(); }} />
      <TaskModal visible={taskModal} subjects={allSubjects} editTask={editingTask} initialSubjectId={id}
        onClose={() => setTaskModal(false)} onSaved={() => { setTaskModal(false); load(); }} />
      <SubjectModal visible={editModal} editSubject={subject}
        onClose={() => setEditModal(false)} onSaved={() => { setEditModal(false); load(); }} />
    </View>
  );
}

function GradesTab({ grades, onAdd, onDelete }: { grades: Grade[]; onAdd: () => void; onDelete: (id: string) => void }) {
  const scale = grades[0]?.max_score ?? 5;
  const passMark = scale === 100 ? 60 : scale * 0.6;
  const sum = gradeSummary(grades, passMark);

  return (
    <>
      <View style={[noteCard, { ...shadow }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: C.muted, fontSize: 12 }}>Promedio actual</Text>
            <Text style={{ color: C.text, fontSize: 34, fontWeight: '800' }}>
              {sum.current.toFixed(1)}<Text style={{ color: C.muted, fontSize: 16 }}> / {scale}</Text>
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: C.muted, fontSize: 12 }}>Calificado</Text>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{sum.doneWeight}%</Text>
          </View>
        </View>
        {sum.remainingWeight > 0 && sum.needed != null && (
          <View style={{ marginTop: 12, backgroundColor: C.surface2, borderRadius: R.md, padding: 12 }}>
            {sum.needed <= 0 ? (
              <Text style={{ color: C.good, fontSize: 13 }}>✓ Ya aseguraste el aprobado ({passMark.toFixed(1)}). ¡Bien ahí!</Text>
            ) : sum.needed > scale ? (
              <Text style={{ color: C.bad, fontSize: 13 }}>Con lo que falta ({sum.remainingWeight}%) no alcanza para {passMark.toFixed(1)}. Habla con tu profe 😅</Text>
            ) : (
              <Text style={{ color: C.text, fontSize: 13 }}>
                Para aprobar ({passMark.toFixed(1)}) necesitas <Text style={{ color: C.warn, fontWeight: '700' }}>{sum.needed.toFixed(1)}</Text> en el {sum.remainingWeight}% restante.
              </Text>
            )}
          </View>
        )}
      </View>

      {grades.map((g) => (
        <View key={g.id} style={card}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '600' }}>{g.name}</Text>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Peso {g.weight}%</Text>
          </View>
          <Text style={{ color: g.score == null ? C.muted : C.text, fontWeight: '700', fontSize: 16 }}>
            {g.score == null ? '—' : `${g.score}`}<Text style={{ color: C.muted, fontSize: 12 }}>/{g.max_score}</Text>
          </Text>
          <Pressable onPress={() => onDelete(g.id)} hitSlop={10} style={{ marginLeft: 12 }}>
            <Ionicons name="trash-outline" size={18} color={C.muted} />
          </Pressable>
        </View>
      ))}

      <Pressable onPress={onAdd} style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: R.md, padding: 13, alignItems: 'center', marginTop: 8 }}>
        <Text style={{ color: C.text }}>＋ Agregar evaluación</Text>
      </Pressable>
    </>
  );
}

function GradeModal({ visible, subjectId, onClose, onSaved }: {
  visible: boolean; subjectId: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('5');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || !weight) return Alert.alert('Falta nombre o peso');
    setBusy(true);
    try {
      await addGrade({
        subject_id: subjectId, name: name.trim(), weight: parseFloat(weight),
        score: score ? parseFloat(score) : null, max_score: parseFloat(maxScore || '5'),
      });
      setName(''); setWeight(''); setScore(''); setMaxScore('5');
      onSaved();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={sheet}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Nueva evaluación</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Ej: Parcial 1" placeholderTextColor={C.muted} style={input} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={lbl}>Peso (%)</Text>
              <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="30" placeholderTextColor={C.muted} style={input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={lbl}>Nota (opcional)</Text>
              <TextInput value={score} onChangeText={setScore} keyboardType="decimal-pad" placeholder="4.2" placeholderTextColor={C.muted} style={input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={lbl}>Sobre</Text>
              <TextInput value={maxScore} onChangeText={setMaxScore} keyboardType="decimal-pad" placeholder="5" placeholderTextColor={C.muted} style={input} />
            </View>
          </View>
          <Pressable onPress={save} disabled={busy} style={{ backgroundColor: C.brand, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 18 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '...' : 'Guardar'}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}>
            <Text style={{ color: C.muted }}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, paddingVertical: 9, borderRadius: R.md, alignItems: 'center', backgroundColor: active ? C.brand : C.surface2, borderWidth: 1, borderColor: active ? C.brand : C.line }}>
      <Text style={{ color: active ? '#0b0d11' : C.muted, fontSize: 12.5, fontWeight: active ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

const card = { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.lg, padding: 14, marginBottom: 8, ...shadow } as const;
const noteCard = { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.lg, padding: 14, marginBottom: 8 } as const;
const check = { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' } as const;
const sheet = { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30, borderTopColor: C.line, borderTopWidth: 1 } as const;
const input = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 12, fontSize: 14 } as const;
const lbl = { color: C.muted, fontSize: 12, marginBottom: 6 } as const;
