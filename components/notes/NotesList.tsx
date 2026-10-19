import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Note } from '../../lib/db';
import { filterNotes, notePreview, readingStats, sortNotes } from '../../lib/subjectInfo';
import { MONTH_SHORT } from '../../lib/time';
import { Button, EmptyState, focusRingStyle, IconButton } from '../ds';
import { recallLabel } from '../../lib/quiz';

// ============================================================
//  Lista de notas de una materia: buscador, fijadas arriba y recientes.
//  En el computador es la columna izquierda de las notas; en el celular,
//  la pantalla completa de la pestaña.
// ============================================================

function when(n: Note): string {
  const d = new Date(n.updated_at || n.created_at);
  const today = new Date();
  const diff = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7) return `Hace ${diff} días`;
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}${d.getFullYear() !== today.getFullYear() ? ' ' + d.getFullYear() : ''}`;
}

function Row({ n, active, onPress, roomy }: { n: Note; active: boolean; onPress: () => void; roomy: boolean }) {
  const prev = notePreview(n.content, roomy ? 120 : 60);
  const { words } = readingStats(n.content);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`Abrir nota ${n.title || 'sin título'}`}
      dataSet={{ press: '1', petPerch: roomy ? '1' : undefined }}
      style={({ pressed, focused, hovered }: any) => [{
        paddingVertical: roomy ? 14 : 10, paddingHorizontal: roomy ? 16 : 12, borderRadius: roomy ? 14 : 10, gap: 3,
        backgroundColor: active ? C.brand + '1f' : roomy ? C.surface : (hovered || pressed) ? C.surface2 : 'transparent',
        borderWidth: 1, borderColor: active ? C.brand + '55' : roomy ? C.line : 'transparent', marginBottom: roomy ? 8 : 2,
      }, focused ? focusRingStyle() : null]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {n.pinned ? <Ionicons name="pin" size={12} color={C.warnText} /> : null}
        {n.image_path ? <Ionicons name="camera-outline" size={13} color={C.muted} /> : null}
        <Text style={{ color: C.text, fontSize: roomy ? 15.5 : 14, fontWeight: active ? '800' : '700', flex: 1 }} numberOfLines={1}>{n.title || 'Nota sin título'}</Text>
        {roomy && <Text style={{ color: C.muted, fontSize: 12 }}>{when(n)}</Text>}
      </View>
      {!!prev && <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 17 }} numberOfLines={roomy ? 2 : 1}>{prev}</Text>}
      {!roomy && <Text style={{ color: C.muted, fontSize: 11.5 }}>{when(n)} · {words} {words === 1 ? 'palabra' : 'palabras'}</Text>}
      {(() => { const r = recallLabel(n.last_recall_at, n.last_recall_score, new Date()); return r ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="bulb-outline" size={11} color={(n.last_recall_score ?? 0) >= 70 ? C.goodText : C.muted} />
          <Text style={{ color: (n.last_recall_score ?? 0) >= 70 ? C.goodText : C.muted, fontSize: 11.5 }}>{r}</Text>
        </View>
      ) : null; })()}
    </Pressable>
  );
}

export function NotesList({ notes, selectedId, onOpen, onNew, onScan, roomy, busyNew }: {
  notes: Note[]; selectedId?: string | null; onOpen: (n: Note) => void; onNew: () => void; onScan: () => void;
  /** Tarjetas grandes (celular / pantalla completa). */
  roomy?: boolean; busyNew?: boolean;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => filterNotes(sortNotes(notes), q), [notes, q]);
  const pinned = list.filter((n) => n.pinned);
  const rest = list.filter((n) => !n.pinned);
  const label = (t: string) => <Text style={{ color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: 12, marginBottom: 6, marginLeft: 4 }}>{t}</Text>;

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <Button label="Nueva nota" icon="add" onPress={onNew} busy={busyNew} style={{ flex: 1 }} />
        {roomy
          ? <Button label="Digitalizar" icon="camera-outline" kind="secondary" onPress={onScan} />
          : <IconButton icon="camera-outline" label="Digitalizar apunte" onPress={onScan} color={C.text} style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }} />}
      </View>
      {notes.length > 2 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, marginBottom: 4 }}>
          <Ionicons name="search" size={15} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar en las notas" placeholderTextColor={C.muted} accessibilityLabel="Buscar en las notas"
            style={[{ flex: 1, minWidth: 0, color: C.text, fontSize: 14 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
          {!!q && <IconButton icon="close" label="Borrar búsqueda" onPress={() => setQ('')} size={16} style={{ width: 32, height: 32 }} />}
        </View>
      )}
      {notes.length === 0 && (
        <EmptyState compact icon="document-text-outline" title="Aún no hay notas" text="Escribe una nota o digitaliza una página de tu cuaderno." />
      )}
      {notes.length > 0 && list.length === 0 && <Text style={{ color: C.muted, fontSize: 13, padding: 12 }}>Ninguna nota tiene “{q.trim()}”.</Text>}
      {pinned.length > 0 && label('FIJADAS')}
      {pinned.map((n) => <Row key={n.id} n={n} active={n.id === selectedId} onPress={() => onOpen(n)} roomy={!!roomy} />)}
      {pinned.length > 0 && rest.length > 0 && label('RECIENTES')}
      {rest.map((n) => <Row key={n.id} n={n} active={n.id === selectedId} onPress={() => onOpen(n)} roomy={!!roomy} />)}
    </View>
  );
}
