import { useEffect, useState } from 'react';
import { RequireAuth } from '../components/RequireAuth';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R } from '../lib/theme';
import { useResponsive, SIDEBAR_W } from '../lib/responsive';
import { Note, Task, Subject, Flashcard, search } from '../lib/db';
import { SubjectIcon } from '../components/SubjectIcon';

function Buscar() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ notes: Note[]; tasks: Task[]; subjects: Subject[]; flashcards: Flashcard[] }>({ notes: [], tasks: [], subjects: [], flashcards: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setRes({ notes: [], tasks: [], subjects: [], flashcards: [] }); return; }
    const id = setTimeout(async () => {
      setBusy(true);
      try { setRes(await search(q.trim())); } catch { /* noop */ } finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  function go(path: string) { router.push(path); }
  const total = res.notes.length + res.tasks.length + res.subjects.length + res.flashcards.length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: isWide ? SIDEBAR_W : 0 }}>
      <View style={{ paddingTop: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver"><Ionicons name="chevron-back" size={26} color={C.text} /></Pressable>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12 }}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Buscar notas, tareas, materias, flashcards…"
            placeholderTextColor={C.muted} style={{ flex: 1, color: C.text, paddingVertical: 12, fontSize: 15 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, maxWidth: 900, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {busy && <Text style={{ color: C.muted }}>Buscando…</Text>}
        {q.trim() !== '' && !busy && total === 0 && <Text style={{ color: C.muted, textAlign: 'center', marginTop: 30 }}>Sin resultados para “{q}”.</Text>}

        {res.subjects.length > 0 && <Text style={sec}>Materias</Text>}
        {res.subjects.map((s) => (
          <Pressable key={s.id} onPress={() => go(`/materia/${s.id}`)} style={item}>
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: s.color + '22', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><SubjectIcon icon={s.icon} box={30} emoji={15} /></View>
            <Text style={{ color: C.text, flex: 1, fontWeight: '600' }} numberOfLines={1}>{s.name}</Text>
          </Pressable>
        ))}

        {res.notes.length > 0 && <Text style={sec}>Notas</Text>}
        {res.notes.map((n) => (
          <Pressable key={n.id} onPress={() => go(`/nota/${n.id}`)} style={item}>
            <Ionicons name="document-text-outline" size={18} color={C.brand} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{n.title || 'Nota'}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>{n.content}</Text>
            </View>
          </Pressable>
        ))}

        {res.tasks.length > 0 && <Text style={sec}>Tareas</Text>}
        {res.tasks.map((t) => (
          <View key={t.id} style={item}>
            <Ionicons name="checkbox-outline" size={18} color={C.good} />
            <Text style={{ color: C.text, flex: 1 }} numberOfLines={1}>{t.title}</Text>
          </View>
        ))}

        {res.flashcards.length > 0 && <Text style={sec}>Flashcards</Text>}
        {res.flashcards.map((c) => (
          <Pressable key={c.id} onPress={() => go('/repaso')} style={item}>
            <Ionicons name="albums-outline" size={18} color={C.brand2} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{c.front}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>{c.back}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const sec = { color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', marginTop: 16, marginBottom: 8 } as const;
const item = { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.md, padding: 12, marginBottom: 8 } as const;

// Esta pantalla no es una pestaña, así que el candado de sesión va aquí.
export default function BuscarProtegida() {
  return (
    <RequireAuth>
      <Buscar />
    </RequireAuth>
  );
}
