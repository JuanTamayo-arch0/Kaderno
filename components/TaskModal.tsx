import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import { SubjectPicker } from './SubjectPicker';
import { SubtaskList, isTempStep } from './SubtaskList';
import { DateField, TimeField, DateShortcuts } from './DateTime';
import { Button, Field, IconButton } from './ds';
import { taskTypeList, loadTaskTypes, slugify } from '../lib/taskTypes';
import { Step, Subject, Task, addStep, addTask, getSteps, updateTask, upsertTaskType, deleteTask, restoreTask, hasV14 } from '../lib/db';
import { REMIND_OPTIONS, RemindChoice, inferChoice, remindAt, remindDays } from '../lib/reminders';
import { combine, dueTimeHHMM, isoDate } from '../lib/time';
import { notify, toast, friendlyError, deleteWithUndo } from '../lib/feedback';
import { scheduleLocalReminder } from '../lib/notifications';
import { removeTask } from '../lib/taskActions';
import { StepSuggestions } from './StepSuggestions';
import { startFocus } from '../lib/focusTimer';
import type { TaskDraft } from '../lib/uiBus';

// ============================================================
//  Crear / editar tarea personal.
//  Novedades v12: hora opcional, aviso exacto (1 hora antes, la noche
//  anterior...), tiempo estimado, crear un tipo nuevo sin salir del
//  formulario, borrar con "Deshacer" y empezar a enfocarse en la tarea.
// ============================================================

const TYPE_COLORS = ['#6c8cff', '#37c98b', '#f5b64c', '#f56c6c', '#8b6cff', '#22c1c3', '#ff8fab'];
const ESTIMATES = [15, 30, 60, 90, 120, 180];

