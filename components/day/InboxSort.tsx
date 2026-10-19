import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { C } from '../../lib/theme';
import { Button } from '../ds';
import { Sheet } from '../cards/CardForms';
import { SubjectPicker } from '../SubjectPicker';
import { DateField } from '../DateTime';
import { updateTask, deleteTask, addNote, type Task, type Subject } from '../../lib/db';
import { isoDate, addDays, startOfDay } from '../../lib/time';
import { toast, friendlyError } from '../../lib/feedback';
import { dataChanged } from '../../lib/uiBus';
import { refreshNavCounts } from '../../lib/navCounts';

// ============================================================
//  Ordenar la bandeja (v21, sección 2): una por una, con botones grandes.
//  Atajos: H hoy, M mañana, N nota, A algún día, Supr borrar.
// ============================================================

export function InboxSort({ visible, items, subjects, onClose }: { visible: boolean; items: Task[]; subjects: Subject[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [pickDate, setPickDate] = useState(false);
  const [subject, setSubject] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const list = items.filter((t) => !done.has(t.id));
  const t = list[Math.min(i, list.length - 1)];
  useEffect(() => { if (visible) { setI(0); setDone(new Set()); } }, [visible]);
  useEffect(() => { setSubject(t?.subject_id ?? null); setPickDate(false); }, [t?.id]);

  async function act(fn: () => Promise<unknown>, msg: string) {
    if (!t || busy) return;
    setBusy(true);
    try { await fn(); setDone((d) => new Set(d).add(t.id)); toast(msg, { tone: 'good' }); dataChanged(); refreshNavCounts(true); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setBusy(false); }
  }
  const today = startOfDay(new Date());
  const toDay = (iso: string, label: string) => act(() => updateTask(t.id, { due_date: iso, inbox: false, subject_id: subject }), `Para ${label}`);
  const someday = () => act(() => updateTask(t.id, { inbox: false, subject_id: subject }), 'A "algún día"');
  const toNote = () => act(async () => { await addNote({ subject_id: subject, title: t.title, content: t.description ?? '', image_path: null }); await deleteTask(t.id); }, 'Convertida en nota');
  const remove = () => act(() => deleteTask(t.id), 'Borrada');

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 'h') toDay(isoDate(today), 'hoy');
      else if (k === 'm') toDay(isoDate(addDays(today, 1)), 'mañana');
      else if (k === 'n') toNote();
      else if (k === 'a') someday();
      else if (e.key === 'Delete' || e.key === 'Backspace') remove();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Ordenar la bandeja" subtitle={list.length ? `${list.length} por ordenar` : 'Listo'}
      footer={<Button label={list.length ? 'Seguir después' : 'Listo'} kind={list.length ? 'secondary' : 'primary'} onPress={onClose} style={{ flex: 1 }} />}>
      {!t ? (
        <Text style={{ color: C.text, fontSize: 15, textAlign: 'center', paddingVertical: 20 }}>La bandeja está vacía. Todo en su lugar.</Text>
      ) : (
        <>
          <View style={{ padding: 16, borderRadius: 14, backgroundColor: C.surface2, gap: 4 }}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{t.title}</Text>
            {!!t.description && <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={3}>{t.description}</Text>}
          </View>
          <SubjectPicker subjects={subjects} value={subject} onChange={setSubject} placeholder="Sin materia" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label="Hoy (H)" icon="today-outline" onPress={() => toDay(isoDate(today), 'hoy')} style={{ flexGrow: 1 }} disabled={busy} />
            <Button label="Mañana (M)" icon="arrow-forward" onPress={() => toDay(isoDate(addDays(today, 1)), 'mañana')} style={{ flexGrow: 1 }} disabled={busy} />
            <Button label="Elegir día" icon="calendar-outline" kind="secondary" onPress={() => setPickDate(!pickDate)} style={{ flexGrow: 1 }} />
          </View>
          {pickDate && <DateField label="Día" value={null} onChange={(v) => { if (v) toDay(v, 'ese día'); }} />}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label="Convertir en nota (N)" icon="document-text-outline" kind="secondary" onPress={toNote} style={{ flexGrow: 1 }} disabled={busy} />
            <Button label="Algún día (A)" icon="time-outline" kind="secondary" onPress={someday} style={{ flexGrow: 1 }} disabled={busy} />
            <Button label="Borrar" icon="trash-outline" kind="ghost" onPress={remove} disabled={busy} />
          </View>
          {list.length > 1 && <Button label="Saltar" kind="ghost" size="sm" onPress={() => setI((x) => (x + 1) % list.length)} />}
        </>
      )}
    </Sheet>
  );
}
