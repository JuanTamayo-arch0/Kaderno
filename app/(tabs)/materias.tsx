import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, shadow, SUBJECT_COLORS, SUBJECT_ICONS } from '../../lib/theme';
import { useResponsive, SIDEBAR_W } from '../../lib/responsive';
import {
  Subject, Task, Note, Grade,
  getSubjects, addSubject, updateSubject, getTasks, getNotes, getAllGrades,
  addGrade, deleteGrade, gradeSummary, toggleTask, deleteTask,
  signedUrl, aiSummary, aiFlashcards, addFlashcards,
} from '../../lib/db';
import { exportSubjectPdf } from '../../lib/exportPdf';
import * as ImagePicker from 'expo-image-picker';
import { MarkdownEditor } from '../../components/MarkdownEditor';
import { NoteAttachments } from '../../components/NoteAttachments';
import { SubjectFiles } from '../../components/SubjectFiles';
import { SubjectIcon, iconChar, isPhotoIcon } from '../../components/SubjectIcon';
import { MiniCalendar } from '../../components/MiniCalendar';
import { TaskModal } from '../../components/TaskModal';
import { taskTypeMeta } from '../../lib/taskTypes';
import { updateNote, indexNote } from '../../lib/db';
import { Header } from '../../components/ui';

export default function Materias() {
  const { isWide } = useResponsive();
  if (isWide) return <MateriasDesktop />;
  return <MateriasMobile />;
}

// ===================== MÓVIL =====================
function MateriasMobile() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, t, n] = await Promise.all([getSubjects(), getTasks(), getNotes()]);
      setSubjects(s); setTasks(t); setNotes(n);
    } catch (e: any) { Alert.alert('Error', e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Materias" subtitle="Organiza por asignatura" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {subjects.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 50 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 32 }}>📚</Text>
            </View>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Aún no tienes materias</Text>
            <Text style={{ color: C.muted, marginTop: 4, fontSize: 13, textAlign: 'center' }}>Crea tu primera materia para empezar a organizar tareas y notas.</Text>
          </View>
        )}
        {subjects.map((s) => {
          const pend = tasks.filter((t) => t.subject_id === s.id && t.status !== 'done').length;
          const nc = notes.filter((n) => n.subject_id === s.id).length;
          return (
            <Pressable key={s.id} onPress={() => router.push(`/materia/${s.id}`)}
              style={({ pressed }) => [row, { opacity: pressed ? 0.7 : 1 }]}>
              <View style={[ico, { backgroundColor: s.color + '22', overflow: 'hidden' }]}>
                <SubjectIcon icon={s.icon} box={42} emoji={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '600' }}>{s.name}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>{nc} notas{s.credits ? ` · ${s.credits} créd.` : ''}</Text>
              </View>
              <Text style={{ color: C.muted, fontSize: 12 }}>{pend} pend.</Text>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          );
        })}
        <Pressable onPress={() => setModal(true)} style={ghost}>
          <Text style={{ color: C.text }}>＋ Nueva materia</Text>
        </Pressable>
      </ScrollView>

      <SubjectModal visible={modal} onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); }} />
    </View>
  );
}

