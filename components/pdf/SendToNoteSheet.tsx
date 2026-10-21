import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button } from '../ds';
import { searchNoteTitles, openClassNote, type NoteRef } from '../../lib/notesDb';
import { appendToNote, newNoteWith } from '../../lib/highlightsDb';
import { toast, friendlyError } from '../../lib/feedback';

// ============================================================
//  "Enviar a una nota" (v22, fase 2): la cita del PDF con su fuente va a la
//  nota de la clase de hoy, a otra nota o a una nueva.
// ============================================================

export function SendToNoteSheet({ visible, md, fileName, subjectId, onClose }: {
  visible: boolean; md: string; fileName: string; subjectId: string | null; onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [list, setList] = useState<NoteRef[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (visible) { setQ(''); setBusy(null); } }, [visible]);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    const t = setTimeout(() => searchNoteTitles(q).then((l) => live && setList(l)), 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, visible]);

  const done = (id: string, label: string) => {
    toast(`Cita agregada a ${label}`, { tone: 'good', actionLabel: 'Abrir', onAction: () => router.push(`/nota/${id}`) });
    onClose();
  };
  async function toNote(n: NoteRef) {
    setBusy(n.id);
    try { await appendToNote(n.id, md); done(n.id, `"${n.title}"`); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } finally { setBusy(null); }
  }
  async function toClass() {
    if (!subjectId) return;
    setBusy('class');
    try { const { id } = await openClassNote(subjectId); await appendToNote(id, md); done(id, 'la nota de la clase de hoy'); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } finally { setBusy(null); }
  }
  async function toNew() {
    setBusy('new');
    try { const id = await newNoteWith(md, `Citas de ${fileName.replace(/\.pdf$/i, '')}`, subjectId); done(id, 'una nota nueva'); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } finally { setBusy(null); }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Enviar a una nota" subtitle="Entra como cita, con un enlace que abre el PDF en esa página.">
      <View style={{ gap: 8 }}>
        {subjectId && <Button label="A la nota de la clase de hoy" icon="today-outline" busy={busy === 'class'} onPress={toClass} />}
        <Button label="A una nota nueva" icon="add" kind="secondary" busy={busy === 'new'} onPress={toNew} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: C.surface2, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10 }}>
          <Ionicons name="search" size={15} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="O busca una nota" placeholderTextColor={C.muted} accessibilityLabel="Buscar una nota"
            style={[{ flex: 1, color: C.text, fontSize: 14, paddingVertical: 9 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
        </View>
        {list === null && <ActivityIndicator color={C.brand} />}
        {list?.map((n) => (
          <Pressable key={n.id} onPress={() => toNote(n)} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`Agregar a ${n.title}`}
            style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
            <Ionicons name="document-text-outline" size={16} color={C.muted} />
            <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{n.title}</Text>
            {busy === n.id && <ActivityIndicator color={C.brand} />}
          </Pressable>
        ))}
        {list?.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>No encontré notas con ese título.</Text>}
      </View>
    </Sheet>
  );
}
