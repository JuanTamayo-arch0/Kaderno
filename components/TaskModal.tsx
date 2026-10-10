import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, R, uiScheme } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import { SubjectPicker } from './SubjectPicker';
import { SubtaskList, isTempStep } from './SubtaskList';
import { Chip, sheet, input, lbl, btnPrimary } from './ui';
import { taskTypeList, loadTaskTypes } from '../lib/taskTypes';
import { Step, Subject, Task, addStep, addTask, getSteps, updateTask } from '../lib/db';
import { ensureNotifPermission, scheduleReminder } from '../lib/notifications';

// ============================================================
//  Modal de crear / editar tarea.
//  Novedades: descripción, microtareas y tipos de tarea propios.
//  Al crear una tarea las microtareas viven en memoria (ids 'tmp-*') y se
//  insertan justo después de guardar la tarea, cuando ya existe su id.
// ============================================================

export function TaskModal({ visible, subjects, editTask, initialSubjectId, onClose, onSaved }: {
  visible: boolean; subjects: Subject[]; editTask: Task | null; initialSubjectId?: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const router = useRouter();
  const { isWide } = useResponsive();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [type, setType] = useState<string>('tarea');
  const [date, setDate] = useState(new Date());
  const [remind, setRemind] = useState(2);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [typesRev, setTypesRev] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setTitle(editTask?.title ?? '');
    setDescription(editTask?.description ?? '');
    setSubjectId(editTask?.subject_id ?? initialSubjectId ?? null);
    setType(editTask?.type ?? 'tarea');
    setDate(editTask?.due_date ? new Date(editTask.due_date + 'T00:00:00') : new Date());
    setRemind(editTask?.remind_days ?? 2);
    setSteps([]);
    // Los tipos pueden haber cambiado en /tipos mientras la app estaba abierta.
    loadTaskTypes().then(() => setTypesRev((n) => n + 1)).catch(() => {});
    if (editTask) getSteps(editTask.id).then(setSteps).catch(() => {});
  }, [visible, editTask, initialSubjectId]);

  const types = React.useMemo(() => taskTypeList(), [typesRev, visible]);
  const doneSteps = steps.filter((s) => s.done).length;

  async function save() {
    if (!title.trim()) { Alert.alert('Ponle un título'); return; }
    setBusy(true);
    try {
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const desc = description.trim() ? description.trim() : null;
      if (editTask) {
        await updateTask(editTask.id, { title: title.trim(), subject_id: subjectId, due_date: iso, remind_days: remind, type, description: desc });
      } else {
        const newId = await addTask({ title: title.trim(), subject_id: subjectId, due_date: iso, remind_days: remind, type, description: desc ?? undefined });
        // Las microtareas escritas antes de existir la tarea se insertan ahora.
        const pend = steps.filter(isTempStep);
        for (let i = 0; i < pend.length; i++) {
          try { await addStep(newId, pend[i].title, i); } catch { /* si una falla, la tarea ya quedó creada */ }
        }
        if (remind > 0 && await ensureNotifPermission()) await scheduleReminder(title.trim(), iso, remind);
      }
      onSaved();
    } catch (e: any) { Alert.alert('Error', e?.message ?? 'No se pudo guardar'); }
    finally { setBusy(false); }
  }

  function goTypes() { onClose(); router.push('/tipos'); }

  const body = (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>{editTask ? 'Editar tarea' : 'Nueva tarea'}</Text>

      <TextInput value={title} onChangeText={setTitle} placeholder="Ej: Taller de cálculo, ej. 1–10"
        placeholderTextColor={C.muted} style={input} />

      <Text style={lbl}>Descripción <Text style={{ color: C.muted, fontSize: 11 }}>(opcional)</Text></Text>
      <TextInput
        value={description} onChangeText={setDescription} multiline
        placeholder="Detalles, requisitos, página del libro…"
        placeholderTextColor={C.muted}
        style={[input, { minHeight: 72, textAlignVertical: 'top' }]}
      />

      <Text style={lbl}>Tipo</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {types.map((m) => {
          const active = type === m.key;
          return (
            <Pressable key={m.key} onPress={() => setType(m.key)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, backgroundColor: active ? m.color + '22' : C.surface2, borderColor: active ? m.color : C.line }}>
              <Text style={{ fontSize: 13 }}>{m.icon}</Text>
              <Text style={{ color: active ? m.color : C.text, fontSize: 13, fontWeight: active ? '700' : '500' }}>{m.label}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={goTypes}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, backgroundColor: 'transparent' }}>
          <Ionicons name="add" size={14} color={C.muted} />
          <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>Nuevo tipo</Text>
        </Pressable>
      </View>

      <Text style={lbl}>Materia</Text>
      <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} />

      <Text style={lbl}>Fecha de entrega</Text>
      {Platform.OS === 'web' ? (
        React.createElement('input', {
          type: 'date',
          value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          onChange: (e: any) => { const v = e.target.value; if (v) setDate(new Date(v + 'T00:00:00')); },
          style: { backgroundColor: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, color: C.text, padding: 12, fontSize: 14, colorScheme: uiScheme(), width: '100%', marginBottom: 4, boxSizing: 'border-box' },
        })
      ) : (
        <>
          <Pressable onPress={() => setShowPicker(true)} style={input}>
            <Text style={{ color: C.text }}>{date.toLocaleDateString('es')}</Text>
          </Pressable>
          {showPicker && (
            <DateTimePicker value={date} mode="date"
              onChange={(_, d) => { setShowPicker(false); if (d) setDate(d); }} />
          )}
        </>
      )}

      <Text style={lbl}>Recordatorio</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {[0, 1, 2, 3].map((n) => (
          <Chip key={n} label={n === 0 ? 'Sin aviso' : `${n}d antes`} active={remind === n} onPress={() => setRemind(n)} />
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 6 }}>
        <Ionicons name="list-outline" size={15} color={C.muted} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>Microtareas</Text>
        {steps.length > 0 && <Text style={{ color: C.muted, fontSize: 12 }}>{doneSteps}/{steps.length}</Text>}
      </View>
      <View style={{ backgroundColor: C.surface2 + '80', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 10 }}>
        <SubtaskList assignmentId={editTask?.id ?? null} steps={steps} onChange={setSteps} />
        {steps.length === 0 && (
          <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 8 }}>
            Parte la tarea en pasos y verás el avance en porcentaje.
          </Text>
        )}
      </View>

      <Pressable onPress={save} disabled={busy} style={[btnPrimary, busy && { opacity: 0.7 }]}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '…' : editTask ? 'Guardar cambios' : 'Crear tarea'}</Text>
      </Pressable>
      <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}>
        <Text style={{ color: C.muted }}>Cancelar</Text>
      </Pressable>
    </ScrollView>
  );

  return (
    <Modal visible={visible} transparent animationType={isWide ? 'fade' : 'slide'} onRequestClose={onClose}>
      {isWide ? (
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 560, maxHeight: '86%', backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, padding: 22 }}>
            {body}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={[sheet, { maxHeight: '92%' }]}>{body}</View>
        </View>
      )}
    </Modal>
  );
}
