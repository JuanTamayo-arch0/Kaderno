import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, R, uiScheme } from '../../lib/theme';
import { confirm, notify } from '../../lib/confirm';
import { ProgressBar } from '../ProgressBar';
import { StepSuggestions } from '../StepSuggestions';
import { play } from '../../lib/sound';
import { BoardColumn, Member, PStep, PTask, addProjectStep, addProjectTask, colorOf, deleteProjectStep, deleteProjectTask, initialsOf, logActivity, nameOf, toggleProjectStep, updateProjectTask } from '../../lib/projects';
import { btnPrimary, hace, input, isWeb, lbl, pad } from './projectUi';
import { TaskComments } from './TaskComments';

// ============================================================
//  Ventana de una tarea de proyecto: datos, responsable, fecha y microtareas.
//  (Separado de app/proyectos/[id].tsx en la versión 23.) Abajo, los
//  comentarios con @menciones (v23, fase 2).
// ============================================================

export function PTaskModal({ visible, task, projectId, status, cols, members, steps, editable, onClose, onSaved, onStepsChanged, onStepPatch, myId = null, isOwner = false, onCommentCount, defaultDate = null }: {
  defaultDate?: Date | null; myId?: string | null; isOwner?: boolean; onCommentCount?: (taskId: string, n: number) => void;
  visible: boolean; task: PTask | null; projectId: string; status: string;
  cols: BoardColumn[]; members: Member[]; steps: PStep[]; editable: boolean;
  onClose: () => void; onSaved: () => void; onStepsChanged: () => void;
  onStepPatch?: (stepId: string, done: boolean) => void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [st, setSt] = useState(status);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState('');   // 'HH:MM' o vacío (= 11:59 p. m.)
  const [start, setStart] = useState<Date | null>(null);   // inicio (opcional), para la línea de tiempo
  const [showStart, setShowStart] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nuevoPaso, setNuevoPaso] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);

  // Rellenar el formulario al abrir. Es el patrón de "ajustar estado durante el
  // render" que React permite, y no un useEffect: así no hay un parpadeo con los
  // datos de la tarea anterior. La clave incluye el cerrado (null), porque si no
  // volver a abrir la MISMA tarjeta no restablecería lo que se dejó a medias.
  const clave = visible ? `${task?.id ?? 'nueva'}:${status}:${task ? '' : defaultDate?.getTime() ?? ''}` : null;
  if (clave !== abierta) {
    setAbierta(clave);
    if (clave) {
      setTitle(task?.title ?? '');
      setDesc(task?.description ?? '');
      setSt(task?.status ?? status);
      setAssignee(task?.assignee_id ?? null);
      const at = task?.due_at ? new Date(task.due_at) : null;
      if (at && !isNaN(at.getTime())) {
        setDate(new Date(at.getFullYear(), at.getMonth(), at.getDate()));
        setTime(at.getHours() === 23 && at.getMinutes() === 59 ? '' : `${pad(at.getHours())}:${pad(at.getMinutes())}`);
      } else {
        setDate(task?.due_date ? new Date(task.due_date + 'T00:00:00') : task ? null : defaultDate);
        setTime('');
      }
      const sa = task?.start_at ? new Date(task.start_at) : null;
      setStart(sa && !isNaN(sa.getTime()) ? new Date(sa.getFullYear(), sa.getMonth(), sa.getDate()) : null);
      setNuevoPaso('');
      setShowPicker(false);
      setShowStart(false);
    }
  }

  async function guardar() {
    if (!title.trim()) return notify('Ponle título a la tarea');
    setBusy(true);
    const due = date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : null;
    const [hh, mm] = /^\d{2}:\d{2}$/.test(time) ? time.split(':').map(Number) : [23, 59];
    const dueAt = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm).toISOString() : null;
    if (start && date && start > date) { setBusy(false); return notify('El inicio va antes de la entrega'); }
    const startAt = start ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 8, 0).toISOString() : null;
    const startPatch = start || task?.start_at ? { start_at: startAt } : {};
    try {
      if (task) {
        await updateProjectTask(task.id, {
          title: title.trim(), description: desc.trim() || null, status: st,
          assignee_id: assignee, due_date: due, due_at: dueAt, ...startPatch,
        });
      } else {
        const creada = await addProjectTask({
          project_id: projectId, title: title.trim(), status: st,
          description: desc.trim() || null, assignee_id: assignee, due_date: due, due_at: dueAt, ...startPatch,
        });
        await logActivity(projectId, 'task_new', `creó “${creada.title}”`, { task_id: creada.id });
      }
      onSaved();
    } catch (e: any) { notify('No se pudo guardar', e.message); }
    finally { setBusy(false); }
  }

  async function borrar() {
    if (!task) return;
    const ok = await confirm('¿Borrar esta tarea?', `Se borra "${task.title}" para todo el equipo.`, 'Borrar');
    if (!ok) return;
    try { await deleteProjectTask(task.id); onSaved(); }
    catch (e: any) { notify('No se pudo borrar', e.message); }
  }

  async function agregarPaso() {
    const t = nuevoPaso.trim();
    if (!t || !task) return;
    setNuevoPaso('');
    try {
      await addProjectStep(projectId, task.id, t, (steps.length + 1) * 1000);
      onStepsChanged();
    } catch (e: any) { notify('No se pudo agregar', e.message); }
  }

  const hechos = steps.filter((s) => s.done).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }} style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 540, maxHeight: '90%' }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', flex: 1 }}>
                {task ? 'Tarea' : 'Nueva tarea'}
              </Text>
              <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={20} color={C.muted} /></Pressable>
            </View>

            {!editable && (
              <Text style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>
                Solo puedes mirar: en este proyecto no tienes permiso de editar.
              </Text>
            )}

            <TextInput value={title} onChangeText={setTitle} editable={editable}
              placeholder="¿Qué hay que hacer?" placeholderTextColor={C.muted} style={input} />

            <Text style={lbl}>Detalle (opcional)</Text>
            <TextInput value={desc} onChangeText={setDesc} editable={editable} multiline
              placeholder="Instrucciones, enlaces, lo que sea" placeholderTextColor={C.muted}
              style={[input, { minHeight: 70, textAlignVertical: 'top' }]} />

            <Text style={lbl}>Columna</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {cols.map((c) => {
                const on = c.key === st;
                return (
                  <Pressable key={c.key} onPress={() => editable && setSt(c.key)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, backgroundColor: on ? c.color + '22' : C.surface2, borderColor: on ? c.color : C.line }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                    <Text style={{ color: on ? c.color : C.text, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={lbl}>¿Quién la hace?</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Pressable onPress={() => editable && setAssignee(null)}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, backgroundColor: assignee === null ? C.surface2 : 'transparent', borderColor: assignee === null ? C.brand : C.line }}>
                <Text style={{ color: assignee === null ? C.brand : C.muted, fontSize: 12.5, fontWeight: assignee === null ? '700' : '500' }}>Nadie aún</Text>
              </Pressable>
              {members.map((m) => {
                const on = m.user_id === assignee;
                return (
                  <Pressable key={m.id} onPress={() => editable && setAssignee(m.user_id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, paddingHorizontal: 11, borderRadius: R.pill, borderWidth: 1, backgroundColor: on ? C.surface2 : 'transparent', borderColor: on ? colorOf(m.user_id) : C.line }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colorOf(m.user_id), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#0f1115', fontSize: 8.5, fontWeight: '800' }}>{initialsOf(m.profile)}</Text>
                    </View>
                    <Text style={{ color: on ? C.text : C.muted, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{nameOf(m.profile)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={lbl}>Fecha y hora de entrega</Text>
            {isWeb ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {React.createElement('input', {
                  type: 'date',
                  value: date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '',
                  disabled: !editable,
                  onChange: (e: any) => { const v = e.target.value; setDate(v ? new Date(v + 'T00:00:00') : null); },
                  style: { backgroundColor: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, color: C.text, padding: 12, fontSize: 14, colorScheme: uiScheme(), flex: 2, minWidth: 0, boxSizing: 'border-box' },
                })}
                {React.createElement('input', {
                  type: 'time',
                  value: time,
                  disabled: !editable || !date,
                  'aria-label': 'Hora de entrega',
                  onChange: (e: any) => setTime(e.target.value),
                  style: { backgroundColor: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, color: C.text, padding: 12, fontSize: 14, colorScheme: uiScheme(), flex: 1, minWidth: 0, boxSizing: 'border-box', opacity: date ? 1 : 0.5 },
                })}
              </View>
            ) : (
              <>
                <Pressable onPress={() => editable && setShowPicker(true)} style={input}>
                  <Text style={{ color: date ? C.text : C.muted }}>{date ? date.toLocaleDateString('es') : 'Sin fecha'}</Text>
                </Pressable>
                {showPicker && (
                  <DateTimePicker value={date ?? new Date()} mode="date"
                    onChange={(_, d) => { setShowPicker(false); if (d) setDate(d); }} />
                )}
              </>
            )}
            {date && editable && (
              <Pressable onPress={() => { setDate(null); setTime(''); }} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                <Text style={{ color: C.muted, fontSize: 12 }}>Quitar la fecha</Text>
              </Pressable>
            )}

            <Text style={lbl}>Empieza (opcional)</Text>
            {isWeb ? (
              React.createElement('input', {
                type: 'date',
                value: start ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` : '',
                max: date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : undefined,
                disabled: !editable,
                'aria-label': 'Fecha de inicio',
                onChange: (e: any) => { const v = e.target.value; setStart(v ? new Date(v + 'T00:00:00') : null); },
                style: { backgroundColor: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, color: C.text, padding: 12, fontSize: 14, colorScheme: uiScheme(), width: '100%', boxSizing: 'border-box' },
              })
            ) : (
              <>
                <Pressable onPress={() => editable && setShowStart(true)} style={input}>
                  <Text style={{ color: start ? C.text : C.muted }}>{start ? start.toLocaleDateString('es') : 'Sin inicio'}</Text>
                </Pressable>
                {showStart && (
                  <DateTimePicker value={start ?? date ?? new Date()} mode="date" maximumDate={date ?? undefined}
                    onChange={(_, d) => { setShowStart(false); if (d) setStart(d); }} />
                )}
              </>
            )}
            {start && editable && (
              <Pressable onPress={() => setStart(null)} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                <Text style={{ color: C.muted, fontSize: 12 }}>Quitar el inicio</Text>
              </Pressable>
            )}

            {/* ---------- Microtareas ---------- */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 }}>
              <Ionicons name="list-outline" size={15} color={C.muted} />
              <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>Microtareas</Text>
              {steps.length > 0 && <Text style={{ color: C.muted, fontSize: 12 }}>{hechos}/{steps.length}</Text>}
            </View>

            {!task ? (
              <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
                Guarda la tarea primero y aquí podrás partirla en pasos (con sugerencias según la descripción) y ver su avance.
              </Text>
            ) : (
              <View style={{ backgroundColor: C.surface2 + '80', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 10 }}>
                {steps.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <ProgressBar done={hechos} total={steps.length} height={6} />
                  </View>
                )}
                {steps.map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 }}>
                    <Pressable disabled={!editable} hitSlop={8}
                      onPress={async () => {
                        // Optimista: se marca ya, con sonido; el servidor confirma por detrás.
                        const next = !s.done;
                        play(next ? 'step' : 'uncheck');
                        onStepPatch?.(s.id, next);
                        try { await toggleProjectStep(s.id, next); onStepsChanged(); }
                        catch (e: any) { onStepPatch?.(s.id, !next); notify('No se pudo marcar', e.message); }
                      }}
                      key={s.done ? 'si' : 'no'} dataSet={s.done ? { anim: 'pop' } : undefined}
                      style={{ width: 19, height: 19, borderRadius: 6, borderWidth: 2, borderColor: s.done ? C.good : C.line, backgroundColor: s.done ? C.good : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {s.done && <Ionicons name="checkmark" size={11} color="#0f1115" />}
                    </Pressable>
                    <Text style={{ color: s.done ? C.muted : C.text, fontSize: 13, flex: 1, textDecorationLine: s.done ? 'line-through' : 'none' }}>{s.title}</Text>
                    {editable && (
                      <Pressable hitSlop={8}
                        onPress={async () => {
                          try { await deleteProjectStep(s.id); onStepsChanged(); }
                          catch (e: any) { notify('No se pudo borrar', e.message); }
                        }}>
                        <Ionicons name="close" size={15} color={C.muted} />
                      </Pressable>
                    )}
                  </View>
                ))}
                {editable && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <TextInput value={nuevoPaso} onChangeText={setNuevoPaso} onSubmitEditing={agregarPaso}
                      placeholder="Agregar un paso" placeholderTextColor={C.muted} returnKeyType="done"
                      style={{ flex: 1, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 9, color: C.text, paddingVertical: 9, paddingHorizontal: 11, fontSize: 13 }} />
                    <Pressable onPress={agregarPaso} hitSlop={8}><Ionicons name="add-circle" size={22} color={C.brand} /></Pressable>
                  </View>
                )}
              </View>
            )}
            {task && editable && (
              <StepSuggestions title={title} description={desc} existing={steps.map((x) => x.title)}
                onAdd={async (titles) => {
                  try {
                    for (let i = 0; i < titles.length; i++) await addProjectStep(projectId, task.id, titles[i], (steps.length + i + 1) * 1000);
                    onStepsChanged();
                  } catch (e: any) { notify('No se pudo agregar', e.message); }
                }} />
            )}

            {editable && (
              <Pressable onPress={guardar} disabled={busy} style={btnPrimary}>
                <Text style={{ color: C.onBrand, fontWeight: '700' }}>{busy ? '…' : task ? 'Guardar' : 'Crear tarea'}</Text>
              </Pressable>
            )}
            {editable && task && (
              <Pressable onPress={borrar} style={{ alignItems: 'center', marginTop: 14 }}>
                <Text style={{ color: C.bad, fontWeight: '600', fontSize: 13 }}>Borrar tarea</Text>
              </Pressable>
            )}
            {task && (
              <TaskComments projectId={projectId} taskId={task.id} taskTitle={task.title} members={members} myId={myId} isOwner={isOwner} onCountChange={onCommentCount} />
            )}
            <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: C.muted }}>Cerrar</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ============================================================
//  Ventana de columnas del tablero
// ============================================================
