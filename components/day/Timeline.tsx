import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { updateTask, type Task, type Slot, type Subject, type FocusSession } from '../../lib/db';
import { SCHEDULE, toMinutes } from '../../lib/schedule';
import { layoutBlocks, minuteAt, taskMinutes, localISO, dayParts, BANDS, DAY_START, DAY_END, type Band } from '../../lib/day';
import { minToLabel } from '../../lib/agenda';
import { ActionMenu } from '../ActionMenu';
import { toast, friendlyError } from '../../lib/feedback';

// ============================================================
//  Línea de tiempo (v21, sección 3): clases, planes con hora, eventos de
//  tu calendario y enfoque hecho, por horas. Los planes se mueven y se
//  estiran arrastrando (o con el menú); lo pendiente sin hora se pone
//  tocando "Poner hora" y luego la hora, o arrastrándolo (computador).
//  Un día en el celular; en el computador también la semana.
// ============================================================

export type ExtEvent = { id: string; title: string; start: string; end: string; color?: string | null; all_day?: boolean };
type Kind = 'class' | 'plan' | 'focus' | 'event';
type Item = { id: string; kind: Kind; start: number; end: number; title: string; color: string; task?: Task; sub?: string };

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function itemsFor(day: Date, tasks: Task[], slots: Slot[], subjects: Subject[], focus: FocusSession[], events: ExtEvent[], ratio: number | null): Item[] {
  const iso = localISO(day);
  const dow = (day.getDay() + 6) % 7;
  const subOf = (id: string | null | undefined) => subjects.find((s) => s.id === id);
  const out: Item[] = [];
  const blocks = SCHEDULE.blocks;
  slots.filter((s) => s.day === dow && blocks[s.slot]).forEach((s) => {
    const sub = subOf(s.subject_id); if (!sub) return;
    out.push({ id: 'c' + s.id, kind: 'class', start: toMinutes(blocks[s.slot].start), end: toMinutes(blocks[s.slot].end), title: sub.name, color: sub.color, sub: 'Clase' });
  });
  for (const t of tasks) {
    if (!t.plan_at || t.status === 'done') continue;
    const d = new Date(t.plan_at);
    if (localISO(d) !== iso) continue;
    const st = d.getHours() * 60 + d.getMinutes();
    out.push({ id: 't' + t.id, kind: 'plan', start: st, end: st + taskMinutes(t.estimate_min, ratio), title: t.title, color: subOf(t.subject_id)?.color ?? C.brand, task: t });
  }
  for (const f of focus) {
    const end = new Date(f.created_at);
    if (localISO(end) !== iso) continue;
    const e = end.getHours() * 60 + end.getMinutes();
    out.push({ id: 'f' + f.id, kind: 'focus', start: Math.max(DAY_START, e - f.minutes), end: e, title: `Enfoque ${f.minutes} min`, color: C.muted });
  }
  for (const ev of events) {
    if (ev.all_day) continue;
    const s = new Date(ev.start), e = new Date(ev.end);
    if (localISO(s) !== iso) continue;
    out.push({ id: 'e' + ev.id, kind: 'event', start: s.getHours() * 60 + s.getMinutes(), end: Math.max(s.getHours() * 60 + s.getMinutes() + 15, e.getHours() * 60 + e.getMinutes()), title: ev.title, color: ev.color || '#8a93a6', sub: 'Calendario' });
  }
  return out.filter((x) => x.end > DAY_START && x.start < DAY_END);
}

