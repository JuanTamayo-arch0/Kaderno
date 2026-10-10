import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, S, shadow } from '../../lib/theme';
import { MarkdownEditor } from '../../components/MarkdownEditor';
import { NoteAttachments } from '../../components/NoteAttachments';
import { SubjectIcon } from '../../components/SubjectIcon';
import {
  Note, Subject, getNote, getSubjects, updateNote, deleteNote, signedUrl,
  aiSummary, aiFlashcards, addFlashcards, indexNote,
} from '../../lib/db';

export default function NotaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [genSum, setGenSum] = useState(false);
  const [genCards, setGenCards] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, subs] = await Promise.all([getNote(id), getSubjects()]);
      if (!n) return;
      setNote(n); setTitle(n.title ?? ''); setContent(n.content ?? ''); setSummary(n.summary ?? null);
      setSubject(subs.find((s) => s.id === n.subject_id) ?? null);
      if (n.image_path) signedUrl(n.image_path).then(setPhoto).catch(() => {});
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, [id]);

  async function makeSummary() {
    if (!content.trim()) return Alert.alert('La nota está vacía');
    setGenSum(true);
    try {
      const s = await aiSummary(content);
      setSummary(s);
      await updateNote(id, { summary: s });
    } catch (e: any) { Alert.alert('No se pudo generar', e.message + '\n(¿Desplegaste la función "ai"?)'); }
    finally { setGenSum(false); }
  }
  async function makeFlashcards() {
    if (!content.trim()) return Alert.alert('La nota está vacía');
    setGenCards(true);
    try {
      const cards = await aiFlashcards(content);
      if (!cards.length) throw new Error('No se generaron tarjetas');
      await addFlashcards(cards, id, note?.subject_id ?? null);
      Alert.alert('¡Listo!', `${cards.length} flashcards creadas. Repásalas desde la pestaña Hoy.`);
    } catch (e: any) { Alert.alert('No se pudo generar', e.message + '\n(¿Desplegaste la función "ai"?)'); }
    finally { setGenCards(false); }
  }
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dirty = note ? (title !== (note.title ?? '') || content !== (note.content ?? '')) : false;

  async function save() {
    setSaving(true);
    try {
      await updateNote(id, { title: title.trim(), content });
      setNote({ ...(note as Note), title: title.trim(), content });
      indexNote(id, content, note?.subject_id ?? null); // best-effort para el Oráculo
      Alert.alert('Guardado', 'Cambios guardados ✓');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  }

  function confirmDelete() {
    Alert.alert('Eliminar nota', '¿Seguro que quieres borrar esta nota? No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await deleteNote(id); router.back(); }
        catch (e: any) { Alert.alert('Error', e.message); }
      } },
    ]);
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><ActivityIndicator color={C.brand} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Barra superior */}
      <View style={{ paddingTop: 54, paddingHorizontal: S.md, paddingBottom: S.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {photo && (
            <Pressable onPress={() => setZoom(true)} hitSlop={10} accessibilityLabel="Ver foto original" style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="image-outline" size={18} color={C.muted} />
              <Text style={{ color: C.muted, fontSize: 12.5 }}>Original</Text>
            </Pressable>
          )}
          <Pressable onPress={confirmDelete} hitSlop={10} accessibilityLabel="Eliminar nota">
            <Ionicons name="trash-outline" size={22} color={C.muted} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* Metadatos */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.sm, flexWrap: 'wrap' }}>
          {subject && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 11, borderRadius: R.pill, backgroundColor: subject.color + '22', borderWidth: 1, borderColor: subject.color + '55' }}>
              <SubjectIcon icon={subject.icon} box={16} emoji={13} />
              <Text style={{ color: subject.color, fontSize: 12.5, fontWeight: '600' }}>{subject.name}</Text>
            </View>
          )}
          {note?.created_at && (
            <Text style={{ color: C.muted, fontSize: 12 }}>
              {new Date(note.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          )}
        </View>

        {/* Título editable */}
        <TextInput
          value={title} onChangeText={setTitle} placeholder="Título de la nota"
          placeholderTextColor={C.muted}
          style={{ color: C.text, fontSize: 22, fontWeight: '800', paddingVertical: S.sm }}
          multiline
        />

        {/* Contenido editable (Markdown con vista renderizada) */}
        <View style={{ marginTop: S.sm }}>
          <MarkdownEditor value={content} onChange={setContent} minHeight={420} />
        </View>
        <Text style={{ color: C.muted, fontSize: 11.5, marginTop: S.sm, marginLeft: 4 }}>
          {content.trim().split(/\s+/).filter(Boolean).length} palabras · Markdown
        </Text>

        {/* Diagramas y adjuntos */}
        <NoteAttachments noteId={id} />

        {/* Estudiar con IA */}
        <Text style={{ color: C.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', marginTop: 24, marginBottom: 8 }}>Estudiar con IA</Text>

        {summary && (
          <View style={{ backgroundColor: C.brand + '14', borderColor: C.brand + '44', borderWidth: 1, borderRadius: R.lg, padding: S.md, marginBottom: S.md }}>
            <Text style={{ color: C.brand, fontWeight: '700', fontSize: 12.5, marginBottom: 6 }}>✨ Resumen</Text>
            <Text style={{ color: C.text, fontSize: 14, lineHeight: 21 }}>{summary}</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={makeSummary} disabled={genSum}
            style={({ pressed }) => ({ flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: R.md, padding: 13, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{genSum ? 'Resumiendo…' : summary ? '↻ Rehacer resumen' : '✨ Resumir'}</Text>
          </Pressable>
          <Pressable onPress={makeFlashcards} disabled={genCards}
            style={({ pressed }) => ({ flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: R.md, padding: 13, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{genCards ? 'Creando…' : '🃏 Flashcards'}</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.push({ pathname: '/oraculo', params: { mode: 'note', noteId: id, subjectId: note?.subject_id ?? '', noteTitle: title || 'Nota' } })}
          style={({ pressed }) => ({ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand2 + '22', borderColor: C.brand2 + '55', borderWidth: 1, borderRadius: R.md, padding: 13, marginTop: 10, opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ fontSize: 16 }}>🔮</Text>
          <Text style={{ color: C.brand2, fontSize: 14, fontWeight: '700' }}>Preguntar al Oráculo sobre esta nota</Text>
        </Pressable>
      </ScrollView>

      {/* Botón guardar flotante (solo si hay cambios) */}
      {dirty && (
        <View style={{ position: 'absolute', left: S.lg, right: S.lg, bottom: 28 }}>
          <Pressable onPress={save} disabled={saving}
            style={({ pressed }) => ({
              backgroundColor: C.brand, borderRadius: R.md, padding: 15, alignItems: 'center',
              opacity: pressed ? 0.85 : 1, ...shadow,
            })}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{saving ? 'Guardando…' : 'Guardar cambios'}</Text>
          </Pressable>
        </View>
      )}

      {/* Visor de foto a pantalla completa */}
      <Modal visible={zoom} transparent onRequestClose={() => setZoom(false)}>
        <Pressable onPress={() => setZoom(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
          {photo && <Image source={{ uri: photo }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
          <Text style={{ color: C.muted, marginTop: 16, fontSize: 13 }}>Toca para cerrar</Text>
        </Pressable>
      </Modal>
    </View>
  );
}
