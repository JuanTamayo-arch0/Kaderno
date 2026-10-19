import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import type { Task } from '../../lib/db';
import { examCountdown, localISO } from '../../lib/day';
import { openTask } from '../../lib/uiBus';

// Cuenta regresiva de exámenes (v21, sección 5): una tira con los próximos.
export function Countdown({ tasks, style }: { tasks: Task[]; style?: any }) {
  const list = examCountdown(tasks as any, localISO(new Date()));
  if (!list.length) return null;
  const tone = { bad: C.bad, warn: C.warn, muted: C.muted };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ marginBottom: 12, flexGrow: 0 }, style]} contentContainerStyle={{ gap: 8 }}
      accessibilityLabel="Próximos exámenes">
      {list.map((c) => {
        const t = tasks.find((x) => x.id === c.id)!;
        return (
          <Pressable key={c.id} onPress={() => openTask(t)} accessibilityRole="button" accessibilityLabel={`${c.title}, ${c.label}`}
            style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: tone[c.tone] + '66', backgroundColor: hovered ? C.surface2 : tone[c.tone] + '12' })}>
            <Ionicons name="hourglass-outline" size={15} color={tone[c.tone]} />
            <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', maxWidth: 200 }} numberOfLines={1}>{c.title}</Text>
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, backgroundColor: tone[c.tone] + '26' }}>
              <Text style={{ color: c.tone === 'muted' ? C.text : tone[c.tone], fontSize: 12, fontWeight: '800' }}>{c.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