export function TaskModal({ visible, subjects, editTask, draft, initialSubjectId, onClose, onSaved, onDeleted }: {
  visible: boolean; subjects: Subject[]; editTask: Task | null; draft?: TaskDraft | null; initialSubjectId?: string | null;
  onClose: () => void; onSaved: (id?: string) => void; onDeleted?: (id: string) => void;
}) {
  const { isWide } = useResponsive();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [type, setType] = useState<string>('tarea');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [remind, setRemind] = useState<RemindChoice>('evening');
  const [estimate, setEstimate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [typesRev, setTypesRev] = useState(0);
  const [newType, setNewType] = useState<{ label: string; icon: string } | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const t = editTask;
    const d = t?.due_at ? isoDate(new Date(t.due_at)) : t?.due_date ?? draft?.dueDate ?? (t ? null : isoDate(new Date()));
    const tm = t ? dueTimeHHMM(t) : draft?.dueTime ?? null;
    setTitle(t?.title ?? draft?.title ?? '');
    setDescription(t?.description ?? '');
    setSubjectId(t ? t.subject_id : draft?.subjectId ?? initialSubjectId ?? null);
    setType(t?.type ?? draft?.typeKey ?? 'tarea');
    setDate(d);
    setTime(tm);
    setRemind(t ? inferChoice(t.remind_at, t.remind_days, d, tm) : (tm ? '1h' : 'evening'));
    setEstimate(t?.estimate_min ?? null);
    setSteps([]);
    setNewType(null);
    setTitleError(null);
    setMore(!!(t?.description || t?.estimate_min));
    loadTaskTypes().then(() => setTypesRev((n) => n + 1)).catch(() => {});
    if (t) getSteps(t.id).then(setSteps).catch(() => {});
  }, [visible, editTask, draft, initialSubjectId]);

  const types = useMemo(() => taskTypeList(), [typesRev, visible]);
  const doneSteps = steps.filter((s) => s.done).length;
  const v14 = hasV14();

  async function save() {
    if (!title.trim()) { setTitleError('Escribe un título.'); return; }
    setBusy(true);
    try {
      const at = remindAt(remind, date, time);
      const payload = {
        title: title.trim(), subject_id: subjectId, type,
        description: description.trim() ? description.trim() : null,
        due_date: date, due_at: date && time ? combine(date, time) : null,
        remind_days: remindDays(remind), remind_at: at ? at.toISOString() : null,
        estimate_min: estimate,
      };
      let id = editTask?.id;
      if (editTask) {
        await updateTask(editTask.id, payload);
      } else {
        id = await addTask(payload);
        const pend = steps.filter(isTempStep);
        for (let i = 0; i < pend.length; i++) {
          try { await addStep(id, pend[i].title, i); } catch { /* la tarea ya quedó creada */ }
        }
      }
      if (at) scheduleLocalReminder(title.trim(), at).catch(() => {});
      toast(editTask ? 'Cambios guardados' : 'Tarea creada', { tone: 'good' });
      onSaved(id);
    } catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }

  // Agrega los pasos sugeridos: directo a la base si la tarea ya existe, en
  // memoria (ids tmp-*) si se está creando.
  async function addSuggested(titles: string[]) {
    if (editTask) {
      const added: Step[] = [];
      for (let i = 0; i < titles.length; i++) {
        try { added.push(await addStep(editTask.id, titles[i], steps.length + i)); } catch (e) { notify('No se pudo agregar el paso', friendlyError(e)); break; }
      }
      setSteps((prev) => [...prev, ...added]);
    } else {
      const stamp = Date.now();
      setSteps((prev) => [...prev, ...titles.map((t, i) => ({ id: `tmp-sug-${stamp}-${i}`, assignment_id: '', title: t, done: false, position: prev.length + i }))]);
    }
  }

  async function createType() {
    if (!newType?.label.trim()) return;
    const label = newType.label.trim();
    const key = slugify(label) || `tipo-${Date.now()}`;
    try {
      await upsertTaskType({ key, label, icon: newType.icon.trim() || '📌', color: TYPE_COLORS[types.length % TYPE_COLORS.length], position: types.length });
      await loadTaskTypes();
      setTypesRev((n) => n + 1);
      setType(key);
      setNewType(null);
    } catch (e) { notify('No se pudo crear el tipo', friendlyError(e)); }
  }

  async function remove() {
    if (!editTask) return;
    const t = editTask;
    if (await removeTask(t)) { onDeleted?.(t.id); onClose(); }
  }

  const body = (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', flex: 1 }} accessibilityRole="header">{editTask ? 'Editar tarea' : 'Nueva tarea'}</Text>
        {editTask && <IconButton icon="timer-outline" label="Enfocarme en esta tarea" onPress={() => { startFocus({ taskId: editTask.id, taskTitle: editTask.title, subjectId: editTask.subject_id }); onClose(); toast('Enfoque iniciado: ' + editTask.title); }} />}
        {editTask && <IconButton icon="trash-outline" label="Borrar tarea" onPress={remove} />}
        <IconButton icon="close" label="Cerrar" onPress={onClose} />
      </View>

      <Field value={title} onChangeText={(v) => { setTitle(v); if (titleError) setTitleError(null); }} placeholder="Ej: Taller de cálculo, ejercicios 1 a 10"
        autoFocus={!editTask && Platform.OS === 'web'} error={titleError} onSubmitEditing={save} returnKeyType="done" label="Título" />

      <Text style={lbl()}>Tipo</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {types.map((m) => {
          const active = type === m.key;
          return (
            <Pressable key={m.key} onPress={() => setType(m.key)} accessibilityRole="radio" accessibilityState={{ checked: active }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, backgroundColor: active ? m.color + '22' : C.surface2, borderColor: active ? m.color : C.line }}>
              <Text style={{ fontSize: 13 }}>{m.icon}</Text>
              <Text style={{ color: active ? C.text : C.text, fontSize: 13, fontWeight: active ? '700' : '500' }}>{m.label}</Text>
            </Pressable>
          );
        })}
        {!newType && (
          <Pressable onPress={() => setNewType({ label: '', icon: '📌' })} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line }}>
            <Ionicons name="add" size={14} color={C.muted} />
            <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>Nuevo tipo</Text>
          </Pressable>
        )}
      </View>
      {newType && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <TextInput value={newType.icon} onChangeText={(v) => setNewType({ ...newType, icon: v.slice(-2) })} accessibilityLabel="Ícono del tipo"
            style={{ width: 48, textAlign: 'center', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 10, fontSize: 16 }} />
          <TextInput value={newType.label} onChangeText={(v) => setNewType({ ...newType, label: v })} placeholder="Ej: Laboratorio" placeholderTextColor={C.muted} autoFocus
            onSubmitEditing={createType} accessibilityLabel="Nombre del tipo"
            style={{ flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 10, fontSize: 14 }} />
          <Button label="Crear" size="sm" onPress={createType} />
          <IconButton icon="close" label="Cancelar tipo nuevo" onPress={() => setNewType(null)} />
        </View>
      )}

      <Text style={lbl()}>Materia</Text>
      <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <DateField label="Entrega" value={date} onChange={(v) => { setDate(v); if (!v) setTime(null); }} />
        {v14 && <TimeField label="Hora (opcional)" value={time} onChange={(v) => { setTime(v); if (v && remind === 'evening') setRemind('1h'); if (!v && REMIND_OPTIONS.find((o) => o.key === remind)?.needsTime) setRemind('evening'); }} disabled={!date} />}
      </View>
      <DateShortcuts value={date} onChange={setDate} />

      {date && (
        <>
          <Text style={lbl()}>Avisarme</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {REMIND_OPTIONS.filter((o) => !o.needsTime || time).filter((o) => v14 || ['none', '1d', '2d'].includes(o.key)).map((o) => {
              const on = remind === o.key;
              return (
                <Pressable key={o.key} onPress={() => setRemind(o.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
                  <Text style={{ color: on ? C.onBrand : C.text, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {!more ? (
        <Pressable onPress={() => setMore(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, alignSelf: 'flex-start', paddingVertical: 6 }} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={17} color={C.brand} />
          <Text style={{ color: C.brand, fontWeight: '700', fontSize: 13.5 }}>Descripción y tiempo estimado</Text>
        </Pressable>
      ) : (
        <>
          <Field label="Descripción" value={description} onChangeText={setDescription} multiline placeholder="Detalles, requisitos, página del libro…"
            inputStyle={{ minHeight: 72, textAlignVertical: 'top' }} style={{ marginTop: 14 }} />
          {v14 && (
            <>
              <Text style={[lbl(), { marginTop: 2 }]}>Tiempo estimado</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {[null, ...ESTIMATES].map((m) => {
                  const on = estimate === m;
                  const label = m == null ? 'Sin estimar' : m < 60 ? `${m} min` : `${m / 60} h`;
                  return (
                    <Pressable key={String(m)} onPress={() => setEstimate(m)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                      style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
                      <Text style={{ color: on ? C.onBrand : C.text, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 6 }}>
        <Ionicons name="list-outline" size={15} color={C.muted} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>Pasos</Text>
        {steps.length > 0 && <Text style={{ color: C.muted, fontSize: 12 }}>{doneSteps} de {steps.length}</Text>}
      </View>
      <View style={{ backgroundColor: C.surface2 + '80', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 10 }}>
        <SubtaskList assignmentId={editTask?.id ?? null} steps={steps} onChange={setSteps} />
        {steps.length === 0 && <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Divide la tarea en pasos y verás el avance.</Text>}
      </View>
      <StepSuggestions title={title} description={description} typeKey={type} existing={steps.map((s) => s.title)} onAdd={addSuggested} />
    </ScrollView>
  );

  const footer = (
    <View style={{ flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, marginTop: 8 }}>
      <Button label="Cancelar" kind="secondary" onPress={onClose} style={{ flex: 1 }} />
      <Button label={editTask ? 'Guardar' : 'Crear tarea'} onPress={save} busy={busy} style={{ flex: 2 }} />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType={isWide || Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: isWide ? 'center' : 'stretch', justifyContent: isWide ? 'center' : 'flex-end', padding: isWide ? 24 : 0 }}>
          <Pressable onPress={() => {}} accessibilityViewIsModal dataSet={{ anim: 'sheet' }}
            style={isWide
              ? { width: '100%', maxWidth: 580, maxHeight: '90%', backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, padding: 22 }
              : { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 24, maxHeight: '94%', borderTopWidth: 1, borderColor: C.line }}>
            {body}
            {footer}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function lbl() { return { color: C.muted, fontSize: 12.5, fontWeight: '600' as const, marginTop: 14, marginBottom: 8 }; }
