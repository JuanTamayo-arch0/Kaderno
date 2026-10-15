import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { Subject, getSubjects, askOracle, getOracleMessages, saveOracleMessage, clearOracleMessages, reindexNotes, addFlashcards } from '../../lib/db';
import { confirm, toast, friendlyError } from '../../lib/feedback';
import { Screen, FilterChip, IconButton, Dot } from '../../components/ds';
import { copyText } from '../../lib/fileIO';

// ============================================================
//  Oráculo: preguntas a la IA sobre tus apuntes.
//  El historial se guarda por alcance (todas las notas, una materia o una
//  nota), los errores se explican en palabras simples y cada respuesta se
//  puede copiar.
// ============================================================

type Msg = { role: 'user' | 'assistant'; content: string; sources?: { title: string }[]; error?: boolean };
const ABILITIES = [
  { key: 'explain', icon: 'bulb-outline', label: 'Explícame', q: 'Explícame lo más importante de este material, con ejemplos.' },
  { key: 'quiz', icon: 'help-circle-outline', label: 'Hazme un quiz', q: 'Hazme un quiz de práctica de 5 preguntas sobre este material.' },
  { key: 'summary', icon: 'reader-outline', label: 'Guía de estudio', q: 'Dame una guía de estudio de este material.' },
  { key: 'connect', icon: 'git-network-outline', label: 'Conecta temas', q: 'Conecta y relaciona los temas entre mis notas y materias.' },
] as const;

