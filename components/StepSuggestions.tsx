import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';
import { suggestSteps } from '../lib/stepSuggest';
import { aiSteps } from '../lib/db';
import { toast, friendlyError } from '../lib/feedback';

// ============================================================
//  "Sugerir pasos": propone microtareas a partir del título y la
//  descripción. Primero sugerencias inmediatas (sin internet); el botón
//  "Mejorar con IA" pide otras a la función "ai".
//  Cada sugerencia se agrega con un toque, o todas de una vez.
// ============================================================

export function StepSuggestions({ title, description, typeKey, existing, onAdd, disabled }: {
  title: string; description: string | null | undefined; typeKey?: string | null;
  existing: string[]; onAdd: (titles: string[]) => void | Promise<void>; disabled?: boolean;
}) {
  const [items, setItems] = useState<string[] | null>(null);
  const [source, setSource] = useState<'local' | 'ia'>('local');
  const [busy, setBusy] = useState(false);

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const visible = (items ?? []).filter((s) => !existing.some((e) => norm(e) === norm(s)));

  function open() {
    if (!title.trim() && !(description ?? '').trim()) { toast('Escribe primero el título o la descripción'); return; }
    setItems(suggestSteps(title, description, typeKey, existing));
    setSource('local');
  }
  async function withAI() {
    setBusy(true);
    try {
      const s = await aiSteps(title, description ?? null);
      if (!s.length) throw new Error('La IA no devolvió pasos.');
      setItems(s); setSource('ia');
    } catch (e) { toast(`No se pudo usar la IA. ${friendlyError(e)}`, { tone: 'bad' }); }
    finally { setBusy(false); }
  }
  async function add(list: string[]) {
    if (!list.length) return;
    await onAdd(list);
  }

  if (disabled) return null;
  if (items === null) {
    return (
      <Pressable onPress={open} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8 }}>
        <Ionicons name="bulb-outline" size={16} color={C.brand} />
        <Text style={{ color: C.brand, fontWeight: '700', fontSize: 13.5 }}>Sugerir pasos</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ marginTop: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.brand + '55', backgroundColor: C.brand + '0f' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Ionicons name={source === 'ia' ? 'sparkles' : 'bulb-outline'} size={15} color={C.brand} />
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 13, flex: 1 }}>{source === 'ia' ? 'Sugerencias de la IA' : 'Pasos sugeridos'}</Text>
        <Pressable onPress={() => setItems(null)} accessibilityLabel="Cerrar sugerencias" hitSlop={8}><Ionicons name="close" size={17} color={C.muted} /></Pressable>
      </View>
      {visible.length === 0 ? (
        <Text style={{ color: C.muted, fontSize: 12.5 }}>Ya agregaste todas las sugerencias.</Text>
      ) : visible.map((s) => (
        <Pressable key={s} onPress={() => add([s])} accessibilityRole="button" accessibilityLabel={`Agregar paso: ${s}`}
          style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
          <Ionicons name="add-circle-outline" size={18} color={C.brand} />
          <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }}>{s}</Text>
        </Pressable>
      ))}
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {visible.length > 1 && (
          <Pressable onPress={() => add(visible)} accessibilityRole="button" style={{ paddingVertical: 6 }}>
            <Text style={{ color: C.brand, fontWeight: '800', fontSize: 13 }}>Agregar todos ({visible.length})</Text>
          </Pressable>
        )}
        {source === 'local' && (
          <Pressable onPress={withAI} disabled={busy} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}>
            {busy ? <ActivityIndicator size="small" color={C.brand} /> : <Ionicons name="sparkles-outline" size={14} color={C.brand} />}
            <Text style={{ color: C.brand, fontWeight: '700', fontSize: 13 }}>{busy ? 'Pensando…' : 'Mejorar con IA'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
