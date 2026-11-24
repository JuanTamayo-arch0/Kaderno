import React from 'react';
import { blockersOf, priorityOf } from '../../lib/projectWork';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R, shadow } from '../../lib/theme';
import { boardColumnWidth } from '../../lib/mobileLayout';
import { ProgressBar } from '../ProgressBar';
import { DragCard, DragGhost, useBoardDrag } from './BoardDrag';
import { Subject } from '../../lib/db';
import { BoardColumn, Member, PStep, PTask, colorOf, initialsOf, nameOf } from '../../lib/projects';
import { COARSE_POINTER, NO_STEPS, SelectBox, dueInfo, isWeb } from './projectUi';
import { t, trn } from '../../lib/i18n';

// ============================================================
//  Vista Tablero del proyecto: columnas, tarjetas, arrastrar y "Mover a" en el celular.
//  (Separado de app/proyectos/[id].tsx en la versión 23.)
// ============================================================

export function Tablero({ cols, grouped, steps, members, subject, editable, isWide, myId, selecting, selected, onToggleSelect, onOpen, onAdd, onMove, onDrop, comments, byId = {} }: {
  byId?: Record<string, PTask>;
  comments?: Record<string, number>;
  selecting: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  cols: BoardColumn[];
  grouped: Record<string, PTask[]>;
  steps: Record<string, PStep[]>;
  members: Member[];
  subject: Subject | null;
  editable: boolean;
  isWide: boolean;
  myId: string | null;
  onOpen: (t: PTask) => void;
  onAdd: (colKey: string) => void;
  onMove: (t: PTask) => void;
  onDrop: (taskId: string, colKey: string, beforeId: string | null) => void;
}) {
  const dnd = useBoardDrag({ enabled: editable && !selecting, onDrop });
  const drag = dnd.drag;
  // v29: en el celular la columna casi llena la pantalla, se ve el borde de la
  // siguiente y al deslizar se acomoda sola (snap).
  const win = useWindowDimensions();
  const width = isWide ? 300 : boardColumnWidth(win.width);
  const listMax = isWide ? 620 : Math.max(320, win.height - 330);
  const dragged = drag ? Object.values(grouped).flat().find((t) => t.id === drag.id) ?? null : null;
  const draggedCol = drag ? cols.find((c) => c.key === drag.fromCol) : null;

  const placeholder = (col: BoardColumn) => (
    <View key="__hueco" dataSet={{ anim: 'grow' }}
      style={{ height: drag?.height ?? 60, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: col.color + 'aa', backgroundColor: col.color + '14', marginBottom: 8 }} />
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={dnd.boardRef} horizontal showsHorizontalScrollIndicator={isWide}
        style={[{ flex: 1 }, !isWide && isWeb && !drag ? ({ scrollSnapType: 'x proximity', scrollPaddingLeft: 12 } as any) : null]}
        contentContainerStyle={{ padding: isWide ? 24 : 12, gap: 12, alignItems: 'stretch' }}>
        {cols.map((col) => {
          const list = grouped[col.key] ?? [];
          const isOver = !!drag && drag.overCol === col.key;
          return (
            <View key={col.key} ref={dnd.colRef(col.key)}
              style={{ width, ...(!isWide && isWeb ? { scrollSnapAlign: 'start' } as any : null), backgroundColor: isOver ? col.color + '10' : C.surface + 'cc', borderRadius: R.lg, borderWidth: 1, borderColor: isOver ? col.color : C.line, padding: 10, ...(isWeb ? { transitionProperty: 'background-color, border-color', transitionDuration: '150ms' } as any : null) }}>
              {/* cabecera de columna */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 2 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: col.color }} />
                <Text numberOfLines={1} style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>{col.label}</Text>
                <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>{list.length}</Text>
                {editable && (
                  <Pressable onPress={() => onAdd(col.key)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Agregar tarjeta en {label}', { label: col.label })}
                    style={{ width: 34, height: 34, margin: -8, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="add" size={17} color={C.muted} />
                  </Pressable>
                )}
              </View>

              <ScrollView ref={dnd.listRef(col.key)} style={{ maxHeight: listMax }} showsVerticalScrollIndicator={false}>
                {list.map((t, i) => (
                  <React.Fragment key={t.id}>
                    {isOver && drag!.beforeId === t.id && placeholder(col)}
                    <DragCard binding={dnd.bind(t.id, col.key, list[i + 1]?.id ?? null)} hidden={drag?.id === t.id} landed={dnd.landed === t.id}>
                      <View dataSet={{ anim: 'enter', i: String(Math.min(i, 8)) }}>
                        <TaskCard byId={byId}
                          task={t} steps={steps[t.id] ?? NO_STEPS} members={members} subject={subject} comments={comments?.[t.id] ?? 0}
                          color={col.color} dim={false} mine={!!myId && t.assignee_id === myId}
                          showMove={editable && !selecting && (!isWeb || !isWide || COARSE_POINTER)}
                          selecting={selecting} selected={selected.has(t.id)}
                          onPress={() => { if (dnd.consumeClick()) return; if (selecting) onToggleSelect(t.id); else onOpen(t); }}
                          onMove={() => onMove(t)}
                          onLongPress={editable && !dnd.isActive ? () => onToggleSelect(t.id) : undefined}
                        />
                      </View>
                    </DragCard>
                  </React.Fragment>
                ))}

                {isOver && drag!.beforeId === null && placeholder(col)}

                {list.length === 0 && !isOver && (
                  <View style={{ paddingVertical: 22, alignItems: 'center', borderWidth: 1, borderColor: C.line, borderStyle: 'dashed', borderRadius: 12 }}>
                    <Text style={{ color: C.muted, fontSize: 12 }}>{dnd.isActive ? t('Arrastra una tarjeta aquí') : t('Nada por aquí')}</Text>
                  </View>
                )}

                {editable && (
                  <Pressable onPress={() => onAdd(col.key)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' }}>
                    <Ionicons name="add" size={14} color={C.muted} />
                    <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>{t('Agregar tarjeta')}</Text>
                  </Pressable>
                )}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      <DragGhost drag={drag} ghostRef={dnd.ghostRef}>
        {dragged && draggedCol && (
          <View style={{ borderRadius: 12, ...(isWeb ? { boxShadow: '0 18px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)' } as any : null) }}>
            <TaskCard byId={byId} task={dragged} steps={steps[dragged.id] ?? []} members={members} subject={subject}
              color={draggedCol.color} dim={false} mine={!!myId && dragged.assignee_id === myId}
              showMove={false} selecting={false} selected={false} onPress={() => {}} onMove={() => {}} />
          </View>
        )}
      </DragGhost>
    </View>
  );
}

// ---------- Tarjeta del tablero ----------

// La tarjeta solo se vuelve a pintar si cambia lo que muestra. Con tableros de
// cientos de tarjetas, arrastrar una (que actualiza el destino varias veces)
// ya no repinta todas las demás.
export const TaskCard = React.memo(TaskCardView, (a, b) =>
  a.task === b.task && a.steps === b.steps && a.members === b.members && a.subject === b.subject && a.color === b.color
  && a.dim === b.dim && a.mine === b.mine && a.showMove === b.showMove && a.selecting === b.selecting && a.selected === b.selected
  && !!a.onLongPress === !!b.onLongPress && a.comments === b.comments && a.byId === b.byId);

export function TaskCardView({ task, steps, members, subject, color, dim, mine, showMove, selecting, selected, onPress, onMove, onLongPress, comments = 0, byId = {} }: {
  byId?: Record<string, PTask>;
  task: PTask; steps: PStep[]; members: Member[]; subject: Subject | null; comments?: number;
  color: string; dim: boolean; mine: boolean; showMove: boolean;
  selecting: boolean; selected: boolean;
  onPress: () => void; onMove: () => void; onLongPress?: () => void;
}) {
  const who = members.find((m) => m.user_id === task.assignee_id) ?? null;
  const doneSteps = steps.filter((s) => s.done).length;
  const due = dueInfo(task, task.done);

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} dataSet={{ press: '1', lift: '1' }} style={({ pressed }) => ({
      backgroundColor: selected ? C.brand + '1a' : C.surface, borderRadius: 12, borderWidth: 1, borderColor: selected ? C.brand : mine ? C.brand + '77' : C.line,
      padding: 11, marginBottom: 8, opacity: dim ? 0.4 : pressed ? 0.8 : 1, borderLeftWidth: 3, borderLeftColor: color, ...shadow,
    })}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        {selecting && <SelectBox on={selected} />}
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600', flex: 1, lineHeight: 19, textDecorationLine: task.done ? 'line-through' : 'none' }}>
          {task.title}
        </Text>
        {showMove && (
          <Pressable onPress={onMove} hitSlop={8} dataSet={{ nodrag: '1' }} accessibilityRole="button" accessibilityLabel={t('Mover "{title}" a otra columna', { title: task.title })}
            style={{ width: 34, height: 34, margin: -8, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="swap-horizontal" size={16} color={C.muted} />
          </Pressable>
        )}
      </View>

      <WorkBadges task={task} byId={byId} />

      {steps.length > 0 && (
        <View style={{ marginTop: 9 }}>
          <ProgressBar done={doneSteps} total={steps.length} height={5} compact />
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {who ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colorOf(who.user_id), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#0f1115', fontSize: 9.5, fontWeight: '800' }}>{initialsOf(who.profile)}</Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 11 }}>{nameOf(who.profile)}</Text>
          </View>
        ) : (
          <Text style={{ color: C.muted, fontSize: 11 }}>{t('Sin asignar')}</Text>
        )}

        <View style={{ flex: 1 }} />

        {subject && <View style={{ paddingVertical: 2, paddingHorizontal: 7, borderRadius: R.pill, backgroundColor: subject.color + '22' }}>
          <Text style={{ color: subject.color, fontSize: 10, fontWeight: '700' }}>{subject.name}</Text>
        </View>}

        {comments > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} accessibilityLabel={trn('{n} comentarios', { n: comments })}>
            <Ionicons name="chatbubble-outline" size={11} color={C.muted} />
            <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '700' }}>{comments}</Text>
          </View>
        )}

        {due && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="calendar-outline" size={11} color={due.color} />
            <Text style={{ color: due.color, fontSize: 11.5, fontWeight: '700' }}>{due.label}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}


// ---------- Menú "mover a" (móvil) ----------

export function MoveMenu({ task, cols, onClose, onPick }: {
  task: PTask | null; cols: BoardColumn[]; onClose: () => void; onPick: (colKey: string) => void;
}) {
  return (
    <Modal visible={!!task} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }} style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, borderTopWidth: 1, borderColor: C.line }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{t('Mover tarjeta')}</Text>
          <Text numberOfLines={2} style={{ color: C.muted, fontSize: 12.5, marginTop: 3, marginBottom: 12 }}>{task?.title}</Text>
          {cols.map((c) => {
            const on = c.key === task?.status;
            return (
              <Pressable key={c.key} onPress={() => onPick(c.key)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12, backgroundColor: on ? C.surface2 : 'transparent' }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />
                <Text style={{ color: C.text, fontSize: 14, fontWeight: on ? '700' : '500', flex: 1 }}>{c.label}</Text>
                {on ? <Text style={{ color: C.muted, fontSize: 11.5 }}>{t('aquí está')}</Text> : <Ionicons name="arrow-forward" size={15} color={C.muted} />}
              </Pressable>
            );
          })}
          <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 10 }}>
            <Text style={{ color: C.muted }}>{t('Cancelar')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ============================================================
//  Vista LISTA
// ============================================================

/** v25: prioridad, bloqueada, repetición y etiquetas en la tarjeta. */
export function WorkBadges({ task, byId }: { task: PTask; byId: Record<string, PTask> }) {
  // "Normal" es lo de siempre: no se marca en la tarjeta (solo lo que se sale de lo normal).
  const p = task.priority === 'normal' ? null : priorityOf(task.priority);
  const blockers = blockersOf(task, byId);
  const labels = task.labels ?? [];
  if (!p && !blockers.length && !labels.length && !task.repeat_rule) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      {p && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} accessibilityLabel={trn('Prioridad {label}', { label: p.label })}><Ionicons name="flag" size={11} color={p.color} /><Text style={{ color: p.color, fontSize: 11.5, fontWeight: '800' }}>{p.label}</Text></View>}
      {!task.done && blockers.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} accessibilityLabel={t('Bloqueada por {join}', { join: blockers.map((b) => b.title).join(', ') })}>
          <Ionicons name="lock-closed" size={11} color={C.warnText} /><Text style={{ color: C.warnText, fontSize: 11.5, fontWeight: '700' }} numberOfLines={1}>{t('Espera: {title}{v}', { title: blockers[0].title, v: blockers.length > 1 ? t(' y {v} más', { v: blockers.length - 1 }) : '' })}</Text>
        </View>
      )}
      {task.repeat_rule && <Ionicons name="repeat" size={12} color={C.muted} accessibilityLabel={t('Se repite')} />}
      {labels.slice(0, 3).map((l) => <Text key={l} style={{ color: C.muted, fontSize: 11.5, fontWeight: '600' }}>#{l}</Text>)}
    </View>
  );
}