export default function Oraculo() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const params = useLocalSearchParams<{ mode?: string; subjectId?: string; noteId?: string; noteTitle?: string; q?: string }>();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mode, setMode] = useState<'all' | 'subject' | 'note'>((params.mode as any) || 'all');
  const [subjectId, setSubjectId] = useState<string | null>(params.subjectId || null);
  const noteId = params.noteId || null;
  const [all, setAll] = useState<(Msg & { scope: string | null })[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const sentQ = useRef<string | null>(null);

  const scopeStr = mode === 'all' ? 'all' : mode === 'subject' ? `subject:${subjectId}` : `note:${noteId}`;
  const messages = all.filter((m) => (m.scope ?? 'all') === scopeStr);

  useFocusEffect(useCallback(() => {
    getSubjects().then(setSubjects).catch(() => {});
    getOracleMessages().then((h) => setAll(h.map((m) => ({ role: m.role, content: m.content, scope: m.scope })))).catch(() => {});
  }, []));
  useEffect(() => { if (params.noteId) { setMode('note'); if (params.subjectId) setSubjectId(params.subjectId); } }, [params.noteId]);
  useEffect(() => { if (params.mode === 'subject' && params.subjectId) { setMode('subject'); setSubjectId(params.subjectId); } }, [params.mode, params.subjectId]);
  useEffect(() => { setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 50); }, [scopeStr, all.length]);

  const send = useCallback(async (question: string, ability: string | null) => {
    const q = question.trim();
    if (!q || sending) return;
    setInput('');
    const hist = all.filter((m) => (m.scope ?? 'all') === scopeStr && !m.error).slice(-8).map((m) => ({ role: m.role, content: m.content }));
    setAll((xs) => [...xs, { role: 'user', content: q, scope: scopeStr }]);
    saveOracleMessage('user', q, scopeStr).catch(() => {});
    setSending(true);
    try {
      const res = await askOracle({ question: q, mode, subjectId, noteId, ability, history: hist });
      setAll((xs) => [...xs, { role: 'assistant', content: res.answer, sources: res.sources, scope: scopeStr }]);
      saveOracleMessage('assistant', res.answer, scopeStr).catch(() => {});
    } catch (e) {
      setAll((xs) => [...xs, { role: 'assistant', content: `No pude responder. ${friendlyError(e)}`, scope: scopeStr, error: true }]);
    } finally { setSending(false); }
  }, [all, scopeStr, sending, mode, subjectId, noteId]);

  // Pregunta que llega desde Estudiar.
  useEffect(() => { if (params.q && sentQ.current !== params.q) { sentQ.current = params.q; send(params.q, null); router.setParams({ q: undefined } as any); } }, [params.q]);

  async function clearAll() {
    if (!(await confirm('¿Borrar toda la conversación?', 'Se borra el historial del Oráculo en todos los temas.', 'Borrar'))) return;
    setAll([]); clearOracleMessages().catch(() => {});
  }
  async function reindex() {
    setIndexing(true);
    try { const n = await reindexNotes(); toast(`${n} ${n === 1 ? 'nota preparada' : 'notas preparadas'} para el Oráculo`, { tone: 'good' }); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setIndexing(false); }
  }

  const scopeLabel = mode === 'note' ? (params.noteTitle || 'la nota abierta') : mode === 'subject' ? (subjects.find((s) => s.id === subjectId)?.name ?? 'esta materia') : 'todas tus notas';

  return (
    <Screen title="Oráculo" subtitle={`Pregúntale a la IA sobre ${scopeLabel}`} scroll={false} padded={false} maxWidth={860} back={isWide ? undefined : '/estudiar'}
      right={<IconButton icon="trash-outline" label="Borrar conversación" onPress={clearAll} />}
      header={
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8, flexGrow: 0 }}>
          {noteId && <FilterChip label={params.noteTitle || 'Nota abierta'} icon={<Ionicons name="document-text-outline" size={14} color={mode === 'note' ? C.onBrand : C.muted} />} active={mode === 'note'} onPress={() => setMode('note')} />}
          <FilterChip label="Todas mis notas" active={mode === 'all'} onPress={() => setMode('all')} />
          {subjects.map((s) => <FilterChip key={s.id} label={s.name} color={s.color} active={mode === 'subject' && subjectId === s.id} onPress={() => { setMode('subject'); setSubjectId(s.id); }} />)}
        </ScrollView>
      }>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 20, maxWidth: 860, width: '100%', alignSelf: 'center' }}>
          {messages.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 30 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.brand2 + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Ionicons name="sparkles" size={28} color={C.brand2} />
              </View>
              <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>¿Qué quieres entender hoy?</Text>
              <Text style={{ color: C.muted, fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 20, maxWidth: 380 }}>Responde con base en {scopeLabel}. Prueba un atajo:</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                {ABILITIES.map((a) => (
                  <Pressable key={a.key} onPress={() => send(a.q, a.key)} accessibilityRole="button"
                    style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: hovered ? C.surface2 : C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, minHeight: 40 })}>
                    <Ionicons name={a.icon as any} size={15} color={C.brand} />
                    <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={reindex} disabled={indexing} style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }} accessibilityRole="button">
                {indexing ? <ActivityIndicator size="small" color={C.muted} /> : <Ionicons name="refresh" size={14} color={C.muted} />}
                <Text style={{ color: C.muted, fontSize: 12.5, textDecorationLine: 'underline' }}>{indexing ? 'Preparando tus notas…' : 'Preparar mis notas para mejores respuestas'}</Text>
              </Pressable>
            </View>
          )}
          {messages.map((m, i) => m.role === 'user' ? (
            <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: C.brand, borderRadius: 16, borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12 }}>
              <Text style={{ color: C.onBrand, fontSize: 15, lineHeight: 21 }}>{m.content}</Text>
            </View>
          ) : (
            <View key={i} style={{ alignSelf: 'flex-start', maxWidth: '94%', backgroundColor: m.error ? C.bad + '14' : C.surface, borderColor: m.error ? C.bad + '55' : C.line, borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, padding: 14, marginBottom: 12 }}>
              <Markdown style={mdStyle()}>{m.content}</Markdown>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {!!m.sources?.length && <Text style={{ color: C.muted, fontSize: 12, flex: 1 }}>Fuentes: {m.sources.slice(0, 4).map((s) => s.title).join(', ')}</Text>}
                {!m.error && <IconButton icon="copy-outline" label="Copiar respuesta" size={16} onPress={async () => { const ok = await copyText(m.content); if (ok) toast('Respuesta copiada'); }} />}
              </View>
            </View>
          ))}
          {sending && (
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
              <ActivityIndicator color={C.brand} size="small" />
              <Text style={{ color: C.muted, fontSize: 13 }}>Pensando…</Text>
            </View>
          )}
        </ScrollView>
        <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: isWide ? 40 : 12, paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end', maxWidth: 860, width: '100%', alignSelf: 'center' }}>
            <TextInput value={input} onChangeText={setInput} placeholder="Escribe tu pregunta…" placeholderTextColor={C.muted} multiline accessibilityLabel="Pregunta"
              onKeyPress={(e: any) => { if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault(); send(input, null); } }}
              style={[{ flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 14, color: C.text, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, maxHeight: 140, minHeight: 46 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
            <Pressable onPress={() => send(input, null)} disabled={sending || !input.trim()} accessibilityRole="button" accessibilityLabel="Enviar pregunta"
              style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: input.trim() ? C.brand : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-up" size={22} color={input.trim() ? C.onBrand : C.muted} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function mdStyle(): any {
  return {
    body: { color: C.text, fontSize: 15, lineHeight: 23 },
    heading1: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 8, marginBottom: 4 },
    heading2: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 8, marginBottom: 4 },
    heading3: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 6, marginBottom: 2 },
    strong: { fontWeight: '800', color: C.text },
    em: { fontStyle: 'italic' },
    list_item: { marginVertical: 2, color: C.text },
    blockquote: { backgroundColor: C.surface2, borderLeftColor: C.brand, borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginVertical: 4 },
    code_inline: { backgroundColor: C.surface2, color: C.text, borderRadius: 4, paddingHorizontal: 4, fontFamily: 'monospace', fontSize: 13 },
    fence: { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 8, padding: 10, color: C.text, fontFamily: 'monospace', fontSize: 13 },
    link: { color: C.brand },
  };
}
