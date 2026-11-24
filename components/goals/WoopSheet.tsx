import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { C } from '../../lib/theme';
import { Button } from '../ds';
import { Sheet } from '../cards/CardForms';
import { saveGoal, closeGoal, type Goal } from '../../lib/ritualsDb';
import { OBSTACLES, PLAN_HINTS, planTemplate, fullPlan, planThen, wishExample, goalError, gradeInWish, type GoalDraft } from '../../lib/rituals';
import { toast, notify, friendlyError } from '../../lib/feedback';
import { t } from '../../lib/i18n';

// ============================================================
//  Meta WOOP (v20, sección K): deseo, mejor resultado, obstáculo y
//  plan "Si…, entonces…". Para una materia o para el semestre.
// ============================================================

const STEPS = [t('Tu meta'), t('El mejor resultado'), t('El obstáculo'), t('Tu plan')];

export function WoopFields({ step, d, onChange, subject, scale }: { step: number; d: GoalDraft; onChange: (d: GoalDraft) => void; subject: string | null; scale: number }) {
  const input = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, color: C.text, padding: 12, fontSize: 15 } as const;
  const then = planThen(d.plan, d.obstacle);
  if (step === 0) return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{t('¿Qué quieres lograr{v}? Que sea retador pero posible.', { v: subject ? ` en ${subject}` : ' este semestre' })}</Text>
      <TextInput value={d.wish} onChangeText={(v) => onChange({ ...d, wish: v, target_grade: d.target_grade ?? gradeInWish(v, scale) })} placeholder={`Ej: ${wishExample(subject, scale)}`} placeholderTextColor={C.muted}
        accessibilityLabel={t('Tu meta')} maxLength={200} style={input} />
      {!!subject && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: C.muted, fontSize: 13 }}>{t('Nota que quieres sacar')}</Text>
          <TextInput value={d.target_grade != null ? String(d.target_grade).replace('.', ',') : ''} keyboardType="decimal-pad" accessibilityLabel={t('Nota que quieres sacar')}
            onChangeText={(v) => { const n = parseFloat(v.replace(',', '.')); onChange({ ...d, target_grade: v.trim() === '' || !Number.isFinite(n) ? null : n }); }}
            placeholder={scale >= 20 ? '80' : '4,0'} placeholderTextColor={C.muted} style={[input, { width: 80, textAlign: 'center', padding: 8 }]} />
          <Text style={{ color: C.muted, fontSize: 13 }}>{t('de {scale}', { scale })}</Text>
        </View>
      )}
    </View>
  );
  if (step === 1) return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{t('Imagina que lo lograste. ¿Qué es lo mejor de eso? Una frase.')}</Text>
      <TextInput value={d.outcome ?? ''} onChangeText={(v) => onChange({ ...d, outcome: v })} placeholder={t('Ej: Me libero para el intersemestral y entro a la línea de énfasis que quiero')} placeholderTextColor={C.muted}
        accessibilityLabel={t('El mejor resultado')} multiline maxLength={300} style={[input, { minHeight: 80, textAlignVertical: 'top' }]} />
    </View>
  );
  if (step === 2) return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{t('¿Qué es lo que más te puede frenar, de ti mismo?')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {OBSTACLES.map((o) => {
          const on = (d.obstacle ?? '').toLowerCase() === o;
          return (
            <Pressable key={o} onPress={() => onChange({ ...d, obstacle: on ? '' : o })} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent' }}>
              <Text style={{ color: on ? C.onBrand : C.text, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput value={d.obstacle ?? ''} onChangeText={(v) => onChange({ ...d, obstacle: v })} placeholder={t('O escríbelo con tus palabras')} placeholderTextColor={C.muted}
        accessibilityLabel={t('El obstáculo')} maxLength={200} style={input} />
    </View>
  );
  const hint = PLAN_HINTS[(d.obstacle ?? '').toLowerCase()];
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{t('Cuando aparezca el obstáculo, ¿qué vas a hacer? Algo concreto.')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
        <Text style={{ color: C.muted, fontSize: 14, paddingTop: 12 }}>{planTemplate(d.obstacle)}</Text>
        <TextInput value={then} onChangeText={(v) => onChange({ ...d, plan: v ? planTemplate(d.obstacle) + v : '' })} placeholder={hint ?? t('lo que harás')} placeholderTextColor={C.muted}
          accessibilityLabel={t('Entonces…')} multiline maxLength={250} style={[input, { flex: 1, minWidth: 200 }]} />
      </View>
      {!!hint && !then && (
        <Pressable onPress={() => onChange({ ...d, plan: fullPlan(d.obstacle, hint) })} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
          <Text style={{ color: C.brand, fontSize: 13, fontWeight: '700' }}>{t('Usar: "{hint}"', { hint })}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function WoopSheet({ visible, onClose, subjectId, subject, scale = 5, goal, onSaved }: {
  visible: boolean; onClose: () => void; subjectId: string | null; subject: string | null; scale?: number; goal: Goal | null; onSaved: (g: Goal | null) => void;
}) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<GoalDraft>({ wish: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setD(goal ? { wish: goal.wish, outcome: goal.outcome, obstacle: goal.obstacle, plan: goal.plan, target_grade: goal.target_grade != null ? Number(goal.target_grade) : null } : { wish: '' });
  }, [visible, goal?.id]);

  async function save() {
    const then = planThen(d.plan, d.obstacle);
    const clean: GoalDraft = { ...d, plan: then.trim() ? fullPlan(d.obstacle, then) : null };
    const err = goalError(clean, scale);
    if (err) { notify(t('Revisa la meta'), err); setStep(0); return; }
    setBusy(true);
    try {
      const g = await saveGoal(clean, subjectId, goal?.id);
      toast(goal ? t('Meta actualizada') : t('Meta guardada. La verás en la materia y en el ritual del lunes.'), { tone: 'good' });
      onSaved(g); onClose();
    } catch (e) { notify(t('No se pudo guardar'), friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function finish(status: 'done' | 'dropped') {
    if (!goal) return;
    try { await closeGoal(goal.id, status); toast(status === 'done' ? t('¡Meta cumplida!') : t('Meta quitada')); onSaved(null); onClose(); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  }

  const canNext = step === 0 ? !!d.wish.trim() : true;
  return (
    <Sheet visible={visible} onClose={onClose} title={subject ? t('Meta para {subject}', { subject }) : t('Meta del semestre')} subtitle={t('Paso {v} de 4 · {v2}', { v: step + 1, v2: STEPS[step] })}
      footer={<>
        <Button label={step === 0 ? t('Cancelar') : t('Atrás')} kind="secondary" onPress={() => (step === 0 ? onClose() : setStep(step - 1))} style={{ flex: 1 }} />
        {step < 3
          ? <Button label={t('Siguiente')} icon="arrow-forward" onPress={() => setStep(step + 1)} disabled={!canNext} style={{ flex: 2 }} />
          : <Button label={t('Guardar meta')} icon="checkmark" onPress={save} busy={busy} style={{ flex: 2 }} />}
      </>}>
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={t('Paso {v} de 4', { v: step + 1 })}>
        {STEPS.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? C.brand : C.surface2 }} />)}
      </View>
      <WoopFields step={step} d={d} onChange={setD} subject={subject} scale={scale} />
      {goal && step === 0 && (
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
          <Pressable onPress={() => finish('done')} accessibilityRole="button"><Text style={{ color: C.goodText, fontSize: 13, fontWeight: '700' }}>{t('La cumplí')}</Text></Pressable>
          <Pressable onPress={() => finish('dropped')} accessibilityRole="button"><Text style={{ color: C.muted, fontSize: 13, fontWeight: '700' }}>{t('Quitar meta')}</Text></Pressable>
        </View>
      )}
    </Sheet>
  );
}
