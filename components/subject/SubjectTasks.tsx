import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useResponsive } from '../../lib/responsive';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Step, Subject, Task, addTask } from '../../lib/db';
import { parseQuickAdd } from '../../lib/quickAdd';
import { taskTypeList, taskTypeMeta } from '../../lib/taskTypes';
import { combine, fmtDay, fmtDue, fmtHHMM, fromISODate } from '../../lib/time';
import { remindAt, remindDays } from '../../lib/reminders';
import { groupTasks } from '../../lib/subjectInfo';
import { notify, toast, friendlyError } from '../../lib/feedback';
import { openTask, dataChanged } from '../../lib/uiBus';
import { refreshNavCounts } from '../../lib/navCounts';
import { play } from '../../lib/sound';
import { Button, EmptyState } from '../ds';
import { TaskRow } from '../TaskRow';

// ============================================================
//  Tareas de una materia: campo para escribir una tarea en una línea
//  ("informe el jueves 6pm") y la lista agrupada por cuándo vence.
// ============================================================

export function QuickTaskInput({ subject, onCreated }: { subject: Subject; onCreated: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(false);
  const { isWide } = useResponsive();
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, [], taskTypeList()) : null), [text]);

  async function create() {
    if (!parsed || busy || !parsed.title.trim()) return;
    setBusy(true);
    try {
      const choice = parsed.dueTime ? '1h' : 'evening';
      const at = remindAt(choice, parsed.dueDate, parsed.dueTime);
      const row = {
        title: parsed.title, subject_id: subject.id, type: parsed.typeKey ?? 'tarea',
        due_date: parsed.dueDate, due_at: parsed.dueDate && parsed.dueTime ? combine(parsed.dueDate, parsed.dueTime) : null,
        remind_days: remindDays(choice), remind_at: at ? at.toISOString() : null,
      };
      const id = await addTask(row);
      setText('');
      play('add');
      refreshNavCounts(true);
      onCreated(); dataChanged();
      const when = fmtDue(row);
      toast(`Agregada: ${parsed.title}${when ? ' · ' + when : ''}`, { actionLabel: 'Editar', onAction: () => openTask({ id, status: 'pending', description: null, ...row } as Task) });
    } catch (e) { notify('No se pudo agregar', friendlyError(e)); }
    finally { setBusy(false); }
  }

  const meta = parsed?.typeKey ? taskTypeMeta(parsed.typeKey) : null;
  const hint = parsed
    ? [meta?.label ?? 'Tarea', parsed.dueDate ? fmtDay(fromISODate(parsed.dueDate)) + (parsed.dueTime ? ', ' + fmtHHMM(parsed.dueTime) : '') : 'sin fecha'].join(' · ')
    : null;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingLeft: 14, paddingRight: 6, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: focus ? C.brand : C.line }}>
        <Ionicons name="add" size={20} color={C.muted} />
        <TextInput value={text} onChangeText={setText} onSubmitEditing={create} returnKeyType="done" blurOnSubmit={false}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          placeholder={isWide ? `Agregar a ${subject.name}: "informe el jueves 6pm"` : 'Agregar tarea…'} placeholderTextColor={C.muted}
          accessibilityLabel={`Agregar tarea a ${subject.name}`}
          style={[{ flex: 1, minWidth: 0, color: C.text, fontSize: 15, paddingVertical: 12 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
        {!!text.trim() && <Button label="Agregar" size="sm" onPress={create} busy={busy} />}
        {!text.trim() && <Pressable onPress={() => openTask(null, { subjectId: subject.id })} accessibilityRole="button" accessibilityLabel="Tarea con todos los detalles"
          style={{ paddingHorizontal: 10, height: 36, justifyContent: 'center' }}>
          <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '700' }}>Con detalles</Text>
        </Pressable>}
      </View>
      {!!hint && <Text style={{ color: C.muted, fontSize: 12.5, paddingLeft: 4 }}>Se guarda como: {hint}</Text>}
    </View>
  );
}

export function SubjectTaskList({ pending, done, steps, onToggle, onRemove, onStepsChange }: {
  pending: Task[]; done: Task[]; steps: Record<string, Step[]>;
  onToggle: (t: Task) => void; onRemove: (t: Task) => void; onStepsChange: (taskId: string, next: Step[]) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const groups = groupTasks(pending);
  return (
    <View>
      {pending.length === 0 && (
        <EmptyState compact icon="checkmark-done-outline" title="Nada pendiente en esta materia"
          text={done.length ? 'Todo al día. Escribe arriba la próxima entrega cuando la tengas.' : 'Escribe arriba la primera tarea o examen.'} />
      )}
      {groups.map((g) => (
        <View key={g.key}>
          <Text style={{ color: g.key === 'overdue' ? C.badText : C.muted, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 }}>
            {g.label} · {g.tasks.length}
          </Text>
          {g.tasks.map((t) => (
            <TaskRow key={t.id} task={t} showSubject={false} steps={steps[t.id]} onToggle={onToggle} onOpen={(x) => openTask(x)}
              onStepsChange={onStepsChange}
              actions={[
                { label: 'Abrir y editar', icon: 'create-outline', onPress: () => openTask(t) },
                { label: 'Marcar hecha', icon: 'checkmark-circle-outline', onPress: () => onToggle(t) },
                { label: 'Borrar', icon: 'trash-outline', danger: true, onPress: () => onRemove(t) },
              ]} />
          ))}
        </View>
      ))}
      {done.length > 0 && (
        <>
          <Pressable onPress={() => setShowDone((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showDone }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, marginTop: 4 }}>
            <Ionicons name={showDone ? 'chevron-down' : 'chevron-forward'} size={16} color={C.muted} />
            <Text style={{ color: C.muted, fontWeight: '700' }}>{done.length} {done.length === 1 ? 'completada' : 'completadas'}</Text>
          </Pressable>
          {showDone && done.map((t) => <TaskRow key={t.id} task={t} showSubject={false} onToggle={onToggle} onOpen={(x) => openTask(x)} compact />)}
        </>
      )}
    </View>
  );
}
