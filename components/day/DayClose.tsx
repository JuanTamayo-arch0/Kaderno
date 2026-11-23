import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Button } from '../ds';
import { Sheet } from '../cards/CardForms';
import { DateField } from '../DateTime';
import { updateTask, moveTaskDate, planDayList, type Task } from '../../lib/db';
import { IVY_MAX, ivyCandidates, togglePick } from '../../lib/frog';
import { getStreakSummary } from '../../lib/studyDb';
import { saveDayReview } from '../../lib/dayDb';
import { leftovers, localISO, fmtHours, hoursNudge } from '../../lib/day';
import { getHours } from '../../lib/hoursDb';
import { useMode } from '../../lib/mode';
import { useRouter } from 'expo-router';
import { toast, notify, friendlyError } from '../../lib/feedback';
import { dataChanged } from '../../lib/uiBus';
import { refreshNavCounts } from '../../lib/navCounts';

// ============================================================
//  Cerrar el día (v21, sección 4), 1 minuto: lo que hiciste, lo que
//  quedó (mañana, otro día o a la bandeja), la lista para mañana (v27,
//  método Ivy Lee: hasta 6 en orden, la primera es la rana) y una línea.
// ============================================================

const STEPS = ['Lo que hiciste', 'Lo que quedó', 'Mañana', 'Una línea'];
const LAST = STEPS.length - 1;

