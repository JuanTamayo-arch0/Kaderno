import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { C, R } from '../../lib/theme';
import { useResponsive, SIDEBAR_W } from '../../lib/responsive';
import { Subject, getSubjects, askOracle, getOracleMessages, saveOracleMessage, clearOracleMessages, reindexNotes } from '../../lib/db';
import { iconChar } from '../../components/SubjectIcon';
import { Alert } from 'react-native';
import { Header, Chip } from '../../components/ui';

type Msg = { role: 'user' | 'assistant'; content: string; sources?: { title: string }[] };
const ABILITIES = [
  { key: 'explain', label: '📖 Explícame', q: 'Explícame lo más importante de este material, con ejemplos.' },
  { key: 'quiz', label: '❓ Hazme un quiz', q: 'Hazme un quiz de práctica sobre este material.' },
  { key: 'summary', label: '📝 Resumen', q: 'Dame un resumen / guía de estudio de este material.' },
  { key: 'connect', label: '🔗 Conecta temas', q: 'Conecta y relaciona los temas entre mis notas y materias.' },
];

export default function Oraculo() {
  const { isWide } = useResponsive();
  const params = useLocalSearchParams<{ mode?: string; subjectId?: string; noteId?: string; noteTitle?: string }>();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mode, setMode] = useState<'all' | 'subject' | 'note'>((params.mode as any) || 'all');
  const [subjectId, setSubjectId] = useState<string | null>(params.subjectId ?? null);
  const noteId = params.noteId ?? null;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const scroller = useRef<ScrollView>(null);

  async function reindex() {
    setIndexing(true);
    try { const n = await reindexNotes(); Alert.alert('Indexado', `${n} nota(s) indexadas para búsqueda semántica.`); }
    catch (e: any) { Alert.alert('No se pudo indexar', e.message + '\n(Requiere OPENAI_API_KEY y la función "oracle" desplegada.)'); }
    finally { setIndexing(false); }
  }

  useFocusEffect(useCallback(() => {
    getSubjects().then(setSubjects).catch(() => {});
    getOracleMessages().then((h) => setMessages(h.map((m) => ({ role: m.role, content: m.content })))).catch(() => {});
  }, []));

  // Si llega con nota, fija el modo nota.
  useEffect(() => {
    if (params.noteId) { setMode('note'); if (params.subjectId) setSubjectId(params.subjectId); }
  }, [params.noteId]);

  const scopeStr = mode === 'all' ? 'all' : mode === 'subject' ? `subject:${subjectId}` : `note:${noteId}`;

  async function send(question: string, ability: string | null) {
    const q = question.trim();
    if (!q || sending) return;
    setInput('');
    const next = [...messages, { role: 'user' as const, content: q }];
    setMessages(next);
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);
    saveOracleMessage('user', q, scopeStr).catch(() => {});
    setSending(true);
    try {
      const res = await askOracle({ question: q, mode, subjectId, noteId, ability, history: messages.slice(-8) });
      setMessages([...next, { role: 'assistant', content: res.answer, sources: res.sources }]);
      saveOracleMessage('assistant', res.answer, scopeStr).catch(() => {});
    } catch (e: any) {
      setMessages([...next, { role: 'assistant', content: `⚠️ No pude responder: ${e.message}\n\n(¿Desplegaste la función "oracle" y corriste la migración v3?)` }]);
    } finally {
      setSending(false);
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    }
  }

  async function clearAll() {
    setMessages([]);
    clearOracleMessages().catch(() => {});
  }

  const scopeLabel = mode === 'note' ? `📄 ${params.noteTitle || 'Nota abierta'}` : mode === 'subject'
    ? (subjects.find((s) => s.id === subjectId)?.name ?? 'Materia') : 'Todas mis notas';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg, paddingLeft: isWide ? SIDEBAR_W : 0 }}>
      <Header title="Oráculo" subtitle="Pregúntale a la IA sobre tus notas"
        right={<Pressable onPress={clearAll} hitSlop={10} accessibilityLabel="Borrar conversación"><Ionicons name="trash-outline" size={20} color={C.muted} /></Pressable>} />

      {/* Alcance */}
      <View style={{ paddingHorizontal: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {noteId && <Chip label="📄 Nota abierta" active={mode === 'note'} onPress={() => setMode('note')} />}
          <Chip label="Todas mis notas" active={mode === 'all'} onPress={() => { setMode('all'); }} />
          {subjects.map((s) => (
            <Chip key={s.id} label={`${iconChar(s.icon)} ${s.name}`} active={mode === 'subject' && subjectId === s.id} onPress={() => { setMode('subject'); setSubjectId(s.id); }} />
          ))}
        </ScrollView>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 20, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
        {messages.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: C.brand2 + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 36 }}>🔮</Text>
            </View>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>Consulta al Oráculo</Text>
            <Text style={{ color: C.muted, fontSize: 13.5, textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: 340 }}>
              Pregunta lo que quieras sobre tus apuntes ({scopeLabel}). O usa un atajo:
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              {ABILITIES.map((a) => (
                <Pressable key={a.key} onPress={() => send(a.q, a.key)} style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14 }}>
                  <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={reindex} disabled={indexing} style={{ marginTop: 22 }}>
              <Text style={{ color: C.muted, fontSize: 12.5, textDecorationLine: 'underline' }}>{indexing ? 'Indexando…' : '⟳ Indexar mis notas (mejora las respuestas)'}</Text>
            </Pressable>
          </View>
        )}

        {messages.map((m, i) => (
          m.role === 'user' ? (
            <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: C.brand, borderRadius: 16, borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12 }}>
              <Text style={{ color: '#0f1115', fontSize: 15 }}>{m.content}</Text>
            </View>
          ) : (
            <View key={i} style={{ alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, padding: 14, marginBottom: 12 }}>
              <Markdown style={md}>{m.content}</Markdown>
              {!!m.sources?.length && (
                <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 8 }}>Fuentes: {m.sources.slice(0, 4).map((s) => s.title).join(' · ')}</Text>
              )}
            </View>
          )
        ))}
        {sending && <View style={{ alignSelf: 'flex-start', padding: 12 }}><ActivityIndicator color={C.brand} /></View>}
      </ScrollView>

      {/* Barra de entrada */}
      <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: C.line, alignItems: 'flex-end', maxWidth: 900, width: '100%', alignSelf: 'center' }}>
        <TextInput value={input} onChangeText={setInput} placeholder="Pregúntale al Oráculo…" placeholderTextColor={C.muted}
          multiline style={{ flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 14, color: C.text, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 120 }} />
        <Pressable onPress={() => send(input, null)} disabled={sending || !input.trim()} accessibilityLabel="Enviar"
          style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: input.trim() ? C.brand : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-up" size={22} color={input.trim() ? '#0f1115' : C.muted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const md: any = {
  body: { color: C.text, fontSize: 15, lineHeight: 23 },
  heading1: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 8, marginBottom: 4 },
  heading2: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  heading3: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 6, marginBottom: 2 },
  strong: { fontWeight: '800', color: C.text },
  em: { fontStyle: 'italic' },
  bullet_list: { marginVertical: 2 },
  ordered_list: { marginVertical: 2 },
  list_item: { marginVertical: 2, color: C.text },
  blockquote: { backgroundColor: C.surface2, borderLeftColor: C.brand, borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginVertical: 4 },
  code_inline: { backgroundColor: C.surface2, color: C.brand2, borderRadius: 4, paddingHorizontal: 4, fontFamily: 'monospace', fontSize: 13 },
  fence: { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 8, padding: 10, color: C.text, fontFamily: 'monospace', fontSize: 13 },
  link: { color: C.brand },
};
