import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Button } from '../ds';
import { Sheet } from '../cards/CardForms';
import { getTasks, getSchedule, updateTask, type Task } from '../../lib/db';
import { getStudyPrefs, saveStudyPrefs } from '../../lib/cardsDb';
import { lastWeekData, saveWeekPlan, getGoals, getWeekPlan, type Goal } from '../../lib/ritualsDb';
import { suggestSlots } from '../../lib/planHelpers';
import { weekItems, suggestPriorities, lastWeekSummary, cleanPriorities, type Priority } from '../../lib/rituals';
import { addDaysISO } from '../../lib/streaks';
import { getDiary } from '../../lib/dayDb';
import { slotLabel } from '../../lib/planSlots';
import { toast, notify, friendlyError } from '../../lib/feedback';
import { dataChanged, streakChanged } from '../../lib/uiBus';

// ============================================================
//  Ritual del lunes (v20, sección J.1), 3 minutos en cuatro pasos:
//  tu semana, lo importante, ¿cuándo? y la meta de días.
// ============================================================

const STEPS = ['Tu semana', 'Lo importante', '¿Cuándo?', 'Tu meta'];
const DAY = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const dayLabel = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return `${DAY[d.getDay()]} ${d.getDate()}`; };

export function WeekRitual({ visible, weekStart, onClose, onDone }: { visible: boolean; weekStart: string; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [classes, setClasses] = useState(0);
  const [summary, setSummary] = useState<{ text: string; vs: string | null } | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [prio, setPrio] = useState<Priority[]>([]);
  const [text, setText] = useState('');
  const [times, setTimes] = useState<Record<number, Date | null>>({});
  const [opts, setOpts] = useState<Record<number, Date[]>>({});
  const [goal, setGoal] = useState(4);
  const [busy, setBusy] = useState(false);
  const [diary, setDiary] = useState<{ day: string; note: string }[]>([]);

  useEffect(() => {
    if (!visible) return;
    setStep(0); setPrio([]); setTimes({}); setOpts({}); setText(''); setTasks(null);
    getDiary(addDaysISO(weekStart, -7), weekStart).then(setDiary).catch(() => setDiary([]));
    Promise.all([getTasks(), getSchedule().catch(() => []), getStudyPrefs(), lastWeekData(weekStart).catch(() => null), getGoals().catch(() => []), getWeekPlan(weekStart).catch(() => null)])
      .then(([t, sc, prefs, lw, g, prev]) => {
        setTasks(t); setClasses(sc.length); setGoal(prev?.goal_days ?? prefs.weeklyGoal); setGoals(g);
        // Si ya se había planeado, se parte de lo elegido.
        if (prev?.priorities?.length) {
          setPrio(prev.priorities);
          const tm: Record<number, Date | null> = {};
          prev.priorities.forEach((p, i) => { const at = p.kind === 'text' ? p.at : t.find((x) => x.id === p.taskId)?.plan_at; if (at) tm[i] = new Date(at); });
          setTimes(tm);
        }
        if (lw) setSummary(lastWeekSummary(lw.rows, weekStart, prefs.weeklyGoal, lw.focusMin, lw.plannedMin));
      }).catch(() => setTasks([]));
  }, [visible, weekStart]);

  const items = useMemo(() => weekItems(tasks ?? [], weekStart), [tasks, weekStart]);
  const cands = useMemo(() => suggestPriorities(tasks ?? [], weekStart), [tasks, weekStart]);

  // Al llegar a "¿Cuándo?": tres horarios para cada prioridad.
  useEffect(() => {
    if (step !== 2) return;
    prio.forEach((p, i) => {
      if (opts[i]) return;
      const t = p.kind === 'task' ? (tasks ?? []).find((x) => x.id === p.taskId) : null;
      const due = t?.due_date ? new Date(t.due_date + 'T00:00:00') : new Date(addDaysISO(weekStart, 7) + 'T00:00:00');
      suggestSlots({ due, dueHasTime: false, excludeId: t?.id ?? null }).then((d) => setOpts((o) => ({ ...o, [i]: d }))).catch(() => setOpts((o) => ({ ...o, [i]: [] })));
    });
  }, [step]);

  const togglePrio = (t: Task) => setPrio((list) => {
    if (list.some((p) => p.kind === 'task' && p.taskId === t.id)) return list.filter((p) => !(p.kind === 'task' && p.taskId === t.id));
    if (list.length >= 3) { toast('Máximo 3: lo importante es poco.'); return list; }
    return [...list, { kind: 'task', taskId: t.id, title: t.title }];
  });
  const addText = () => {
    const v = text.trim();
    if (!v) return;
    if (prio.length >= 3) { toast('Máximo 3: lo importante es poco.'); return; }
    setPrio((l) => [...l, { kind: 'text', title: v }]); setText('');
  };

  async function finish() {
    setBusy(true);
    try {
      const list = cleanPriorities(prio.map((p, i) => (p.kind === 'text' ? { ...p, at: times[i] ? times[i]!.toISOString() : null } : p)));
      // A las tareas elegidas se les pone su "¿Cuándo lo haces?".
      for (let i = 0; i < prio.length; i++) {
        const p = prio[i], at = times[i];
        if (p.kind === 'task' && at) await updateTask(p.taskId, { plan_at: at.toISOString() }).catch(() => {});
      }
      await saveWeekPlan(weekStart, { priorities: list, goal_days: goal, done_at: new Date().toISOString(), snoozed_until: null });
      await saveStudyPrefs({ weeklyGoal: goal }).catch(() => {});
      toast('Semana planeada. Tus prioridades quedan arriba en Hoy.', { tone: 'good' });
      dataChanged(); streakChanged(0);
      onDone(); onClose();
    } catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }

  let body: React.ReactNode;
  if (!tasks) body = <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color={C.brand} /></View>;
  else if (step === 0) body = (
    <>
      {summary && (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.surface2, gap: 4 }}>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>La semana pasada</Text>
          <Text style={{ color: C.text, fontSize: 13.5 }}>{summary.text}</Text>
          {!!summary.vs && <Text style={{ color: C.muted, fontSize: 13 }}>{summary.vs}</Text>}
        </View>
      )}
      {diary.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>Lo que aprendiste</Text>
          {diary.slice(-5).map((d) => <Text key={d.day} style={{ color: C.muted, fontSize: 13 }}>{dayLabel(d.day)}: <Text style={{ color: C.text }}>{d.note}</Text></Text>)}
        </View>
      )}
      <Group title={`Esta semana${classes ? ` · ${classes} ${classes === 1 ? 'clase' : 'clases'}` : ''}`} rows={items.thisWeek} empty="Nada con fecha esta semana." />
      <Group title="La próxima" rows={items.nextWeek} empty="Nada con fecha la próxima semana." />
      {goals.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>Tus metas</Text>
          {goals.slice(0, 3).map((g) => (
            <View key={g.id} style={{ gap: 2 }}>
              <Text style={{ color: C.text, fontSize: 13.5 }}>{g.wish}</Text>
              {!!g.plan && <Text style={{ color: C.muted, fontSize: 12.5, fontStyle: 'italic' }}>{g.plan}</Text>}
            </View>
          ))}
        </View>
      )}
    </>
  );
  else if (step === 1) body = (
    <>
      <Text style={{ color: C.text, fontSize: 14 }}>Elige hasta 3 cosas que, si las haces, la semana valió la pena.</Text>
      {cands.map((t) => {
        const on = prio.some((p) => p.kind === 'task' && p.taskId === t.id);
        return (
          <Pressable key={t.id} onPress={() => togglePrio(t)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={t.title}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand + '14' : 'transparent' }}>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={19} color={on ? C.brand : C.muted} />
            <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{t.title}</Text>
            {!!t.due_date && <Text style={{ color: C.muted, fontSize: 12.5 }}>{dayLabel(t.due_date)}</Text>}
          </Pressable>
        );
      })}
      {prio.filter((p) => p.kind === 'text').map((p, i) => (
        <View key={'t' + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: C.brand, backgroundColor: C.brand + '14' }}>
          <Ionicons name="create-outline" size={18} color={C.brand} />
          <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{p.title}</Text>
          <Pressable onPress={() => setPrio((l) => l.filter((x) => x !== p))} accessibilityLabel={`Quitar ${p.title}`} hitSlop={8}><Ionicons name="close" size={18} color={C.muted} /></Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={addText} placeholder="Otra cosa (ej: ir a asesoría de Cálculo)" placeholderTextColor={C.muted} maxLength={120}
          accessibilityLabel="Escribir otra prioridad" style={{ flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, color: C.text, padding: 11, fontSize: 14 }} />
        <Button label="Agregar" kind="secondary" size="sm" onPress={addText} />
      </View>
      <Text style={{ color: C.muted, fontSize: 12.5 }}>{prio.length} de 3</Text>
    </>
  );
  else if (step === 2) body = (
    <>
      {prio.length === 0 && <Text style={{ color: C.muted, fontSize: 13.5 }}>No elegiste prioridades. Puedes seguir o volver atrás.</Text>}
      {prio.map((p, i) => (
        <View key={i} style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{p.title}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {!opts[i] && <ActivityIndicator color={C.brand} size="small" />}
            {[...(times[i] && !(opts[i] ?? []).some((d) => d.getTime() === times[i]!.getTime()) ? [times[i]!] : []), ...(opts[i] ?? [])].map((d) => {
              const on = times[i]?.getTime() === d.getTime();
              return (
                <Pressable key={d.toISOString()} onPress={() => setTimes((x) => ({ ...x, [i]: on ? null : d }))} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
                  <Text style={{ color: on ? C.onBrand : C.text, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{slotLabel(d, new Date())}</Text>
                </Pressable>
              );
            })}
            {opts[i] && opts[i].length === 0 && <Text style={{ color: C.muted, fontSize: 12.5 }}>Sin huecos libres antes de la entrega.</Text>}
          </View>
        </View>
      ))}
    </>
  );
  else body = (
    <>
      <Text style={{ color: C.text, fontSize: 14 }}>¿Cuántos días vas a estudiar algo esta semana?</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
        {[2, 3, 4, 5, 6, 7].map((n) => (
          <Pressable key={n} onPress={() => setGoal(n)} accessibilityRole="radio" accessibilityState={{ checked: goal === n }} accessibilityLabel={`${n} días`}
            style={{ minWidth: 48, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 99, borderWidth: 1, borderColor: goal === n ? C.brand : C.line, backgroundColor: goal === n ? C.brand : 'transparent' }}>
            <Text style={{ color: goal === n ? C.onBrand : C.text, fontSize: 15, fontWeight: '700' }}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: C.muted, fontSize: 12.5 }}>Un día cuenta con 10 min de enfoque, 1 tarea o 10 tarjetas. Mejor una meta que cumplas que una que te pese.</Text>
    </>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Planea tu semana" subtitle={`Paso ${step + 1} de 4 · ${STEPS[step]}`}
      footer={<>
        <Button label={step === 0 ? 'Cerrar' : 'Atrás'} kind="secondary" onPress={() => (step === 0 ? onClose() : setStep(step - 1))} style={{ flex: 1 }} />
        {step < 3
          ? <Button label="Siguiente" icon="arrow-forward" onPress={() => setStep(step + 1)} disabled={!tasks} style={{ flex: 2 }} />
          : <Button label="Listo" icon="checkmark" onPress={finish} busy={busy} style={{ flex: 2 }} />}
      </>}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {STEPS.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? C.brand : C.surface2 }} />)}
      </View>
      {body}
    </Sheet>
  );
}

function Group({ title, rows, empty }: { title: string; rows: Task[]; empty: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>{title}</Text>
      {rows.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>{empty}</Text>}
      {rows.slice(0, 8).map((t) => (
        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: C.muted, fontSize: 12.5, width: 52 }}>{dayLabel(t.due_date!)}</Text>
          <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>{t.title}</Text>
          {['examen', 'quiz'].includes(String(t.type)) && <Text style={{ color: C.badText, fontSize: 11.5, fontWeight: '800' }}>{t.type === 'quiz' ? 'QUIZ' : 'EXAMEN'}</Text>}
        </View>
      ))}
      {rows.length > 8 && <Text style={{ color: C.muted, fontSize: 12.5 }}>y {rows.length - 8} más</Text>}
    </View>
  );
}
