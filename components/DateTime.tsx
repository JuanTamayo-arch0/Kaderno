import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, uiScheme } from '../lib/theme';
import { fromISODate, isoDate, fmtLongDate, fmtHHMM, capitalize, addDays, startOfDay } from '../lib/time';

// Campos de fecha y hora: en web usan los controles nativos del navegador
// (<input type="date|time">); en el celular, el selector del sistema.

const webInput = (extra: Record<string, any> = {}) => ({
  backgroundColor: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10, color: C.text,
  padding: '10px 12px', fontSize: 15, colorScheme: uiScheme(), width: '100%', boxSizing: 'border-box',
  minHeight: 44, fontFamily: 'inherit', ...extra,
});

export function DateField({ value, onChange, allowClear = true, label }: {
  value: string | null; onChange: (v: string | null) => void; allowClear?: boolean; label?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ flex: 1, minWidth: 140 }}>
      {!!label && <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>{label}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flex: 1 }}>
          {Platform.OS === 'web' ? (
            React.createElement('input', {
              type: 'date', value: value ?? '', 'aria-label': label ?? 'Fecha',
              onChange: (e: any) => onChange(e.target.value || null),
              style: webInput(),
            })
          ) : (
            <Pressable onPress={() => setShow(true)} accessibilityRole="button" accessibilityLabel={label ?? 'Fecha'}
              style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: value ? C.text : C.muted }}>{value ? capitalize(fmtLongDate(fromISODate(value))) : 'Sin fecha'}</Text>
            </Pressable>
          )}
        </View>
        {allowClear && value && (
          <Pressable onPress={() => onChange(null)} accessibilityLabel="Quitar fecha" hitSlop={8} style={{ padding: 8 }}>
            <Ionicons name="close-circle" size={20} color={C.muted} />
          </Pressable>
        )}
      </View>
      {show && Platform.OS !== 'web' && (
        <DateTimePicker value={value ? fromISODate(value) : new Date()} mode="date"
          onChange={(_, d) => { setShow(false); if (d) onChange(isoDate(d)); }} />
      )}
    </View>
  );
}

export function TimeField({ value, onChange, label, disabled }: {
  value: string | null; onChange: (v: string | null) => void; label?: string; disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ flex: 1, minWidth: 120, opacity: disabled ? 0.5 : 1 }}>
      {!!label && <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>{label}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flex: 1 }}>
          {Platform.OS === 'web' ? (
            React.createElement('input', {
              type: 'time', value: value ?? '', disabled, 'aria-label': label ?? 'Hora',
              onChange: (e: any) => onChange(e.target.value || null),
              style: webInput(),
            })
          ) : (
            <Pressable onPress={() => !disabled && setShow(true)} accessibilityRole="button" accessibilityLabel={label ?? 'Hora'}
              style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: value ? C.text : C.muted }}>{value ? fmtHHMM(value) : 'Sin hora'}</Text>
            </Pressable>
          )}
        </View>
        {value && !disabled && (
          <Pressable onPress={() => onChange(null)} accessibilityLabel="Quitar hora" hitSlop={8} style={{ padding: 8 }}>
            <Ionicons name="close-circle" size={20} color={C.muted} />
          </Pressable>
        )}
      </View>
      {show && Platform.OS !== 'web' && (
        <DateTimePicker value={(() => { const d = new Date(); if (value) { const [h, m] = value.split(':').map(Number); d.setHours(h, m); } return d; })()} mode="time"
          onChange={(_, d) => { setShow(false); if (d) onChange(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); }} />
      )}
    </View>
  );
}

/** Atajos de fecha: Hoy, Mañana, el próximo viernes, en una semana. */
export function DateShortcuts({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const today = startOfDay(new Date());
  const fri = addDays(today, ((5 - today.getDay() + 7) % 7) || 7);
  const opts = [
    { label: 'Hoy', d: today }, { label: 'Mañana', d: addDays(today, 1) },
    { label: 'Viernes', d: fri }, { label: 'En una semana', d: addDays(today, 7) },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {opts.map((o) => {
        const v = isoDate(o.d); const on = value === v;
        return (
          <Pressable key={o.label} onPress={() => onChange(v)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand + '22' : 'transparent' }}>
            <Text style={{ color: on ? C.brand : C.muted, fontSize: 12.5, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
