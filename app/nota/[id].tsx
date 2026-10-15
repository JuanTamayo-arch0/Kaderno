import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../lib/theme';
import { RequireAuth } from '../../components/RequireAuth';
import { MarkdownEditor } from '../../components/MarkdownEditor';
import { NoteAttachments } from '../../components/NoteAttachments';
import { SubjectPicker } from '../../components/SubjectPicker';
import { Screen, Button, Card, EmptyState, IconButton, SectionLabel } from '../../components/ds';
import {
  Note, Subject, getNote, getSubjects, updateNote, deleteNote, restoreNote, signedUrl,
  aiSummary, aiFlashcards, addFlashcards, indexNote, hasV14,
} from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { notify, toast, friendlyError } from '../../lib/feedback';
import { refreshNavCounts } from '../../lib/navCounts';

// ============================================================
//  Nota: se guarda sola mientras escribes, con ancho de lectura cómodo,
//  materia editable, adjuntos y acciones de IA (resumen, flashcards,
//  Oráculo). Borrar la manda a la papelera con "Deshacer".
// ============================================================

function NotaDetalle() {
  const { id } = useLocalSearchParams<{ id: string; edit?: string }>();
  const router = useRouter();
  const [note, setNote] = useState<Note | null | undefined>(undefined);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [summary, setSummary] = useState<string | null>(null);
  const [genSum, setGenSum] = useState(false);
  const [genCards, setGenCards] = useState(false);
  const saved = useRef({ title: '', content: '' });

  const load = useCallback(async () => {
    try {
      const [n, subs] = await Promise.all([getNote(id), getSubjects()]);
      setSubjects(subs);
      if (!n || n.deleted_at) { setNote(null); return; }
      setNote(n); setTitle(n.title ?? ''); setContent(n.content ?? ''); setSummary(n.summary ?? null);
      saved.current = { title: n.title ?? '', content: n.content ?? '' };
      if (n.image_path) signedUrl(n.image_path).then(setPhoto).catch(() => {});
    } catch { setNote(null); }
  }, [id]);
  useFocusEffect(useCallback(() => { if (note === undefined) load(); }, [load, note]));

  // Guardado automático 1,2 s después de dejar de escribir.
  useEffect(() => {
    if (!note) return;
    if (title === saved.current.title && content === saved.current.content) return;
    setStatus('saving');
    const h = setTimeout(async () => {
      try {
        await updateNote(id, { title: title.trim() || 'Nota sin título', content });
        saved.current = { title, content };
        setStatus('saved');
        indexNote(id, content, note.subject_id ?? null);
      } catch { setStatus('error'); }
    }, 1200);
    return () => clearTimeout(h);
  }, [title, content, note, id]);

  async function changeSubject(sid: string | null) {
    if (!note) return;
    try {
      const { error } = await supabase.from('notes').update({ subject_id: sid }).eq('id', id);
      if (error) throw error;
      setNote({ ...note, subject_id: sid });
      toast('Nota movida');
    } catch (e) { notify('No se pudo mover', friendlyError(e)); }
  }
  async function makeSummary() {
    if (!content.trim()) { notify('La nota está vacía', 'Escribe o digitaliza algo antes de resumir.'); return; }
    setGenSum(true);
    try { const s = await aiSummary(content); setSummary(s); await updateNote(id, { summary: s }); }
    catch (e) { notify('No se pudo resumir', friendlyError(e)); } finally { setGenSum(false); }
  }
  async function makeFlashcards() {
    if (!content.trim()) { notify('La nota está vacía', 'Escribe o digitaliza algo antes de crear tarjetas.'); return; }
    setGenCards(true);
    try {
      const cards = await aiFlashcards(content);
      if (!cards.length) throw new Error('La IA no devolvió tarjetas. Intenta con una nota más larga.');
      await addFlashcards(cards, id, note?.subject_id ?? null);
      refreshNavCounts(true);
      toast(`${cards.length} flashcards creadas`, { tone: 'good', actionLabel: 'Repasar', onAction: () => router.push('/repaso') });
    } catch (e) { notify('No se pudieron crear', friendlyError(e)); } finally { setGenCards(false); }
  }
  async function remove() {
    try {
      await deleteNote(id);
      const back = note?.subject_id ? `/materia/${note.subject_id}` : '/materias';
      router.replace(back as any);
      toast(hasV14() ? 'Nota enviada a la papelera' : 'Nota borrada', hasV14() ? { actionLabel: 'Deshacer', onAction: () => { restoreNote(id).then(() => router.push(`/nota/${id}`)).catch(() => {}); } } : {});
    } catch (e) { notify('No se pudo borrar', friendlyError(e)); }
  }

  const back = note?.subject_id ? `/materia/${note.subject_id}` : '/materias';
  if (note === undefined) return <Screen back="/materias" nav="materias"><ActivityIndicator color={C.brand} style={{ marginTop: 40 }} /></Screen>;
  if (note === null) return (
    <Screen back="/materias" nav="materias" title="Nota">
      <EmptyState icon="document-outline" title="No encontramos esta nota" text="Puede que esté en la papelera." action={{ label: 'Ir a la Papelera', onPress: () => router.replace('/papelera') }} />
    </Screen>
  );

  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const statusText = status === 'saving' ? 'Guardando…' : status === 'saved' ? 'Guardado' : status === 'error' ? 'No se pudo guardar. Revisa tu conexión.' : `${words} palabras`;

  return (
    <Screen back={back} nav="materias" maxWidth={760}
      right={<>
        {photo && <IconButton icon="image-outline" label="Ver foto original" onPress={() => setZoom(true)} />}
        <IconButton icon="trash-outline" label="Borrar nota" onPress={remove} />
      </>}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <View style={{ width: 220 }}><SubjectPicker subjects={subjects} value={note.subject_id} onChange={changeSubject} placeholder="Sin materia" /></View>
        <Text style={{ color: C.muted, fontSize: 12.5 }}>{new Date(note.created_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ color: status === 'error' ? C.badText : C.muted, fontSize: 12.5 }} accessibilityLiveRegion="polite">{statusText}</Text>
      </View>
      <TextInput value={title} onChangeText={setTitle} placeholder="Título de la nota" placeholderTextColor={C.muted} multiline accessibilityLabel="Título"
        style={[{ color: C.text, fontSize: 26, fontWeight: '800', paddingVertical: 8 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
      <View style={{ marginTop: 4 }}>
        <MarkdownEditor value={content} onChange={setContent} minHeight={360} />
      </View>

      <NoteAttachments noteId={id} />

      <SectionLabel text="Estudiar con IA" style={{ marginTop: 26 }} />
      {summary && (
        <Card style={{ marginBottom: 12, backgroundColor: C.brand + '12', borderColor: C.brand + '44' }}>
          <Text style={{ color: C.brand, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>Resumen</Text>
          <Text style={{ color: C.text, fontSize: 14.5, lineHeight: 22 }}>{summary}</Text>
        </Card>
      )}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button label={summary ? 'Rehacer resumen' : 'Resumir'} icon="reader-outline" kind="secondary" busy={genSum} onPress={makeSummary} style={{ flexGrow: 1 }} />
        <Button label="Crear flashcards" icon="albums-outline" kind="secondary" busy={genCards} onPress={makeFlashcards} style={{ flexGrow: 1 }} />
        <Button label="Preguntar al Oráculo" icon="sparkles-outline" kind="secondary" style={{ flexGrow: 1 }}
          onPress={() => router.push({ pathname: '/oraculo', params: { mode: 'note', noteId: id, subjectId: note.subject_id ?? '', noteTitle: title || 'Nota' } } as any)} />
      </View>

      <Modal visible={zoom} transparent onRequestClose={() => setZoom(false)}>
        <Pressable onPress={() => setZoom(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="Cerrar foto">
          {photo && <Image source={{ uri: photo }} style={{ width: '94%', height: '84%' }} resizeMode="contain" />}
          <Text style={{ color: '#ccc', marginTop: 16, fontSize: 13 }}>Toca para cerrar</Text>
        </Pressable>
      </Modal>
    </Screen>
  );
}

export default function NotaProtegida() {
  return <RequireAuth><NotaDetalle /></RequireAuth>;
}
