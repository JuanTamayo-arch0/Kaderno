import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, shadow, fmtDate, dueTone } from '../lib/theme';
import { Step, Subject, Task } from '../lib/db';
import { taskTypeMeta } from '../lib/taskTypes';
import { iconChar } from './SubjectIcon';
import { Pill } from './ui';
import { ProgressBar } from './ProgressBar';
import { SubtaskList } from './SubtaskList';

// ============================================================
//  Tarjeta de tarea. Un solo componente para móvil y escritorio:
//  antes el escritorio tenía su propia tarjeta y se le había olvidado el color
//  de la materia. Ahora las dos comparten la misma barra de color, la misma
//  barra de progreso y el mismo desplegable de microtareas.
// ============================================================

export function TaskCard({
  task, subject, steps = [], wide = false, expanded = false, bucket, bucketColor,
  onToggle, onEdit, onDelete, onToggleExpand, onStepsChange,
}: {
  task: Task;
  subject?: Subject;
  steps?: Step[];
  wide?: boolean;
  expanded?: boolean;
  bucket?: string;
  bucketColor?: string;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onToggleExpand?: (t: Task) => void;
  onStepsChange?: (taskId: string, next: Step[]) => void;
}) {
  const done = task.status === 'done';
  const tm = taskTypeMeta(task.type);
  const accent = done ? C.line : (subject?.color ?? C.line);
  const total = steps.length;
  const doneCount = steps.filter((s) => s.done).length;

  const checkbox = (
    <Pressable
      onPress={() => onToggle(task)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={`Completar ${task.title}`}
      hitSlop={6}
      style={{
        width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
        marginTop: wide ? 0 : 2,
        backgroundColor: done ? C.good : 'transparent',
        borderWidth: done ? 0 : 2, borderColor: done ? C.good : C.muted,
      }}
    >
      {done && <Ionicons name="checkmark" size={14} color={C.bg} />}
    </Pressable>
  );

  const actions = (
    <View style={wide ? { flexDirection: 'row', alignItems: 'center', gap: 14 } : { gap: 14, alignItems: 'center' }}>
      <Pressable onPress={() => onEdit(task)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Editar ${task.title}`}>
        <Ionicons name="create-outline" size={wide ? 17 : 18} color={C.muted} />
      </Pressable>
      <Pressable onPress={() => onDelete(task.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Eliminar ${task.title}`}>
        <Ionicons name="trash-outline" size={wide ? 17 : 18} color={C.muted} />
      </Pressable>
    </View>
  );

  // Fila con el resumen de microtareas; al tocarla se despliega el checklist.
  const stepsRow = (total > 0 || expanded) && onToggleExpand ? (
    <Pressable
      onPress={() => onToggleExpand(task)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Ocultar microtareas' : 'Ver microtareas'}
    >
      <View style={{ flex: 1 }}>
        {total > 0
          ? <ProgressBar done={doneCount} total={total} compact={!wide} />
          : <Text style={{ color: C.muted, fontSize: 12 }}>Sin microtareas</Text>}
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
    </Pressable>
  ) : null;

  const stepsPanel = expanded ? (
    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line }}>
      <SubtaskList
        assignmentId={task.id}
        steps={steps}
        onChange={(next) => onStepsChange?.(task.id, next)}
        compact
      />
    </View>
  ) : null;

  const description = task.description?.trim() ? (
    <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }} numberOfLines={expanded ? undefined : 2}>
      {task.description.trim()}
    </Text>
  ) : null;

  // ---------- Escritorio ----------
  if (wide) {
    return (
      <View style={{
        backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 14,
        borderLeftWidth: 4, borderLeftColor: accent,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {checkbox}
          <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => onEdit(task)}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: done ? C.muted : C.text, textDecorationLine: done ? 'line-through' : 'none' }}>{task.title}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {task.type && task.type !== 'tarea' && (
                <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: tm.color + '22' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: tm.color }}>{tm.icon} {tm.label}</Text>
                </View>
              )}
              {subject && (
                <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: subject.color + '22', borderWidth: 1, borderColor: subject.color + '55' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: subject.color }}>{iconChar(subject.icon)} {subject.name}</Text>
                </View>
              )}
              {!!bucket && (
                <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: (bucketColor ?? C.muted) + '22' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: bucketColor ?? C.muted }}>{bucket}</Text>
                </View>
              )}
              {!!task.remind_days && !done && <Text style={{ fontSize: 12, color: C.muted }}>🔔 {task.remind_days}d</Text>}
            </View>
            {description}
          </Pressable>
          {actions}
        </View>
        {stepsRow}
        {stepsPanel}
      </View>
    );
  }

  // ---------- Móvil ----------
  return (
    <View style={{
      backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.lg, padding: 14, marginBottom: 10,
      borderLeftWidth: 4, borderLeftColor: accent, ...shadow,
    }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        {checkbox}
        <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => onEdit(task)}>
          <Text style={{ color: done ? C.muted : C.text, fontSize: 15, fontWeight: '600', textDecorationLine: done ? 'line-through' : 'none' }}>{task.title}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            {task.type && task.type !== 'tarea' && <Pill text={`${tm.icon} ${tm.label}`} color={tm.color} />}
            {subject && <Pill text={`${iconChar(subject.icon)} ${subject.name}`} color={subject.color} />}
            <Pill text={fmtDate(task.due_date ?? '')} color={dueTone(task.due_date ?? '', done)} />
            {!!task.remind_days && !done && <Pill text={`🔔 ${task.remind_days}d`} color={C.muted} />}
          </View>
          {description}
        </Pressable>
        {actions}
      </View>
      {stepsRow}
      {stepsPanel}
    </View>
  );
}
