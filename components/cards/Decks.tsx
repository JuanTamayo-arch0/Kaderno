import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import type { Subject } from '../../lib/db';
import { updateCard, setSuspended, moveCards, deleteCards, saveDrafts, hasFsrsDb, type CardRow } from '../../lib/cardsDb';
import { dueLabel, retrievability } from '../../lib/fsrs';
import { isHard, normalize, forecast, reviewsByDay, retentionPct, type ReviewStat } from '../../lib/cards';
import { confirm, toast, friendlyError } from '../../lib/feedback';
import { refreshNavCounts } from '../../lib/navCounts';
import { Button, Card, ChipRow, Dot, EmptyState, FilterChip } from '../ds';
import { SubjectPicker } from '../SubjectPicker';
import { CardText } from './CardText';
import { CardEditor, Sheet } from './CardForms';

// ============================================================
//  Mazos: tus tarjetas por materia y por nota, con buscador,
//  filtros (nuevas, difíciles, suspendidas) y selección múltiple.
//  Y las estadísticas de repaso.
// ============================================================

type Filter = 'todas' | 'nuevas' | 'dificiles' | 'suspendidas';

export function Decks({ cards, subjects, noteTitles, retention, onChanged }: {
  cards: CardRow[]; subjects: Subject[]; noteTitles: Record<string, string>; retention: number; onChanged: () => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('todas');
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<CardRow | 'new' | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const now = new Date();

  const list = useMemo(() => {
    const n = normalize(q);
    return cards.filter((c) => {
      if (filter === 'nuevas' && (c.fsrs_state !== 0 || c.suspended)) return false;
      if (filter === 'dificiles' && !isHard(c)) return false;
      if (filter === 'suspendidas' && !c.suspended) return false;
      if (filter === 'todas' && c.suspended) return false;
      return !n || normalize(`${c.front} ${c.back}`).includes(n);
    });
  }, [cards, q, filter]);

  const groups = useMemo(() => {
    const bySubj = new Map<string, Map<string, CardRow[]>>();
    for (const c of list) {
      const sk = c.subject_id ?? '';
      const nk = c.note_id ?? '';
      if (!bySubj.has(sk)) bySubj.set(sk, new Map());
      const m = bySubj.get(sk)!;
      if (!m.has(nk)) m.set(nk, []);
      m.get(nk)!.push(c);
    }
    const name = (sid: string) => subjects.find((s) => s.id === sid)?.name ?? 'Sin materia';
    return [...bySubj.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || name(a[0]).localeCompare(name(b[0]), 'es'));
  }, [list, subjects]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = [...sel];
  const allSuspended = ids.length > 0 && ids.every((id) => cards.find((c) => c.id === id)?.suspended);
  const done = (msg: string) => { setSel(new Set()); setSelecting(false); onChanged(); refreshNavCounts(true); toast(msg, { tone: 'good' }); };

  const bulkSuspend = async () => {
    try { await setSuspended(ids, !allSuspended); done(allSuspended ? 'Tarjetas reactivadas' : 'Tarjetas suspendidas: no saldrán en el repaso'); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  };
  const bulkDelete = async () => {
    if (!(await confirm(`¿Borrar ${ids.length} ${ids.length === 1 ? 'tarjeta' : 'tarjetas'}?`, 'Se pierde también su historial de repaso.', 'Borrar'))) return;
    try { await deleteCards(ids); done('Tarjetas borradas'); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  };
  const bulkMove = async () => {
    try { await moveCards(ids, moveTo); setMoving(false); done('Tarjetas movidas'); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 42, borderRadius: 10, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line }}>
          <Ionicons name="search" size={16} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar en tus tarjetas" placeholderTextColor={C.muted} accessibilityLabel="Buscar en tus tarjetas"
            style={{ flex: 1, color: C.text, fontSize: 14, minHeight: 40, outlineStyle: 'none' } as any} />
        </View>
        <Button label={selecting ? 'Listo' : 'Seleccionar'} kind="secondary" size="sm" onPress={() => { setSelecting(!selecting); setSel(new Set()); }} />
        <Button label="Nueva" icon="add" size="sm" onPress={() => setEdit('new')} />
      </View>
      <ChipRow>
        <FilterChip label={`Todas · ${cards.filter((c) => !c.suspended).length}`} active={filter === 'todas'} onPress={() => setFilter('todas')} />
        <FilterChip label="Nuevas" active={filter === 'nuevas'} onPress={() => setFilter('nuevas')} />
        <FilterChip label="Difíciles" active={filter === 'dificiles'} onPress={() => setFilter('dificiles')} />
        {hasFsrsDb() && <FilterChip label="Suspendidas" active={filter === 'suspendidas'} onPress={() => setFilter('suspendidas')} />}
      </ChipRow>

      {selecting && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: '#1a2036', borderWidth: 1, borderColor: '#34437a', flexWrap: 'wrap' }}>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 13.5, flex: 1 }}>{ids.length ? `${ids.length} seleccionadas` : 'Toca las tarjetas para elegirlas'}</Text>
          <Button label="Mover" kind="secondary" size="sm" disabled={!ids.length} onPress={() => { setMoveTo(null); setMoving(true); }} />
          {hasFsrsDb() && <Button label={allSuspended ? 'Reactivar' : 'Suspender'} kind="secondary" size="sm" disabled={!ids.length} onPress={bulkSuspend} />}
          <Button label="Borrar" kind="danger" size="sm" disabled={!ids.length} onPress={bulkDelete} />
        </View>
      )}

      {!list.length ? (
        <EmptyState icon="albums-outline" compact title={cards.length ? 'Nada con ese filtro' : 'Aún no tienes tarjetas'}
          text={cards.length ? 'Prueba con otro filtro o búsqueda.' : 'Créalas desde una nota con "Crear flashcards", o escribe una a mano.'} />
      ) : groups.map(([sid, notes]) => {
        const s = subjects.find((x) => x.id === sid);
        const count = [...notes.values()].reduce((n, xs) => n + xs.length, 0);
        return (
          <View key={sid || 'none'} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Dot color={s?.color ?? C.muted} size={10} />
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{s?.name ?? 'Sin materia'}</Text>
              <Text style={{ color: C.muted, fontSize: 12.5 }}>{count}</Text>
            </View>
            {[...notes.entries()].map(([nid, xs]) => (
              <Card key={nid || 'sin-nota'} padded={false}>
                <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }} numberOfLines={1}>
                  {nid ? (noteTitles[nid] ?? 'Nota') : 'Sin nota (a mano)'}
                </Text>
                {xs.map((c) => {
                  const r = retrievability(c, now, retention);
                  const on = sel.has(c.id);
                  return (
                    <Pressable key={c.id} onPress={() => (selecting ? toggle(c.id) : setEdit(c))} accessibilityRole={selecting ? 'checkbox' : 'button'}
                      accessibilityState={selecting ? { checked: on } : undefined} accessibilityLabel={c.front.slice(0, 80)}
                      style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.surface2, backgroundColor: on ? '#1a2036' : hovered ? C.surface2 : 'transparent' })}>
                      {selecting && <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? C.brand : C.muted} />}
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <CardText text={c.front} kind={c.kind} reveal size={14} align="left" lines={2} />
                        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                          {c.kind === 'cloze' && <Text style={{ color: C.brand, fontSize: 11.5, fontWeight: '700' }}>Completar</Text>}
                          <Text style={{ color: C.muted, fontSize: 11.5 }}>{c.suspended ? 'Suspendida' : dueLabel(c, now)}</Text>
                          {r !== null && <Text style={{ color: C.muted, fontSize: 11.5 }}>Recuerdas {Math.round(r * 100)}%</Text>}
                          {isHard(c) && <Text style={{ color: C.warnText, fontSize: 11.5, fontWeight: '700' }}>Difícil</Text>}
                        </View>
                      </View>
                      {!selecting && <Ionicons name="chevron-forward" size={16} color={C.muted} />}
                    </Pressable>
                  );
                })}
              </Card>
            ))}
          </View>
        );
      })}

      <CardEditor visible={!!edit} initial={edit && edit !== 'new' ? { kind: edit.kind, front: edit.front, back: edit.back } : null}
        subjects={subjects} subjectId={edit && edit !== 'new' ? edit.subject_id : null} onClose={() => setEdit(null)}
        onSave={async (v, more) => {
          if (edit && edit !== 'new') await updateCard(edit.id, { front: v.front.trim(), back: v.kind === 'cloze' ? '' : v.back.trim(), kind: v.kind, subject_id: v.subject_id });
          else await saveDrafts([v], { noteId: null, subjectId: v.subject_id, from: 'manual' });
          toast(edit === 'new' ? 'Tarjeta creada: entra como nueva' : 'Tarjeta guardada', { tone: 'good' });
          onChanged(); refreshNavCounts(true);
          if (!more) setEdit(null);
        }} />
      <Sheet visible={moving} onClose={() => setMoving(false)} title={`Mover ${ids.length} ${ids.length === 1 ? 'tarjeta' : 'tarjetas'}`}
        footer={<><Button label="Cancelar" kind="secondary" onPress={() => setMoving(false)} style={{ flex: 1 }} /><Button label="Mover" onPress={bulkMove} style={{ flex: 1 }} /></>}>
        <SubjectPicker subjects={subjects} value={moveTo} onChange={setMoveTo} placeholder="Sin materia" />
      </Sheet>
    </View>
  );
}