export function Timeline({ days, tasks, slots, subjects, focus, events = [], ratio = null, hourPx = 52, placing, onPlaced, onChanged, onFocusTask, onDone }: {
  days: Date[]; tasks: Task[]; slots: Slot[]; subjects: Subject[]; focus: FocusSession[]; events?: ExtEvent[]; ratio?: number | null; hourPx?: number;
  /** Tarea esperando hora: el siguiente toque en una columna la pone ahí. */
  placing?: Task | null;
  onPlaced?: () => void;
  onChanged: () => void;
  onFocusTask: (t: Task) => void;
  onDone: (t: Task) => void;
}) {
  const [now, setNow] = useState(new Date());
  const [menu, setMenu] = useState<Task | null>(null);
  const [colW, setColW] = useState(0);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  const height = ((DAY_END - DAY_START) / 60) * hourPx;
  const todayISO = localISO(now);
  const scroller = useRef<any>(null);

  async function setPlan(t: Task, day: Date, minute: number) {
    const d = new Date(day); d.setHours(0, minute, 0, 0);
    try { await updateTask(t.id, { plan_at: d.toISOString(), plan_day: null, plan_band: null }); onChanged(); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  }
  async function setBand(t: Task, day: Date, band: Band) {
    try { await updateTask(t.id, { plan_at: null, plan_day: localISO(day), plan_band: band }); onChanged(); toast(`${t.title}: ${BANDS[band].label.toLowerCase()}`); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  }

  const hours = useMemo(() => Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60), []);
  const wide = days.length > 1;

  return (
    <View>
      {/* Franjas: mañana, tarde y noche (sin hora exacta) */}
      <View style={{ flexDirection: 'row', marginLeft: 50, gap: 6, marginBottom: 8 }}>
        {days.map((day) => {
          const parts = dayParts(tasks, localISO(day), todayISO);
          return (
            <View key={day.toISOString()} style={{ flex: 1, gap: 4 }}>
              {wide && <Text style={{ color: localISO(day) === todayISO ? C.brand : C.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>{DAY_SHORT[day.getDay()]} {day.getDate()}</Text>}
              {(Object.keys(BANDS) as Band[]).map((b) => {
                const list = parts.banded[b];
                const target = !!placing;
                if (!list.length && !target && wide) return null;
                return (
                  <Pressable key={b} disabled={!target} onPress={() => { if (placing) { setBand(placing, day, b); onPlaced?.(); } }}
                    accessibilityRole={target ? 'button' : undefined} accessibilityLabel={target ? `Poner en la ${BANDS[b].label.toLowerCase()}` : undefined}
                    style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, minHeight: 28, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderStyle: target ? 'dashed' : 'solid', borderColor: target ? C.brand : C.line, backgroundColor: target ? C.brand + '10' : 'transparent' }}>
                    <Text style={{ color: C.muted, fontSize: 11, fontWeight: '800' }}>{BANDS[b].label}</Text>
                    {list.map((t) => (
                      <Pressable key={t.id} onPress={() => setMenu(t)} accessibilityRole="button" style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: C.surface2 }}>
                        <Text style={{ color: C.text, fontSize: 11.5 }} numberOfLines={1}>{t.title}</Text>
                      </Pressable>
                    ))}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>

      <View ref={scroller} style={{ flexDirection: 'row' }}>
        <View style={{ width: 50, height }}>
          {hours.map((m) => (
            <Text key={m} style={{ position: 'absolute', top: ((m - DAY_START) / 60) * hourPx - 7, right: 8, color: C.muted, fontSize: 11, fontVariant: ['tabular-nums'] }}>
              {minToLabel(m).replace(':00', '')}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }} onLayout={(e) => setColW(e.nativeEvent.layout.width / days.length)}>
          {days.map((day, di) => (
            <DayColumn key={day.toISOString()} day={day} dayIndex={di} days={days} height={height} hourPx={hourPx} hours={hours} colW={colW}
              items={itemsFor(day, tasks, slots, subjects, focus, events, ratio)} isToday={localISO(day) === todayISO} now={now}
              placing={placing ?? null} tasks={tasks}
              onPlace={(m) => { if (placing) { setPlan(placing, day, m); onPlaced?.(); } }}
              onDropTask={(t, m) => setPlan(t, day, m)}
              onMove={(t, dayShift, m) => setPlan(t, days[Math.max(0, Math.min(days.length - 1, di + dayShift))], m)}
              onResize={async (t, minutes) => { try { await updateTask(t.id, { estimate_min: minutes }); onChanged(); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } }}
              onTapTask={setMenu} />
          ))}
        </View>
      </View>

      <ActionMenu visible={!!menu} title={menu?.title ?? ''} onClose={() => setMenu(null)} actions={menu ? [
        { label: 'Empezar enfoque', icon: 'timer-outline', onPress: () => onFocusTask(menu) },
        { label: 'Marcar hecha', icon: 'checkmark-circle-outline', onPress: () => onDone(menu) },
        { label: 'Mover a mañana', icon: 'arrow-forward-outline', onPress: async () => {
          try {
            if (menu.plan_at) { const d = new Date(menu.plan_at); d.setDate(d.getDate() + 1); await updateTask(menu.id, { plan_at: d.toISOString() }); }
            else { const d = new Date(); d.setDate(d.getDate() + 1); await updateTask(menu.id, { plan_day: localISO(d) }); }
            onChanged(); toast('Movida a mañana');
          } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
        } },
        { label: 'Quitar la hora', icon: 'close-circle-outline', onPress: async () => { try { await updateTask(menu.id, { plan_at: null, plan_day: null, plan_band: null }); onChanged(); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } } },
      ] : []} />
    </View>
  );
}

function DayColumn({ day, dayIndex, days, height, hourPx, hours, colW, items, isToday, now, placing, tasks, onPlace, onDropTask, onMove, onResize, onTapTask }: {
  day: Date; dayIndex: number; days: Date[]; height: number; hourPx: number; hours: number[]; colW: number; items: Item[]; isToday: boolean; now: Date;
  placing: Task | null; tasks: Task[];
  onPlace: (minute: number) => void; onDropTask: (t: Task, minute: number) => void;
  onMove: (t: Task, dayShift: number, minute: number) => void; onResize: (t: Task, minutes: number) => void; onTapTask: (t: Task) => void;
}) {
  const ref = useRef<any>(null);
  // Soltar aquí una tarea arrastrada desde la lista (computador).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el: HTMLElement | null = ref.current;
    if (!el || !el.addEventListener) return;
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('text/kd-task')) { e.preventDefault(); el.style.backgroundColor = C.brand + '0d'; } };
    const leave = () => { el.style.backgroundColor = ''; };
    const drop = (e: DragEvent) => {
      el.style.backgroundColor = '';
      const id = e.dataTransfer?.getData('text/kd-task');
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      onDropTask(t, minuteAt(e.clientY - r.top, hourPx));
    };
    el.addEventListener('dragover', over); el.addEventListener('dragleave', leave); el.addEventListener('drop', drop);
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('dragleave', leave); el.removeEventListener('drop', drop); };
  }, [tasks, hourPx, onDropTask]);

  const placed = layoutBlocks(items);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    <Pressable ref={ref} disabled={!placing} onPress={(e: any) => {
        const ne = e.nativeEvent ?? {};
        const r = Platform.OS === 'web' && ref.current?.getBoundingClientRect ? ref.current.getBoundingClientRect() : null;
        const y = r && typeof ne.clientY === 'number' ? ne.clientY - r.top : ne.locationY ?? 0;
        onPlace(minuteAt(y, hourPx));
      }}
      accessibilityLabel={placing ? `Toca la hora para "${placing.title}"` : `${DAY_SHORT[day.getDay()]} ${day.getDate()}`}
      style={{ flex: 1, height, borderRadius: 10, borderWidth: 1, borderColor: placing ? C.brand : C.line, borderStyle: placing ? 'dashed' : 'solid', backgroundColor: C.surface, overflow: 'hidden' }}>
      {hours.map((m) => <View key={m} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: ((m - DAY_START) / 60) * hourPx, height: 1, backgroundColor: C.line + '88' }} />)}
      {placed.map((b) => (
        <BlockView key={b.id} b={b} hourPx={hourPx} colW={colW} days={days} dayIndex={dayIndex} past={isToday && b.end <= nowMin} live={isToday && b.start <= nowMin && b.end > nowMin}
          onMove={onMove} onResize={onResize} onTap={onTapTask} disabled={!!placing} />
      ))}
      {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: ((nowMin - DAY_START) / 60) * hourPx, height: 2, backgroundColor: C.bad }}>
          <View style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: C.bad }} />
        </View>
      )}
    </Pressable>
  );
}

