import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import { RequireAuth } from '../components/RequireAuth';
import { Flashcard, Subject, getDueFlashcards, getAllFlashcards, reviewFlashcard, addFlashcards, updateFlashcard, deleteFlashcard, getSubjects } from '../lib/db';
import { nextLabel } from '../lib/srs';
import { confirm, toast, friendlyError, notify } from '../lib/feedback';
import { refreshNavCounts } from '../lib/navCounts';
import { Screen, Button, Card, EmptyState, Field, FilterChip, IconButton, Segmented, Skeleton, Dot } from '../components/ds';
import { SubjectPicker } from '../components/SubjectPicker';
import { Kbd } from '../components/SideNav';

// ============================================================
//  Repaso con repetición espaciada (SM-2).
//  Cuatro respuestas (Otra vez, Difícil, Bien, Fácil) que muestran cuándo
//  vuelve la tarjeta. Atajos: espacio voltea, 1 a 4 responden.
//  "Mis tarjetas": crear, corregir y borrar tarjetas a mano.
// ============================================================

const GRADES: { g: 0 | 1 | 2 | 3; label: string; tone: 'bad' | 'warn' | 'brand' | 'good' }[] = [
  { g: 0, label: 'Otra vez', tone: 'bad' }, { g: 1, label: 'Difícil', tone: 'warn' },
  { g: 2, label: 'Bien', tone: 'brand' }, { g: 3, label: 'Fácil', tone: 'good' },
];

function Repaso() {
  const [tab, setTab] = useState<'repasar' | 'tarjetas'>('repasar');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  useFocusEffect(useCallback(() => { getSubjects().then(setSubjects).catch(() => {}); }, []));
  return (
    <Screen title="Repaso" back="/estudiar" nav="repaso" maxWidth={760}
      header={<Segmented value={tab} onChange={setTab} items={[{ key: 'repasar', label: 'Repasar', icon: 'flash-outline' }, { key: 'tarjetas', label: 'Mis tarjetas', icon: 'albums-outline' }]} />}>
      <View style={{ height: 16 }} />
      {tab === 'repasar' ? <Review subjects={subjects} onManage={() => setTab('tarjetas')} /> : <Manage subjects={subjects} />}
    </Screen>
  );
}

