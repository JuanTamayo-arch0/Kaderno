import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import { RequireAuth } from '../components/RequireAuth';
import { Subject, getSubjects } from '../lib/db';
import {
  getCards, getReviews, getStudyPrefs, examInfo, noteTitles as fetchTitles, newDoneToday, hasFsrsDb, FSRS_MISSING,
  type CardRow, type StudyPrefs,
} from '../lib/cardsDb';
import { buildQueue, cramQueue, interleave, forecast, secondsPerCard, estimateLabel, retentionPct, type ReviewStat } from '../lib/cards';
import { friendlyError } from '../lib/feedback';
import { Screen, Button, Card, Dot, EmptyState, IconButton, Segmented, Skeleton } from '../components/ds';
import { ReviewSession, type SessionMode, type SessionSummary } from '../components/cards/ReviewSession';
import { Decks, CardStats } from '../components/cards/Decks';
import { Sheet } from '../components/cards/CardForms';
import { StudySettings } from '../components/cards/StudySettings';

// ============================================================
//  Repaso (v20): FSRS, tarjetas nuevas poco a poco, sesión con pasos
//  cortos, intensivo antes del examen, mazos y estadísticas.
// ============================================================

type Tab = 'repasar' | 'mazos' | 'stats';
type Data = {
  cards: CardRow[]; reviews: ReviewStat[]; prefs: StudyPrefs; exams: Record<string, { days: number; title: string }>;
  titles: Record<string, string>; subjects: Subject[];
};
type Run = { mode: SessionMode; queue: CardRow[]; learning: CardRow[]; label: string } | null;

const DAY = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function Repaso() {
  const router = useRouter();
  const params = useLocalSearchParams<{ materia?: string; intensivo?: string }>();
  const { isWide } = useResponsive();
  const [tab, setTab] = useState<Tab>('repasar');
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [run, setRun] = useState<Run>(null);
  const [result, setResult] = useState<(SessionSummary & { left: number }) | null>(null);
  const [settings, setSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cards, reviews, prefs, exams, subjects] = await Promise.all([getCards(), getReviews(90), getStudyPrefs(), examInfo().catch(() => ({})), getSubjects().catch(() => [])]);
      const titles = await fetchTitles(cards.map((c) => c.note_id ?? '')).catch(() => ({}));
      setData({ cards, reviews, prefs, exams, titles, subjects });
      setErr(null);
    } catch (e) { setErr(friendlyError(e)); setData((d) => d ?? null); }
  }, []);
  useFocusEffect(useCallback(() => { if (!run) load(); }, [load, run]));

  const now = new Date();
  const queue = useMemo(() => data ? buildQueue({
    cards: data.cards, now, newPerDay: data.prefs.newPerDay, newDoneToday: newDoneToday(data.reviews),
    examDays: Object.fromEntries(Object.entries(data.exams).map(([k, v]) => [k, v.days])),
  }) : null, [data]);

  const start = (mode: SessionMode, subjectId?: string) => {
    if (!data || !queue) return;
    setResult(null);
    if (mode === 'cram' && subjectId) {
      const q = cramQueue(data.cards, subjectId);
      setRun({ mode, queue: q, learning: [], label: `Intensivo de ${data.subjects.find((s) => s.id === subjectId)?.name ?? 'la materia'}` });
      return;
    }
    const q = subjectId ? buildQueue({ cards: data.cards, now: new Date(), newPerDay: data.prefs.newPerDay, newDoneToday: newDoneToday(data.reviews), subjectId }) : queue;
    setRun({ mode, queue: interleave(q.due, q.fresh), learning: q.learning, label: subjectId ? (data.subjects.find((s) => s.id === subjectId)?.name ?? 'Mazo') : 'Repaso' });
  };

  // Abrir directo un intensivo (desde el plan del parcial, por ejemplo).
  const autoStarted = React.useRef(false);
  React.useEffect(() => {
    if (!data || autoStarted.current || !params.materia) return;
    autoStarted.current = true;
    start(params.intensivo === '1' ? 'cram' : 'normal', params.materia);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Segmented value={tab} onChange={(t) => { setTab(t); }} items={[
          { key: 'repasar', label: 'Repasar', icon: 'flash-outline' },
          { key: 'mazos', label: 'Mazos', icon: 'albums-outline' },
          { key: 'stats', label: 'Estadísticas', icon: 'stats-chart-outline' },
        ]} />
      </View>
      <IconButton icon="options-outline" label="Ajustes de repaso" onPress={() => setSettings(true)} />
    </View>
  );

  let body: React.ReactNode;
  if (!data) body = err ? <EmptyState icon="cloud-offline-outline" title="No se pudo cargar" text={err} action={{ label: 'Reintentar', onPress: load }} /> : <Skeleton height={280} />;
  else if (tab === 'mazos') body = <Decks cards={data.cards} subjects={data.subjects} noteTitles={data.titles} retention={data.prefs.retention} onChanged={load} />;
  else if (tab === 'stats') body = <CardStats cards={data.cards} reviews={data.reviews} />;
  else if (run) {
    body = (
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{run.label}{run.mode === 'five' ? ' · 5 minutos' : ''}</Text>
          <Button label="Terminar" kind="ghost" size="sm" onPress={() => { setRun(null); load(); }} />
        </View>
        <ReviewSession key={run.label + run.mode} queue={run.queue} learning={run.learning} mode={run.mode} retention={data.prefs.retention}
          typeAnswer={data.prefs.typeAnswer} subjects={data.subjects} noteTitles={data.titles}
          onFinish={(s, left) => { setRun(null); setResult({ ...s, left }); load(); }} />
      </View>
    );
  } else body = <Home data={data} queue={queue!} result={result} onStart={start} onDismiss={() => setResult(null)} onCreate={() => router.push('/materias')} wide={isWide} />;

  return (
    <Screen title="Repaso" back="/estudiar" nav="repaso" maxWidth={820} header={header}>
      <View style={{ height: 14 }} />
      {!hasFsrsDb() && data && (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#2a2416', borderWidth: 1, borderColor: '#4a3d1f', marginBottom: 12 }}>
          <Text style={{ color: '#e2d2a8', fontSize: 13 }}>{FSRS_MISSING} Mientras tanto, el repaso funciona como antes.</Text>
        </View>
      )}
      {body}
      <Sheet visible={settings} onClose={() => setSettings(false)} title="Ajustes de repaso">
        <View style={{ marginHorizontal: -14 }}>
          <StudySettings onChange={(p) => setData((d) => (d ? { ...d, prefs: p } : d))} />
        </View>
      </Sheet>
    </Screen>
  );
}

