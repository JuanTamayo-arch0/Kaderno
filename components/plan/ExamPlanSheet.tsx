import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../../lib/theme';
import { Button } from '../ds';
import { Sheet } from '../cards/CardForms';
import type { Task } from '../../lib/db';
import { proposePlan, createPlan, type DraftSession } from '../../lib/quizDb';
import { KIND_TEXT, daysUntil, type SessionKind } from '../../lib/examPlan';
import { timeLabel } from '../../lib/planSlots';
import { toast, notify, friendlyError } from '../../lib/feedback';
import { dataChanged } from '../../lib/uiBus';
import { refreshNavCounts } from '../../lib/navCounts';
import { lastChange } from '../../lib/examReviewDb';

// ============================================================
//  "¿Armo tu plan de repaso para el Parcial 3?" (v20, sección G).
//  Muestra las sesiones propuestas con su horario y se crean con un toque.
// ============================================================

const ASKED_KEY = 'kd:examPlanAsked';
export async function examPlanAsked(): Promise<string[]> {
  try { const raw = await AsyncStorage.getItem(ASKED_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export async function markExamPlanAsked(id: string): Promise<void> {
  const list = await examPlanAsked();
  if (!list.includes(id)) AsyncStorage.setItem(ASKED_KEY, JSON.stringify([...list, id].slice(-100))).catch(() => {});
}

const ICON: Record<SessionKind, React.ComponentProps<typeof Ionicons>['name']> = {
  prep: 'reader-outline', mix: 'shuffle-outline', sim: 'clipboard-outline', light: 'leaf-outline',
};
const DAY = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function ExamPlanSheet({ exam, onClose }: { exam: Task | null; onClose: () => void }) {
  const [drafts, setDrafts] = useState<DraftSession[] | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  // v22: lo que dijiste que harías distinto en el parcial anterior de la materia.
  const [prev, setPrev] = useState<{ title: string; change: string } | null>(null);
  useEffect(() => { setPrev(null); if (exam?.subject_id) lastChange(exam.subject_id).then(setPrev).catch(() => {}); }, [exam?.id]);

  useEffect(() => {
    if (!exam) return;
    setDrafts(null);
    proposePlan(exam).then((d) => { setDrafts(d); setKeep(d.map(() => true)); }).catch(() => setDrafts([]));
  }, [exam?.id, exam?.due_date]);

  if (!exam) return null;
  const n = keep.filter(Boolean).length;
  const d = exam.due_date ? (() => { const [y, m, dd] = exam.due_date!.split('-').map(Number); return daysUntil(new Date(y, m - 1, dd), new Date()); })() : 0;

  async function create() {
    if (!exam || !drafts) return;
    setBusy(true);
    try {
      const count = await createPlan(exam, drafts.filter((_, i) => keep[i]));
      markExamPlanAsked(exam.id);
      toast(`Plan listo: ${count} ${count === 1 ? 'sesión' : 'sesiones'}. Salen en Hoy y en el calendario.`, { tone: 'good' });
      dataChanged(); refreshNavCounts(true);
      onClose();
    } catch (e) { notify('No se pudo crear el plan', friendlyError(e)); }
    finally { setBusy(false); }
  }
  const later = () => { markExamPlanAsked(exam.id); onClose(); };

  return (
    <Sheet visible={!!exam} onClose={later} title={`¿Armo tu plan de repaso para ${exam.title}?`}
      subtitle={d > 0 ? `Faltan ${d} ${d === 1 ? 'día' : 'días'}. Sesiones cortas antes del examen, en horarios libres.` : undefined}
      footer={<>
        <Button label="Ahora no" kind="secondary" onPress={later} style={{ flex: 1 }} />
        <Button label={`Crear ${n} ${n === 1 ? 'sesión' : 'sesiones'}`} icon="checkmark" onPress={create} busy={busy} disabled={!drafts || n === 0} style={{ flex: 2 }} />
      </>}>
      {prev && (
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.brand2 + '1a', borderWidth: 1, borderColor: C.brand2 + '55' }}>
          <Ionicons name="return-down-forward-outline" size={18} color={C.brand2} />
          <Text style={{ color: C.text, fontSize: 13.5, flex: 1, lineHeight: 19 }}>Después de {prev.title} dijiste: <Text style={{ fontWeight: '700' }}>"{prev.change}"</Text></Text>
        </View>
      )}
      {!drafts ? (
        <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={C.brand} /></View>
      ) : drafts.length === 0 ? (
        <Text style={{ color: C.muted, fontSize: 13.5 }}>El examen es hoy o ya pasó: no hay sesiones que armar.</Text>
      ) : drafts.map((s, i) => (
        <Pressable key={i} onPress={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))} accessibilityRole="checkbox" accessibilityState={{ checked: keep[i] }}
          accessibilityLabel={`${KIND_TEXT[s.kind].long}, ${DAY[s.day.getDay()]} ${s.day.getDate()}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: keep[i] ? C.brand + '66' : C.line, backgroundColor: keep[i] ? C.brand + '10' : 'transparent', opacity: keep[i] ? 1 : 0.6 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={ICON[s.kind]} size={18} color={C.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{s.title.split(' · ')[0] === 'Simulacro rápido' ? 'Simulacro rápido' : KIND_TEXT[s.kind].long}</Text>
            <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>
              {DAY[s.day.getDay()]} {s.day.getDate()} · {s.at ? timeLabel(s.at) : 'sin hueco libre, a cualquier hora'} · {s.minutes} min
            </Text>
          </View>
          <Ionicons name={keep[i] ? 'checkbox' : 'square-outline'} size={20} color={keep[i] ? C.brand : C.muted} />
        </Pressable>
      ))}
    </Sheet>
  );
}
