import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button, Card } from '../ds';
import type { Task } from '../../lib/db';
import { verdict, changeSuggestions, parseScore, chartPoints, MY_REASONS, fmtGrade, type Effort, type Verdict } from '../../lib/examReview';
import { gatherEffort, saveResult, findGrade, dismissReview, pendingReviews, getResults, type ExamResult } from '../../lib/examReviewDb';
import { fmtHours } from '../../lib/day';
import { dueDay, DAY_LONG } from '../../lib/time';
import { toast, friendlyError, notify, confirm } from '../../lib/feedback';
import { dataChanged, openExamReview, onDataChanged } from '../../lib/uiBus';

// ============================================================
//  ¿Cómo te fue? (v22, fase 3): la nota del parcial frente al esfuerzo,
//  el porqué y lo que harás distinto (que vuelve al planear el próximo).
// ============================================================

const FELT = ['Nada', 'Poco', 'Más o menos', 'Bien', 'Muy bien'];
const field = [{ color: C.text, fontSize: 15, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null];

export function ExamReviewSheet({ exam, onClose }: { exam: Task | null; onClose: () => void }) {
  const [step, setStep] = useState<'grade' | 'result'>('grade');
  const [scoreText, setScoreText] = useState('');
  const [weightText, setWeightText] = useState('');
  const [felt, setFelt] = useState<number | null>(null);
  const [data, setData] = useState<{ effort: Effort; target: number | null; history: ExamResult[]; gradeMax: number } | null>(null);
  const [hasGrade, setHasGrade] = useState(true);
  const [mine, setMine] = useState<string[]>([]);
  const [change, setChange] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!exam) return;
    setStep('grade'); setScoreText(''); setWeightText(''); setFelt(null); setMine([]); setChange(''); setData(null);
    gatherEffort(exam).then(setData).catch(() => setData({ effort: { minutes: 0, days: 0, firstDaysBefore: null, last48Share: 0, sessionsDone: 0, sessionsTotal: 0, cardReviews: 0, quizzes: 0, bestQuiz: null, lastQuiz: null, recalls: 0 }, target: null, history: [], gradeMax: 5 }));
    findGrade(exam.subject_id ?? null, exam.title).then((g) => setHasGrade(!!g || !exam.subject_id)).catch(() => setHasGrade(true));
  }, [exam?.id]);

  const parsed = parseScore(scoreText, data?.gradeMax ?? 5);
  const v: Verdict | null = useMemo(() => (parsed && data ? verdict(parsed.score, parsed.max, data.target != null ? data.target * (parsed.max / (data.gradeMax || 5)) : null, data.effort, data.history) : null), [parsed?.score, parsed?.max, data]);
  const tips = v ? changeSuggestions(v.reasons, mine) : [];
  if (!exam) return null;
  const d = dueDay(exam);
  const when = d ? `${DAY_LONG[d.getDay()]} ${d.getDate()}` : '';

  async function save(skipped = false) {
    if (!exam || !data) return;
    if (skipped && !(await confirm('¿No lo presentaste?', 'No se pide nota y no vuelve a preguntar por este parcial.', 'No lo presenté'))) return;
    setBusy(true);
    try {
      const w = Number(weightText.replace(',', '.'));
      await saveResult(exam, {
        score: skipped ? null : parsed?.score ?? null, max: parsed?.max ?? data.gradeMax, skipped, felt, reasons: mine,
        change, weight: Number.isFinite(w) && w > 0 && w <= 100 ? w : null, focusMin: data.effort.minutes,
      });
      toast(skipped ? 'Listo, no se vuelve a preguntar' : change.trim() ? 'Guardado. Te lo recuerdo al planear el próximo parcial.' : 'Guardado en Calificaciones', { tone: 'good' });
      dataChanged();
      onClose();
    } catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }

  const e = data?.effort;
  return (
    <Sheet visible={!!exam} onClose={onClose} title={`¿Cómo te fue en ${exam.title}?`} subtitle={when ? `Fue el ${when}.` : undefined}
      footer={step === 'grade' ? <>
        <Button label="No lo presenté" kind="secondary" onPress={() => save(true)} disabled={!data || busy} style={{ flex: 1 }} />
        <Button label="Ver qué pasó" icon="analytics-outline" onPress={() => setStep('result')} disabled={!parsed || !data} style={{ flex: 2 }} />
      </> : <>
        <Button label="Atrás" kind="secondary" onPress={() => setStep('grade')} style={{ flex: 1 }} />
        <Button label="Guardar" icon="checkmark" onPress={() => save(false)} busy={busy} style={{ flex: 2 }} />
      </>}>
      {step === 'grade' ? (
        <View style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>Tu nota</Text>
            <TextInput value={scoreText} onChangeText={setScoreText} placeholder={`Ej: 4,2 (sobre ${fmtGrade(data?.gradeMax ?? 5)}) o 38/50`} placeholderTextColor={C.muted}
              keyboardType="decimal-pad" accessibilityLabel="Tu nota" autoFocus style={field} />
            {!!scoreText && !parsed && <Text style={{ color: C.badText, fontSize: 12.5 }}>Escribe una nota entre 0 y {fmtGrade(data?.gradeMax ?? 5)}, o con su escala (38/50).</Text>}
          </View>
          {!hasGrade && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>¿Cuánto vale en la materia? <Text style={{ color: C.muted, fontWeight: '400' }}>(opcional)</Text></Text>
              <TextInput value={weightText} onChangeText={setWeightText} placeholder="Ej: 25 (%)" placeholderTextColor={C.muted} keyboardType="decimal-pad" accessibilityLabel="Peso en porcentaje" style={[...field, { maxWidth: 140 }]} />
              <Text style={{ color: C.muted, fontSize: 12 }}>Se agrega a Calificaciones para calcular tu promedio.</Text>
            </View>
          )}
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>¿Qué tan preparado te sentiste?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup">
              {FELT.map((l, i) => (
                <Pressable key={l} onPress={() => setFelt(felt === i + 1 ? null : i + 1)} accessibilityRole="radio" accessibilityState={{ checked: felt === i + 1 }}
                  style={{ paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', borderRadius: 99, borderWidth: 1, borderColor: felt === i + 1 ? C.brand : C.line, backgroundColor: felt === i + 1 ? C.brand : 'transparent' }}>
                  <Text style={{ color: felt === i + 1 ? C.onBrand : C.text, fontSize: 13, fontWeight: '600' }}>{l}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {!data && <ActivityIndicator color={C.brand} />}
        </View>
      ) : v && e && parsed && data ? (
        <View style={{ gap: 16 }}>
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: (v.reached ? C.good : C.warn) + '1f', borderWidth: 1, borderColor: (v.reached ? C.good : C.warn) + '66', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name={v.reached ? 'checkmark-circle' : 'alert-circle'} size={24} color={v.reached ? C.goodText : C.warnText} />
              <Text style={{ color: C.text, fontSize: 17, fontWeight: '800', flex: 1 }}>{v.headline}</Text>
              <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{fmtGrade(parsed.score)}<Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}> / {fmtGrade(parsed.max)}</Text></Text>
            </View>
            <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 19 }}>{v.detail}</Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Stat label="Enfoque" value={fmtHours(e.minutes)} />
            <Stat label="Días distintos" value={String(e.days)} />
            <Stat label="Empezaste" value={e.firstDaysBefore == null ? '—' : e.firstDaysBefore === 0 ? 'el mismo día' : `${e.firstDaysBefore} ${e.firstDaysBefore === 1 ? 'día' : 'días'} antes`} />
            <Stat label="Últimas 48 h" value={e.minutes ? `${Math.round(e.last48Share * 100)} %` : '—'} />
            {e.sessionsTotal > 0 && <Stat label="Plan" value={`${e.sessionsDone} de ${e.sessionsTotal}`} />}
            <Stat label="Tarjetas" value={String(e.cardReviews)} />
            <Stat label="Simulacros" value={e.quizzes ? `${e.quizzes}${e.bestQuiz != null ? ` · ${Math.round(e.bestQuiz)} %` : ''}` : '0'} />
          </View>

          <HoursChart points={chartPoints(data.history, { focus_min: e.minutes, pct: v.pct, title: exam.title })} targetPct={v.targetPct} />

          {v.reasons.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>{v.reached ? 'Lo que se ve en los datos' : 'Por qué, según los datos'}</Text>
              {v.reasons.map((r) => (
                <View key={r.key + r.tone} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Ionicons name={r.tone === 'good' ? 'checkmark' : 'close'} size={16} color={r.tone === 'good' ? C.goodText : C.badText} style={{ marginTop: 2 }} />
                  <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 19, flex: 1 }}>{r.text}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>¿Qué más pasó? <Text style={{ color: C.muted, fontWeight: '400', fontSize: 12.5 }}>Lo que los datos no ven</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {MY_REASONS.map((r) => {
                const on = mine.includes(r.key);
                return (
                  <Pressable key={r.key} onPress={() => setMine(on ? mine.filter((x) => x !== r.key) : [...mine, r.key])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    style={{ paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand + '22' : 'transparent' }}>
                    <Text style={{ color: C.text, fontSize: 13 }}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>{v.reached ? '¿Algo que repetirías o cambiarías?' : '¿Qué harás distinto la próxima vez?'}</Text>
            <TextInput value={change} onChangeText={setChange} maxLength={300} placeholder="Una frase. Te la recuerdo al planear el próximo parcial." placeholderTextColor={C.muted}
              accessibilityLabel="Qué harás distinto" style={field} />
            {tips.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {tips.map((t) => (
                  <Pressable key={t} onPress={() => setChange(t)} accessibilityRole="button" accessibilityLabel={`Usar: ${t}`}
                    style={({ hovered }: any) => ({ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: hovered ? C.surface2 : C.surface, borderWidth: 1, borderColor: C.line })}>
                    <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '600' }}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      ) : <ActivityIndicator color={C.brand} />}
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 104, flexGrow: 1, flexBasis: 104, padding: 10, borderRadius: 12, backgroundColor: C.surface2 }}>
      <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '700' }}>{label.toUpperCase()}</Text>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', marginTop: 2 }}>{value}</Text>
    </View>
  );
}

/** Horas de enfoque contra nota (%) de tus parciales. */
export function HoursChart({ points, targetPct, caption, title = 'Tus parciales: horas y nota' }: { points: { x: number; y: number; title: string; current: boolean }[]; targetPct: number; caption?: string; title?: string | null }) {
  const [w, setW] = useState(0);
  if (points.length < 2) return null;
  const H = 150, padL = 38, padB = 22;
  const maxX = Math.max(1, Math.ceil(Math.max(...points.map((p) => p.x)) * 1.15));
  const X = (x: number) => padL + (x / maxX) * Math.max(1, w - padL - 10);
  const Y = (y: number) => 8 + (1 - y / 100) * (H - padB - 8);
  return (
    <View style={{ gap: 6 }}>
      {!!title && <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>{title}</Text>}
      <View onLayout={(ev) => setW(ev.nativeEvent.layout.width)} style={{ height: H, borderRadius: 12, backgroundColor: C.surface2, overflow: 'hidden' }}
        accessibilityLabel={`Gráfica de ${points.length} parciales: horas de enfoque y nota`}>
        {w > 0 && <>
          {[0, 50, 100].map((g) => (
            <View key={g} style={{ position: 'absolute', left: padL, right: 10, top: Y(g), height: 1, backgroundColor: C.line }}>
              <Text numberOfLines={1} style={{ position: 'absolute', left: -33, top: -7, color: C.muted, fontSize: 10, width: 30, textAlign: 'right' }}>{g}%</Text>
            </View>
          ))}
          <View style={{ position: 'absolute', left: padL, right: 10, top: Y(targetPct), borderTopWidth: 1, borderStyle: 'dashed', borderColor: C.goodText }} />
          {[0, Math.round(maxX / 2), maxX].map((h) => (
            <Text key={h} style={{ position: 'absolute', left: X(h) - 14, bottom: 4, width: 28, textAlign: 'center', color: C.muted, fontSize: 10 }}>{h} h</Text>
          ))}
          {points.map((p, i) => (
            <View key={i} accessibilityLabel={`${p.title}: ${Math.round(p.x * 10) / 10} h, ${Math.round(p.y)} %`}
              style={{ position: 'absolute', left: X(p.x) - (p.current ? 7 : 5), top: Y(p.y) - (p.current ? 7 : 5), width: p.current ? 14 : 10, height: p.current ? 14 : 10, borderRadius: 7,
                backgroundColor: p.current ? C.brand : C.muted, borderWidth: p.current ? 2 : 0, borderColor: C.surface }} />
          ))}
        </>}
      </View>
      <Text style={{ color: C.muted, fontSize: 11.5 }}>{caption ?? 'El punto grande es este parcial. La línea punteada es tu meta.'}</Text>
    </View>
  );
}

/** Tarjeta en Hoy: el parcial que ya pasó y no tiene nota. */
export function ExamReviewCard({ tasks }: { tasks: Task[] }) {
  const [pending, setPending] = useState<Task[]>([]);
  const ids = tasks.filter((t) => t.type === 'examen' || t.type === 'quiz').map((t) => `${t.id}:${t.due_date}`).join(',');
  const [tick, setTick] = useState(0);
  useEffect(() => onDataChanged(() => setTick((n) => n + 1)), []);
  useEffect(() => { pendingReviews(tasks).then(setPending).catch(() => {}); }, [ids, tick]);
  const t = pending[0];
  if (!t) return null;
  const d = dueDay(t);
  return (
    <Card style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderLeftWidth: 4, borderLeftColor: C.brand2 }}>
      <Ionicons name="school-outline" size={22} color={C.brand2} />
      <View style={{ flex: 1, minWidth: 180 }}>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>¿Cómo te fue en {t.title}?</Text>
        <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{d ? `Fue el ${DAY_LONG[d.getDay()]}. ` : ''}Pon la nota y mira si el esfuerzo alcanzó.</Text>
      </View>
      <Button label="Poner la nota" size="sm" onPress={() => openExamReview(t)} />
      <Button label="Ahora no" size="sm" kind="ghost" onPress={() => { dismissReview(t.id); setPending((p) => p.filter((x) => x.id !== t.id)); }} />
    </Card>
  );
}

/** En Calificaciones: tus parciales con horas, nota y lo que dijiste. */
export function ExamResultsList({ subjectId }: { subjectId: string }) {
  const [list, setList] = useState<ExamResult[] | null>(null);
  useEffect(() => { getResults(subjectId, 30).then(setList).catch(() => setList([])); }, [subjectId]);
  if (!list?.length) return null;
  const done = list.filter((r) => !r.skipped && r.score != null);
  return (
    <Card style={{ marginTop: 16, gap: 10 }}>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>Tus parciales: esfuerzo y nota</Text>
      <HoursChart points={chartPoints(done.slice(1), done[0] ? { focus_min: done[0].focus_min, pct: (Number(done[0].score) / Number(done[0].max_score)) * 100, title: done[0].title } : null)} targetPct={60} caption="El punto grande es el más reciente. La línea punteada es aprobar." title={null} />
      {list.map((r) => (
        <View key={r.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>{r.title}</Text>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>{r.skipped ? 'No lo presenté' : `${fmtGrade(Number(r.score))} / ${fmtGrade(Number(r.max_score))}`}</Text>
          </View>
          {!r.skipped && <Text style={{ color: C.muted, fontSize: 12.5 }}>{fmtHours(r.focus_min)} de enfoque{r.exam_date ? ` · ${r.exam_date.slice(8, 10)}/${r.exam_date.slice(5, 7)}` : ''}</Text>}
          {!!r.change && <Text style={{ color: C.text, fontSize: 12.5, fontStyle: 'italic' }}>Para la próxima: {r.change}</Text>}
        </View>
      ))}
    </Card>
  );
}