/** Estadísticas: retención, mapa de calor de 12 semanas y pronóstico de 30 días. */
export function CardStats({ cards, reviews }: { cards: CardRow[]; reviews: ReviewStat[] }) {
  const now = new Date();
  const ret = retentionPct(reviews, now.getTime() - 30 * 86_400_000);
  const byDay = reviewsByDay(reviews);
  const fc = forecast(cards, now, 30);
  const maxF = Math.max(5, ...fc.map((x) => x.n));
  const learned = cards.filter((c) => c.fsrs_state === 2 && !c.suspended).length;
  const fresh = cards.filter((c) => c.fsrs_state === 0 && !c.suspended).length;
  // Mapa de calor: 12 semanas terminando hoy, de lunes a domingo.
  const end = new Date(now); end.setHours(0, 0, 0, 0);
  const weeks: { key: string; n: number; future: boolean }[][] = [];
  const d = new Date(end); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 11 * 7);
  for (let w = 0; w < 12; w++) {
    const col: { key: string; n: number; future: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      col.push({ key: k, n: byDay[k] ?? 0, future: d > end });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(col);
  }
  const maxH = Math.max(1, ...weeks.flat().map((x) => x.n));
  const total90 = reviews.length;
  const tile = (label: string, value: string, hint?: string) => (
    <View style={{ flex: 1, minWidth: 140, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}>
      <Text style={{ color: C.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', marginTop: 4 }}>{value}</Text>
      {!!hint && <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{hint}</Text>}
    </View>
  );
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {tile('Retención, 30 días', ret === null ? 'Sin datos' : `${ret}%`, ret === null ? 'Aparece tras unos repasos' : 'de las que ya habías aprendido')}
        {tile('Aprendidas', String(learned), `${fresh} nuevas en espera`)}
        {tile('Repasos, 90 días', String(total90))}
      </View>
      <Card>
        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', marginBottom: 10 }}>Repasos por día</Text>
        <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={`Mapa de 12 semanas: ${total90} repasos`}>
          {weeks.map((col, wi) => (
            <View key={wi} style={{ gap: 3, flex: 1, maxWidth: 22 }}>
              {col.map((c) => (
                <View key={c.key} style={{ aspectRatio: 1, borderRadius: 3, backgroundColor: c.future ? 'transparent' : c.n ? C.good : C.surface2, opacity: c.future ? 0 : c.n ? 0.3 + 0.7 * (c.n / maxH) : 1 }} />
              ))}
            </View>
          ))}
        </View>
        <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 8 }}>Últimas 12 semanas. Más intenso = más tarjetas ese día.</Text>
      </Card>
      <Card>
        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', marginBottom: 10 }}>Lo que viene, 30 días</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 90 }}>
          {fc.map((x, i) => (
            <View key={x.day} style={{ flex: 1, height: `${Math.max(3, (x.n / maxF) * 100)}%`, backgroundColor: i === 0 ? C.brand : C.line, borderRadius: 2 }} accessibilityLabel={`${x.day}: ${x.n}`} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ color: C.muted, fontSize: 11.5 }}>Hoy · {fc[0]?.n ?? 0}</Text>
          <Text style={{ color: C.muted, fontSize: 11.5 }}>En 30 días</Text>
        </View>
      </Card>
    </View>
  );
}