function Home({ data, queue, result, onStart, onDismiss, onCreate, wide }: {
  data: Data; queue: ReturnType<typeof buildQueue>; result: (SessionSummary & { left: number }) | null;
  onStart: (m: SessionMode, subjectId?: string) => void; onDismiss: () => void; onCreate: () => void; wide: boolean;
}) {
  const now = new Date();
  const secs = secondsPerCard(data.reviews);
  const total = queue.counts.due + queue.counts.fresh + queue.counts.learning;
  const fc = forecast(data.cards, now, 8);
  const tomorrow = fc[1]?.n ?? 0;
  const maxF = Math.max(5, ...fc.slice(1).map((x) => x.n));
  // Examen cercano con tarjetas: intensivo.
  const exam = Object.entries(data.exams)
    .filter(([sid, e]) => e.days <= 7 && data.cards.some((c) => c.subject_id === sid && !c.suspended))
    .sort((a, b) => a[1].days - b[1].days)[0];
  // Mazos por materia.
  const decks = data.subjects.map((s) => {
    const mine = data.cards.filter((c) => c.subject_id === s.id && !c.suspended);
    if (!mine.length) return null;
    const ids = new Set(mine.map((c) => c.id));
    const ret = retentionPct(data.reviews.filter((r) => r.card_id && ids.has(r.card_id)), now.getTime() - 30 * 86_400_000);
    return {
      s, total: mine.length, ret,
      fresh: queue.fresh.filter((c) => c.subject_id === s.id).length,
      due: queue.due.filter((c) => c.subject_id === s.id).length + queue.learning.filter((c) => c.subject_id === s.id).length,
    };
  }).filter(Boolean) as { s: Subject; total: number; ret: number | null; fresh: number; due: number }[];
  const noSubject = data.cards.filter((c) => !c.subject_id && !c.suspended).length;

  return (
    <View style={{ gap: 14 }}>
      {result && (
        <Card style={{ borderColor: '#22604a', backgroundColor: '#142a22' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="checkmark-done" size={22} color={C.goodText} />
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{result.cards ? 'Repaso terminado' : 'Sin tarjetas por ahora'}</Text>
            <IconButton icon="close" label="Cerrar resumen" onPress={onDismiss} />
          </View>
          {result.cards > 0 && (
            <Text style={{ color: '#b9dccb', fontSize: 13.5, marginTop: 6, lineHeight: 19 }}>
              {result.cards} {result.cards === 1 ? 'tarjeta' : 'tarjetas'} en {Math.max(1, Math.round(result.ms / 60000))} min. Recordaste {Math.round((result.recalled / result.cards) * 100)}%.
              {result.left ? ` Quedan ${result.left} para más tarde.` : ''} Mañana te tocan {tomorrow}.
            </Text>
          )}
        </Card>
      )}

      {exam && (
        <Card style={{ borderColor: '#4a3d1f', backgroundColor: '#2a2416' }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>
                {exam[1].title} de {data.subjects.find((s) => s.id === exam[0])?.name ?? 'una materia'} {exam[1].days === 0 ? 'hoy' : exam[1].days === 1 ? 'mañana' : `en ${exam[1].days} días`}
              </Text>
              <Text style={{ color: '#e2d2a8', fontSize: 13 }}>Repaso intensivo: todas las tarjetas de la materia, aunque no les toque. Solo las que falles cambian su programación.</Text>
            </View>
            <Button label="Repaso intensivo" icon="flame-outline" onPress={() => onStart('cram', exam[0])} />
          </View>
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Big n={queue.counts.fresh} label="Nuevas" color={C.brand} hint={`máx. ${data.prefs.newPerDay} al día`} />
          <Big n={queue.counts.due} label="Para repasar" color={C.goodText} />
          <Big n={queue.counts.learning} label="Aprendiendo" color={C.warnText} />
        </View>
        {total > 0 ? (
          <>
            <Text style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>{total} {total === 1 ? 'tarjeta' : 'tarjetas'} hoy, {estimateLabel(total, secs)}.</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <Button label="Empezar" icon="play" size="lg" onPress={() => onStart('normal')} style={{ flex: 2, minWidth: 160 }} />
              <Button label="Solo 5 minutos" kind="secondary" size="lg" onPress={() => onStart('five')} style={{ flex: 1, minWidth: 150 }} />
            </View>
          </>
        ) : (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{data.cards.length ? `Al día. Mañana te tocan ${tomorrow}.` : 'Todavía no tienes tarjetas.'}</Text>
            <Text style={{ color: C.muted, fontSize: 13 }}>Crea tarjetas desde una nota con "Crear flashcards" o seleccionando un fragmento.</Text>
            <Button label="Ir a mis notas" kind="secondary" icon="document-text-outline" onPress={onCreate} style={{ alignSelf: 'flex-start' }} />
          </View>
        )}
      </Card>

      {decks.length > 0 && (
        <Card padded={false}>
          <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', padding: 14, paddingBottom: 6 }}>Mazos</Text>
          {decks.map((d) => (
            <Pressable key={d.s.id} onPress={() => (d.fresh + d.due ? onStart('normal', d.s.id) : undefined)} accessibilityRole="button"
              accessibilityLabel={`${d.s.name}: ${d.fresh} nuevas, ${d.due} para repasar`}
              style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.surface2, backgroundColor: hovered && d.fresh + d.due ? C.surface2 : 'transparent' })}>
              <Dot color={d.s.color} size={10} />
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{d.s.name}</Text>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' }}>
                  <View style={{ width: `${d.ret ?? 0}%`, height: 5, backgroundColor: (d.ret ?? 0) >= 85 ? C.good : (d.ret ?? 0) >= 70 ? C.warn : C.bad }} />
                </View>
              </View>
              <Text style={{ color: C.brand, fontSize: 13, fontWeight: '800', width: 34, textAlign: 'right' }}>{d.fresh || ''}</Text>
              <Text style={{ color: C.goodText, fontSize: 13, fontWeight: '800', width: 34, textAlign: 'right' }}>{d.due || ''}</Text>
              <Text style={{ color: C.muted, fontSize: 12, width: 64, textAlign: 'right' }}>{d.ret === null ? `${d.total}` : `${d.ret}%`}</Text>
            </Pressable>
          ))}
          <Text style={{ color: C.muted, fontSize: 11.5, paddingHorizontal: 14, paddingVertical: 10 }}>
            Azul: nuevas de hoy · Verde: para repasar · La barra es cuánto recordaste en 30 días.{noSubject ? ` ${noSubject} sin materia.` : ''}
          </Text>
        </Card>
      )}

      {data.cards.length > 0 && (
        <Card>
          <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', marginBottom: 12 }}>Los próximos 7 días</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {fc.slice(1).map((x) => {
              const d = new Date(x.day + 'T12:00:00');
              return (
                <View key={x.day} style={{ flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }} accessibilityLabel={`${DAY[d.getDay()]}: ${x.n} tarjetas`}>
                  {x.n > 0 && <Text style={{ fontSize: 10.5, color: C.muted }}>{x.n}</Text>}
                  <View style={{ width: '62%', height: `${Math.max(3, (x.n / maxF) * 70)}%`, backgroundColor: C.line, borderRadius: 5 }} />
                  <Text style={{ fontSize: 11, color: C.muted }}>{DAY[d.getDay()]}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      )}
    </View>
  );
}

function Big({ n, label, color, hint }: { n: number; label: string; color: string; hint?: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: C.surface2 }}>
      <Text style={{ color, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{n}</Text>
      <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
      {!!hint && <Text style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>{hint}</Text>}
    </View>
  );
}

export default function RepasoProtegida() {
  return <RequireAuth><Repaso /></RequireAuth>;
}