// ===================== ESCRITORIO (maestro-detalle) =====================
function MateriasDesktop() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [tab, setTab] = useState<'tareas' | 'notas' | 'cal' | 'files'>('tareas');
  const [selNote, setSelNote] = useState<Note | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [subjModal, setSubjModal] = useState(false);
  const [editSubj, setEditSubj] = useState<Subject | null>(null);
  const [gradeModal, setGradeModal] = useState(false);
  const [busyAI, setBusyAI] = useState<'' | 'sum' | 'cards'>('');
  const [summary, setSummary] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [origZoom, setOrigZoom] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, t, n, g] = await Promise.all([getSubjects(), getTasks(), getNotes(), getAllGrades()]);
      setSubjects(s); setTasks(t); setNotes(n); setGrades(g);
      setSelId((prev) => prev ?? (s[0]?.id ?? null));
    } catch (e: any) { Alert.alert('Error', e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    setSelNote(null); setPhoto(null); setSummary(null); setTab('tareas');
  }, [selId]);
  useEffect(() => {
    setSummary(selNote?.summary ?? null);
    setNoteContent(selNote?.content ?? '');
    if (selNote?.image_path) signedUrl(selNote.image_path).then(setPhoto).catch(() => {});
    else setPhoto(null);
  }, [selNote]);

  async function saveNoteContent() {
    if (!selNote) return;
    setSavingNote(true);
    try { await updateNote(selNote.id, { content: noteContent }); indexNote(selNote.id, noteContent, selNote.subject_id); setSelNote({ ...selNote, content: noteContent }); load(); }
    catch (e: any) { Alert.alert('Error', e.message); } finally { setSavingNote(false); }
  }

  const sel = subjects.find((x) => x.id === selId) ?? null;
  const pendOf = (id: string) => tasks.filter((t) => t.subject_id === id && t.status !== 'done').length;
  const avgOf = (id: string) => {
    const items = grades.filter((x) => x.subject_id === id && x.score != null && x.weight > 0);
    const w = items.reduce((a, i) => a + i.weight, 0);
    if (!w) return 0;
    return items.reduce((a, i) => a + (i.score as number) * i.weight, 0) / w;
  };
  const subjTasks = tasks.filter((t) => t.subject_id === selId)
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const subjNotes = notes.filter((n) => n.subject_id === selId);
  const subjGrades = grades.filter((g) => g.subject_id === selId);

  async function makeSummary() {
    if (!noteContent.trim() || !selNote) return;
    setBusyAI('sum');
    try { const sres = await aiSummary(noteContent); setSummary(sres); await updateNote(selNote.id, { summary: sres }); }
    catch (e: any) { Alert.alert('No se pudo', e.message); } finally { setBusyAI(''); }
  }
  async function makeCards() {
    if (!noteContent.trim() || !selNote) return;
    setBusyAI('cards');
    try { const cs = await aiFlashcards(noteContent); if (!cs.length) throw new Error('Sin tarjetas'); await addFlashcards(cs, selNote.id, selNote.subject_id); Alert.alert('¡Listo!', `${cs.length} flashcards creadas.`); }
    catch (e: any) { Alert.alert('No se pudo', e.message); } finally { setBusyAI(''); }
  }

  const passMark = (subjGrades[0]?.max_score ?? 5) === 100 ? 60 : (subjGrades[0]?.max_score ?? 5) * 0.6;
  const gs = gradeSummary(subjGrades, passMark);
  const scale = subjGrades[0]?.max_score ?? 5;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: SIDEBAR_W }}>
      <View style={{ flex: 1, paddingVertical: 36, paddingHorizontal: 44 }}>
        <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>Materias</Text>
        <Text style={{ color: C.muted, fontSize: 14, marginTop: 4, marginBottom: 20 }}>Organiza por asignatura</Text>

        <View style={{ flexDirection: 'row', gap: 20, flex: 1, minHeight: 0 }}>
          {/* Lista (maestro) */}
          <View style={{ width: 320, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 10 }}>
            <ScrollView>
              {subjects.map((su) => {
                const active = su.id === selId;
                return (
                  <Pressable key={su.id} onPress={() => setSelId(su.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10, marginBottom: 4, backgroundColor: active ? C.surface2 : 'transparent', borderWidth: 1, borderColor: active ? su.color : 'transparent' }}>
                    <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: su.color + '30', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <SubjectIcon icon={su.icon} box={34} emoji={16} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{su.name}</Text>
                      <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{pendOf(su.id)} pend. · prom. {avgOf(su.id).toFixed(1)}{su.credits ? ` · ${su.credits} créd.` : ''}</Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => { setEditSubj(null); setSubjModal(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginTop: 4 }}>
                <Ionicons name="add" size={16} color={C.muted} />
                <Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}>Nueva materia</Text>
              </Pressable>
            </ScrollView>
          </View>

          {/* Detalle */}
          <View style={{ flex: 1, minWidth: 0, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 24 }}>
            {!sel ? (
              <Text style={{ color: C.muted }}>Crea o selecciona una materia.</Text>
            ) : selNote ? (
              // ----- Detalle de nota inline -----
              <ScrollView>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Pressable onPress={() => setSelNote(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="chevron-back" size={16} color={C.muted} />
                    <Text style={{ color: C.muted, fontSize: 13 }}>Volver a notas</Text>
                  </Pressable>
                  {photo && (
                    <Pressable onPress={() => setOrigZoom(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="image-outline" size={16} color={C.muted} />
                      <Text style={{ color: C.muted, fontSize: 13 }}>Ver original</Text>
                    </Pressable>
                  )}
                </View>
                <View style={{ maxWidth: 820, width: '100%' }}>
                  <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>{selNote.title || 'Nota'}</Text>
                  <Text style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>{new Date(selNote.created_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                  <MarkdownEditor value={noteContent} onChange={setNoteContent} minHeight={420} />
                  {noteContent !== (selNote.content ?? '') && (
                    <Pressable onPress={saveNoteContent} disabled={savingNote} style={{ backgroundColor: C.brand, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10 }}>
                      <Text style={{ color: '#0f1115', fontWeight: '700' }}>{savingNote ? 'Guardando…' : 'Guardar cambios'}</Text>
                    </Pressable>
                  )}

                  <NoteAttachments noteId={selNote.id} />

                  <Text style={{ color: C.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '700', marginTop: 24, marginBottom: 10 }}>Estudiar con IA</Text>
                  {summary && (
                    <View style={{ backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                      <Text style={{ color: C.brand2, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>✨ Resumen IA</Text>
                      <Text style={{ color: C.muted, fontSize: 13, lineHeight: 21 }}>{summary}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={makeSummary} disabled={!!busyAI} style={{ backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 }}>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{busyAI === 'sum' ? 'Resumiendo…' : summary ? '↻ Resumen' : '✨ Resumir'}</Text>
                    </Pressable>
                    <Pressable onPress={makeCards} disabled={!!busyAI} style={{ backgroundColor: C.brand, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 }}>
                      <Text style={{ color: '#0f1115', fontSize: 14, fontWeight: '700' }}>{busyAI === 'cards' ? 'Creando…' : 'Generar flashcards'}</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={() => router.push({ pathname: '/oraculo', params: { mode: 'note', noteId: selNote.id, subjectId: selNote.subject_id ?? '', noteTitle: selNote.title ?? 'Nota' } })}
                    style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: C.brand2 + '22', borderColor: C.brand2 + '55', borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, marginTop: 12, alignSelf: 'flex-start' }}>
                    <Text style={{ fontSize: 15 }}>🔮</Text>
                    <Text style={{ color: C.brand2, fontSize: 14, fontWeight: '700' }}>Preguntar al Oráculo</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              // ----- Detalle de materia con tabs -----
              <View style={{ flex: 1, minHeight: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: sel.color + '30', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <SubjectIcon icon={sel.icon} box={42} emoji={20} />
                    </View>
                    <Text numberOfLines={1} style={{ color: C.text, fontSize: 20, fontWeight: '800', flex: 1 }}>{sel.name}</Text>
                    {sel.credits ? <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>{sel.credits} créd.</Text> : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => { setEditSubj(sel); setSubjModal(true); }}
                      accessibilityLabel="Editar materia"
                      style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="create-outline" size={15} color={C.muted} />
                    </Pressable>
                    <Pressable onPress={() => exportSubjectPdf(sel.name, iconChar(sel.icon), subjNotes).catch((e) => Alert.alert('Error', e.message))}
                      accessibilityLabel="Exportar PDF"
                      style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="share-outline" size={15} color={C.muted} />
                    </Pressable>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 18, borderBottomWidth: 1, borderBottomColor: C.line, marginBottom: 20 }}>
                  {(['tareas', 'notas', 'cal', 'files'] as const).map((tk) => (
                    <Pressable key={tk} onPress={() => setTab(tk)} style={{ paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: tab === tk ? sel.color : 'transparent' }}>
                      <Text style={{ color: tab === tk ? C.text : C.muted, fontSize: 13, fontWeight: '700' }}>{tk === 'tareas' ? 'Tareas' : tk === 'notas' ? 'Notas' : tk === 'cal' ? 'Calificaciones' : 'Archivos'}</Text>
                    </Pressable>
                  ))}
                </View>

                <ScrollView style={{ flex: 1 }}>
                  {tab === 'tareas' && (
                    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                      <View style={{ width: 316 }}>
                        <MiniCalendar tasks={tasks} subjects={subjects} embedded />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                      <Pressable onPress={() => { setEditingTask(null); setTaskModal(true); }} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand, borderRadius: 10, padding: 11, marginBottom: 12 }}>
                        <Ionicons name="add" size={18} color="#0f1115" />
                        <Text style={{ color: '#0f1115', fontWeight: '700' }}>Nueva tarea o examen</Text>
                      </Pressable>
                      {subjTasks.length === 0 ? <Text style={{ color: C.muted, paddingVertical: 20 }}>Sin tareas en esta materia.</Text>
                        : <View style={{ gap: 8 }}>
                          {subjTasks.map((t) => { const tm = taskTypeMeta(t.type); return (
                            <View key={t.id} style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderLeftWidth: 4, borderLeftColor: t.status === 'done' ? C.line : tm.color }}>
                              <Pressable onPress={async () => { await toggleTask(t.id, t.status !== 'done'); load(); }}
                                style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: t.status === 'done' ? C.good : 'transparent', borderWidth: t.status === 'done' ? 0 : 1.5, borderColor: C.line }}>
                                {t.status === 'done' && <Ionicons name="checkmark" size={13} color="#0f1115" />}
                              </Pressable>
                              <Pressable style={{ flex: 1 }} onPress={() => { setEditingTask(t); setTaskModal(true); }}>
                                <Text style={{ color: t.status === 'done' ? C.muted : C.text, fontWeight: '600', textDecorationLine: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</Text>
                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                                  {t.type && t.type !== 'tarea' && <Text style={{ color: tm.color, fontSize: 12, fontWeight: '700' }}>{tm.icon} {tm.label}</Text>}
                                  <Text style={{ color: C.muted, fontSize: 12 }}>{t.due_date ?? 'Sin fecha'}</Text>
                                </View>
                              </Pressable>
                              <Pressable onPress={async () => { await deleteTask(t.id); load(); }} hitSlop={8} accessibilityLabel="Eliminar"><Ionicons name="trash-outline" size={16} color={C.muted} /></Pressable>
                            </View>
                          ); })}
                        </View>}
                      </View>
                    </View>
                  )}

                  {tab === 'notas' && (
                    subjNotes.length === 0 ? <Text style={{ color: C.muted, paddingVertical: 20 }}>Aún no hay notas. Ve a "Capturar".</Text>
                      : <View style={{ gap: 10 }}>
                        {subjNotes.map((n) => (
                          <Pressable key={n.id} onPress={() => setSelNote(n)} style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>📝 {n.title}</Text>
                              <Ionicons name="chevron-forward" size={14} color={C.muted} />
                            </View>
                            <Text numberOfLines={2} style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>{n.content}</Text>
                          </Pressable>
                        ))}
                      </View>
                  )}

                  {tab === 'cal' && (
                    <View>
                      <View style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 18, marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                          <View>
                            <Text style={{ color: C.muted, fontSize: 12 }}>Promedio actual</Text>
                            <Text style={{ color: C.text, fontSize: 32, fontWeight: '800' }}>{gs.current.toFixed(1)}<Text style={{ color: C.muted, fontSize: 15, fontWeight: '600' }}> / {scale}</Text></Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: C.muted, fontSize: 12 }}>Calificado</Text>
                            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{gs.doneWeight}%</Text>
                          </View>
                        </View>
                        <View style={{ height: 8, backgroundColor: C.bg, borderRadius: 8, marginBottom: 10, position: 'relative' }}>
                          <View style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, (gs.current / scale) * 100)}%`, backgroundColor: sel.color, borderRadius: 8 }} />
                          <View style={{ position: 'absolute', left: `${(passMark / scale) * 100}%`, top: -3, width: 2, height: 14, backgroundColor: C.muted }} />
                        </View>
                        {gs.remainingWeight > 0 && gs.needed != null && (
                          <Text style={{ color: C.muted, fontSize: 13 }}>
                            {gs.needed <= 0 ? `✓ Ya aseguraste el ${passMark.toFixed(1)}.` : gs.needed > scale ? `Con el ${gs.remainingWeight}% restante no alcanza para ${passMark.toFixed(1)}.` : `Para aprobar (${passMark.toFixed(1)}) necesitas ${gs.needed.toFixed(1)} en el ${gs.remainingWeight}% restante.`}
                          </Text>
                        )}
                      </View>
                      <View style={{ gap: 8 }}>
                        {subjGrades.map((it) => (
                          <View key={it.id} style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 14 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <View>
                                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{it.name}</Text>
                                <Text style={{ color: C.muted, fontSize: 12 }}>Peso {it.weight}%</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{it.score == null ? '—' : it.score}<Text style={{ color: C.muted, fontWeight: '500' }}>/{it.max_score}</Text></Text>
                                <Pressable onPress={async () => { await deleteGrade(it.id); load(); }} hitSlop={8} accessibilityLabel="Eliminar"><Ionicons name="trash-outline" size={15} color={C.muted} /></Pressable>
                              </View>
                            </View>
                            <View style={{ height: 5, backgroundColor: C.bg, borderRadius: 6 }}>
                              <View style={{ height: '100%', width: `${it.score == null ? 0 : Math.min(100, (it.score / it.max_score) * 100)}%`, backgroundColor: sel.color, borderRadius: 6 }} />
                            </View>
                          </View>
                        ))}
                        <Pressable onPress={() => setGradeModal(true)} style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 4 }}>
                          <Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}>+ Agregar evaluación</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {tab === 'files' && <SubjectFiles subjectId={sel.id} />}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </View>

      <SubjectModal visible={subjModal} editSubject={editSubj} onClose={() => { setSubjModal(false); setEditSubj(null); }} onSaved={() => { setSubjModal(false); setEditSubj(null); load(); }} />
      {sel && <GradeModal visible={gradeModal} subjectId={sel.id} onClose={() => setGradeModal(false)} onSaved={() => { setGradeModal(false); load(); }} />}
      <TaskModal visible={taskModal} subjects={subjects} editTask={editingTask} initialSubjectId={sel?.id ?? null}
        onClose={() => setTaskModal(false)} onSaved={() => { setTaskModal(false); load(); }} />

      <Modal visible={origZoom} transparent onRequestClose={() => setOrigZoom(false)}>
        <Pressable onPress={() => setOrigZoom(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
          {photo && <Image source={{ uri: photo }} style={{ width: '90%', height: '85%' }} resizeMode="contain" />}
          <Text style={{ color: C.muted, marginTop: 16, fontSize: 13 }}>Toca para cerrar</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

// ===================== Modales compartidos =====================
export function SubjectModal({ visible, editSubject, onClose, onSaved }: { visible: boolean; editSubject?: Subject | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [hexText, setHexText] = useState(SUBJECT_COLORS[0]);
  const [icon, setIcon] = useState(SUBJECT_ICONS[0]);
  const [credits, setCredits] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible && editSubject) {
      setName(editSubject.name);
      setColor(editSubject.color); setHexText(editSubject.color);
      setIcon(editSubject.icon);
      setCredits(editSubject.credits ? String(editSubject.credits) : '');
    } else if (visible && !editSubject) {
      setName(''); setColor(SUBJECT_COLORS[0]); setHexText(SUBJECT_COLORS[0]); setIcon(SUBJECT_ICONS[0]); setCredits('');
    }
  }, [visible, editSubject]);

  function onHexChange(t: string) {
    let v = t.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    v = v.slice(0, 7);
    setHexText(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v);
  }

  async function pickIcon() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const uri = a.uri?.startsWith('data:') ? a.uri : (a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
      if (uri) setIcon(uri);
    } catch (e: any) { Alert.alert('No se pudo cargar la imagen', e.message); }
  }

  async function save() {
    if (!name.trim()) return Alert.alert('Nombre de la materia');
    setBusy(true);
    try {
      if (editSubject) await updateSubject(editSubject.id, { name: name.trim(), color, icon, credits: parseInt(credits || '0', 10) });
      else await addSubject(name.trim(), color, icon, parseInt(credits || '0', 10));
      setName(''); setCredits(''); onSaved();
    }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 420, maxHeight: '88%' }}>
          <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>{editSubject ? 'Editar materia' : 'Nueva materia'}</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Ej: Física" placeholderTextColor={C.muted} style={input} />
          <Text style={lbl}>Créditos</Text>
          <TextInput value={credits} onChangeText={setCredits} keyboardType="number-pad" placeholder="Ej: 3" placeholderTextColor={C.muted} style={input} />
          <Text style={lbl}>Color</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {SUBJECT_COLORS.map((c) => (
              <Pressable key={c} onPress={() => { setColor(c); setHexText(c); }} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: 3, borderColor: color.toLowerCase() === c.toLowerCase() ? '#fff' : 'transparent' }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color, borderWidth: 1, borderColor: C.line }} />
            <TextInput value={hexText} onChangeText={onHexChange} autoCapitalize="none" autoCorrect={false} placeholder="#4F8CFF" placeholderTextColor={C.muted} style={[input, { flex: 1 }]} maxLength={7} />
          </View>
          <Text style={lbl}>Ícono</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            {SUBJECT_ICONS.map((i) => (
              <Pressable key={i} onPress={() => setIcon(i)} style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: icon === i ? C.brand : 'transparent' }}>
                <Text style={{ fontSize: 18 }}>{i}</Text>
              </Pressable>
            ))}
            <Pressable onPress={pickIcon} style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: isPhotoIcon(icon) ? C.brand : C.line, borderStyle: isPhotoIcon(icon) ? 'solid' : 'dashed', overflow: 'hidden' }}>
              {isPhotoIcon(icon) ? <SubjectIcon icon={icon} box={38} emoji={18} /> : <Ionicons name="image-outline" size={18} color={C.muted} />}
            </Pressable>
          </View>
          <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 8 }}>Toca el recuadro con la imagen para subir una foto como ícono.</Text>
          <Pressable onPress={save} disabled={busy} style={btnPrimary}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '...' : editSubject ? 'Guardar cambios' : 'Crear materia'}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}><Text style={{ color: C.muted }}>Cancelar</Text></Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function GradeModal({ visible, subjectId, onClose, onSaved }: { visible: boolean; subjectId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('5');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || !weight) return Alert.alert('Falta nombre o peso');
    setBusy(true);
    try {
      await addGrade({ subject_id: subjectId, name: name.trim(), weight: parseFloat(weight), score: score ? parseFloat(score) : null, max_score: parseFloat(maxScore || '5') });
      setName(''); setWeight(''); setScore(''); setMaxScore('5'); onSaved();
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 460 }}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Nueva evaluación</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Ej: Parcial 1" placeholderTextColor={C.muted} style={input} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <View style={{ flex: 1 }}><Text style={lbl2}>Peso (%)</Text><TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="30" placeholderTextColor={C.muted} style={input} /></View>
            <View style={{ flex: 1 }}><Text style={lbl2}>Nota</Text><TextInput value={score} onChangeText={setScore} keyboardType="decimal-pad" placeholder="4.2" placeholderTextColor={C.muted} style={input} /></View>
            <View style={{ flex: 1 }}><Text style={lbl2}>Sobre</Text><TextInput value={maxScore} onChangeText={setMaxScore} keyboardType="decimal-pad" placeholder="5" placeholderTextColor={C.muted} style={input} /></View>
          </View>
          <Pressable onPress={save} disabled={busy} style={btnPrimary}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '...' : 'Guardar'}</Text></Pressable>
          <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}><Text style={{ color: C.muted }}>Cancelar</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const row = { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.lg, padding: 14, marginBottom: 10, ...shadow } as const;
const ico = { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' } as const;
const ghost = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8 } as const;
const input = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 12, fontSize: 14 } as const;
const lbl = { color: C.muted, fontSize: 12, marginTop: 14, marginBottom: 8 } as const;
const lbl2 = { color: C.muted, fontSize: 12, marginBottom: 6 } as const;
const btnPrimary = { backgroundColor: C.brand, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 } as const;