function Review({ subjects, onManage }: { subjects: Subject[]; onManage: () => void }) {
  const router = useRouter();
  const { isWide } = useResponsive();
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ done: 0, again: 0 });
  const [filter, setFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setCards(await getDueFlashcards()); setI(0); setFlipped(false); setStats({ done: 0, again: 0 }); }
    catch (e) { setCards([]); notify('No se pudo cargar', friendlyError(e)); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const queue = useMemo(() => (cards ?? []).filter((c) => !filter || c.subject_id === filter), [cards, filter]);
  const card = queue[i];

  const answer = useCallback(async (g: 0 | 1 | 2 | 3) => {
    if (!card) return;
    setFlipped(false);
    setStats((s) => ({ done: s.done + 1, again: s.again + (g === 0 ? 1 : 0) }));
    // "Otra vez" la deja al final de la cola de hoy.
    if (g === 0) setCards((cs) => cs ? [...cs, card] : cs);
    setI((x) => x + 1);
    try { await reviewFlashcard(card, g); refreshNavCounts(true); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  }, [card]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === ' ') { e.preventDefault(); setFlipped((f) => !f); }
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); answer((Number(e.key) - 1) as 0 | 1 | 2 | 3); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [flipped, answer]);

  if (cards === null) return <Skeleton height={280} />;
  const usedSubjects = subjects.filter((s) => (cards ?? []).some((c) => c.subject_id === s.id));

  if (!queue.length && !stats.done) return (
    <EmptyState icon="albums-outline" title="Nada para repasar hoy"
      text="Crea tarjetas desde una nota (botón Flashcards) o a mano. Cuando les toque repaso aparecerán aquí."
      action={{ label: 'Crear una tarjeta', icon: 'add', onPress: onManage }} />
  );
  if (!card) return (
    <EmptyState icon="checkmark-done-outline" title="Repaso completado"
      text={`Revisaste ${stats.done} ${stats.done === 1 ? 'tarjeta' : 'tarjetas'}${stats.again ? `, ${stats.again} para volver a ver` : ''}. Vuelve mañana para la siguiente ronda.`}
      action={{ label: 'Volver a Estudiar', onPress: () => router.replace('/estudiar') }} />
  );

  const subj = subjects.find((s) => s.id === card.subject_id);
  const total = queue.length;
  return (
    <View>
      {usedSubjects.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <FilterChip label="Todas" active={!filter} onPress={() => { setFilter(null); setI(0); }} />
          {usedSubjects.map((s) => <FilterChip key={s.id} label={s.name} color={s.color} active={filter === s.id} onPress={() => { setFilter(s.id); setI(0); }} />)}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={{ flex: 1, height: 6, backgroundColor: C.surface2, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${(i / total) * 100}%`, height: '100%', backgroundColor: C.brand }} />
        </View>
        <Text style={{ color: C.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{i + 1} de {total}</Text>
      </View>

      <Pressable onPress={() => setFlipped((f) => !f)} accessibilityRole="button" accessibilityLabel={flipped ? 'Ver pregunta' : 'Ver respuesta'}
        style={{ backgroundColor: C.surface, borderColor: flipped ? C.brand : C.line, borderWidth: 1.5, borderRadius: 20, padding: 28, minHeight: 280, justifyContent: 'center', alignItems: 'center' }}>
        {subj && <View style={{ position: 'absolute', top: 16, left: 18, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Dot color={subj.color} /><Text style={{ color: C.muted, fontSize: 12.5 }}>{subj.name}</Text></View>}
        <Text style={{ color: flipped ? C.brand : C.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>{flipped ? 'Respuesta' : 'Pregunta'}</Text>
        <Text style={{ color: C.text, fontSize: 21, textAlign: 'center', lineHeight: 30 }}>{flipped ? card.back : card.front}</Text>
        {!flipped && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22 }}>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>Toca para ver la respuesta</Text>
            {Platform.OS === 'web' && isWide && <Kbd text="Espacio" />}
          </View>
        )}
      </Pressable>

      {flipped ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {GRADES.map((b, k) => {
            const col = b.tone === 'bad' ? C.bad : b.tone === 'warn' ? C.warn : b.tone === 'good' ? C.good : C.brand;
            const txt = b.tone === 'bad' ? C.badText : b.tone === 'warn' ? C.warnText : b.tone === 'good' ? C.goodText : C.brand;
            return (
              <Pressable key={b.g} onPress={() => answer(b.g)} accessibilityRole="button" accessibilityLabel={`${b.label}, vuelve en ${nextLabel(card, b.g)}`}
                style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: col + '66', backgroundColor: col + (pressed ? '33' : '1a'), minHeight: 56 })}>
                <Text style={{ color: txt, fontWeight: '800', fontSize: 14 }}>{b.label}</Text>
                <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{nextLabel(card, b.g)}{Platform.OS === 'web' && isWide ? ` · ${k + 1}` : ''}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Button label="Mostrar respuesta" onPress={() => setFlipped(true)} size="lg" style={{ marginTop: 16 }} full />
      )}
    </View>
  );
}

function Manage({ subjects }: { subjects: Subject[] }) {
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [edit, setEdit] = useState<Flashcard | 'new' | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const load = useCallback(() => { getAllFlashcards().then(setCards).catch(() => setCards([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(c: Flashcard) {
    if (!(await confirm('¿Borrar esta tarjeta?', c.front, 'Borrar'))) return;
    try { await deleteFlashcard(c.id); setCards((xs) => xs?.filter((x) => x.id !== c.id) ?? null); toast('Tarjeta borrada'); }
    catch (e) { notify('No se pudo borrar', friendlyError(e)); }
  }
  const list = (cards ?? []).filter((c) => !filter || c.subject_id === filter);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Text style={{ color: C.muted, flex: 1 }}>{cards ? `${cards.length} ${cards.length === 1 ? 'tarjeta' : 'tarjetas'}` : ''}</Text>
        <Button label="Nueva tarjeta" icon="add" size="sm" onPress={() => setEdit('new')} />
      </View>
      {subjects.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <FilterChip label="Todas" active={!filter} onPress={() => setFilter(null)} />
          {subjects.map((s) => <FilterChip key={s.id} label={s.name} color={s.color} active={filter === s.id} onPress={() => setFilter(s.id)} />)}
        </ScrollView>
      )}
      {cards === null ? <Skeleton /> : list.length === 0 ? (
        <EmptyState icon="albums-outline" title="Sin tarjetas" text="Escribe una pregunta y su respuesta, o genéralas con IA desde una nota." compact />
      ) : list.map((c) => {
        const s = subjects.find((x) => x.id === c.subject_id);
        return (
          <Card key={c.id} style={{ marginBottom: 8, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Pressable style={{ flex: 1 }} onPress={() => setEdit(c)} accessibilityRole="button" accessibilityLabel={`Editar: ${c.front}`}>
                <Text style={{ color: C.text, fontWeight: '700' }}>{c.front}</Text>
                <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }} numberOfLines={2}>{c.back}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  {s && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Dot color={s.color} /><Text style={{ color: C.muted, fontSize: 12 }}>{s.name}</Text></View>}
                  <Text style={{ color: C.muted, fontSize: 12 }}>Próximo repaso: {c.due_date}</Text>
                </View>
              </Pressable>
              <IconButton icon="trash-outline" label="Borrar tarjeta" onPress={() => remove(c)} />
            </View>
          </Card>
        );
      })}
      <CardEditor visible={!!edit} card={edit === 'new' ? null : edit} subjects={subjects} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); refreshNavCounts(true); }} />
    </View>
  );
}

function CardEditor({ visible, card, subjects, onClose, onSaved }: { visible: boolean; card: Flashcard | null; subjects: Subject[]; onClose: () => void; onSaved: () => void }) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [sid, setSid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (visible) { setFront(card?.front ?? ''); setBack(card?.back ?? ''); setSid(card?.subject_id ?? null); setErr(null); } }, [visible, card]);
  async function save(more = false) {
    if (!front.trim() || !back.trim()) { setErr('Escribe la pregunta y la respuesta.'); return; }
    setBusy(true);
    try {
      if (card) await updateFlashcard(card.id, { front: front.trim(), back: back.trim(), subject_id: sid });
      else await addFlashcards([{ front: front.trim(), back: back.trim() }], null, sid);
      toast(card ? 'Tarjeta guardada' : 'Tarjeta creada', { tone: 'good' });
      if (more && !card) { setFront(''); setBack(''); } else onSaved();
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 520, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 18 }}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>{card ? 'Editar tarjeta' : 'Nueva tarjeta'}</Text>
          <Field label="Pregunta" value={front} onChangeText={setFront} multiline autoFocus inputStyle={{ minHeight: 60, textAlignVertical: 'top' }} />
          <Field label="Respuesta" value={back} onChangeText={setBack} multiline inputStyle={{ minHeight: 80, textAlignVertical: 'top' }} error={err} />
          <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>Materia</Text>
          <SubjectPicker subjects={subjects} value={sid} onChange={setSid} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <Button label="Cancelar" kind="secondary" onPress={onClose} style={{ flex: 1 }} />
            {!card && <Button label="Guardar y otra" kind="secondary" onPress={() => save(true)} style={{ flex: 1 }} />}
            <Button label="Guardar" onPress={() => save(false)} busy={busy} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function RepasoProtegida() {
  return <RequireAuth><Repaso /></RequireAuth>;
}
