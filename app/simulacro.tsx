import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import { RequireAuth } from '../components/RequireAuth';
import { Screen, Button, Card, EmptyState, Toggle } from '../components/ds';
import { SubjectPicker } from '../components/SubjectPicker';
import { CardText } from '../components/cards/CardText';
import { useCardMaker } from '../components/cards/CardMaker';
import { getSubjects, getNotes, getGrades, toggleTask, type Subject, type Note } from '../lib/db';
import { aiQuiz, aiGrade, saveQuiz, getQuizzes, nextExamOf, type QuizRow } from '../lib/quizDb';
import {
  pickNotes, autoGrade, scoreQuiz, toScale, fmtGrade, byNote, errorsOf, errorDrafts, correctText, givenText,
  cycleVerdict, prepText, fmtClock, SECONDS_PER_Q, type QuizQuestion, type QuizAnswer, type Verdict,
} from '../lib/quiz';
import { toast, notify, friendlyError, confirm } from '../lib/feedback';
import { streakChanged, dataChanged } from '../lib/uiBus';
import { refreshNavCounts } from '../lib/navCounts';
import { getGoal } from '../lib/ritualsDb';
import { t } from '../lib/i18n';

// ============================================================
//  Simulacro (v20, sección H): preguntas de tus notas, mezcla de opción
//  múltiple, respuesta corta y problemas; nota en la escala de la materia,
//  desglose por nota y errores convertibles en tarjetas.
// ============================================================

type Phase = 'config' | 'loading' | 'answer' | 'grading' | 'result';
const COUNTS = [5, 10, 20];
const VERDICT: Record<Verdict, { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  ok: { label: t('Correcta'), color: C.good, icon: 'checkmark-circle' },
  partial: { label: t('A medias'), color: C.warn, icon: 'remove-circle' },
  wrong: { label: t('Incorrecta'), color: C.bad, icon: 'close-circle' },
  skip: { label: t('Sin responder'), color: C.muted, icon: 'ellipse-outline' },
};

