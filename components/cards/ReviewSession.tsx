import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import type { Subject } from '../../lib/db';
import { answerCard, undoAnswer, updateCard, setSuspended, hasFsrsDb, type Answered, type CardRow } from '../../lib/cardsDb';
import { preview, stateOf, dueOf, type CardRating } from '../../lib/fsrs';
import { nextLabel } from '../../lib/srs';
import { toast, friendlyError } from '../../lib/feedback';
import { refreshNavCounts } from '../../lib/navCounts';
import { refreshCoinsSoon, emitPetEvent } from '../../lib/pets/store';
import { Button, Dot } from '../ds';
import { Kbd } from '../SideNav';
import { CardText } from './CardText';
import { CardEditor } from './CardForms';

// ============================================================
//  Una sesión de repaso.
//  · Las que fallas o estás aprendiendo vuelven en 1 o 10 minutos dentro
//    de la misma sesión (si no queda nada más, se adelantan).
//  · "Solo 5 minutos": pasado el tiempo deja de sacar tarjetas y termina
//    las que estaban en curso.
//  · Intensivo (antes del examen): todas las de la materia; solo las que
//    fallas cambian su programación.
//  Atajos: espacio voltea, 1 a 4 responden, Z deshace, E edita.
// ============================================================

export type SessionMode = 'normal' | 'five' | 'cram';
export type SessionSummary = { cards: number; ms: number; recalled: number; again: number };

type Pending = { card: CardRow; at: number };
type Snap = { main: CardRow[]; pending: Pending[]; current: CardRow | null; done: number; again: number; recalled: number };

const BUTTONS: { r: CardRating; label: string; col: string; txt: string }[] = [
  { r: 1, label: 'Otra vez', col: C.bad, txt: C.badText }, { r: 2, label: 'Difícil', col: C.warn, txt: C.warnText },
  { r: 3, label: 'Bien', col: C.brand, txt: C.brand }, { r: 4, label: 'Fácil', col: C.good, txt: C.goodText },
];
const AHEAD_MS = 20 * 60_000;

