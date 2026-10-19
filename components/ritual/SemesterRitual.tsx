import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { C } from '../../lib/theme';
import { Button, Dot } from '../ds';
import { Sheet } from '../cards/CardForms';
import { WoopFields } from '../goals/WoopSheet';
import { getSubjects, getAllGrades, type Subject, type Grade } from '../../lib/db';
import { getStudyPrefs, saveStudyPrefs } from '../../lib/cardsDb';
import { getGoals, saveGoal, saveRitualPrefs, type Goal } from '../../lib/ritualsDb';
import { fullPlan, planThen, goalError, type GoalDraft } from '../../lib/rituals';
import { toast, notify, friendlyError } from '../../lib/feedback';
import { streakChanged } from '../../lib/uiBus';

// ============================================================
//  Ritual del semestre (v20, sección J.2): la nota que quieres en cada
//  materia, la meta semanal y una meta WOOP del semestre.
// ============================================================

const STEPS = ['Notas que quieres', 'Meta semanal', 'Meta del semestre'];

export function SemesterRitual({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [scales, setScales] = useState<Record<string, number>>({});
  const [goals, setGoals] = useState<Goal[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [weekly, setWeekly] = useState(4);
  const [woop, setWoop] = useState<GoalDraft>({ wish: '' });
  const [wStep, setWStep] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep(0); setWStep(0);
    Promise.all([getSubjects(), getAllGrades().catch(() => [] as Grade[]), getGoals(), getStudyPrefs()]).then(([s, g, gl, p]) => {
      const live = s.filter((x) => !x.archived);
      setSubjects(live); setGoals(gl); setWeekly(p.weeklyGoal);
      const sc: Record<string, number> = {};
      live.forEach((x) => { sc[x.id] = g.find((y) => y.subject_id === x.id)?.max_score ?? 5; });
      setScales(sc);
      const t: Record<string, string> = {};
      gl.forEach((x) => { if (x.subject_id && x.target_grade != null) t[x.subject_id] = String(x.target_grade).replace('.', ','); });
      setTargets(t);
      const sem = gl.find((x) => !x.subject_id);
      setWoop(sem ? { wish: sem.wish, outcome: sem.outcome, obstacle: sem.obstacle, plan: sem.plan } : { wish: '' });
    }).catch(() => setSubjects([]));
  }, [visible]);

  async function save() {
    setBusy(true);
    try {
      for (const s of subjects ?? []) {
        const raw = (targets[s.id] ?? '').trim();
        if (!raw) continue;
        const n = parseFloat(raw.replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0 || n > (scales[s.id] ?? 5)) continue;
        const g = goals.find((x) => x.subject_id === s.id);
        if (g) await saveGoal({ wish: g.wish, outcome: g.outcome, obstacle: g.obstacle, plan: g.plan, target_grade: n }, s.id, g.id);
        else await saveGoal({ wish: `Sacar ${String(n).replace('.', ',')} en ${s.name}`, target_grade: n }, s.id);
      }
      if (woop.wish.trim()) {
        const then = planThen(woop.plan, woop.obstacle);
        const clean = { ...woop, plan: then.trim() ? fullPlan(woop.obstacle, then) : null };
        const err = goalError(clean);
        if (err) throw new Error(err);
        const sem = goals.find((x) => !x.subject_id);
        await saveGoal(clean, null, sem?.id);
      }
      await saveStudyPrefs({ weeklyGoal: weekly });
      await saveRitualPrefs({ semesterAt: new Date().toISOString() });
      streakChanged(0);
      toast('Semestre listo: metas guardadas.', { tone: 'good' });
      onClose();
    } catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }

  let body: React.ReactNode;
  if (!subjects) body = <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color={C.brand} /></View>;
  else if (step === 0) body = (
    <>
      <Text style={{ color: C.text, fontSize: 14 }}>¿Qué nota quieres sacar en cada materia? Se usa en "Quiero sacar" y en el resultado del simulacro.</Text>
      {subjects.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>Primero crea tus materias.</Text>}
      {subjects.map((s) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Dot color={s.color} />
          <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{s.name}</Text>
          <TextInput value={targets[s.id] ?? ''} onChangeText={(v) => setTargets((t) => ({ ...t, [s.id]: v.replace(/[^0-9.,]/g, '') }))} keyboardType="decimal-pad"
            placeholder={(scales[s.id] ?? 5) >= 20 ? '80' : '4,0'} placeholderTextColor={C.muted} accessibilityLabel={`Nota que quieres en ${s.name}`}
            style={{ width: 72, textAlign: 'center', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 8, fontSize: 15, fontWeight: '700' }} />
          <Text style={{ color: C.muted, fontSize: 12.5, width: 36 }}>/ {scales[s.id] ?? 5}</Text>
        </View>
      ))}
    </>
  );
  else if (step === 1) body = (
    <>
      <Text style={{ color: C.text, fontSize: 14 }}>¿Cuántos días por semana quieres estudiar algo?</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
        {[2, 3, 4, 5, 6, 7].map((n) => (
          <Pressable key={n} onPress={() => setWeekly(n)} accessibilityRole="radio" accessibilityState={{ checked: weekly === n }} accessibilityLabel={`${n} días`}
            style={{ minWidth: 48, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 99, borderWidth: 1, borderColor: weekly === n ? C.brand : C.line, backgroundColor: weekly === n ? C.brand : 'transparent' }}>
            <Text style={{ color: weekly === n ? C.onBrand : C.text, fontSize: 15, fontWeight: '700' }}>{n}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
  else body = (
    <>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[0, 1, 2, 3].map((i) => <Pressable key={i} onPress={() => setWStep(i)} accessibilityLabel={`Parte ${i + 1}`} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= wStep ? C.brand2 : C.surface2 }} />)}
      </View>
      <WoopFields step={wStep} d={woop} onChange={setWoop} subject={null} scale={5} />
      <Text style={{ color: C.muted, fontSize: 12 }}>Opcional. Puedes dejarla vacía y ponerla después.</Text>
    </>
  );

  const last = step === 2 && wStep === 3;
  return (
    <Sheet visible={visible} onClose={onClose} title="Empezar semestre" subtitle={`Paso ${step + 1} de 3 · ${STEPS[step]}`}
      footer={<>
        <Button label={step === 0 ? 'Cerrar' : 'Atrás'} kind="secondary" style={{ flex: 1 }}
          onPress={() => { if (step === 2 && wStep > 0) setWStep(wStep - 1); else if (step === 0) onClose(); else setStep(step - 1); }} />
        {step === 2 && !last && woop.wish.trim()
          ? <Button label="Siguiente" icon="arrow-forward" onPress={() => setWStep(wStep + 1)} style={{ flex: 2 }} />
          : step < 2
          ? <Button label="Siguiente" icon="arrow-forward" onPress={() => setStep(step + 1)} disabled={!subjects} style={{ flex: 2 }} />
          : <Button label="Guardar" icon="checkmark" onPress={save} busy={busy} style={{ flex: 2 }} />}
      </>}>
      {body}
    </Sheet>
  );
}
