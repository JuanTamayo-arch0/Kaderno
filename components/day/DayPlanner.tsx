import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { Card, Button } from '../ds';
import { supabase } from '../../lib/supabase';
import { updateTask, type Task, type Slot, type Subject, type FocusSession } from '../../lib/db';
import { getEstimateRatio } from '../../lib/studyDb';
import { SCHEDULE, toMinutes } from '../../lib/schedule';
import { dayParts, plannedMinutes, freeMinutes, overloadText, moveCandidates, localISO, taskMinutes, fmtHours } from '../../lib/day';
import { Timeline, useDraggableTask, type ExtEvent } from './Timeline';
import { toast, friendlyError } from '../../lib/feedback';

// ============================================================
//  "Mi día" en Hoy (v21, sección 3): la línea de tiempo con lo pendiente
//  sin hora al lado, el aviso de sobrecarga y, en computador, la semana.
// ============================================================

export type EventsLoader = (from: Date, to: Date) => Promise<ExtEvent[]>;

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function DayPlanner({ tasks, slots, subjects, onChanged, onToggle, onFocusTask, loadEvents }: {
  tasks: Task[]; slots: Slot[]; subjects: Subject[]; onChanged: () => void; onToggle: (t: Task) => void; onFocusTask: (t: Task) => void; loadEvents?: EventsLoader;
}) {
  const { isWide, width } = useResponsive();
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [day, setDay] = useState(startOfDay(new Date()));
  const [focus, setFocus] = useState<FocusSession[]>([]);
  const [events, setEvents] = useState<ExtEvent[]>([]);
  const [ratio, setRatio] = useState<number | null>(null);
  const [placing, setPlacing] = useState<Task | null>(null);
  const week = mode === 'week' && isWide && width >= 900;
  const days = useMemo(() => {
    if (!week) return [day];
    const mon = addDays(day, -((day.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }, [day, week]);
  const from = days[0], to = addDays(days[days.length - 1], 1);

  const loadSide = useCallback(() => {
    supabase.from('focus_sessions').select('id, subject_id, minutes, created_at').gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
      .then(({ data }) => setFocus((data as FocusSession[]) ?? []));
    loadEvents?.(from, to).then(setEvents).catch(() => setEvents([]));
  }, [from.getTime(), to.getTime(), loadEvents]);
  useEffect(() => { loadSide(); }, [loadSide]);
  useEffect(() => { getEstimateRatio().then(setRatio).catch(() => {}); }, []);

  const todayISO = localISO(new Date());
  const dayISO = localISO(day);
  const parts = dayParts(tasks, dayISO, todayISO);
  const isToday = dayISO === todayISO;

  // Sobrecarga (solo hoy): lo planeado contra las horas libres que quedan.
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const busy = [
    ...slots.filter((s) => s.day === dow && SCHEDULE.blocks[s.slot]).map((s) => ({ start: toMinutes(SCHEDULE.blocks[s.slot].start), end: toMinutes(SCHEDULE.blocks[s.slot].end) })),
    ...events.filter((e) => !e.all_day && localISO(new Date(e.start)) === todayISO).map((e) => { const s = new Date(e.start), en = new Date(e.end); return { start: s.getHours() * 60 + s.getMinutes(), end: en.getHours() * 60 + en.getMinutes() }; }),
  ];
  const planned = plannedMinutes(tasks, todayISO, todayISO, ratio);
  const free = freeMinutes(now.getHours() * 60 + now.getMinutes(), busy);
  const over = isToday ? overloadText(planned, free) : null;
  const cand = over ? moveCandidates(tasks, todayISO, todayISO)[0] : undefined;

  async function moveToTomorrow(t: Task) {
    try {
      const patch = t.plan_at ? { plan_at: addDays(new Date(t.plan_at), 1).toISOString() } : { plan_day: localISO(addDays(new Date(), 1)) };
      await updateTask(t.id, patch); toast(`"${t.title}" pasa a mañana`); onChanged();
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  }

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
      <Pressable onPress={() => setDay(addDays(day, week ? -7 : -1))} accessibilityLabel={week ? 'Semana anterior' : 'Día anterior'} style={navBtn}><Ionicons name="chevron-back" size={18} color={C.text} /></Pressable>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', minWidth: 110, textAlign: 'center' }}>
        {week ? `Semana del ${days[0].getDate()}` : isToday ? 'Hoy' : `${DAY_SHORT[day.getDay()]} ${day.getDate()}`}
      </Text>
      <Pressable onPress={() => setDay(addDays(day, week ? 7 : 1))} accessibilityLabel={week ? 'Semana siguiente' : 'Día siguiente'} style={navBtn}><Ionicons name="chevron-forward" size={18} color={C.text} /></Pressable>
      {!isToday && <Button label="Hoy" size="sm" kind="ghost" onPress={() => setDay(startOfDay(new Date()))} />}
      <View style={{ flex: 1 }} />
      {isWide && width >= 900 && (
        <View style={{ flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line }} accessibilityRole="radiogroup">
          {(['day', 'week'] as const).map((k) => (
            <Pressable key={k} onPress={() => setMode(k)} accessibilityRole="radio" accessibilityState={{ checked: mode === k }}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: mode === k ? C.surface : 'transparent' }}>
              <Text style={{ color: mode === k ? C.text : C.muted, fontSize: 12.5, fontWeight: '700' }}>{k === 'day' ? 'Día' : 'Semana'}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const loose = (
    <View style={{ gap: 8 }}>
      <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '800' }}>Sin hora {isToday ? 'hoy' : ''} · {parts.loose.length}</Text>
      {parts.loose.length === 0 && <Text style={{ color: C.muted, fontSize: 12.5 }}>Nada pendiente sin hora.</Text>}
      {parts.loose.map((t) => <LooseRow key={t.id} t={t} ratio={ratio} active={placing?.id === t.id} onPlace={() => setPlacing(placing?.id === t.id ? null : t)} onToggle={() => onToggle(t)} />)}
      {parts.loose.length > 0 && <Text style={{ color: C.muted, fontSize: 11.5 }}>{isWide ? 'Arrástrala a una hora, o toca "Poner hora" y luego la hora.' : 'Toca "Poner hora" y luego la hora en la línea.'}</Text>}
    </View>
  );

  return (
    <View>
      {header}
      {over && (
        <Card style={{ marginBottom: 10, borderLeftWidth: 4, borderLeftColor: C.warn, gap: 6 }}>
          <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>{over}</Text>
          {cand && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ color: C.muted, fontSize: 12.5, flex: 1 }}>Lo que puede esperar: "{cand.title}"{cand.due_date ? `, vence el ${cand.due_date.slice(8, 10)}/${cand.due_date.slice(5, 7)}` : ''}.</Text>
              <Button label="Pasarla a mañana" size="sm" kind="secondary" onPress={() => moveToTomorrow(cand)} />
            </View>
          )}
        </Card>
      )}
      {placing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: C.brand + '18', marginBottom: 10 }} accessibilityLiveRegion="polite">
          <Ionicons name="hand-left-outline" size={16} color={C.brand} />
          <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>Toca la hora (o una franja) para "{placing.title}".</Text>
          <Button label="Cancelar" size="sm" kind="ghost" onPress={() => setPlacing(null)} />
        </View>
      )}
      {isWide ? (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Timeline days={days} tasks={tasks} slots={slots} subjects={subjects} focus={focus} events={events} ratio={ratio} hourPx={week ? 44 : 52}
              placing={placing} onPlaced={() => setPlacing(null)} onChanged={onChanged} onFocusTask={onFocusTask} onDone={onToggle} />
          </View>
          {!week && <View style={{ width: 260 }}>{loose}</View>}
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {loose}
          <Timeline days={days} tasks={tasks} slots={slots} subjects={subjects} focus={focus} events={events} ratio={ratio} hourPx={46}
            placing={placing} onPlaced={() => setPlacing(null)} onChanged={onChanged} onFocusTask={onFocusTask} onDone={onToggle} />
        </View>
      )}
      {week && <View style={{ marginTop: 14 }}>{loose}</View>}
      {isToday && <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 8 }}>Planeado hoy: {fmtHours(planned)} · libre: {fmtHours(free)}</Text>}
    </View>
  );
}

function LooseRow({ t, ratio, active, onPlace, onToggle }: { t: Task; ratio: number | null; active: boolean; onPlace: () => void; onToggle: () => void }) {
  const ref = useDraggableTask(t.id);
  return (
    <View ref={ref} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: active ? C.brand : C.line, backgroundColor: C.surface }}>
      <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`Completar "${t.title}"`} hitSlop={6}>
        <Ionicons name="ellipse-outline" size={20} color={C.muted} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={2}>{t.title}</Text>
        <Text style={{ color: C.muted, fontSize: 11.5 }}>{fmtHours(taskMinutes(t.estimate_min, ratio))}</Text>
      </View>
      <Pressable onPress={onPlace} accessibilityRole="button" accessibilityLabel={`Poner hora a "${t.title}"`}
        style={{ paddingHorizontal: 10, minHeight: 30, justifyContent: 'center', borderRadius: 8, backgroundColor: active ? C.brand : C.surface2 }}>
        <Text style={{ color: active ? C.onBrand : C.text, fontSize: 12, fontWeight: '700' }}>{active ? 'Elige…' : 'Poner hora'}</Text>
      </Pressable>
    </View>
  );
}

const navBtn = { width: 34, height: 34, borderRadius: 9, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: C.line };
