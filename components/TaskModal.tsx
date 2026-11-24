import React, { useEffect, useMemo, useState } from 'react';
import { startStopwatch } from '../lib/stopwatch';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import { useSheetDrag } from '../lib/sheetDrag';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { WhenPicker, type PlanValue } from './plan/WhenPicker';
import { needsPlan } from '../lib/planSlots';
import { hasPlanCols } from '../lib/db';
import { getEstimateRatio } from '../lib/studyDb';
import { estimateHint, fmtMinutes } from '../lib/estimate';
import { getSessions, removePlan, applyShift, trashTasks, type SessionTask } from '../lib/quizDb';
import { shouldOffer, planProgress, shiftSessions, KIND_TEXT } from '../lib/examPlan';
import { openExamPlan, openExamReview, dataChanged } from '../lib/uiBus';
import { shouldAsk } from '../lib/examReview';
import { confirm } from '../lib/feedback';
import { useRouter } from 'expo-router';
import { cleanRule, ruleText, type RepeatRule } from '../lib/repeat';
import { hasV20Cols } from '../lib/db';
import { t, locale, trn, dayLetters } from '../lib/i18n';

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
  const insets = useSafeAreaInsets();
  const drag = useSheetDrag(visible, onClose);
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
  const [plan, setPlan] = useState<PlanValue>({ at: null, place: null });
  const [ratio, setRatio] = useState<number | null>(null);
  const [hintOff, setHintOff] = useState(false);
  const [sessions, setSessions] = useState<SessionTask[]>([]);
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const [important, setImportant] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!visible) return;
    const t = editTask;
    const d = t?.due_at ? isoDate(new Date(t.due_at)) : t?.due_date ?? draft?.dueDate ?? (t ? null : isoDate(new Date()));
    const tm = t ? dueTimeHHMM(t) : draft?.dueTime ?? null;
    setTitle(t?.title ?? draft?.title ?? '');
    setDescription(t?.description ?? draft?.description ?? '');
    setSubjectId(t ? t.subject_id : draft?.subjectId ?? initialSubjectId ?? null);
    setType(t?.type ?? draft?.typeKey ?? 'tarea');
    setDate(d);
    setTime(tm);
    setRemind(t ? inferChoice(t.remind_at, t.remind_days, d, tm) : (tm ? '1h' : 'evening'));
    setEstimate(t?.estimate_min ?? null);
    setSteps([]);
    setNewType(null);
    setTitleError(null);
    setMore(!!(t?.description || t?.estimate_min || draft?.description));
    setPlan({ at: t?.plan_at ?? null, place: t?.plan_place ?? null });
    setHintOff(!!t?.estimate_min);
    getEstimateRatio().then(setRatio).catch(() => setRatio(null));
    setSessions([]);
    setRepeat(cleanRule(t?.repeat_rule));
    setImportant(!!t?.important);
    if (t && ['examen', 'quiz'].includes(String(t.type))) getSessions(t.id).then(setSessions).catch(() => {});
    loadTaskTypes().then(() => setTypesRev((n) => n + 1)).catch(() => {});
    if (t) getSteps(t.id).then(setSteps).catch(() => {});
  }, [visible, editTask, draft, initialSubjectId]);

  const types = useMemo(() => taskTypeList(), [typesRev, visible]);
  const doneSteps = steps.filter((s) => s.done).length;
  const v14 = hasV14();

  async function save() {
    if (!title.trim()) { setTitleError(t('Escribe un título.')); return; }
    setBusy(true);
    try {
      const at = remindAt(remind, date, time);
      const payload = {
        title: title.trim(), subject_id: subjectId, type,
        description: description.trim() ? description.trim() : null,
        due_date: date, due_at: date && time ? combine(date, time) : null,
        remind_days: remindDays(remind), remind_at: at ? at.toISOString() : null,
        estimate_min: estimate,
        // El plan solo se manda si hay uno (o había y se quitó): así no molesta sin la migración.
        ...(plan.at || editTask?.plan_at ? { plan_at: plan.at, plan_place: plan.at ? plan.place : null } : {}),
        ...(repeat || editTask?.repeat_rule ? { repeat_rule: date ? repeat : null } : {}),
        // v27: la estrella solo se manda si está puesta (o se quitó), igual que el plan.
        ...(important || editTask?.important ? { important } : {}),
        // Con fecha o materia sale de la bandeja.
        ...(editTask?.inbox && (date || subjectId) ? { inbox: false } : {}),
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
      const planChanged = plan.at && plan.at !== editTask?.plan_at;
      if (planChanged && new Date(plan.at!).getTime() > Date.now()) scheduleLocalReminder(t('Toca: ') + title.trim(), new Date(plan.at!)).catch(() => {});
      if (planChanged && !hasPlanCols()) toast(t('Tarea guardada. Para guardar cuándo la haces falta correr schema_v19.sql.'), { tone: 'bad' });
      else toast(editTask ? t('Cambios guardados') : t('Tarea creada'), { tone: 'good' });
      onSaved(id);
      // Plan de repaso del examen: ofrecerlo al crear (o al ponerle fecha) y mover las sesiones si cambia la fecha.
      const isExam = ['examen', 'quiz'].includes(type);
      const dateChanged = !!editTask && editTask.due_date !== date;
      const pendingSessions = sessions.filter((x) => x.status !== 'done');
      if (isExam && id && date && dateChanged && pendingSessions.length && editTask?.due_date) {
        const delta = Math.round((new Date(date + 'T12:00:00').getTime() - new Date(editTask.due_date + 'T12:00:00').getTime()) / 86_400_000);
        if (delta && await confirm(t('¿Muevo las sesiones que faltan?'), t('El examen se movió {delta} {v}. Las sesiones de repaso pendientes se corren igual.', { delta: Math.abs(delta), v: Math.abs(delta) === 1 ? t('día') : t('días') }), t('Moverlas'))) {
          const r = shiftSessions(pendingSessions, delta, new Date(), new Date(date + 'T12:00:00'));
          try { await applyShift(r.move); await trashTasks(r.drop); dataChanged(); toast(trn('Sesiones movidas') + `${r.drop.length ? t('; {length} ya no cabían y se quitaron', { length: r.drop.length }) : ''}`, { tone: 'good' }); }
          catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
        }
      } else if (isExam && id && shouldOffer(type, date, new Date()) && (!editTask || dateChanged) && !sessions.length) {
        openExamPlan({ ...(editTask ?? {}), ...payload, id, status: editTask?.status ?? 'pending' } as Task);
      }
    } catch (e) { notify(t('No se pudo guardar'), friendlyError(e)); }
    finally { setBusy(false); }
  }

  // Agrega los pasos sugeridos: directo a la base si la tarea ya existe, en
  // memoria (ids tmp-*) si se está creando.
  async function addSuggested(titles: string[]) {
    if (editTask) {
      const added: Step[] = [];
      for (let i = 0; i < titles.length; i++) {
        try { added.push(await addStep(editTask.id, titles[i], steps.length + i)); } catch (e) { notify(t('No se pudo agregar el paso'), friendlyError(e)); break; }
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
    } catch (e) { notify(t('No se pudo crear el tipo'), friendlyError(e)); }
  }

  async function remove() {
    if (!editTask) return;
    const t = editTask;
    if (await removeTask(t)) { onDeleted?.(t.id); onClose(); }
  }

  const body = (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', flex: 1 }} accessibilityRole="header">{editTask ? t('Editar tarea') : t('Nueva tarea')}</Text>
        {editTask && <IconButton icon="timer-outline" label={t('Enfocarme en esta tarea')} onPress={() => { startFocus({ taskId: editTask.id, taskTitle: editTask.title, subjectId: editTask.subject_id }); onClose(); toast(t('Enfoque iniciado: ') + editTask.title); }} />}
        {editTask && <IconButton icon="play-circle-outline" label={t('Iniciar cronómetro')} onPress={() => { startStopwatch({ title: editTask.title, subjectId: editTask.subject_id, assignmentId: editTask.id }); onClose(); toast(t('Cronómetro: ') + editTask.title); }} />}
        {editTask && <IconButton icon="trash-outline" label={t('Borrar tarea')} onPress={remove} />}
        <IconButton icon="close" label={t('Cerrar')} onPress={onClose} />
      </View>

      <Field value={title} onChangeText={(v) => { setTitle(v); if (titleError) setTitleError(null); }} placeholder={t('Ej: Taller de cálculo, ejercicios 1 a 10')}
        autoFocus={!editTask && Platform.OS === 'web'} error={titleError} onSubmitEditing={save} returnKeyType="done" label={t('Título')} />
      <Pressable onPress={() => setImportant((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: important }}
        accessibilityLabel={t('Importante')} accessibilityHint={t('Lo importante va arriba en la vista Matriz de Hoy')}
        style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99,
          borderWidth: 1, borderColor: important ? C.warnText : C.line, backgroundColor: important ? C.warn + '1f' : hovered ? C.surface2 : 'transparent' })}>
        <Ionicons name={important ? 'star' : 'star-outline'} size={15} color={important ? C.warnText : C.muted} />
        <Text style={{ color: important ? C.text : C.muted, fontSize: 13, fontWeight: '700' }}>{t('Importante')}</Text>
      </Pressable>

      <Text style={lbl()}>{t('Tipo')}</Text>
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
            <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>{t('Nuevo tipo')}</Text>
          </Pressable>
        )}
      </View>
      {newType && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <TextInput value={newType.icon} onChangeText={(v) => setNewType({ ...newType, icon: v.slice(-2) })} accessibilityLabel={t('Ícono del tipo')}
            style={{ width: 48, textAlign: 'center', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 10, fontSize: 16 }} />
          <TextInput value={newType.label} onChangeText={(v) => setNewType({ ...newType, label: v })} placeholder={t('Ej: Laboratorio')} placeholderTextColor={C.muted} autoFocus
            onSubmitEditing={createType} accessibilityLabel={t('Nombre del tipo')}
            style={{ flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 10, fontSize: 14 }} />
          <Button label={t('Crear')} size="sm" onPress={createType} />
          <IconButton icon="close" label={t('Cancelar tipo nuevo')} onPress={() => setNewType(null)} />
        </View>
      )}

      <Text style={lbl()}>{t('Materia')}</Text>
      <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <DateField label={t('Entrega')} value={date} onChange={(v) => { setDate(v); if (!v) setTime(null); }} />
        {v14 && <TimeField label={t('Hora (opcional)')} value={time} onChange={(v) => { setTime(v); if (v && remind === 'evening') setRemind('1h'); if (!v && REMIND_OPTIONS.find((o) => o.key === remind)?.needsTime) setRemind('evening'); }} disabled={!date} />}
      </View>
      <DateShortcuts value={date} onChange={setDate} />

      {date && (
        <>
          <Text style={lbl()}>{t('Avisarme')}</Text>
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

      {date && hasV20Cols() && <RepeatPicker value={repeat} onChange={setRepeat} date={date} />}

      {hasPlanCols() && (needsPlan(date, new Date()) || !!plan.at) && (
        <WhenPicker title={title} dueDate={date} dueTime={time} value={plan} onChange={setPlan} excludeId={editTask?.id ?? null} />
      )}

      {editTask && shouldAsk({ ...editTask, type, due_date: date } as any, new Date()) && (
        <Pressable onPress={() => { const ex = { ...editTask, due_date: date, type }; onClose(); openExamReview(ex as Task); }} accessibilityRole="button"
          style={({ hovered }: any) => ({ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.brand2 + '66', backgroundColor: hovered ? C.surface2 : C.brand2 + '12' })}>
          <Ionicons name="school-outline" size={18} color={C.brand2} />
          <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>{t('¿Cómo te fue? Pon la nota y mira si el esfuerzo alcanzó')}</Text>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </Pressable>
      )}

      {editTask && ['examen', 'quiz'].includes(type) && (sessions.length > 0 || shouldOffer(type, date, new Date())) && (
        <View style={{ marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 + '66', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="calendar-number-outline" size={15} color={C.brand} />
            <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>{sessions.length ? planProgress(sessions).text : t('Plan de repaso')}</Text>
          </View>
          {sessions.map((x) => (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${x.title}${x.status === 'done' ? t(', hecha') : ''}`}
              onPress={() => { if (x.session_kind === 'sim' && x.status !== 'done') { onClose(); router.push({ pathname: '/simulacro', params: { materia: x.subject_id ?? '', examen: editTask.id, sesion: x.id } } as any); } }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={x.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={x.status === 'done' ? C.good : C.muted} />
              <Text style={{ color: x.status === 'done' ? C.muted : C.text, fontSize: 13, flex: 1, textDecorationLine: x.status === 'done' ? 'line-through' : 'none' }} numberOfLines={1}>
                {x.session_kind ? KIND_TEXT[x.session_kind].short : x.title.split(' · ')[0]}
              </Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>{x.due_date ? x.due_date.slice(8, 10) + '/' + x.due_date.slice(5, 7) : ''}{x.plan_at ? ' · ' + new Date(x.plan_at).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }) : ''}</Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {sessions.length === 0
              ? <Button label={t('Armar plan de repaso')} icon="sparkles-outline" size="sm" onPress={() => { const ex = { ...editTask, due_date: date, type }; onClose(); openExamPlan(ex as Task); }} />
              : <>
                <Button label={t('Rehacer')} size="sm" kind="secondary" onPress={async () => { try { await removePlan(editTask.id); const ex = { ...editTask, due_date: date, type }; onClose(); dataChanged(); openExamPlan(ex as Task); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } }} />
                <Button label={t('Quitar')} size="sm" kind="ghost" onPress={async () => { try { await removePlan(editTask.id); setSessions((xs) => xs.filter((x) => x.status === 'done')); dataChanged(); toast(t('Plan quitado (las sesiones hechas se quedan)')); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } }} />
              </>}
          </View>
        </View>
      )}

      {!more ? (
        <Pressable onPress={() => setMore(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, alignSelf: 'flex-start', paddingVertical: 6 }} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={17} color={C.brand} />
          <Text style={{ color: C.brand, fontWeight: '700', fontSize: 13.5 }}>{t('Descripción y tiempo estimado')}</Text>
        </Pressable>
      ) : (
        <>
          <Field label={t('Descripción')} value={description} onChangeText={setDescription} multiline placeholder={t('Detalles, requisitos, página del libro…')}
            inputStyle={{ minHeight: 72, textAlignVertical: 'top' }} style={{ marginTop: 14 }} />
          {v14 && (
            <>
              <Text style={[lbl(), { marginTop: 2 }]}>{t('Tiempo estimado')}</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {[null, ...ESTIMATES, ...(estimate != null && !ESTIMATES.includes(estimate) ? [estimate] : [])].map((m) => {
                  const on = estimate === m;
                  const label = m == null ? t('Sin estimar') : fmtMinutes(m);
                  return (
                    <Pressable key={String(m)} onPress={() => { setEstimate(m); setHintOff(false); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                      style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
                      <Text style={{ color: on ? C.onBrand : C.text, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {(() => {
                const h = hintOff ? null : estimateHint(estimate, ratio);
                if (!h) return null;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: C.brand + '14', borderWidth: 1, borderColor: C.brand + '44', flexWrap: 'wrap' }}>
                    <Ionicons name="hourglass-outline" size={15} color={C.brand} />
                    <Text style={{ color: C.text, fontSize: 12.5, flex: 1, minWidth: 180 }}>{h.text}</Text>
                    <Button label={t('Poner {value}', { value: fmtMinutes(h.value) })} size="sm" onPress={() => { setEstimate(h.value); setHintOff(true); }} />
                    <IconButton icon="close" label={t('No, gracias')} onPress={() => setHintOff(true)} />
                  </View>
                );
              })()}
            </>
          )}
        </>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 6 }}>
        <Ionicons name="list-outline" size={15} color={C.muted} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>{t('Pasos')}</Text>
        {steps.length > 0 && <Text style={{ color: C.muted, fontSize: 12 }}>{t('{doneSteps} de {length}', { doneSteps, length: steps.length })}</Text>}
      </View>
      <View style={{ backgroundColor: C.surface2 + '80', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 10 }}>
        <SubtaskList assignmentId={editTask?.id ?? null} steps={steps} onChange={setSteps} />
        {steps.length === 0 && <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{t('Divide la tarea en pasos y verás el avance.')}</Text>}
      </View>
      <StepSuggestions title={title} description={description} typeKey={type} existing={steps.map((s) => s.title)} onAdd={addSuggested} />
    </ScrollView>
  );

  const footer = (
    <View style={{ flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, marginTop: 8 }}>
      <Button label={t('Cancelar')} kind="secondary" onPress={onClose} style={{ flex: 1 }} />
      <Button label={editTask ? t('Guardar') : t('Crear tarea')} onPress={save} busy={busy} style={{ flex: 2 }} />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType={isWide || Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: isWide ? 'center' : 'stretch', justifyContent: isWide ? 'center' : 'flex-end', padding: isWide ? 24 : 0 }}>
          <Animated.View ref={drag.ref} onLayout={drag.onLayout} {...(isWide ? {} : drag.handlers)} style={isWide ? { width: '100%', maxWidth: 580, maxHeight: '90%' } : [{ maxHeight: '94%' }, drag.style]}>
          <Pressable onPress={() => {}} accessibilityViewIsModal dataSet={{ anim: 'sheet' }}
            style={isWide
              ? { width: '100%', flexShrink: 1, backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, padding: 22 }
              : { flexShrink: 1, backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingTop: 8, paddingBottom: 18 + Math.max(insets.bottom, 6), borderTopWidth: 1, borderColor: C.line }}>
            {/* v29: en el celular, la rayita de arriba y el encabezado se arrastran hacia abajo para cerrar. */}
            {!isWide && <View style={{ paddingVertical: 6, marginBottom: 4, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
              <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: C.line }} />
            </View>}
            {body}
            {footer}
          </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function lbl() { return { color: C.muted, fontSize: 12.5, fontWeight: '600' as const, marginTop: 14, marginBottom: 8 }; }

// ---------- Repetir (v21) ----------
const LETTERS = dayLetters();
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export function RepeatPicker({ value, onChange, date }: { value: RepeatRule | null; onChange: (r: RepeatRule | null) => void; date: string }) {
  const d = new Date(date + 'T12:00:00');
  const kind = !value ? 'none' : value.freq === 'day' ? 'day' : value.freq === 'month' ? 'month'
    : value.days?.join() === '1,2,3,4,5' && value.interval === 1 ? 'weekdays' : value.interval === 2 ? 'week2' : 'week';
  const keep = (r: RepeatRule) => ({ ...r, ...(value?.until ? { until: value.until } : {}), ...(value?.fromDone ? { fromDone: true } : {}) });
  const opts: { k: string; label: string; make: () => RepeatRule | null }[] = [
    { k: 'none', label: t('No se repite'), make: () => null },
    { k: 'day', label: t('Cada día'), make: () => keep({ freq: 'day', interval: 1 }) },
    { k: 'weekdays', label: t('Días hábiles'), make: () => keep({ freq: 'week', interval: 1, days: [1, 2, 3, 4, 5] }) },
    { k: 'week', label: t('Cada semana'), make: () => keep({ freq: 'week', interval: 1, days: [d.getDay()] }) },
    { k: 'week2', label: t('Cada 2 semanas'), make: () => keep({ freq: 'week', interval: 2, days: [d.getDay()] }) },
    { k: 'month', label: t('Cada mes'), make: () => keep({ freq: 'month', interval: 1, monthDay: d.getDate() }) },
  ];
  const chip = (key: string, label: string, on: boolean, onPress: () => void, small = false) => (
    <Pressable key={key} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }}
      style={{ minHeight: small ? 32 : 34, minWidth: small ? 32 : undefined, alignItems: 'center', justifyContent: 'center', paddingHorizontal: small ? 0 : 11, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
      <Text style={{ color: on ? C.onBrand : C.text, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View>
      <Text style={lbl()}>{t('Repetir')}</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }} accessibilityRole="radiogroup" accessibilityLabel={t('Repetir')}>
        {opts.map((o) => chip(o.k, o.label, kind === o.k, () => onChange(o.make())))}
      </View>
      {value && value.freq === 'week' && kind !== 'weekdays' && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }} accessibilityLabel={t('Días de la semana')}>
          {WEEK_ORDER.map((n) => {
            const on = !!value.days?.includes(n);
            return chip('d' + n, LETTERS[n], on, () => {
              const days = on ? (value.days ?? []).filter((x) => x !== n) : [...(value.days ?? []), n];
              if (days.length) onChange({ ...value, days: days.sort() });
            }, true);
          })}
        </View>
      )}
      {value && (
        <View style={{ marginTop: 10, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <DateField label={t('Hasta (opcional)')} value={value.until ?? null} onChange={(v) => onChange({ ...value, until: v })} />
          </View>
          <Pressable onPress={() => onChange({ ...value, fromDone: !value.fromDone })} accessibilityRole="checkbox" accessibilityState={{ checked: !!value.fromDone }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <Ionicons name={value.fromDone ? 'checkbox' : 'square-outline'} size={18} color={value.fromDone ? C.brand : C.muted} />
            <Text style={{ color: C.text, fontSize: 13 }}>{t('Contar desde que la termino')}</Text>
          </Pressable>
          <Text style={{ color: C.muted, fontSize: 12 }}>{t('Se repite {value}. Al marcarla hecha aparece la siguiente.', { value: ruleText(value) })}</Text>
        </View>
      )}
    </View>
  );
}
