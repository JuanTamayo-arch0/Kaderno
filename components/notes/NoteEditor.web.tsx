import React, { Suspense, forwardRef } from 'react';
import { Text, View } from 'react-native';
import { C } from '../../lib/theme';
import { LazyMarkdown } from '../LazyMarkdown';
import type { NoteEditorHandle, NoteEditorProps } from './editorTypes';

// El editor (TipTap + KaTeX) pesa bastante: se descarga solo al abrir una nota.
// Mientras llega se muestra la nota ya formateada con el lector de siempre.
const RichEditor = React.lazy(() => import('./RichEditorImpl'));

// Metro devuelve un "thenable" sin .catch: por eso el Promise.resolve().
export function preloadNoteEditor() { Promise.resolve().then(() => import('./RichEditorImpl')).catch(() => {}); }

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(props, ref) {
  const fallback = (
    <View style={{ maxWidth: props.maxWidth ?? 720, width: '100%', minHeight: props.minHeight ?? 320 }}>
      {props.value?.trim()
        ? <LazyMarkdown style={{ body: { color: C.text, fontSize: 17, lineHeight: 29 } }}>{props.value}</LazyMarkdown>
        : <Text style={{ color: C.muted, fontSize: 16 }}>Cargando el editor…</Text>}
    </View>
  );
  return (
    <Suspense fallback={fallback}>
      <RichEditor ref={ref} {...props} />
    </Suspense>
  );
});