function Simulacro() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const params = useLocalSearchParams<{ materia?: string; examen?: string; sesion?: string }>();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(params.materia || null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [count, setCount] = useState(10);
  const [timed, setTimed] = useState(false);
  const [scale, setScale] = useState(5);
  const [history, setHistory] = useState<QuizRow[]>([]);
  const [examId, setExamId] = useState<string | null>(params.examen || null);
  const [target, setTarget] = useState<number | null>(null);

  const [phase, setPhase] = useState<Phase>('config');
  const [qs, setQs] = useState<QuizQuestion[]>([]);
  const [used, setUsed] = useState<{ id: string; title: string }[]>([]);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [quizId, setQuizId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const maker = useCardMaker();
  const finishing = useRef(false);
  // Las respuestas también en una ref: terminar (por botón o por tiempo) lee siempre lo último.
  const ansRef = useRef<QuizAnswer[]>([]);
  const putAnswers = (a: QuizAnswer[]) => { ansRef.current = a; setAnswers(a); };

  useEffect(() => { getSubjects().then(setSubjects).catch(() => {}); }, []);
  useEffect(() => {
    if (!subjectId) { setNotes(null); return; }
    setNotes(null); setSelected(null);
    getNotes(subjectId).then(setNotes).catch(() => setNotes([]));
    getGrades(subjectId).then((g) => setScale(g[0]?.max_score ?? 5)).catch(() => {});
    getQuizzes(subjectId, 5).then(setHistory).catch(() => {});
    getGoal(subjectId).then((g) => setTarget(g?.target_grade != null ? Number(g.target_grade) : null)).catch(() => {});
    if (!params.examen) nextExamOf(subjectId).then((t) => setExamId(t?.id ?? null)).catch(() => {});
  }, [subjectId]);

  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const usable = useMemo(() => (notes ?? []).filter((n) => (n.content ?? '').trim().length >= 40), [notes]);
  const limit = timed ? qs.length * SECONDS_PER_Q : 0;
  const left = timed && phase === 'answer' ? Math.max(0, limit - Math.floor((now - startedAt) / 1000)) : 0;

  // Reloj (solo con tiempo).
  useEffect(() => {
    if (phase !== 'answer' || !timed) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase, timed]);
  useEffect(() => { if (phase === 'answer' && timed && left === 0 && startedAt) finish(); }, [left]);

  async function start() {
    if (!subjectId) { toast(t('Elige una materia.')); return; }
    const picked = pickNotes(usable, selected);
    if (!picked.length) { notify(t('No hay notas para preguntar'), t('Escribe o digitaliza tus apuntes de esta materia primero.')); return; }
    setPhase('loading');
    try {
      const q = await aiQuiz(picked.map((n) => ({ title: n.title, content: n.content })), count, subject?.name ?? null);
      setQs(q); setUsed(picked.map((n) => ({ id: n.id, title: n.title })));
      putAnswers(q.map(() => ({ given: null, verdict: null })));
      setIdx(0); setDraft(''); setQuizId(null); finishing.current = false;
      setStartedAt(Date.now()); setNow(Date.now());
      setPhase('answer');
    } catch (e) { notify(t('No se pudo armar el simulacro'), friendlyError(e)); setPhase('config'); }
  }

  const setGiven = (i: number, given: string | number | null) => putAnswers(ansRef.current.map((x, j) => (j === i ? { ...x, given } : x)));
  function next(skip = false) {
    const q = qs[idx];
    if (q && q.type !== 'mc') setGiven(idx, skip ? null : draft.trim() || null);
    if (q && q.type === 'mc' && skip) setGiven(idx, null);
    if (idx + 1 >= qs.length) { finish(); return; }
    const nq = qs[idx + 1];
    const na = ansRef.current[idx + 1];
    setDraft(nq.type !== 'mc' && na?.given != null ? String(na.given) : '');
    setIdx(idx + 1);
  }

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    const secs = Math.round((Date.now() - startedAt) / 1000);
    setDuration(secs);
    setPhase('grading');
    // Si se terminó por tiempo, lo que estaba escrito en la pregunta abierta también cuenta.
    const q0 = qs[idx];
    if (q0 && q0.type !== 'mc' && draft.trim() && ansRef.current[idx]?.given == null) setGiven(idx, draft.trim());
    const current = ansRef.current;
    const graded: QuizAnswer[] = current.map((a, i) => {
      const v = autoGrade(qs[i], a.given);
      return v ? { ...a, verdict: v, by: 'auto' } : { ...a, verdict: null };
    });
    const pending = graded.map((a, i) => (a.verdict == null ? i : -1)).filter((i) => i >= 0);
    if (pending.length) {
      try {
        const res = await aiGrade(pending.map((i) => ({ q: qs[i].q, expected: correctText(qs[i]), given: String(graded[i].given ?? '') })));
        pending.forEach((i, k) => {
          const r = res[k];
          graded[i] = r ? { ...graded[i], verdict: r.verdict, why: r.why, by: 'ai' } : { ...graded[i], verdict: 'wrong', why: t('No se pudo corregir con IA: revísala tú y cambia el veredicto si estaba bien.'), by: 'user' };
        });
      } catch (e) {
        pending.forEach((i) => { graded[i] = { ...graded[i], verdict: 'wrong', why: t('No se pudo corregir con IA: revísala tú y cambia el veredicto si estaba bien.'), by: 'user' }; });
        toast(friendlyError(e), { tone: 'bad' });
      }
    }
    putAnswers(graded);
    const { pct } = scoreQuiz(graded, qs.length);
    try {
      const id = await saveQuiz({
        subject_id: subjectId, exam_task_id: examId, note_ids: used.map((n) => n.id), questions: qs, answers: graded,
        score: toScale(pct, scale), scale, pct, duration_sec: secs,
      });
      setQuizId(id);
      streakChanged();
    } catch (e) { toast(t('No se pudo guardar el simulacro: ') + friendlyError(e), { tone: 'bad' }); }
    if (params.sesion) {
      toggleTask(params.sesion, true).then(() => { dataChanged(); refreshNavCounts(true); }).catch(() => {});
    }
    getQuizzes(subjectId, 5).then(setHistory).catch(() => {});
    setPhase('result');
  }, [qs, idx, draft, startedAt, subjectId, examId, used, scale, params.sesion]);

  async function changeVerdict(i: number) {
    const nextA = ansRef.current.map((a, j) => (j === i ? { ...a, verdict: cycleVerdict(a.verdict), by: 'user' as const } : a));
    putAnswers(nextA);
    const { pct } = scoreQuiz(nextA, qs.length);
    if (quizId) saveQuiz({ subject_id: subjectId, exam_task_id: examId, note_ids: [], questions: qs, answers: nextA, score: toScale(pct, scale), scale, pct, duration_sec: duration }, quizId).catch(() => {});
  }

  // Teclado en web: 1 a 4 eligen, Enter sigue.
  useEffect(() => {
    if (Platform.OS !== 'web' || phase !== 'answer' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => {
      const q = qs[idx]; if (!q) return;
      const typing = (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT';
      if (q.type === 'mc' && !typing && ['1', '2', '3', '4'].includes(e.key)) { setGiven(idx, Number(e.key) - 1); e.preventDefault(); }
      if (e.key === 'Enter' && !e.shiftKey && (q.type === 'mc' || !typing)) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  async function leave() {
    if (phase === 'answer' && !(await confirm(t('¿Salir del simulacro?'), t('Se pierden las respuestas.'), t('Salir')))) return;
    router.back();
  }

  // ---------- Pantallas ----------
  if (phase === 'loading' || phase === 'grading') {
    return (
      <Screen title={t('Simulacro')} back nav={null} maxWidth={760}>
        <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 40 }}>
          <ActivityIndicator color={C.brand} size="large" />
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{phase === 'loading' ? t('Armando tus preguntas…') : t('Corrigiendo…')}</Text>
          <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>{phase === 'loading' ? t('Salen de tus notas. Toma unos segundos.') : t('La opción múltiple ya está; las respuestas escritas las revisa la IA.')}</Text>
        </Card>
      </Screen>
    );
  }

  if (phase === 'answer') {
    const q = qs[idx];
    const a = answers[idx];
    return (
      <Screen title={t('Simulacro')} nav={null} maxWidth={760} right={<Button label={t('Salir')} kind="ghost" size="sm" onPress={leave} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' }}>
            <View style={{ width: `${((idx + 1) / qs.length) * 100}%`, height: '100%', backgroundColor: C.brand }} />
          </View>
          <Text style={{ color: C.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>{t('{v} de {length}', { v: idx + 1, length: qs.length })}</Text>
          {timed && <Text style={{ color: left < 60 ? C.badText : C.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }} accessibilityLabel={`Quedan ${fmtClock(left)}`}>{fmtClock(left)}</Text>}
        </View>
        <Card style={{ gap: 16, padding: isWide ? 24 : 16 }}>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {q.type === 'mc' ? t('Opción múltiple') : q.type === 'num' ? t('Problema') : t('Respuesta corta')}{q.note != null && used[q.note] ? ` · ${used[q.note].title}` : ''}
          </Text>
          <CardText text={q.q} size={18} align="left" />
          {q.type === 'mc' ? (
            <View style={{ gap: 8 }} accessibilityRole="radiogroup">
              {q.options!.map((o, i) => {
                const on = a?.given === i;
                return (
                  <Pressable key={i} onPress={() => setGiven(idx, i)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand + '18' : hovered ? C.surface2 : 'transparent' })}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: on ? C.onBrand : C.muted, fontWeight: '800', fontSize: 12.5 }}>{'ABCD'[i]}</Text>
                    </View>
                    <View style={{ flex: 1 }}><CardText text={o} size={15} align="left" /></View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <TextInput value={draft} onChangeText={setDraft} multiline placeholder={q.type === 'num' ? t('Tu resultado, con unidades (puedes poner el procedimiento)') : t('Tu respuesta')} placeholderTextColor={C.muted}
              accessibilityLabel={t('Tu respuesta')} autoFocus={Platform.OS === 'web'}
              style={[{ minHeight: 110, textAlignVertical: 'top', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, color: C.text, padding: 12, fontSize: 15 }, Platform.OS === 'web' ? ({ outlineColor: C.brand } as any) : null]} />
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={t('Saltar')} kind="secondary" icon="play-skip-forward-outline" onPress={() => next(true)} style={{ flex: 1 }} />
            <Button label={idx + 1 >= qs.length ? t('Terminar') : t('Siguiente')} icon={idx + 1 >= qs.length ? 'checkmark' : 'arrow-forward'} onPress={() => next()} style={{ flex: 2 }}
              disabled={q.type === 'mc' ? a?.given == null : !draft.trim()} />
          </View>
        </Card>
      </Screen>
    );
  }

  if (phase === 'result') {
    const { pct } = scoreQuiz(answers, qs.length);
    const grade = toScale(pct, scale);
    const errs = errorsOf(answers, qs.length);
    const notesRows = byNote(qs, answers, used);
    const prev = history.filter((h) => h.id !== quizId && h.score != null)[0];
    return (
      <Screen title={t('Resultado del simulacro')} back nav={null} maxWidth={860}>
        <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 14 }}>
          <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 22 }}>
            <Text style={{ color: C.muted, fontSize: 13 }}>{subject?.name ?? t('Simulacro')}</Text>
            <Text style={{ color: grade / scale >= 0.6 ? C.goodText : C.badText, fontSize: 44, fontWeight: '800' }} accessibilityLabel={t('Nota {grade}', { grade: fmtGrade(grade, scale) })}>{fmtGrade(grade, scale)}</Text>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{t('{pct}% · {v} de {length} bien · {duration}', { pct, v: qs.length - errs.length, length: qs.length, duration: fmtClock(duration) })}</Text>
            {prev && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 6 }}>{t('Antes: {fmtGrade}', { fmtGrade: fmtGrade(Number(prev.score), Number(prev.scale) || scale) })}</Text>}
            {target != null && <Text style={{ color: grade >= target ? C.goodText : C.muted, fontSize: 12.5, marginTop: 2 }}>{t('Tu meta: {v}{v2}', { v: fmtGrade(target, scale).split(' / ')[0], v2: grade >= target ? t(' · ¡la alcanzaste!') : '' })}</Text>}
          </Card>
          <Card style={{ flex: 1, gap: 10 }}>
            <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }}>{t('Por nota')}</Text>
            {notesRows.map((r, i) => (
              <Pressable key={i} disabled={!r.id} onPress={() => r.id && router.push(`/nota/${r.id}`)} accessibilityRole="link" style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ color: C.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{r.title}</Text>
                  <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('{replace} de {total}', { replace: String(r.points).replace('.', ','), total: r.total })}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' }}>
                  <View style={{ width: `${(r.points / r.total) * 100}%`, height: '100%', backgroundColor: r.points / r.total >= 0.6 ? C.good : C.warn }} />
                </View>
              </Pressable>
            ))}
          </Card>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {errs.length > 0 && <Button label={t('Convertir {length} {v} en tarjetas', { length: errs.length, v: errs.length === 1 ? t('error') : t('errores') })} icon="albums-outline"
            onPress={() => maker.review(errorDrafts(qs, answers), { noteId: used.length === 1 ? used[0].id : null, subjectId, title: t('Errores del simulacro'), from: 'quiz' })} />}
          <Button label={t('Otro simulacro')} kind="secondary" icon="refresh" onPress={() => setPhase('config')} />
          <Button label={t('Listo')} kind="ghost" onPress={() => router.back()} />
        </View>

        <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', marginTop: 22, marginBottom: 8 }}>{errs.length ? t('Para repasar') : t('¡Todo bien!')}</Text>
        {qs.map((q, i) => {
          const a = answers[i];
          const v = a?.verdict ?? 'skip';
          if (v === 'ok' && errs.length) return null;
          const n = q.note != null ? used[q.note] : null;
          return (
            <Card key={i} style={{ marginBottom: 10, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '700' }}>{t('Pregunta {v}', { v: i + 1 })}</Text>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => q.type !== 'mc' && changeVerdict(i)} disabled={q.type === 'mc'} accessibilityRole="button"
                  accessibilityLabel={`${VERDICT[v].label}${q.type !== 'mc' ? t('. Toca para cambiar el veredicto') : ''}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: VERDICT[v].color + '22' }}>
                  <Ionicons name={VERDICT[v].icon} size={14} color={VERDICT[v].color} />
                  <Text style={{ color: VERDICT[v].color, fontSize: 12.5, fontWeight: '700' }}>{VERDICT[v].label}</Text>
                  {q.type !== 'mc' && <Ionicons name="swap-horizontal" size={12} color={VERDICT[v].color} />}
                </Pressable>
              </View>
              <CardText text={q.q} size={15} align="left" />
              <Text style={{ color: C.muted, fontSize: 13 }}>{t('Tu respuesta: ')}<Text style={{ color: C.text }}>{givenText(q, a)}</Text></Text>
              <Text style={{ color: C.muted, fontSize: 13 }}>{t('Correcta: ')}<Text style={{ color: C.goodText, fontWeight: '600' }}>{correctText(q)}</Text></Text>
              {!!(a?.why || q.explain) && <Text style={{ color: C.text, fontSize: 13, lineHeight: 19 }}>{a?.why ? a.why + ' ' : ''}{q.explain}</Text>}
              {n && (
                <Pressable onPress={() => router.push(`/nota/${n.id}`)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}>
                  <Ionicons name="document-text-outline" size={14} color={C.brand} />
                  <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>{t('Ver en la nota: {title}', { title: n.title })}</Text>
                </Pressable>
              )}
            </Card>
          );
        })}
        {maker.sheet}
      </Screen>
    );
  }

  // ---------- Configurar ----------
  const allOn = selected === null;
  const prep = prepText(history as any);
  return (
    <Screen title={t('Simulacro')} subtitle={t('Preguntas de tus notas, como en el parcial')} back nav={null} maxWidth={760}>
      <Card style={{ gap: 14 }}>
        <View>
          <Text style={lbl}>{t('Materia')}</Text>
          <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} allowNone={false} />
          {!!prep && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 6 }}>{prep}</Text>}
        </View>
        {subjectId && notes === null && <ActivityIndicator color={C.brand} />}
        {subjectId && notes !== null && usable.length === 0 && (
          <EmptyState compact icon="document-text-outline" title={t('No hay notas para preguntar')} text={t('Escribe o digitaliza tus apuntes de esta materia y vuelve.')} />
        )}
        {usable.length > 0 && (
          <View>
            <Text style={lbl}>{t('Notas')}</Text>
            <Pressable onPress={() => setSelected(allOn ? [] : null)} accessibilityRole="checkbox" accessibilityState={{ checked: allOn }} style={rowStyle}>
              <Ionicons name={allOn ? 'checkbox' : 'square-outline'} size={19} color={allOn ? C.brand : C.muted} />
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{t('Todas las notas ({length})', { length: usable.length })}</Text>
            </Pressable>
            {usable.slice(0, 40).map((n) => {
              const on = allOn || (selected ?? []).includes(n.id);
              return (
                <Pressable key={n.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[rowStyle, { paddingLeft: 26 }]}
                  onPress={() => {
                    const base = allOn ? usable.map((x) => x.id) : selected ?? [];
                    const nextSel = on ? base.filter((x) => x !== n.id) : [...base, n.id];
                    setSelected(nextSel.length === usable.length ? null : nextSel);
                  }}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={17} color={on ? C.brand : C.muted} />
                  <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>{n.title || t('Nota sin título')}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <View>
          <Text style={lbl}>{t('Preguntas')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
            {COUNTS.map((c) => (
              <Pressable key={c} onPress={() => setCount(c)} accessibilityRole="radio" accessibilityState={{ checked: count === c }}
                style={{ minWidth: 60, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 99, borderWidth: 1, borderColor: count === c ? C.brand : C.line, backgroundColor: count === c ? C.brand : 'transparent' }}>
                <Text style={{ color: count === c ? C.onBrand : C.text, fontWeight: '700' }}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ marginHorizontal: -14 }}>
          <Toggle label={t('Con tiempo')} hint={t('1,5 min por pregunta ({fmtClock} en total).', { fmtClock: fmtClock(count * SECONDS_PER_Q) })} value={timed} onChange={setTimed} />
        </View>
        <Button label={t('Empezar simulacro')} icon="play" size="lg" onPress={start} disabled={!subjectId || usable.length === 0 || selected?.length === 0} />
        <Text style={{ color: C.muted, fontSize: 12 }}>{t('Máximo 5 simulacros por día. La opción múltiple se corrige al instante; las respuestas escritas las corrige la IA y puedes cambiar su veredicto.')}</Text>
      </Card>
    </Screen>
  );
}

const lbl = { color: C.muted, fontSize: 12.5, fontWeight: '600' as const, marginBottom: 8 };
const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 8, minHeight: 40 };

export default function SimulacroProtegido() {
  return <RequireAuth><Simulacro /></RequireAuth>;
}
