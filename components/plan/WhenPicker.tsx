import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { getSchedule, getTasks, type Slot } from '../../lib/db';
import { SCHEDULE, toMinutes } from '../../lib/schedule';
import { getHabitHours, getPlaces, addPlace } from '../../lib/studyDb';
import { freeSlots, slotLabel, planPhrase, PLAN_MIN, DEFAULT_PLACES, type Range } from '../../lib/planSlots';
import { combine, isoDate, fromISODate } from '../../lib/time';
import { DateField, TimeField } from '../DateTime';
import { toast, friendlyError } from '../../lib/feedback';

// ============================================================
//  "¿Cuándo lo haces?" (v20, sección E): tres horarios libres sugeridos,
//  "Otro" y el lugar. Se muestra como una frase de intención.
// ============================================================

export type PlanValue = { at: string | null; place: string | null };

/** Clases de un día como rangos de minutos (para no sugerir encima). */
export function classRanges(slots: Slot[]): (day: Date) => Range[] {
  const blocks = SCHEDULE.blocks;
  return (day: Date) => {
    const dow = (day.getDay() + 6) % 7;
    return slots.filter((s) => s.day === dow && blocks[s.slot])
      .map((s) => ({ start: toMinutes(blocks[s.slot].start), end: toMinutes(blocks[s.slot].end) }));
  };
}

/** Horarios sugeridos para una tarea (carga clases, otros planes y costumbre). */
export async function suggestSlots(o: { due: Date | null; dueHasTime: boolean; excludeId?: string | null; count?: number }): Promise<Date[]> {
  const [slots, tasks, habit] = await Promise.all([
    getSchedule().catch(() => [] as Slot[]), getTasks().catch(() => []), getHabitHours().catch(() => [] as number[]),
  ]);
  const busy = tasks.filter((t) => t.plan_at && t.id !== o.excludeId && t.status !== 'done')
    .map((t) => { const s = new Date(t.plan_at!).getTime(); return { start: s, end: s + PLAN_MIN * 60_000 }; });
  return freeSlots({ now: new Date(), due: o.due, dueHasTime: o.dueHasTime, classesFor: classRanges(slots), busy, habit, count: o.count ?? 3 });
}

export function WhenPicker({ title, dueDate, dueTime, value, onChange, excludeId }: {
  title: string; dueDate: string | null; dueTime: string | null; value: PlanValue; onChange: (v: PlanValue) => void; excludeId?: string | null;
}) {
  const [sugg, setSugg] = useState<Date[]>([]);
  const [places, setPlaces] = useState<string[]>(DEFAULT_PLACES);
  const [other, setOther] = useState(false);
  const [oDate, setODate] = useState<string | null>(null);
  const [oTime, setOTime] = useState<string | null>(null);
  const [newPlace, setNewPlace] = useState<string | null>(null);
  const now = new Date();

  useEffect(() => {
    const due = dueDate ? (dueTime ? new Date(combine(dueDate, dueTime)) : fromISODate(dueDate)) : null;
    suggestSlots({ due, dueHasTime: !!dueTime, excludeId }).then(setSugg).catch(() => setSugg([]));
  }, [dueDate, dueTime, excludeId]);
  useEffect(() => { getPlaces().then(setPlaces).catch(() => {}); }, []);

  const at = value.at ? new Date(value.at) : null;
  const inSugg = !!at && sugg.some((d) => d.getTime() === at.getTime());
  const chips = useMemo(() => {
    const list = sugg.map((d) => ({ key: d.toISOString(), at: d }));
    if (at && !inSugg) list.unshift({ key: at.toISOString(), at });
    return list;
  }, [sugg, value.at]);

  const pick = (d: Date) => { setOther(false); onChange({ ...value, at: value.at && new Date(value.at).getTime() === d.getTime() ? null : d.toISOString() }); };
  const applyOther = (d: string | null, t: string | null) => {
    setODate(d); setOTime(t);
    if (d && t) onChange({ ...value, at: combine(d, t) });
  };
  async function savePlace() {
    const p = (newPlace ?? '').trim();
    setNewPlace(null);
    if (!p) return;
    onChange({ ...value, place: p.slice(0, 40) });
    try { setPlaces(await addPlace(p)); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  }

  const chip = (key: string, label: string, on: boolean, onPress: () => void, icon?: any) => (
    <Pressable key={key} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, paddingHorizontal: 11, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
      {icon && <Ionicons name={icon} size={13} color={on ? C.onBrand : C.muted} />}
      <Text style={{ color: on ? C.onBrand : C.text, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 + '66' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Ionicons name="time-outline" size={15} color={C.brand} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>¿Cuándo lo haces?</Text>
        {!!value.at && (
          <Pressable onPress={() => { setOther(false); onChange({ at: null, place: null }); }} accessibilityRole="button" hitSlop={8}>
            <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>Quitar</Text>
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }} accessibilityRole="radiogroup" accessibilityLabel="Horario para empezar">
        {chips.map((c) => chip(c.key, slotLabel(c.at, now), !!at && at.getTime() === c.at.getTime(), () => pick(c.at)))}
        {chip('otro', 'Otro', other, () => { setOther(!other); if (!other) { setODate(at ? isoDate(at) : isoDate(now)); setOTime(null); } }, 'calendar-outline')}
      </View>
      {sugg.length === 0 && !other && (
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>No encontré huecos libres antes de la entrega. Elige "Otro".</Text>
      )}
      {other && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <DateField label="Día" value={oDate} onChange={(v) => applyOther(v, oTime)} allowClear={false} />
          <TimeField label="Hora" value={oTime} onChange={(v) => applyOther(oDate, v)} />
        </View>
      )}
      {!!value.at && (
        <>
          <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginTop: 12, marginBottom: 6 }}>Dónde</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }} accessibilityRole="radiogroup" accessibilityLabel="Lugar">
            {places.map((p) => chip('p' + p, p, (value.place ?? '').toLowerCase() === p.toLowerCase(), () => onChange({ ...value, place: (value.place ?? '').toLowerCase() === p.toLowerCase() ? null : p })))}
            {value.place && !places.some((p) => p.toLowerCase() === value.place!.toLowerCase()) && chip('pv', value.place, true, () => onChange({ ...value, place: null }))}
            {newPlace === null
              ? chip('padd', 'Otro lugar', false, () => setNewPlace(''), 'add')
              : (
                <TextInput value={newPlace} onChangeText={setNewPlace} autoFocus placeholder="Ej: Café" placeholderTextColor={C.muted} maxLength={40}
                  onSubmitEditing={savePlace} onBlur={savePlace} accessibilityLabel="Nuevo lugar"
                  style={{ minWidth: 120, minHeight: 34, borderRadius: 99, borderWidth: 1, borderColor: C.brand, color: C.text, paddingHorizontal: 12, fontSize: 12.5 }} />
              )}
          </View>
          <Text style={{ color: C.text, fontSize: 13.5, marginTop: 12, fontStyle: 'italic' }} accessibilityLiveRegion="polite">
            {planPhrase(title, new Date(value.at), value.place, now)}
          </Text>
        </>
      )}
    </View>
  );
}
