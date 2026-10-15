import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { search, type Note, type Task, type Subject, type Flashcard, type ProjectTaskHit } from '../lib/db';
import { fmtDue } from '../lib/time';
import { openTask } from '../lib/uiBus';
import { Screen, Card, ListRow, SectionLabel, EmptyState, Dot } from '../components/ds';

// Búsqueda en pantalla completa (la paleta Ctrl K usa la misma búsqueda).
function Buscar() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ notes: Note[]; tasks: Task[]; subjects: Subject[]; flashcards: Flashcard[]; projectTasks: ProjectTaskHit[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const id = setTimeout(async () => {
      setBusy(true);
      try { setRes(await search(q.trim())); } catch { setRes(null); } finally { setBusy(false); }
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const total = res ? res.notes.length + res.tasks.length + res.subjects.length + res.flashcards.length + res.projectTasks.length : 0;
  const section = (title: string, n: number, children: React.ReactNode) => n ? (
    <View><SectionLabel text={title} count={n} /><Card padded={false}>{children}</Card></View>
  ) : null;

  return (
    <Screen title="Buscar" back="/" nav="buscar" maxWidth={820}
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, marginBottom: 6 }}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Notas, tareas, materias, proyectos, flashcards…" placeholderTextColor={C.muted} accessibilityLabel="Buscar"
            style={[{ flex: 1, color: C.text, paddingVertical: 12, fontSize: 15, minHeight: 46 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
          {busy && <ActivityIndicator size="small" color={C.brand} />}
        </View>
      }>
      {!q.trim() ? (
        <EmptyState icon="search-outline" title="Busca en todo Kaderno" text={Platform.OS === 'web' ? 'Desde cualquier pantalla también puedes usar Ctrl K.' : undefined} compact />
      ) : res && total === 0 && !busy ? (
        <EmptyState icon="search-outline" title={`Sin resultados para “${q.trim()}”`} text="Prueba con otra palabra o revisa la ortografía." compact />
      ) : res ? (
        <>
          {section('Materias', res.subjects.length, res.subjects.map((s) => <ListRow key={s.id} title={s.name} left={<Dot color={s.color} size={10} />} onPress={() => router.push(`/materia/${s.id}`)} />))}
          {section('Tareas', res.tasks.length, res.tasks.map((t) => <ListRow key={t.id} title={t.title} subtitle={[t.status === 'done' ? 'Hecha' : '', fmtDue(t)].filter(Boolean).join(' · ') || undefined} left={<Ionicons name={t.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={C.muted} />} onPress={() => openTask(t)} />))}
          {section('Tareas de proyectos', res.projectTasks.length, res.projectTasks.map((t) => <ListRow key={t.id} title={t.title} subtitle={fmtDue(t) || undefined} left={<Ionicons name="people-outline" size={18} color={C.muted} />} onPress={() => router.push(`/proyectos/${t.project_id}`)} />))}
          {section('Notas', res.notes.length, res.notes.map((n) => <ListRow key={n.id} title={n.title || 'Nota'} subtitle={(n.content ?? '').replace(/[#>*_`]/g, '').slice(0, 90)} left={<Ionicons name="document-text-outline" size={18} color={C.muted} />} onPress={() => router.push(`/nota/${n.id}`)} />))}
          {section('Flashcards', res.flashcards.length, res.flashcards.map((c) => <ListRow key={c.id} title={c.front} subtitle={c.back} left={<Ionicons name="albums-outline" size={18} color={C.muted} />} onPress={() => router.push('/repaso')} />))}
        </>
      ) : <Text style={{ color: C.muted }}>Buscando…</Text>}
    </Screen>
  );
}

export default function BuscarProtegida() {
  return <RequireAuth><Buscar /></RequireAuth>;
}
