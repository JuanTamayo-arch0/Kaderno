import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import {
  Note, Subject, getNote, updateNote, deleteNote, restoreNote, signedUrl, setNotePinned, uploadPhoto,
  aiSummary, indexNote, hasV14,
} from '../../lib/db';
import { useCardMaker } from '../cards/CardMaker';
import { supabase } from '../../lib/supabase';
import { readingStats } from '../../lib/subjectInfo';
import { MONTH_LONG } from '../../lib/time';
import { shrinkForNote } from '../../lib/imageResize';
import { notify, toast, friendlyError } from '../../lib/feedback';
import { refreshNavCounts } from '../../lib/navCounts';
import { Button, EmptyState, IconButton, focusRingStyle } from '../ds';
import { ActionMenu } from '../ActionMenu';
import { NoteAttachments } from '../NoteAttachments';
import { SubjectPicker } from '../SubjectPicker';
import { NoteEditor } from './NoteEditor';
import type { HeadingItem, NoteEditorHandle, SelectionAction } from './editorTypes';
import { RecallTest } from './RecallTest';
import { ShareNoteSheet } from './ShareNoteSheet';
import { recallLabel } from '../../lib/quiz';
import { extractLinks, refreshLinkTitles } from '../../lib/noteLinks';
import { noteTitles } from '../../lib/cardsDb';
import { searchNoteTitles, getBacklinks, getRelated, syncNoteCards, saveTemplate, type NoteRef } from '../../lib/notesDb';

