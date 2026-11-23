import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { slotLabel } from '../lib/planSlots';
import { ruleText } from '../lib/repeat';
import { C, RAD, inkOn } from '../lib/theme';
import type { Step, Subject, Task } from '../lib/db';
import { taskTypeMeta } from '../lib/taskTypes';
import { fmtDue, isOverdue, bucketOf } from '../lib/time';
import { Badge, Dot } from './ds';
import { SubtaskList } from './SubtaskList';
import { ActionMenu, type MenuAction } from './ActionMenu';
import { play } from '../lib/sound';

// ============================================================
//  Fila de tarea compacta (Hoy, Materia, Papelera...).
//  Tocar abre la tarea; el círculo la completa; "⋯" (o mantener
//  presionado en el celular) abre el menú: mover, enfocarse, borrar.
//  Ya no hay lápiz ni papelera sueltos en cada fila.
// ============================================================

export function TaskRow({
  task, subject, steps, showSubject = true, showDue = true, focusMin, onToggle, onOpen, actions,
  onStepsChange, compact, swipe, onStar,
}: {
  task: Task; subject?: Subject | null; steps?: Step[]; showSubject?: boolean; showDue?: boolean; focusMin?: number;
  onToggle: (t: Task) => void; onOpen: (t: Task) => void; actions?: MenuAction[];
  onStepsChange?: (taskId: string, next: Step[]) => void; compact?: boolean;
  /** v26: en el celular, deslizar a la derecha la completa y a la izquierda la pasa a mañana. */
  swipe?: { onDone: () => void; onLater: () => void };
  /** v27: botón de estrella para marcar importante (en la vista Matriz). */
  onStar?: (t: Task) => void;
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

  // ---------- Deslizar (v26) ----------
  const dx = useRef(new Animated.Value(0)).current;
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const swipeRef = useRef(swipe); swipeRef.current = swipe;
  // Tras deslizar, el navegador igual manda el clic al soltar: se ignora para no abrir la tarea.
  const slid = useRef(0);
  const tapOk = () => Date.now() - slid.current > 400;
  const pan = useMemo(() => PanResponder.create({
    // Solo gestos claramente horizontales: el desplazamiento vertical de la lista sigue igual.
    onMoveShouldSetPanResponder: (_, g) => !!swipeRef.current && Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderGrant: () => { slid.current = Date.now(); },
    onPanResponderMove: (_, g) => { slid.current = Date.now(); dx.setValue(g.dx); setDir(g.dx > 0 ? 1 : g.dx < 0 ? -1 : 0); },
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, g) => {
      slid.current = Date.now();
      const sw = swipeRef.current;
      if (sw && Math.abs(g.dx) > 96) {
        const right = g.dx > 0;
        Animated.timing(dx, { toValue: right ? 480 : -480, duration: 180, useNativeDriver: false }).start(() => {
          if (right) { play('complete'); sw.onDone(); } else sw.onLater();
          dx.setValue(0); setDir(0);
        });
      } else {
        Animated.spring(dx, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start(() => setDir(0));
      }
    },
    onPanResponderTerminate: () => { Animated.spring(dx, { toValue: 0, useNativeDriver: false }).start(() => setDir(0)); },
  }), []);

  return (
    <View style={{ marginBottom: 8, borderRadius: RAD.row, overflow: swipe ? 'hidden' : 'visible' }}>
      {swipe && dir !== 0 && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: RAD.row, flexDirection: 'row', alignItems: 'center', justifyContent: dir > 0 ? 'flex-start' : 'flex-end', paddingHorizontal: 18, backgroundColor: dir > 0 ? C.good : C.warn }}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name={dir > 0 ? 'checkmark-circle' : 'arrow-forward-circle'} size={22} color={inkOn(dir > 0 ? C.good : C.warn)} />
          <Text style={{ color: inkOn(dir > 0 ? C.good : C.warn), fontSize: 14, fontWeight: '800', marginLeft: 8 }}>{dir > 0 ? 'Hecha' : 'Mañana'}</Text>
        </View>
      )}
    <Animated.View {...(swipe ? pan.panHandlers : {})} dataSet={{ petPerch: '1' }} style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: RAD.row, opacity: done ? 0.75 : 1, transform: [{ translateX: dx }] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Pressable onPress={() => { if (!tapOk()) return; play(done ? 'uncheck' : 'complete'); onToggle(task); }} accessibilityRole="checkbox" accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `Marcar "${task.title}" como pendiente` : `Completar "${task.title}"`}
          style={{ width: 48, minHeight: compact ? 46 : 54, alignItems: 'center', justifyContent: 'center' }}>
          <View key={done ? 'hecha' : 'pendiente'} dataSet={done ? { anim: 'pop' } : undefined} style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: done ? C.good : (tm.key !== 'tarea' ? tm.color : C.muted), backgroundColor: done ? C.good : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {done && <Ionicons name="checkmark" size={14} color={inkOn(C.good)} />}
          </View>
        </Pressable>
        <Pressable onPress={() => { if (tapOk()) onOpen(task); }} onLongPress={actions?.length ? () => { if (tapOk()) setMenu(true); } : undefined} delayLongPress={350}
          accessibilityRole="button" accessibilityLabel={`${task.title}${due ? ', ' + due : ''}`} accessibilityHint="Abre la tarea"
          style={{ flex: 1, minWidth: 0, paddingVertical: compact ? 10 : 12, paddingRight: 4 }}>
          <Text style={{ color: done ? C.muted : C.text, fontSize: 15, fontWeight: '600', lineHeight: 20, textDecorationLine: done ? 'line-through' : 'none' }} numberOfLines={2}>{task.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4, marginTop: 4 }}>
            {!!task.important && !onStar && <Ionicons name="star" size={13} color={C.warnText} accessibilityLabel="Importante" />}
            {!!task.frog && !done && task.plan_day === todayLocal() && <Text style={{ color: C.brand, fontSize: 12, fontWeight: '800' }}>Primero</Text>}
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
            {!!task.repeat_rule && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} accessibilityLabel={`Se repite ${ruleText(task.repeat_rule)}`}>
                <Ionicons name="repeat" size={13} color={C.muted} />
                <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>{ruleText({ ...task.repeat_rule, until: null, fromDone: false })}</Text>
              </View>
            )}
            {!!task.plan_at && task.status !== 'done' && new Date(task.plan_at).getTime() > Date.now() - 3600_000 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={`Plan: ${slotLabel(new Date(task.plan_at), new Date())}`}>
                <Ionicons name="flag-outline" size={12} color={C.brand} />
                <Text style={{ color: C.brand, fontSize: 12, fontWeight: '600' }}>{slotLabel(new Date(task.plan_at), new Date())}</Text>
              </View>
            )}
            {!!task.description?.trim() && !compact && <Ionicons name="reader-outline" size={13} color={C.muted} accessibilityLabel="Tiene descripción" />}
          </View>
        </Pressable>
        {onStar && (
          <Pressable onPress={() => onStar(task)} accessibilityRole="checkbox" accessibilityState={{ checked: !!task.important }}
            accessibilityLabel={task.important ? `Quitar importante a "${task.title}"` : `Marcar "${task.title}" como importante`}
            style={({ hovered }: any) => ({ width: 40, minHeight: compact ? 46 : 54, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
            <Ionicons name={task.important ? 'star' : 'star-outline'} size={18} color={task.important ? C.warnText : C.muted} />
          </Pressable>
        )}
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
    </Animated.View>
    </View>
  );
}

export function fmtMin(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Hoy en AAAA-MM-DD (hora local), para saber si la rana es de hoy. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