export function ReviewSession({ queue, learning, mode, retention, typeAnswer, subjects, noteTitles, onFinish }: {
  queue: CardRow[]; learning: CardRow[]; mode: SessionMode; retention: number; typeAnswer: boolean;
  subjects: Subject[]; noteTitles: Record<string, string>; onFinish: (s: SessionSummary, left: number) => void;
}) {
  const router = useRouter();
  const { isWide } = useResponsive();
  const total0 = queue.length + learning.length;
  const [main, setMain] = useState<CardRow[]>(queue);
  const [pending, setPending] = useState<Pending[]>(() => learning.map((c) => ({ card: c, at: dueOf(c)?.getTime() ?? Date.now() })));
  const [current, setCurrent] = useState<CardRow | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState('');
  const [stats, setStats] = useState({ done: 0, again: 0, recalled: 0 });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const undoStack = useRef<{ snap: Snap; answered: Answered | null }[]>([]);
  const shownAt = useRef(Date.now());
  const started = useRef(Date.now());
  const deadline = mode === 'five' ? started.current + 5 * 60_000 : Infinity;
  const finished = useRef(false);

  // Elegir la siguiente.
  const pick = useCallback((m: CardRow[], p: Pending[]): { cur: CardRow | null; m: CardRow[]; p: Pending[] } => {
    const now = Date.now();
    const sorted = [...p].sort((a, b) => a.at - b.at);
    if (sorted[0] && sorted[0].at <= now) return { cur: sorted[0].card, m, p: sorted.slice(1) };
    if (now < deadline && m.length) return { cur: m[0], m: m.slice(1), p: sorted };
    if (sorted[0] && sorted[0].at - now <= AHEAD_MS) return { cur: sorted[0].card, m, p: sorted.slice(1) };
    return { cur: null, m, p: sorted };
  }, [deadline]);

  useEffect(() => {
    const r = pick(main, pending);
    setMain(r.m); setPending(r.p); setCurrent(r.cur); shownAt.current = Date.now(); setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si no queda nada para ahora pero hay pasos cortos en camino, se espera.
  useEffect(() => {
    if (current || finished.current) return;
    if (!pending.length) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [current, pending.length]);
  useEffect(() => {
    if (current || finished.current || !pending.length) return;
    const r = pick(main, pending);
    if (r.cur) { setMain(r.m); setPending(r.p); setCurrent(r.cur); setFlipped(false); setTyped(''); shownAt.current = Date.now(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // Terminó.
  useEffect(() => {
    if (!ready || current || finished.current) return;
    const soon = pending.filter((x) => x.at - Date.now() <= AHEAD_MS).length;
    if (soon && Date.now() < deadline + 60 * 60_000 && (mode !== 'five' || Date.now() < deadline)) return;
    finished.current = true;
    const summary = { cards: stats.done, ms: Date.now() - started.current, recalled: stats.recalled, again: stats.again };
    if (stats.done) {
      emitPetEvent({ type: 'repaso_fin', cards: stats.done });
      refreshNavCounts(true); refreshCoinsSoon(1500);
    }
    onFinish(summary, main.length + pending.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, current, pending.length]);

  const labels = useMemo(() => {
    if (!current) return null;
    if (mode === 'cram') return { 1: 'repasar de nuevo', 2: 'sin cambios', 3: 'sin cambios', 4: 'sin cambios' } as Record<CardRating, string>;
    if (!hasFsrsDb()) return { 1: 'mañana', 2: nextLabel(current, 1), 3: nextLabel(current, 2), 4: nextLabel(current, 3) } as Record<CardRating, string>;
    const p = preview(current, new Date(), retention);
    return { 1: p[1].label, 2: p[2].label, 3: p[3].label, 4: p[4].label } as Record<CardRating, string>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.fsrs_state, current?.learning_steps, mode, retention, flipped]);

  const snapshot = (): Snap => ({ main, pending, current, done: stats.done, again: stats.again, recalled: stats.recalled });

  const answer = useCallback(async (r: CardRating) => {
    if (!current || busy) return;
    const card = current;
    const dur = Math.min(120_000, Date.now() - shownAt.current);
    const snap = snapshot();
    setBusy(true);
    let answered: Answered | null = null;
    let nextMain = main, nextPending = pending;
    try {
      if (mode === 'cram' && r > 1) {
        answered = null; // en el intensivo, acertar no cambia su programación
      } else {
        answered = await answerCard(card, r, dur, retention);
        const upd: CardRow = answered.patch ? { ...card, ...answered.patch } as CardRow : card;
        if (mode === 'cram') nextMain = [...main, upd];
        else if (answered.patch && (answered.patch.fsrs_state === 1 || answered.patch.fsrs_state === 3)) {
          const at = Date.parse(answered.patch.due_at);
          const end = new Date(); end.setHours(23, 59, 59, 999);
          if (at <= end.getTime()) nextPending = [...pending, { card: upd, at }];
        } else if (!answered.patch && r === 1) nextMain = [...main, card]; // sin FSRS: "Otra vez" al final
      }
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); setBusy(false); return; }
    undoStack.current.push({ snap, answered });
    if (undoStack.current.length > 20) undoStack.current.shift();
    setStats((s) => ({ done: s.done + 1, again: s.again + (r === 1 ? 1 : 0), recalled: s.recalled + (r > 1 ? 1 : 0) }));
    const pk = pick(nextMain, nextPending);
    setMain(pk.m); setPending(pk.p); setCurrent(pk.cur); setFlipped(false); setTyped(''); shownAt.current = Date.now();
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, busy, main, pending, mode, retention, pick, stats]);

  const undo = useCallback(async () => {
    const last = undoStack.current.pop();
    if (!last || busy) return;
    setBusy(true);
    try { if (last.answered) await undoAnswer(last.answered); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); setBusy(false); return; }
    const s = last.snap;
    setMain(s.main); setPending(s.pending); setCurrent(s.current); setStats({ done: s.done, again: s.again, recalled: s.recalled });
    setFlipped(true); shownAt.current = Date.now(); finished.current = false;
    setBusy(false);
    toast('Respuesta deshecha');
  }, [busy]);

  const skip = () => {
    if (!current) return;
    const pk = pick([...main, current], pending);
    setMain(pk.m); setPending(pk.p); setCurrent(pk.cur); setFlipped(false); setTyped(''); shownAt.current = Date.now();
  };
  const suspend = async () => {
    if (!current) return;
    const card = current;
    try {
      await setSuspended([card.id], true);
      const pk = pick(main, pending);
      setMain(pk.m); setPending(pk.p); setCurrent(pk.cur); setFlipped(false); setTyped('');
      toast('No se mostrará más. La puedes reactivar en Mazos.', { actionLabel: 'Deshacer', onAction: () => { setSuspended([card.id], false).catch(() => {}); } });
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  };

  // Atajos de teclado.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (editing) return;
      if (typing) { if (e.key === 'Enter' && !flipped) { e.preventDefault(); setFlipped(true); } return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') { e.preventDefault(); setFlipped((f) => !f); }
      else if (flipped && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); answer(Number(e.key) as CardRating); }
      else if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); }
      else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); if (current) setEditing(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [flipped, answer, undo, editing, current]);

  if (!current) {
    const next = [...pending].sort((a, b) => a.at - b.at)[0];
    return (
      <View style={{ alignItems: 'center', paddingVertical: 60, gap: 8 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{next ? 'Un momento…' : 'Terminando…'}</Text>
        {next && <Text style={{ color: C.muted, fontSize: 13.5 }}>La siguiente vuelve en {Math.max(1, Math.ceil((next.at - Date.now()) / 1000))} s</Text>}
      </View>
    );
  }

  const subj = subjects.find((s) => s.id === current.subject_id);
  const st = stateOf(current);
  const stLabel = mode === 'cram' ? 'Intensivo' : st === 0 ? 'Nueva' : st === 2 ? 'Repaso' : 'Aprendiendo';
  const stColor = st === 0 ? C.brand : st === 2 ? C.goodText : C.warnText;
  const nNew = main.filter((c) => stateOf(c) === 0).length + (st === 0 ? 1 : 0);
  const nLearn = pending.length + (st === 1 || st === 3 ? 1 : 0);
  const nRev = main.filter((c) => stateOf(c) === 2).length + (st === 2 ? 1 : 0);
  const total = Math.max(total0, stats.done + nNew + nLearn + nRev);
  const leftMin = mode === 'five' ? Math.max(0, Math.ceil((deadline - Date.now()) / 60000)) : null;
  const noteTitle = current.note_id ? noteTitles[current.note_id] : null;

  return (
    <View>
      {/* Progreso */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={{ flex: 1, height: 8, backgroundColor: C.surface2, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' }}
          accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: stats.done }}>
          <View style={{ width: `${(stats.done / total) * 100}%`, backgroundColor: C.brand }} />
        </View>
        <Text style={{ color: C.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{Math.min(total, stats.done + 1)} de {total}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
        <Count n={nNew} label="nuevas" color={C.brand} />
        <Count n={nLearn} label="aprendiendo" color={C.warnText} />
        <Count n={nRev} label="repaso" color={C.goodText} />
        {leftMin !== null && <Text style={{ color: C.muted, fontSize: 12.5, marginLeft: 'auto' }}>{leftMin > 0 ? `Quedan ${leftMin} min` : 'Terminando las que van'}</Text>}
      </View>

      {/* Tarjeta */}
      <Pressable onPress={() => setFlipped((f) => !f)} accessibilityRole="button" accessibilityLabel={flipped ? 'Ver pregunta' : 'Ver respuesta'}
        style={{ backgroundColor: C.surface, borderColor: flipped ? C.brand : C.line, borderWidth: 1.5, borderRadius: 20, padding: 24, paddingTop: 48, minHeight: 300, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
        <View style={{ position: 'absolute', top: 14, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {subj && <><Dot color={subj.color} /><Text style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={1}>{subj.name}</Text></>}
          <Text style={{ color: stColor, fontSize: 11.5, fontWeight: '800' }}>· {stLabel}</Text>
          <View style={{ flex: 1 }} />
          {current.note_id && (
            <Pressable onPress={(e: any) => { e?.stopPropagation?.(); router.push({ pathname: '/nota/[id]', params: { id: current.note_id!, ...(current.source_heading ? { titulo: current.source_heading } : {}) } } as any); }}
              accessibilityRole="link" accessibilityLabel={`Ver en la nota ${noteTitle ?? ''}`} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="document-text-outline" size={14} color={C.brand} />
              <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>Ver en la nota</Text>
            </Pressable>
          )}
        </View>
        <CardText text={current.front} kind={current.kind} reveal={flipped} size={isWide ? 22 : 19} />
        {flipped && current.kind !== 'cloze' && (
          <>
            <View style={{ width: '40%', height: 1, backgroundColor: C.line }} />
            <CardText text={current.back} size={isWide ? 20 : 17} color={C.text} />
          </>
        )}
        {flipped && typeAnswer && !!typed.trim() && (
          <View style={{ alignSelf: 'stretch', padding: 10, borderRadius: 10, backgroundColor: C.surface2 }}>
            <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '700' }}>TU RESPUESTA</Text>
            <Text style={{ color: C.text, fontSize: 14.5, marginTop: 2 }}>{typed}</Text>
          </View>
        )}
        {!flipped && !typeAnswer && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>Toca para ver la respuesta</Text>
            {Platform.OS === 'web' && isWide && <Kbd text="Espacio" />}
          </View>
        )}
      </Pressable>

      {/* Escribir antes de ver */}
      {typeAnswer && !flipped && (
        <TextInput value={typed} onChangeText={setTyped} placeholder="Escribe tu respuesta y presiona Enter" placeholderTextColor={C.muted}
          accessibilityLabel="Tu respuesta" autoFocus onSubmitEditing={() => setFlipped(true)} returnKeyType="done"
          style={{ marginTop: 12, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, color: C.text, padding: 12, fontSize: 15, minHeight: 46 }} />
      )}

      {/* Respuestas */}
      {flipped ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          {BUTTONS.map((b) => (
            <Pressable key={b.r} onPress={() => answer(b.r)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${b.label}${labels ? `, vuelve en ${labels[b.r]}` : ''}`}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: b.col + '66', backgroundColor: b.col + (pressed ? '33' : '1a'), minHeight: 56, opacity: busy ? 0.6 : 1 })}>
              <Text style={{ color: b.txt, fontWeight: '800', fontSize: 14 }}>{b.label}</Text>
              <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{labels?.[b.r]}{Platform.OS === 'web' && isWide ? ` · ${b.r}` : ''}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Button label="Mostrar respuesta" onPress={() => setFlipped(true)} size="lg" style={{ marginTop: 14 }} full />
      )}

      {/* Acciones */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
        <Action icon="arrow-undo-outline" label="Deshacer" kbd="Z" onPress={undo} disabled={!undoStack.current.length || busy} />
        <Action icon="create-outline" label="Editar" kbd="E" onPress={() => setEditing(true)} />
        <Action icon="eye-off-outline" label="No mostrar más" onPress={suspend} disabled={!hasFsrsDb()} />
        <Action icon="play-skip-forward-outline" label="Saltar" onPress={skip} />
      </View>

      <CardEditor visible={editing} title="Editar tarjeta" initial={{ kind: current.kind, front: current.front, back: current.back }} subjects={subjects} subjectId={current.subject_id}
        onClose={() => setEditing(false)}
        onSave={async (v) => {
          await updateCard(current.id, { front: v.front.trim(), back: v.kind === 'cloze' ? '' : v.back.trim(), kind: v.kind, subject_id: v.subject_id });
          setCurrent({ ...current, front: v.front.trim(), back: v.kind === 'cloze' ? '' : v.back.trim(), kind: v.kind, subject_id: v.subject_id });
          setEditing(false); toast('Tarjeta guardada', { tone: 'good' });
        }} />
    </View>
  );
}

function Count({ n, label, color }: { n: number; label: string; color: string }) {
  return <Text style={{ color: C.muted, fontSize: 12.5 }}><Text style={{ color, fontWeight: '800' }}>{n}</Text> {label}</Text>;
}
function Action({ icon, label, kbd, onPress, disabled }: { icon: any; label: string; kbd?: string; onPress: () => void; disabled?: boolean }) {
  const { isWide } = useResponsive();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 36, borderRadius: 9, opacity: disabled ? 0.4 : 1, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
      <Ionicons name={icon} size={16} color={C.muted} />
      <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
      {kbd && Platform.OS === 'web' && isWide && <Kbd text={kbd} />}
    </Pressable>
  );
}