function BlockView({ b, hourPx, colW, days, dayIndex, past, live, onMove, onResize, onTap, disabled }: {
  b: Item & { lane: number; lanes: number }; hourPx: number; colW: number; days: Date[]; dayIndex: number; past: boolean; live: boolean; disabled: boolean;
  onMove: (t: Task, dayShift: number, minute: number) => void; onResize: (t: Task, minutes: number) => void; onTap: (t: Task) => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [grow, setGrow] = useState(0);
  // Al soltar un arrastre no se abre el menú del bloque.
  const dragEnd = useRef(0);
  const movable = b.kind === 'plan' && !!b.task && !disabled;
  const snap = (dy: number) => Math.round(((dy / hourPx) * 60) / 15) * 15;
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => movable && (Math.abs(g.dy) > 6 || Math.abs(g.dx) > 10),
    onPanResponderMove: (_, g) => setDrag({ dx: g.dx, dy: g.dy }),
    onPanResponderRelease: (_, g) => {
      setDrag(null); dragEnd.current = Date.now();
      const shift = colW > 0 && days.length > 1 ? Math.round(g.dx / colW) : 0;
      const m = Math.max(DAY_START, Math.min(DAY_END - 15, b.start + snap(g.dy)));
      if (b.task && (m !== b.start || shift)) onMove(b.task, shift, m);
    },
    onPanResponderTerminate: () => setDrag(null),
  }), [movable, b.start, colW, days.length, hourPx]);
  const resize = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => movable,
    onMoveShouldSetPanResponder: () => movable,
    onPanResponderMove: (_, g) => setGrow(g.dy),
    onPanResponderRelease: (_, g) => { setGrow(0); dragEnd.current = Date.now(); const mins = Math.max(15, b.end - b.start + snap(g.dy)); if (b.task && mins !== b.end - b.start) onResize(b.task, mins); },
    onPanResponderTerminate: () => setGrow(0),
  }), [movable, b.start, b.end, hourPx]);

  const top = ((Math.max(b.start, DAY_START) - DAY_START) / 60) * hourPx + (drag?.dy ?? 0);
  const h = Math.max(18, ((b.end - Math.max(b.start, DAY_START)) / 60) * hourPx + grow);
  const w = 100 / b.lanes;
  const bg = b.kind === 'class' ? b.color + '2a' : b.kind === 'focus' ? C.surface2 : b.kind === 'event' ? b.color + '22' : b.color + '44';
  const label = `${b.sub ? b.sub + ': ' : ''}${b.title}, ${minToLabel(b.start)} a ${minToLabel(b.end)}`;
  return (
    <View {...(movable ? pan.panHandlers : {})}
      style={{ position: 'absolute', top, height: h, left: `${b.lane * w}%`, width: `${w}%`, padding: 1.5, zIndex: drag ? 10 : 1,
        transform: drag ? [{ translateX: drag.dx }] : undefined, opacity: past && b.kind !== 'focus' ? 0.6 : 1 }}>
      <Pressable onPress={() => { if (Date.now() - dragEnd.current < 500) return; if (b.task && !disabled) onTap(b.task); }} disabled={!b.task || disabled} accessibilityRole={b.task ? 'button' : undefined} accessibilityLabel={label}
        style={{ flex: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: bg, borderLeftWidth: 3, borderLeftColor: b.kind === 'focus' ? C.line : b.color,
          borderWidth: live ? 1.5 : 0, borderColor: live ? C.brand : 'transparent', overflow: 'hidden', ...(movable && Platform.OS === 'web' ? { cursor: drag ? 'grabbing' : 'grab' } as any : null) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {b.kind === 'event' && <Ionicons name="calendar-outline" size={10} color={C.muted} />}
          {b.kind === 'focus' && <Ionicons name="timer-outline" size={10} color={C.muted} />}
          <Text style={{ color: b.kind === 'focus' ? C.muted : C.text, fontSize: 11.5, fontWeight: b.kind === 'plan' ? '700' : '600', flex: 1 }} numberOfLines={h > 34 ? 2 : 1}>{b.title}</Text>
        </View>
        {h > 34 && <Text style={{ color: C.muted, fontSize: 10.5 }} numberOfLines={1}>{minToLabel(b.start + (drag ? snap(drag.dy) : 0))}{b.sub ? ` · ${b.sub}` : ''}</Text>}
      </Pressable>
      {movable && (
        <View {...resize.panHandlers} accessibilityLabel="Estirar para cambiar la duración"
          style={{ position: 'absolute', left: 8, right: 8, bottom: 0, height: 8, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'ns-resize' } as any : null) }}>
          <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: C.muted + '99' }} />
        </View>
      )}
    </View>
  );
}

/** Hace que un elemento de la lista se pueda arrastrar a la línea de tiempo (solo web). */
export function useDraggableTask(taskId: string) {
  const ref = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el: HTMLElement | null = ref.current;
    if (!el || !el.setAttribute) return;
    el.setAttribute('draggable', 'true');
    const start = (e: DragEvent) => { e.dataTransfer?.setData('text/kd-task', taskId); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; };
    el.addEventListener('dragstart', start);
    return () => el.removeEventListener('dragstart', start);
  }, [taskId]);
  return ref;
}
