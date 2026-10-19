import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Card, Button, IconButton } from '../ds';
import { updateTask, type Task } from '../../lib/db';
import { suggestSlots } from './WhenPicker';
import { slotLabel } from '../../lib/planSlots';
import { combine, fromISODate, dueTimeHHMM } from '../../lib/time';
import { toast, friendlyError } from '../../lib/feedback';

// "No arrancó el informe. ¿Lo movemos?" con tres horarios nuevos.
export function StalledPlan({ t, onChanged, onStart, onDismiss }: { t: Task; onChanged: () => void; onStart: () => void; onDismiss: () => void }) {
  const [slots, setSlots] = useState<Date[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const hh = dueTimeHHMM(t);
    const due = t.due_date ? (hh ? new Date(combine(t.due_date, hh)) : fromISODate(t.due_date)) : null;
    suggestSlots({ due, dueHasTime: !!hh, excludeId: t.id }).then(setSlots).catch(() => setSlots([]));
  }, [t.id, t.due_date, t.due_at]);

  async function move(at: Date | null) {
    setBusy(true);
    try {
      await updateTask(t.id, { plan_at: at ? at.toISOString() : null, plan_place: at ? t.plan_place ?? null : null });
      toast(at ? `Movido a ${slotLabel(at, new Date()).toLowerCase()}` : 'Plan quitado', { tone: 'good' });
      onChanged();
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setBusy(false); }
  }

  return (
    <Card style={{ marginBottom: 12, borderLeftWidth: 4, borderLeftColor: C.brand }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Ionicons name="time-outline" size={18} color={C.brand} style={{ marginTop: 1 }} />
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', flex: 1 }}>No arrancó "{t.title}". ¿Lo movemos?</Text>
        <IconButton icon="close" label="Cerrar" onPress={onDismiss} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {slots.map((d) => (
          <Pressable key={d.toISOString()} disabled={busy} onPress={() => move(d)} accessibilityRole="button"
            style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 99, borderWidth: 1, borderColor: C.line, opacity: busy ? 0.5 : 1 }}>
            <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>{slotLabel(d, new Date())}</Text>
          </Pressable>
        ))}
        {slots.length === 0 && <Text style={{ color: C.muted, fontSize: 12.5 }}>No veo huecos libres antes de la entrega.</Text>}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button label="Empezar ahora" icon="play" size="sm" onPress={onStart} />
        <Button label="Quitar el plan" kind="ghost" size="sm" onPress={() => move(null)} disabled={busy} />
      </View>
    </Card>
  );
}
