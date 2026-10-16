import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, inkOn } from '../lib/theme';
import type { Step, Subject, Task } from '../lib/db';
import { taskTypeMeta } from '../lib/taskTypes';
import { fmtDue, isOverdue, bucketOf } from '../lib/time';
import { Badge, Dot } from './ds';
import { SubtaskList } from './SubtaskList';
import { ActionMenu, type MenuAction } from './ActionMenu';

// ============================================================
//  Fila de tarea compacta (Hoy, Materia, Papelera...).
//  Tocar abre la tarea; el círculo la completa; "⋯" (o mantener
//  presionado en el celular) abre el menú: mover, enfocarse, borrar.
//  Ya no hay lápiz ni papelera sueltos en cada fila.
// ============================================================

export function TaskRow({
  task, subject, steps, showSubject = true, showDue = true, focusMin, onToggle, onOpen, actions,
  onStepsChange, compact,
}: {
  task: Task; subject?: Subject | null; steps?: Step[]; showSubject?: boolean; showDue?: boolean; focusMin?: number;
  onToggle: (t: Task) => void; onOpen: (t: Task) => void; actions?: MenuAction[];
  onStepsChange?: (taskId: string, next: Step[]) => void; compact?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false);
  const done = task.status === 'done';
  const tm = taskTypeMeta(task.type);
  const total = steps?.length ?? 0;
  const doneSteps = steps?.filter((s) => s.done).length ?? 0;
  const overdue = isOverdue(task);
  const b = bucketOf(task);
  const dueColor = done ? C.muted : overdue ? C.badText : b === 'today' ? C.warnText : C.muted;
  const due = showDue ? fmtDue(task) : '';

  return (
    <View style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 12, marginBottom: 8, opacity: done ? 0.75 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Pressable onPress={() => onToggle(task)} accessibilityRole="checkbox" accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `Marcar "${task.title}" como pendiente` : `Completar "${task.title}"`}
          style={{ width: 48, minHeight: compact ? 46 : 54, alignItems: 'center', justifyContent: 'center' }}>
          <View key={done ? 'hecha' : 'pendiente'} dataSet={done ? { anim: 'pop' } : undefined} style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: done ? C.good : (tm.key !== 'tarea' ? tm.color : C.muted), backgroundColor: done ? C.good : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {done && <Ionicons name="checkmark" size={14} color={inkOn(C.good)} />}
          </View>
        </Pressable>
        <Pressable onPress={() => onOpen(task)} onLongPress={actions?.length ? () => setMenu(true) : undefined} delayLongPress={350}
          accessibilityRole="button" accessibilityLabel={`${task.title}${due ? ', ' + due : ''}`} accessibilityHint="Abre la tarea"
          style={{ flex: 1, minWidth: 0, paddingVertical: compact ? 10 : 12, paddingRight: 4 }}>
          <Text style={{ color: done ? C.muted : C.text, fontSize: 15, fontWeight: '600', lineHeight: 20, textDecorationLine: done ? 'line-through' : 'none' }} numberOfLines={2}>{task.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4, marginTop: 4 }}>
            {showSubject && subject && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Dot color={subject.color} />
                <Text style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={1}>{subject.name}</Text>
              </View>
            )}
            {tm.key !== 'tarea' && <Badge text={tm.label} color={tm.color} />}
            {!!due && <Text style={{ color: dueColor, fontSize: 12.5, fontWeight: overdue || b === 'today' ? '700' : '500' }}>{due}</Text>}
            {total > 0 && (
              <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={open ? 'Ocultar pasos' : `Ver pasos, ${doneSteps} de ${total}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 }} hitSlop={8}>
                <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: C.surface2, overflow: 'hidden' }}>
                  <View style={{ width: `${(doneSteps / total) * 100}%`, height: '100%', backgroundColor: C.brand }} />
                </View>
                <Text style={{ color: C.muted, fontSize: 12 }}>{doneSteps}/{total}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={C.muted} />
              </Pressable>
            )}
            {(task.estimate_min || focusMin) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="time-outline" size={13} color={C.muted} />
                <Text style={{ color: C.muted, fontSize: 12 }}>
                  {focusMin ? `${fmtMin(focusMin)}${task.estimate_min ? ' de ' + fmtMin(task.estimate_min) : ''}` : fmtMin(task.estimate_min!)}
                </Text>
              </View>
            ) : null}
            {!!task.description?.trim() && !compact && <Ionicons name="reader-outline" size={13} color={C.muted} accessibilityLabel="Tiene descripción" />}
          </View>
        </Pressable>
        {!!actions?.length && (
          <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel={`Más acciones para "${task.title}"`}
            style={({ hovered }: any) => ({ width: 44, minHeight: compact ? 46 : 54, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
            <Ionicons name="ellipsis-horizontal" size={18} color={C.muted} />
          </Pressable>
        )}
      </View>
      {open && steps && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 10, marginLeft: 36 }}>
          <SubtaskList assignmentId={task.id} steps={steps} onChange={(next) => onStepsChange?.(task.id, next)} compact />
        </View>
      )}
      {actions && <ActionMenu visible={menu} title={task.title} actions={actions} onClose={() => setMenu(false)} />}
    </View>
  );
}

export function fmtMin(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