export function DayClose({ visible, tasks, onClose, onDone }: { visible: boolean; tasks: Task[]; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [stats, setStats] = useState<{ focus: number; cards: number } | null>(null);
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState<number | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const { work } = useMode();
  const router = useRouter();
  const today = localISO(new Date());
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return localISO(d); })();
  useEffect(() => {
    if (!visible) return;
    setStep(0); setMoved({}); setNote(''); setPicking(null);
    // Si ya había lista para mañana, se parte de ella.
    const tmw = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return localISO(d); })();
    setPicks(tasks.filter((t) => t.plan_day === tmw && t.plan_order && t.status !== 'done').sort((a, b) => (a.plan_order ?? 0) - (b.plan_order ?? 0)).map((t) => t.id));
    getStreakSummary().then((s) => setStats(s ? { focus: s.today.focus, cards: s.today.cards } : { focus: 0, cards: 0 })).catch(() => setStats({ focus: 0, cards: 0 }));
    // v25: en modo Trabajo, las horas registradas hoy (enfoque, cronómetro y a mano).
    if (work) {
      const from = new Date(); from.setHours(0, 0, 0, 0);
      const to = new Date(from); to.setDate(to.getDate() + 1);
      getHours(from, to).then((r) => setLogged(r.list.reduce((a, x) => a + (x.minutes || 0), 0))).catch(() => setLogged(null));
    } else setLogged(null);
  }, [visible, work]);

  const doneToday = tasks.filter((t) => t.status === 'done' && t.completed_at && localISO(new Date(t.completed_at)) === today);
  const left = leftovers(tasks, today);

  async function move(t: Task, to: string | 'inbox') {
    try {
      if (to === 'inbox') await updateTask(t.id, { inbox: true, due_date: null, due_at: null, plan_at: null, plan_day: null, plan_band: null });
      else if ((t.plan_at || t.plan_day) && t.due_date && t.due_date > today) {
        const patch = t.plan_at ? (() => { const d = new Date(t.plan_at!); const [y, m, dd] = to.split('-').map(Number); d.setFullYear(y, m - 1, dd); return { plan_at: d.toISOString() }; })() : { plan_day: to };
        await updateTask(t.id, patch);
      } else await moveTaskDate(t, to);
      setMoved((m) => ({ ...m, [t.id]: to })); setPicking(null);
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  }

  async function finish() {
    setBusy(true);
    try {
      if (picks.length) {
        try { await planDayList(picks, tomorrow); }
        catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
      }
      await saveDayReview({ day: today, done: { tasks: doneToday.length, focus: stats?.focus ?? 0, cards: stats?.cards ?? 0 }, moved: Object.entries(moved).map(([id, to]) => ({ id, to })), note: note || null });
      const first = picks.length ? tasks.find((t) => t.id === picks[0])?.title : null;
      toast(first ? `Día cerrado. Mañana empiezas por "${first}".` : 'Día cerrado. Mañana empiezas con lo que dejaste listo.', { tone: 'good' });
      dataChanged(); refreshNavCounts(true); onDone(); onClose();
    } catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }

  let body: React.ReactNode;
  if (step === 0) {
    const nothing = !doneToday.length && !(stats?.focus) && !(stats?.cards);
    body = (
      <>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat n={String(doneToday.length)} label={doneToday.length === 1 ? 'tarea' : 'tareas'} />
          {work && logged != null
            ? <Stat n={fmtHours(logged)} label="registradas" />
            : <Stat n={fmtHours(stats?.focus ?? 0)} label="de enfoque" />}
          {!work && <Stat n={String(stats?.cards ?? 0)} label="tarjetas" />}
        </View>
        <Text style={{ color: C.text, fontSize: 14 }}>{nothing && !logged ? (work ? 'Hoy no hubo nada registrado, y está bien. Mañana es otro día.' : 'Hoy no hubo estudio, y está bien. Mañana es otro día.') : doneToday.length >= 3 || (stats?.focus ?? 0) >= 60 || (logged ?? 0) >= 240 ? 'Buen día. Lo que hiciste cuenta.' : 'Algo hiciste hoy, y eso suma.'}</Text>
        {work && logged != null && hoursNudge(logged, doneToday.length) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: C.surface2, flexWrap: 'wrap' }}>
            <Ionicons name="time-outline" size={16} color={C.brand} />
            <Text style={{ color: C.text, fontSize: 13, flex: 1, minWidth: 180 }}>{hoursNudge(logged, doneToday.length)}</Text>
            <Button label="Anotar horas" size="sm" kind="secondary" onPress={() => { onClose(); router.push({ pathname: '/horas', params: { anotar: '1' } } as any); }} />
          </View>
        )}
        {doneToday.slice(0, 8).map((t) => (
          <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={16} color={C.good} />
            <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>{t.title}</Text>
          </View>
        ))}
      </>
    );
  } else if (step === 1) {
    body = (
      <>
        {left.length === 0 && <Text style={{ color: C.text, fontSize: 14 }}>No quedó nada pendiente de hoy.</Text>}
        {left.map((t) => {
          const to = moved[t.id];
          return (
            <View key={t.id} style={{ gap: 6, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: to ? C.good + '66' : C.line }}>
              <Text style={{ color: to ? C.muted : C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={2}>{t.title}</Text>
              {to ? (
                <Text style={{ color: C.goodText, fontSize: 12.5 }}>{to === 'inbox' ? 'A la bandeja' : to === tomorrow ? 'Para mañana' : `Para el ${to.slice(8, 10)}/${to.slice(5, 7)}`}</Text>
              ) : (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Button label="Mañana" size="sm" onPress={() => move(t, tomorrow)} />
                  <Button label="Elegir día" size="sm" kind="secondary" onPress={() => setPicking(picking === t.id ? null : t.id)} />
                  <Button label="A la bandeja" size="sm" kind="ghost" onPress={() => move(t, 'inbox')} />
                </View>
              )}
              {picking === t.id && <DateField label="Día" value={null} onChange={(v) => { if (v) move(t, v); }} />}
            </View>
          );
        })}
      </>
    );
  } else if (step === 2) {
    const cands = ivyCandidates(tasks, tomorrow);
    body = (
      <>
        <Text style={{ color: C.text, fontSize: 14 }}>Escoge hasta {IVY_MAX} para mañana, en el orden en que las vas a hacer. La primera es lo primero del día.</Text>
        <Text style={{ color: C.muted, fontSize: 12.5 }}>Mañana las haces en ese orden, una a la vez. Es opcional: puedes seguir sin lista.</Text>
        {cands.length === 0 && <Text style={{ color: C.muted, fontSize: 13.5 }}>No hay tareas pendientes para escoger.</Text>}
        {cands.map((t) => {
          const n = picks.indexOf(t.id) + 1;
          return (
            <Pressable key={t.id} onPress={() => { const r = togglePick(picks, t.id); if (r.full) toast(`Máximo ${IVY_MAX}: lo importante es poco.`); setPicks(r.list); }}
              accessibilityRole="checkbox" accessibilityState={{ checked: n > 0 }} accessibilityLabel={n ? `${t.title}, número ${n} de la lista` : `Agregar "${t.title}" a la lista de mañana`}
              style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: n ? C.brand : C.line, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: n ? C.brand : 'transparent', borderWidth: n ? 0 : 1.5, borderColor: C.muted }}>
                {n > 0 && <Text style={{ color: C.onBrand, fontSize: 12.5, fontWeight: '800' }}>{n}</Text>}
              </View>
              <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={2}>{t.title}</Text>
              {!!t.important && <Ionicons name="star" size={14} color={C.warnText} />}
            </Pressable>
          );
        })}
      </>
    );
  } else {
    body = (
      <>
        <Text style={{ color: C.text, fontSize: 14 }}>¿Qué aprendiste hoy? (opcional)</Text>
        <TextInput value={note} onChangeText={setNote} placeholder="Ej: Por fin entendí la ecuación de Bernoulli" placeholderTextColor={C.muted} multiline maxLength={500}
          accessibilityLabel="Qué aprendiste hoy" style={{ minHeight: 80, textAlignVertical: 'top', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, color: C.text, padding: 12, fontSize: 15 }} />
        <Text style={{ color: C.muted, fontSize: 12 }}>Queda como diario y lo verás en el ritual del lunes.</Text>
      </>
    );
  }
  const pendingLeft = step === 1 && left.some((t) => !moved[t.id]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Cerrar el día" subtitle={`Paso ${step + 1} de ${STEPS.length} · ${STEPS[step]}`}
      footer={<>
        <Button label={step === 0 ? 'Cerrar' : 'Atrás'} kind="secondary" onPress={() => (step === 0 ? onClose() : setStep(step - 1))} style={{ flex: 1 }} />
        {step < LAST
          ? <Button label={pendingLeft ? 'Dejarlas así' : step === 2 && !picks.length ? 'Seguir sin lista' : 'Siguiente'} icon="arrow-forward" onPress={() => setStep(step + 1)} style={{ flex: 2 }} />
          : <Button label="Cerrar el día" icon="moon-outline" onPress={finish} busy={busy} style={{ flex: 2 }} />}
      </>}>
      {body}
    </Sheet>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' }}>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{n}</Text>
      <Text style={{ color: C.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
