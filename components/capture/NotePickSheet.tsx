import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { searchNoteTitles, type NoteRef } from '../../lib/notesDb';

/** Elegir una nota existente (para agregar al final). */
export function NotePickSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (n: NoteRef) => void }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<NoteRef[] | null>(null);
  useEffect(() => { if (visible) setQ(''); }, [visible]);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    const t = setTimeout(() => searchNoteTitles(q).then((l) => live && setList(l)), 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, visible]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Agregar a otra nota" subtitle="Lo leído va al final de la nota que elijas.">
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface2, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10 }}>
          <Ionicons name="search" size={15} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Busca por título" placeholderTextColor={C.muted} accessibilityLabel="Buscar una nota" autoFocus
            style={[{ flex: 1, color: C.text, fontSize: 14, paddingVertical: 9 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
        </View>
        {list === null && <ActivityIndicator color={C.brand} />}
        {list?.map((n) => (
          <Pressable key={n.id} onPress={() => { onPick(n); onClose(); }} accessibilityRole="button" accessibilityLabel={`Elegir ${n.title}`}
            style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
            <Ionicons name="document-text-outline" size={16} color={C.muted} />
            <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{n.title}</Text>
          </Pressable>
        ))}
        {list?.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>No encontré notas con ese título.</Text>}
      </View>
    </Sheet>
  );
}
