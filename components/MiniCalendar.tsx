import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';
import { taskTypeMeta } from '../lib/taskTypes';
import { Subject, Task } from '../lib/db';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Mini-calendario de un mes con puntos por día (exámenes en rojo). Widget compacto.
export function MiniCalendar({ tasks, subjects, defaultOpen = false, embedded = false, onTaskPress, open: openProp, onOpenChange }: {
  tasks: Task[]; subjects: Subject[]; defaultOpen?: boolean; embedded?: boolean;
  onTaskPress?: (t: Task) => void;
  // Modo controlado: úsalo cuando otro botón (p. ej. el del encabezado) también
  // deba abrir o cerrar el calendario.
  open?: boolean; onOpenChange?: (v: boolean) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [openState, setOpenState] = useState(embedded ? true : defaultOpen);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => { if (onOpenChange) onOpenChange(v); else setOpenState(v); };
  const today = new Date();
  const [selected, setSelected] = useState<string | null>(null);

  const base = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWd = (new Date(year, month, 1).getDay() + 6) % 7;
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

  const byDate: Record<string, Task[]> = {};
  tasks.forEach((t) => { if (t.due_date) (byDate[t.due_date] ??= []).push(t); });
  const subColor = (sid: string | null) => subjects.find((s) => s.id === sid)?.color ?? C.brand;

  // Un punto por MATERIA (no por tarea) y el tamaño crece con la cantidad de
  // tareas de esa materia ese día. Si hay examen, el punto lleva un anillo rojo.
  type Dot = { key: string; color: string; count: number; exam: boolean; name: string };
  const dotsOf = (list: Task[]): Dot[] => {
    const map = new Map<string, Dot>();
    list.forEach((t) => {
      const key = t.subject_id ?? '_none';
      const sub = subjects.find((s) => s.id === t.subject_id);
      const d = map.get(key) ?? { key, color: sub?.color ?? C.muted, count: 0, exam: false, name: sub?.name ?? 'Sin materia' };
      d.count += 1;
      if (t.type === 'examen') d.exam = true;
      map.set(key, d);
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  };
  // 1 tarea = 6px … 4 o más = 12px
  const dotSize = (n: number) => (n <= 1 ? 6 : n === 2 ? 8 : n === 3 ? 10 : 12);
  const CELL_H = 40;

  const cells: (number | null)[] = [...Array(firstWd).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const selTasks = selected ? (byDate[selected] ?? []) : [];

  const totalTasks = tasks.filter((t) => t.due_date).length;

  const showGrid = embedded || open;

  return (
    <View style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: embedded ? 0 : 12 }}>
      {embedded ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="calendar-outline" size={16} color={C.muted} />
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', flex: 1 }}>Calendario</Text>
        </View>
      ) : (
        <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="calendar-outline" size={16} color={C.muted} />
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', flex: 1 }}>Calendario{!open && totalTasks > 0 ? ` · ${totalTasks} con fecha` : ''}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
        </Pressable>
      )}

      {showGrid && (<>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 }}>
        <Pressable onPress={() => setOffset(offset - 1)} hitSlop={10}><Ionicons name="chevron-back" size={18} color={C.muted} /></Pressable>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }}>{MONTHS[month]} {year}</Text>
        <Pressable onPress={() => setOffset(offset + 1)} hitSlop={10}><Ionicons name="chevron-forward" size={18} color={C.muted} /></Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WD.map((d, i) => (<Text key={i} style={{ flex: 1, textAlign: 'center', color: C.muted, fontSize: 10.5, paddingBottom: 4 }}>{d}</Text>))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (d === null) return <View key={`b${i}`} style={{ width: `${100 / 7}%`, height: CELL_H }} />;
          const dIso = iso(year, month, d);
          const list = byDate[dIso] ?? [];
          const isToday = dIso === todayIso;
          const isSel = dIso === selected;
          const dots = dotsOf(list);
          const shown = dots.slice(0, 4);
          const extra = dots.length - shown.length;
          const pend = list.filter((t) => t.status !== 'done').length;
          return (
            <Pressable
              key={dIso}
              onPress={() => setSelected(isSel ? null : dIso)}
              accessibilityLabel={`${d} — ${list.length} ${list.length === 1 ? 'tarea' : 'tareas'}${pend ? `, ${pend} pendiente${pend === 1 ? '' : 's'}` : ''}`}
              style={{ width: `${100 / 7}%`, height: CELL_H, alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? C.brand : isToday ? C.surface2 : 'transparent' }}>
                <Text style={{ color: isSel ? C.bg : C.text, fontSize: 12.5, fontWeight: isToday || isSel ? '700' : '400' }}>{d}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 3, marginTop: 3, height: 13, alignItems: 'center', justifyContent: 'center' }}>
                {shown.map((dot) => {
                  const size = dotSize(dot.count);
                  return (
                    <View
                      key={dot.key}
                      style={{
                        width: size, height: size, borderRadius: size / 2,
                        backgroundColor: isSel ? C.bg : dot.color,
                        borderWidth: dot.exam ? 1.5 : 0,
                        borderColor: isSel ? C.bg : C.bad,
                      }}
                    />
                  );
                })}
                {extra > 0 && (
                  <Text style={{ color: isSel ? C.bg : C.muted, fontSize: 9, fontWeight: '700' }}>+{extra}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selected && (
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}>
          <Text style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>{new Date(selected + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          {selTasks.length === 0 ? <Text style={{ color: C.muted, fontSize: 12.5 }}>Sin tareas.</Text> : selTasks.map((t) => {
            const sub = subjects.find((s) => s.id === t.subject_id);
            return (
            <Pressable
              key={t.id}
              onPress={onTaskPress ? () => onTaskPress(t) : undefined}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sub?.color ?? C.muted, borderWidth: t.type === 'examen' ? 1.5 : 0, borderColor: C.bad }} />
              <Text style={{ fontSize: 12 }}>{taskTypeMeta(t.type).icon}</Text>
              <Text style={{ color: t.status === 'done' ? C.muted : C.text, fontSize: 13, flex: 1, textDecorationLine: t.status === 'done' ? 'line-through' : 'none' }} numberOfLines={1}>{t.title}</Text>
              {sub && <Text style={{ color: C.muted, fontSize: 11 }} numberOfLines={1}>{sub.name}</Text>}
              {onTaskPress && <Ionicons name="chevron-forward" size={14} color={C.muted} />}
            </Pressable>
          ); })}
        </View>
      )}
      </>)}
    </View>
  );
}
