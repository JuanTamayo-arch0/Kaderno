import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Button } from '../ds';
import { Sheet } from '../cards/CardForms';
import { CardText } from '../cards/CardText';
import { aiRecall, aiQuiz, aiGrade, saveRecall } from '../../lib/quizDb';
import { headingsOf, autoGrade, correctText, fmtClock, type QuizQuestion, type Verdict } from '../../lib/quiz';
import type { RecallResult } from '../../supabase/functions/_shared/quiz';
import { toast, notify, friendlyError } from '../../lib/feedback';
import { streakChanged } from '../../lib/uiBus';

// ============================================================
//  "Ponme a prueba" (v20, sección I): se oculta la nota, escribes lo que
//  recuerdas y la IA lo compara: lo que recordaste, lo que faltó (con
//  enlace al título) y lo que quedó mal. También "3 preguntas rápidas".
// ============================================================

type Step = 'write' | 'loading' | 'result' | 'quick' | 'quickLoading' | 'quickResult';
const SUGGESTED = 180;

export function RecallTest({ visible, onClose, noteId, title, markdown, onHeading, onCards, onSaved }: {
  visible: boolean; onClose: () => void; noteId: string; title: string; markdown: string;
  onHeading: (heading: string) => void;
  /** Hacer tarjetas de lo que faltó (abre la revisión con la IA). */
  onCards: (text: string) => void;
  onSaved: (score: number) => void;
}) {
  const [step, setStep] = useState<Step>('write');
  const [text, setText] = useState('');
  const [startedAt, setStartedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [res, setRes] = useState<RecallResult | null>(null);
  const [qs, setQs] = useState<QuizQuestion[]>([]);
  const [given, setGiven] = useState<(string | number | null)[]>([]);
  const [verdicts, setVerdicts] = useState<(Verdict | null)[]>([]);

  useEffect(() => { if (visible) { setStep('write'); setText(''); setRes(null); setStartedAt(Date.now()); setNow(Date.now()); } }, [visible]);
  useEffect(() => {
    if (!visible || step !== 'write') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible, step]);
  const elapsed = Math.floor((now - startedAt) / 1000);
  const headings = headingsOf(markdown);

  async function compare() {
    setStep('loading');
    try {
      const r = await aiRecall(title, markdown, headings, text);
      setRes(r); setStep('result');
      saveRecall(noteId, r.score).then((ok) => { if (ok) { onSaved(r.score); streakChanged(); } }).catch(() => {});
    } catch (e) { notify('No se pudo comparar', friendlyError(e)); setStep('write'); }
  }
  async function quick() {
    setStep('quickLoading');
    try {
      const q = await aiQuiz([{ title, content: markdown }], 3, null, true);
      setQs(q); setGiven(q.map(() => null)); setVerdicts(q.map(() => null)); setStep('quick');
    } catch (e) { notify('No se pudieron armar las preguntas', friendlyError(e)); setStep('write'); }
  }
  async function gradeQuick() {
    setStep('quickLoading');
    const v = qs.map((q, i) => autoGrade(q, given[i]));
    const pend = v.map((x, i) => (x == null ? i : -1)).filter((i) => i >= 0);
    if (pend.length) {
      try {
        const g = await aiGrade(pend.map((i) => ({ q: qs[i].q, expected: correctText(qs[i]), given: String(given[i] ?? '') })));
        pend.forEach((i, k) => { v[i] = g[k]?.verdict ?? 'wrong'; });
      } catch (e) { pend.forEach((i) => { v[i] = 'wrong'; }); toast(friendlyError(e), { tone: 'bad' }); }
    }
    setVerdicts(v); setStep('quickResult');
  }

  const missingText = res ? [
    ...res.missing.map((m) => `- ${m.point}`),
    ...res.wrong.map((w) => `- ${w.fix}`),
  ].join('\n') : '';

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  if (step === 'write') {
    body = (
      <>
        <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>Sin mirar la nota, escribe todo lo que recuerdas: ideas, fórmulas, ejemplos. No importa el orden.</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="time-outline" size={15} color={elapsed > SUGGESTED ? C.warnText : C.muted} />
          <Text style={{ color: elapsed > SUGGESTED ? C.warnText : C.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>
            Sugerido: 3 min · {fmtClock(elapsed)}
          </Text>
        </View>
        <TextInput value={text} onChangeText={setText} multiline autoFocus={Platform.OS === 'web'} placeholder="Escribe todo lo que recuerdas…" placeholderTextColor={C.muted}
          accessibilityLabel="Lo que recuerdas de la nota"
          style={{ minHeight: 200, textAlignVertical: 'top', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, color: C.text, padding: 12, fontSize: 15, lineHeight: 21 }} />
        <Pressable onPress={quick} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 }}>
          <Ionicons name="flash-outline" size={15} color={C.brand} />
          <Text style={{ color: C.brand, fontSize: 13, fontWeight: '700' }}>Mejor 3 preguntas rápidas</Text>
        </Pressable>
      </>
    );
    footer = <>
      <Button label="Cancelar" kind="secondary" onPress={onClose} style={{ flex: 1 }} />
      <Button label="Comparar con la nota" icon="git-compare-outline" onPress={compare} disabled={text.trim().length < 10} style={{ flex: 2 }} />
    </>;
  } else if (step === 'loading' || step === 'quickLoading') {
    body = (
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 30 }}>
        <ActivityIndicator color={C.brand} size="large" />
        <Text style={{ color: C.muted, fontSize: 13 }}>{step === 'loading' ? 'Comparando con tu nota…' : 'Un momento…'}</Text>
      </View>
    );
  } else if (step === 'result' && res) {
    body = (
      <>
        <View style={{ alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ color: res.score >= 70 ? C.goodText : res.score >= 40 ? C.warnText : C.badText, fontSize: 40, fontWeight: '800' }}>{res.score}%</Text>
          <Text style={{ color: C.muted, fontSize: 13 }}>de lo importante, de memoria</Text>
        </View>
        {res.recalled.length > 0 && <Group title="Lo que recordaste" icon="checkmark-circle" color={C.good} items={res.recalled.map((r) => ({ text: r }))} />}
        {res.missing.length > 0 && (
          <Group title="Lo que faltó" icon="ellipse-outline" color={C.warn}
            items={res.missing.map((m) => ({ text: m.point, link: m.heading ? { label: m.heading, onPress: () => { onClose(); onHeading(m.heading!); } } : undefined }))} />
        )}
        {res.wrong.length > 0 && <Group title="Lo que quedó mal" icon="close-circle" color={C.bad} items={res.wrong.map((w) => ({ text: w.point, sub: `Lo correcto: ${w.fix}` }))} />}
      </>
    );
    footer = <>
      <Button label="Listo" kind="secondary" onPress={onClose} style={{ flex: 1 }} />
      {missingText ? <Button label="Hacer tarjetas de lo que faltó" icon="albums-outline" onPress={() => { onClose(); onCards(missingText); }} style={{ flex: 2 }} /> : null}
    </>;
  } else if (step === 'quick' || step === 'quickResult') {
    const done = step === 'quickResult';
    body = (
      <>
        {qs.map((q, i) => (
          <View key={i} style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: done ? (verdicts[i] === 'ok' ? C.good : verdicts[i] === 'partial' ? C.warn : C.bad) + '88' : C.line }}>
            <CardText text={`${i + 1}. ${q.q}`} size={15} align="left" />
            {q.type === 'mc' ? q.options!.map((o, k) => {
              const on = given[i] === k;
              const right = done && k === q.answer;
              return (
                <Pressable key={k} disabled={done} onPress={() => setGiven((g) => g.map((x, j) => (j === i ? k : x)))} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: right ? C.good : on ? C.brand : C.line, backgroundColor: on ? C.brand + '14' : 'transparent' }}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={16} color={on ? C.brand : C.muted} />
                  <View style={{ flex: 1 }}><CardText text={o} size={14} align="left" /></View>
                </Pressable>
              );
            }) : (
              <TextInput editable={!done} value={String(given[i] ?? '')} onChangeText={(v) => setGiven((g) => g.map((x, j) => (j === i ? v : x)))} placeholder="Tu respuesta" placeholderTextColor={C.muted}
                accessibilityLabel={`Respuesta ${i + 1}`} style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 10, fontSize: 14 }} />
            )}
            {done && <Text style={{ color: C.muted, fontSize: 12.5 }}>Correcta: <Text style={{ color: C.goodText }}>{correctText(q)}</Text>{q.explain ? `. ${q.explain}` : ''}</Text>}
          </View>
        ))}
      </>
    );
    footer = done
      ? <Button label={`Listo · ${verdicts.filter((v) => v === 'ok').length} de ${qs.length}`} onPress={onClose} style={{ flex: 1 }} />
      : <>
        <Button label="Volver" kind="secondary" onPress={() => setStep('write')} style={{ flex: 1 }} />
        <Button label="Corregir" icon="checkmark" onPress={gradeQuick} style={{ flex: 2 }} />
      </>;
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={step.startsWith('quick') ? '3 preguntas rápidas' : 'Ponme a prueba'} subtitle={title} footer={footer}>
      {body}
    </Sheet>
  );
}

function Group({ title, icon, color, items }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; items: { text: string; sub?: string; link?: { label: string; onPress: () => void } }[] }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>{title}</Text>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          <Ionicons name={icon} size={16} color={color} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 19 }}>{it.text}</Text>
            {!!it.sub && <Text style={{ color: C.muted, fontSize: 12.5 }}>{it.sub}</Text>}
            {it.link && (
              <Pressable onPress={it.link.onPress} accessibilityRole="link" style={{ alignSelf: 'flex-start' }}>
                <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>Ver en la nota: {it.link.label}</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
