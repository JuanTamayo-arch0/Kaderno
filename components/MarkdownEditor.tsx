import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { C, R } from '../lib/theme';

// Editor de notas en Markdown con barra de formato y vista de lectura renderizada (estilo Notion).
export function MarkdownEditor({ value, onChange, minHeight = 220 }: {
  value: string; onChange: (t: string) => void; minHeight?: number;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>(value && value.trim() ? 'view' : 'edit');
  const [sel, setSel] = useState({ start: 0, end: 0 });

  function wrap(marker: string) {
    const { start, end } = sel;
    const mid = value.slice(start, end) || 'texto';
    onChange(value.slice(0, start) + marker + mid + marker + value.slice(end));
  }
  function linePrefix(prefix: string) {
    const start = sel.start;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
  }
  function insert(text: string) {
    const { start } = sel;
    onChange(value.slice(0, start) + text + value.slice(start));
  }

  const tools: { label: string; run: () => void }[] = [
    { label: 'H1', run: () => linePrefix('# ') },
    { label: 'H2', run: () => linePrefix('## ') },
    { label: 'B', run: () => wrap('**') },
    { label: 'i', run: () => wrap('*') },
    { label: '• Lista', run: () => linePrefix('- ') },
    { label: '☐ Tarea', run: () => linePrefix('- [ ] ') },
    { label: '❝ Cita', run: () => linePrefix('> ') },
    { label: '</>', run: () => wrap('`') },
    { label: '― Línea', run: () => insert('\n---\n') },
  ];

  // Para la vista, convierte las casillas de tarea a símbolos visibles.
  const forView = (value || '')
    .replace(/^(\s*[-*] )\[ \] /gm, '$1☐ ')
    .replace(/^(\s*[-*] )\[[xX]\] /gm, '$1☑ ');

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        <Seg label="Ver" active={mode === 'view'} onPress={() => setMode('view')} />
        <Seg label="Editar" active={mode === 'edit'} onPress={() => setMode('edit')} />
      </View>

      {mode === 'edit' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {tools.map((t) => (
              <Pressable key={t.label} onPress={t.run} accessibilityRole="button" accessibilityLabel={t.label}
                style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9, marginRight: 6, backgroundColor: pressed ? C.line : C.surface2, borderWidth: 1, borderColor: C.line })}>
                <Text style={{ color: C.text, fontSize: 13, fontWeight: t.label === 'B' ? '800' : '600', fontStyle: t.label === 'i' ? 'italic' : 'normal' }}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            value={value} onChangeText={onChange} multiline
            onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
            placeholder="Escribe tu apunte… usa la barra de arriba para dar formato (Markdown)."
            placeholderTextColor={C.muted}
            style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.lg, color: C.text, fontSize: 15, lineHeight: 24, padding: 14, minHeight, textAlignVertical: 'top', fontFamily: 'monospace' }}
          />
        </>
      ) : (
        <View style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.lg, padding: 18, minHeight }}>
          {value && value.trim()
            ? <Markdown style={mdStyles}>{forView}</Markdown>
            : <Text style={{ color: C.muted }}>Nota vacía. Toca “Editar” para empezar a escribir.</Text>}
        </View>
      )}
    </View>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: active ? C.brand : C.surface2, borderWidth: 1, borderColor: active ? C.brand : C.line }}>
      <Text style={{ color: active ? '#0f1115' : C.muted, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const mdStyles: any = {
  body: { color: C.text, fontSize: 15, lineHeight: 25 },
  heading1: { color: C.text, fontSize: 24, fontWeight: '800', marginTop: 14, marginBottom: 6 },
  heading2: { color: C.text, fontSize: 19, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  heading3: { color: C.text, fontSize: 16, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  strong: { fontWeight: '800', color: C.text },
  em: { fontStyle: 'italic' },
  paragraph: { marginTop: 2, marginBottom: 10 },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 3, color: C.text },
  blockquote: { backgroundColor: C.surface2, borderLeftColor: C.brand, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginVertical: 6 },
  code_inline: { backgroundColor: C.surface2, color: C.brand2, borderRadius: 5, paddingHorizontal: 5, fontFamily: 'monospace', fontSize: 13 },
  fence: { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, color: C.text, fontFamily: 'monospace', fontSize: 13 },
  code_block: { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, color: C.text, fontFamily: 'monospace', fontSize: 13 },
  hr: { backgroundColor: C.line, height: 1, marginVertical: 12 },
  link: { color: C.brand },
};