// ============================================================
//  Una nota abierta: título, texto (se lee y se edita en el mismo lugar),
//  índice, "Estudiar esta nota", materia, foto original y adjuntos.
//  Se guarda sola 1,2 s después de dejar de escribir y al salir.
//
//  `scroll`: la nota tiene sus propias columnas con scroll (dentro de la
//  materia en el computador). `side`: índice y estudio en una columna a la
//  derecha; si no, van debajo del texto.
// ============================================================

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function NoteDocument({ noteId, subjects, scroll, side, startEditing, onNoteChange, onDeleted, focusHeading }: {
  noteId: string; subjects: Subject[]; scroll: boolean; side: boolean; startEditing?: boolean;
  /** Llevar la vista a este título al abrir (desde "Ver en la nota" de una tarjeta). */
  focusHeading?: string | null;
  onNoteChange?: (patch: Partial<Note> & { id: string }) => void;
  onDeleted?: (n: Note) => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState<Note | null | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(!!startEditing);
  const [status, setStatus] = useState<Status>('idle');
  const [summary, setSummary] = useState<string | null>(null);
  const [genSum, setGenSum] = useState(false);
  const maker = useCardMaker();
  const genCards = maker.busy;
  const [heads, setHeads] = useState<HeadingItem[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState<'link' | 'project' | null>(null);
  const [titleH, setTitleH] = useState(0);
  const [recall, setRecall] = useState(false);
  const [recallMd, setRecallMd] = useState('');
  const saved = useRef({ title: '', content: '' });
  const latest = useRef({ title: '', content: '' });
  const ed = useRef<NoteEditorHandle>(null);
  const cbRef = useRef(onNoteChange); cbRef.current = onNoteChange;

  useEffect(() => {
    let alive = true;
    setNote(undefined); setPhoto(null); setHeads([]); setStatus('idle');
    getNote(noteId).then((n) => {
      if (!alive) return;
      if (!n || n.deleted_at) { setNote(null); return; }
      const finish = (content: string) => {
        if (!alive) return;
        setNote(n); setTitle(n.title ?? ''); setContent(content); setSummary(n.summary ?? null);
        // Si un enlace cambió de título, la nota se guarda con el título actual.
        saved.current = { title: n.title ?? '', content: n.content ?? '' };
        latest.current = { title: n.title ?? '', content };
        if (!startEditing) setEditing(!content.trim());
      };
      const ids = extractLinks(n.content ?? '');
      if (ids.length) noteTitles(ids).then((m) => finish(refreshLinkTitles(n.content ?? '', m))).catch(() => finish(n.content ?? ''));
      else finish(n.content ?? '');
      if (n.image_path) signedUrl(n.image_path).then((u) => { if (alive) setPhoto(u); }).catch(() => {});
    }).catch(() => { if (alive) setNote(null); });
    return () => { alive = false; };
  }, [noteId]);

  // Notas conectadas: "Mencionada en" y relacionadas.
  const [backlinks, setBacklinks] = useState<NoteRef[]>([]);
  const [related, setRelated] = useState<NoteRef[]>([]);
  useEffect(() => {
    setBacklinks([]); setRelated([]);
    getBacklinks(noteId).then(setBacklinks).catch(() => {});
    getRelated(noteId).then(setRelated).catch(() => {});
  }, [noteId]);

  // Al salir de editar: tarjetas escritas con "::" o {{ }}.
  const wasEditing = useRef(editing);
  useEffect(() => {
    if (wasEditing.current && !editing && note) {
      const md = ed.current?.flush() ?? content;
      syncNoteCards(noteId, md).then(({ create, updated }) => {
        if (updated) toast(updated === 1 ? '1 tarjeta actualizada desde la nota' : `${updated} tarjetas actualizadas desde la nota`);
        if (create.length) {
          toast(`Encontré ${create.length} ${create.length === 1 ? 'tarjeta' : 'tarjetas'} en tu nota`);
          maker.review(create.map((c) => ({ kind: c.kind, front: c.front, back: c.back })), {
            noteId, subjectId: note.subject_id ?? null, title: title || 'Nota', from: 'note', lines: Object.fromEntries(create.map((c) => [c.front, c.line])),
          });
        }
      }).catch(() => {});
    }
    wasEditing.current = editing;
  }, [editing]);

  // "Ver en la nota": ir al título de donde salió la tarjeta (una vez por nota).
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focusHeading || !heads.length || focused.current === noteId + focusHeading) return;
    const want = focusHeading.trim().toLowerCase();
    const h = heads.find((x) => x.text.trim().toLowerCase() === want) ?? heads.find((x) => x.text.toLowerCase().includes(want));
    if (!h) return;
    focused.current = noteId + focusHeading;
    setTimeout(() => ed.current?.scrollToHeading(h.index), 300);
  }, [heads, focusHeading, noteId]);

  const save = useCallback(async (t: string, c: string, final = false) => {
    if (t === saved.current.title && c === saved.current.content) return;
    if (!final) setStatus('saving');
    try {
      const cleanTitle = t.trim() || 'Nota sin título';
      await updateNote(noteId, { title: cleanTitle, content: c });
      saved.current = { title: t, content: c };
      if (!final) setStatus('saved');
      indexNote(noteId, c, note?.subject_id ?? null);
      cbRef.current?.({ id: noteId, title: cleanTitle, content: c, updated_at: new Date().toISOString() });
    } catch { if (!final) setStatus('error'); }
  }, [noteId, note?.subject_id]);

  // Guardado automático 1,2 s después de dejar de escribir.
  useEffect(() => {
    latest.current = { title, content };
    if (!note) return;
    if (title === saved.current.title && content === saved.current.content) return;
    setStatus('saving');
    const h = setTimeout(() => save(title, content), 1200);
    return () => clearTimeout(h);
  }, [title, content, note, save]);

  // Al cambiar de nota o salir: guardar lo pendiente (incluido lo que el editor no ha avisado).
  useEffect(() => () => {
    const md = ed.current?.flush();
    const c = md ?? latest.current.content;
    save(latest.current.title, c, true);
  }, [noteId, save]);

  async function changeSubject(sid: string | null) {
    if (!note) return;
    try {
      const { error } = await supabase.from('notes').update({ subject_id: sid }).eq('id', noteId);
      if (error) throw error;
      setNote({ ...note, subject_id: sid });
      cbRef.current?.({ id: noteId, subject_id: sid });
      toast(sid ? `Nota movida a ${subjects.find((s) => s.id === sid)?.name ?? 'otra materia'}` : 'Nota sin materia');
    } catch (e) { notify('No se pudo mover', friendlyError(e)); }
  }
  async function togglePin() {
    if (!note) return;
    const next = !note.pinned;
    setNote({ ...note, pinned: next });
    try { await setNotePinned(noteId, next); cbRef.current?.({ id: noteId, pinned: next }); toast(next ? 'Nota fijada arriba' : 'Nota sin fijar'); }
    catch (e) { setNote({ ...note, pinned: !next }); notify('No se pudo fijar', friendlyError(e)); }
  }
  async function makeSummary() {
    const c = ed.current?.flush() ?? content;
    if (!c.trim()) { notify('La nota está vacía', 'Escribe o digitaliza algo antes de resumir.'); return; }
    setGenSum(true);
    try { const s = await aiSummary(c); setSummary(s); await updateNote(noteId, { summary: s }); }
    catch (e) { notify('No se pudo resumir', friendlyError(e)); } finally { setGenSum(false); }
  }
  function makeFlashcards(text?: string) {
    const md = ed.current?.flush() ?? content;
    const c = text ?? md;
    maker.start(c, text ? 'selection' : 'note', { noteId, subjectId: note?.subject_id ?? null, title: title || 'Nota', markdown: md });
  }
  function goHeading(text: string) {
    const want = text.trim().toLowerCase();
    const h = heads.find((x) => x.text.trim().toLowerCase() === want) ?? heads.find((x) => x.text.toLowerCase().includes(want));
    if (h) setTimeout(() => ed.current?.scrollToHeading(h.index), 250);
  }
  function startRecall() {
    const md = ed.current?.flush() ?? content;
    if (md.trim().length < 80) { notify('La nota es muy corta', 'Escribe un poco más antes de ponerte a prueba.'); return; }
    if (editing) setEditing(false);
    setRecallMd(md);
    setRecall(true);
  }
  function askOracle(q?: string) {
    router.push({ pathname: '/oraculo', params: { mode: 'note', noteId, subjectId: note?.subject_id ?? '', noteTitle: title || 'Nota', ...(q ? { q } : {}) } } as any);
  }
  function onSelection(kind: SelectionAction, text: string) {
    if (kind === 'flashcard') makeFlashcards(text);
    else askOracle(`Explícame esto de mi nota "${title || 'Nota'}": ${text.slice(0, 600)}`);
  }
  async function uploadImage(file: Blob): Promise<string> {
    try {
      toast('Subiendo imagen…');
      const b64 = await shrinkForNote(file);
      return await uploadPhoto(b64);
    } catch (e) { notify('No se pudo subir la imagen', friendlyError(e)); throw e; }
  }
  async function remove() {
    if (!note) return;
    try {
      const c = ed.current?.flush(); if (c != null) await save(latest.current.title, c, true);
      await deleteNote(noteId);
      onDeleted?.(note);
      toast(hasV14() ? 'Nota enviada a la papelera' : 'Nota borrada', hasV14() ? { actionLabel: 'Deshacer', onAction: () => { restoreNote(noteId).then(() => router.push(`/nota/${noteId}`)).catch(() => {}); } } : {});
    } catch (e) { notify('No se pudo borrar', friendlyError(e)); }
  }

  if (note === undefined) return <View style={{ flex: scroll ? 1 : undefined, padding: 40, alignItems: 'center' }}><ActivityIndicator color={C.brand} /></View>;
  if (note === null) return (
    <View style={{ flex: scroll ? 1 : undefined }}>
      <EmptyState icon="document-outline" title="No encontramos esta nota" text="Puede que esté en la papelera." action={{ label: 'Ir a la Papelera', onPress: () => router.push('/papelera') }} />
    </View>
  );

  const { words, minutes } = readingStats(content);
  const d = new Date(note.created_at);
  const dateText = `${d.getDate()} de ${MONTH_LONG[d.getMonth()]} de ${d.getFullYear()}`;
  const statusText = status === 'saving' ? 'Guardando…' : status === 'saved' ? 'Guardado' : status === 'error' ? 'No se pudo guardar. Revisa tu conexión.' : '';

  const meta = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
      {note.pinned && <Ionicons name="pin" size={14} color={C.warnText} accessibilityLabel="Fijada" />}
      <Text style={{ color: C.muted, fontSize: 12.5 }}>{dateText} · {words} {words === 1 ? 'palabra' : 'palabras'} · {minutes} min de lectura</Text>
      <View style={{ flex: 1 }} />
      {!!statusText && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }} accessibilityLiveRegion="polite">
          {status === 'saved' && <Ionicons name="checkmark" size={14} color={C.goodText} />}
          <Text style={{ color: status === 'error' ? C.badText : status === 'saved' ? C.goodText : C.muted, fontSize: 12.5 }}>{statusText}</Text>
        </View>
      )}
      <Button label={editing ? 'Listo' : 'Editar'} icon={editing ? 'checkmark' : 'create-outline'} size="sm" kind={editing ? 'primary' : 'secondary'} onPress={() => setEditing((v) => !v)} />
      <IconButton icon="ellipsis-horizontal" label="Más opciones de la nota" onPress={() => setMenu(true)} color={C.text} />
    </View>
  );

  const doc = (
    <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      {meta}
      <TextInput value={title} onChangeText={setTitle} placeholder="Título de la nota" placeholderTextColor={C.muted} multiline accessibilityLabel="Título"
        onContentSizeChange={(e) => setTitleH(e.nativeEvent.contentSize.height)} blurOnSubmit
        style={[{ color: C.text, fontSize: scroll ? 36 : 28, fontWeight: '800', letterSpacing: -0.3, paddingVertical: 4, marginBottom: 14, height: Math.max(scroll ? 50 : 40, titleH) }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
      <NoteEditor key={noteId} ref={ed} value={content} onChange={setContent} editing={editing} onRequestEdit={() => setEditing(true)} onRequestRead={() => setEditing(false)}
        onOutline={setHeads} onSelectionAction={onSelection} uploadImage={uploadImage} minHeight={scroll ? 420 : 300}
        searchNotes={(q) => searchNoteTitles(q, noteId)} onOpenNote={(id) => router.push(`/nota/${id}`)} />
    </View>
  );

  const study = (
    <View style={{ gap: 18 }}>
      {heads.length > 1 && (
        <View role={"navigation" as any} accessibilityLabel="Índice de la nota">
          <Label text="En esta nota" />
          {heads.map((h) => (
            <Pressable key={h.index} onPress={() => ed.current?.scrollToHeading(h.index)} accessibilityRole="link"
              style={({ focused, hovered }: any) => [{ paddingVertical: 5, paddingRight: 8, paddingLeft: 10 + (h.level - 1) * 12, borderLeftWidth: 2, borderLeftColor: hovered ? C.brand : C.line, marginLeft: 2 }, focused ? focusRingStyle() : null]}>
              <Text style={{ color: h.level === 1 ? C.text : C.muted, fontSize: 13, fontWeight: h.level === 1 ? '700' : '500' }} numberOfLines={2}>{h.text}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View dataSet={{ petPerch: '1' }} style={{ padding: 16, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, gap: 10 }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>Estudiar esta nota</Text>
        {(() => {
          const lab = recallLabel(note.last_recall_at, note.last_recall_score, new Date());
          return lab
            ? <Text style={{ color: (note.last_recall_score ?? 0) >= 70 ? C.goodText : C.muted, fontSize: 12.5, fontWeight: '600' }}>{lab}</Text>
            : <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}>Lo que más ayuda a recordar es ponerte a prueba. También puedes seleccionar una parte del texto.</Text>;
        })()}
        <Button label="Ponme a prueba" icon="bulb-outline" size="sm" onPress={startRecall} />
        <Button label="Crear flashcards" icon="albums-outline" kind="secondary" size="sm" busy={genCards} onPress={() => makeFlashcards()} />
        <Button label="Preguntar al Oráculo" icon="sparkles-outline" kind="secondary" size="sm" onPress={() => askOracle()} />
        <View style={{ height: 1, backgroundColor: C.line, marginVertical: 2 }} />
        {summary && <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 20 }}>{summary}</Text>}
        <Button label={summary ? 'Rehacer resumen' : 'Resumir'} icon="reader-outline" kind="ghost" size="sm" busy={genSum} onPress={makeSummary} />
        <Text style={{ color: C.muted, fontSize: 11.5, lineHeight: 16 }}>Resumir ayuda a ordenar; para recordar, ponte a prueba.</Text>
      </View>

      {(backlinks.length > 0 || related.length > 0) && (
        <View style={{ gap: 14 }}>
          {backlinks.length > 0 && (
            <View>
              <Label text="Mencionada en" />
              {backlinks.map((n) => <NoteLinkRow key={n.id} n={n} icon="return-up-back-outline" onPress={() => router.push(`/nota/${n.id}`)} />)}
            </View>
          )}
          {related.length > 0 && (
            <View>
              <Label text="Notas relacionadas" />
              {related.map((n) => <NoteLinkRow key={n.id} n={n} icon="git-network-outline" subject={subjects.find((s) => s.id === n.subject_id)?.name} onPress={() => router.push(`/nota/${n.id}`)} />)}
            </View>
          )}
        </View>
      )}

      <View>
        <Label text="Materia" />
        <SubjectPicker subjects={subjects} value={note.subject_id} onChange={changeSubject} placeholder="Sin materia" />
      </View>

      {photo && (
        <View>
          <Label text="Foto original" />
          <Pressable onPress={() => setZoom(true)} accessibilityRole="button" accessibilityLabel="Ver la foto original del apunte"
            style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 }}>
            <Image source={{ uri: photo }} style={{ width: '100%', height: 150 }} resizeMode="cover" />
          </Pressable>
        </View>
      )}
      <NoteAttachments noteId={noteId} />
    </View>
  );

  const menuEl = (
    <ActionMenu visible={menu} title={title || 'Nota'} onClose={() => setMenu(false)} actions={[
      { label: note.pinned ? 'Quitar de fijadas' : 'Fijar arriba', icon: note.pinned ? 'pin-outline' : 'pin', onPress: togglePin },
      ...(photo ? [{ label: 'Ver foto original', icon: 'image-outline' as const, onPress: () => setZoom(true) }] : []),
      { label: 'Preguntar al Oráculo', icon: 'sparkles-outline', onPress: () => askOracle() },
      { label: 'Compartir con un enlace', icon: 'link-outline', onPress: () => setShare('link') },
      { label: 'Copiar a un proyecto', icon: 'folder-open-outline', onPress: () => setShare('project') },
      { label: 'Guardar como plantilla', icon: 'copy-outline', onPress: async () => {
        try { await saveTemplate(title || 'Mi plantilla', ed.current?.flush() ?? content); toast('Plantilla guardada: sale al crear una nota nueva', { tone: 'good' }); }
        catch (e) { notify('No se pudo guardar', friendlyError(e)); }
      } },
      { label: 'Borrar nota', icon: 'trash-outline', danger: true, onPress: remove },
    ]} />
  );
  const shareEl = (
    <ShareNoteSheet visible={!!share} mode={share ?? 'link'} noteId={noteId} title={title} getContent={() => ed.current?.flush() ?? content} onClose={() => setShare(null)} />
  );
  const zoomEl = (
    <Modal visible={zoom} transparent onRequestClose={() => setZoom(false)}>
      <Pressable onPress={() => setZoom(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="Cerrar foto">
        {photo && <Image source={{ uri: photo }} style={{ width: '94%', height: '84%' }} resizeMode="contain" />}
        <Text style={{ color: '#ccc', marginTop: 16, fontSize: 13 }}>Toca para cerrar</Text>
      </Pressable>
    </Modal>
  );


  const recallEl = (
    <RecallTest visible={recall} onClose={() => setRecall(false)} noteId={noteId} title={title || 'Nota'} markdown={recallMd}
      onHeading={goHeading}
      onCards={(txt) => maker.start(txt, 'selection', { noteId, subjectId: note.subject_id ?? null, title: title || 'Nota', from: 'recall' })}
      onSaved={(score) => { const at = new Date().toISOString(); setNote((n) => (n ? { ...n, last_recall_at: at, last_recall_score: score } : n)); cbRef.current?.({ id: noteId, last_recall_at: at, last_recall_score: score } as any); }} />
  );

  if (!scroll) {
    return (
      <View>
        {doc}
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', marginTop: 28 }}>{study}</View>
        {menuEl}{shareEl}{zoomEl}{maker.sheet}{recallEl}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 36, paddingTop: 22, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {doc}
        {!side && <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', marginTop: 32 }}>{study}</View>}
      </ScrollView>
      {side && (
        <ScrollView style={{ width: 290, flexGrow: 0, borderLeftWidth: 1, borderLeftColor: C.line }} contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
          {study}
        </ScrollView>
      )}
      {menuEl}{shareEl}{zoomEl}{maker.sheet}{recallEl}
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>{text}</Text>;
}

function NoteLinkRow({ n, icon, subject, onPress }: { n: NoteRef; icon: React.ComponentProps<typeof Ionicons>['name']; subject?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={`Abrir nota ${n.title}`}
      style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
      <Ionicons name={icon} size={14} color={C.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{n.title}</Text>
        {!!subject && <Text style={{ color: C.muted, fontSize: 11.5 }} numberOfLines={1}>{subject}</Text>}
      </View>
    </Pressable>
  );
}
