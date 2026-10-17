import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { MarkdownEditor } from '../MarkdownEditor';
import { outline } from '../../lib/subjectInfo';
import type { NoteEditorHandle, NoteEditorProps } from './editorTypes';

// Editor de notas en el celular nativo: el de Markdown de siempre, con el modo
// controlado desde afuera. En web se usa NoteEditor.web.tsx (TipTap).
export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(props, ref) {
  const onOutline = props.onOutline;
  useEffect(() => { onOutline?.(outline(props.value)); }, []);
  useImperativeHandle(ref, () => ({ scrollToHeading: () => {}, flush: () => null }), []);
  return (
    <MarkdownEditor value={props.value}
      onChange={(t) => { props.onChange(t); onOutline?.(outline(t)); }}
      minHeight={props.minHeight} mode={props.editing ? 'edit' : 'view'} />
  );
});
export function preloadNoteEditor() {}
