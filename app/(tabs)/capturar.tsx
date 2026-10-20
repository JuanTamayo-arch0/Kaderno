import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { Subject, Note, Slot, getSubjects, getNotes, getSchedule } from '../../lib/db';
import { notify, toast, friendlyError, confirm } from '../../lib/feedback';
import { Screen, Button, Card, Field, IconButton, SectionLabel, EmptyState, Segmented, Toggle } from '../../components/ds';
import { SubjectPicker } from '../../components/SubjectPicker';
import { SubjectIcon } from '../../components/SubjectIcon';
import { SCHEDULE } from '../../lib/schedule';
import { suggestSubject, suggestTitle, uncertainCount, mergePages, resolveFigures, boardMarkdown, firstLine, type CaptureMode, type Figure } from '../../lib/capture';
import { processImage, cropFigure, fileToImg, pdfToPages } from '../../lib/captureImage';
import { saveDraft, loadDraft, clearDraft, type DraftPage, type PageEdit, type CaptureDraft } from '../../lib/captureDraft';
import { readPage, saveCapture, uploadPhoto } from '../../lib/captureDb';
import { openClassNote, type NoteRef } from '../../lib/notesDb';
import { noteToHtml } from '../../lib/noteHtml';
import { openTask, dataChanged } from '../../lib/uiBus';
import { PhotoEditor } from '../../components/capture/PhotoEditor';
import { NotePickSheet } from '../../components/capture/NotePickSheet';

// Se carga al usarlo: así expo-image-picker no se descarga al abrir la app.
const loadPicker = () => import('expo-image-picker');
if (typeof window !== 'undefined') setTimeout(() => { Promise.resolve().then(loadPicker).catch(() => {}); }, 4000);

// ============================================================
//  Capturar (v22, fase 4): de la foto (o el PDF) a una nota fiel.
//  - Modos: Apuntes, Pizarra, PDF, Cronograma o tarea.
//  - Antes de leer: girar, recortar y modo escáner.
//  - Lectura en Markdown (títulos, tablas, fórmulas) con los dibujos
//    recortados; revisión con la foto al lado y "Leer de nuevo" por página.
//  - Materia y título sugeridos; nota nueva, clase de hoy u otra nota.
//  - Lo que llevas queda guardado en el dispositivo hasta guardar.
// ============================================================

const MODES: { key: CaptureMode; label: string; icon: any }[] = [
  { key: 'notes', label: 'Apuntes', icon: 'document-text-outline' },
  { key: 'board', label: 'Pizarra', icon: 'easel-outline' },
  { key: 'pdf', label: 'PDF', icon: 'document-attach-outline' },
  { key: 'schedule', label: 'Cronograma o tarea', icon: 'calendar-outline' },
];
const HINT: Record<CaptureMode, string> = {
  notes: 'Se lee con títulos, listas, tablas y fórmulas. Los dibujos se recortan y quedan en su lugar.',
  board: 'La foto del tablero se limpia y queda como imagen en la nota, con el texto debajo si quieres.',
  pdf: 'Hasta 20 páginas. Si el PDF ya trae texto se toma directo; si es escaneado, se lee como fotos.',
  schedule: 'Del cronograma salen las entregas (pasa por Importar cronograma); de un enunciado, una tarea.',
};
const LAST_SUBJECT = 'kd-capture-subject';
const SCAN_ALWAYS = 'kd-capture-scan';
const IMPORT_TEXT = 'kd-import-text';
const isWeb = Platform.OS === 'web';
const src = (b64: string) => `data:image/jpeg;base64,${b64}`;
const ocrMode = (m: CaptureMode) => (m === 'board' ? 'board' : m === 'schedule' ? 'plain' : 'notes');
const newId = () => Math.random().toString(36).slice(2, 10);
const NO_EDIT: PageEdit = { rotate: 0, crop: null, scan: false };

type Dest = { kind: 'new' } | { kind: 'class' } | { kind: 'note'; id: string; title: string };

export default function Capturar() {
  const router = useRouter();
  const params = useLocalSearchParams<{ subjectId?: string; compartido?: string }>();
  const { isWide } = useResponsive();
  const [mode, setModeState] = useState<CaptureMode>('notes');
  const modeRef = useRef(mode); modeRef.current = mode;
  const [pages, setPages] = useState<DraftPage[]>([]);
  const [sel, setSel] = useState(0);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(params.subjectId ?? null);
  const [dest, setDest] = useState<Dest>({ kind: 'new' });
  const [picking, setPicking] = useState(false);
  const [boardText, setBoardText] = useState(true);
  const [scanAlways, setScanAlways] = useState(false);
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [view, setView] = useState<'text' | 'preview'>('text');
  const [mobileTab, setMobileTab] = useState<'photo' | 'text'>('text');
  const [preview, setPreview] = useState('');
  const [editing, setEditing] = useState<DraftPage | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [offer, setOffer] = useState<CaptureDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Note[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [dragging, setDragging] = useState(false);
  const dropRef = useRef<View>(null);
  const pdfInput = useRef<HTMLInputElement>(null);

  const setPage = useCallback((id: string, patch: Partial<DraftPage>) => setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))), []);

  useFocusEffect(useCallback(() => {
    Promise.all([getSubjects(), getSchedule().catch(() => [] as Slot[]), AsyncStorage.getItem(LAST_SUBJECT).catch(() => null)]).then(([s, sl, last]) => {
      setSubjects(s); setSlots(sl);
      setSubjectId((cur) => cur ?? params.subjectId ?? suggestSubject(new Date(), sl, SCHEDULE.blocks, s, last));
    }).catch(() => {});
    getNotes().then((n) => setRecent(n.slice(0, 12))).catch(() => {});
  }, [params.subjectId]));
  useEffect(() => { AsyncStorage.getItem(SCAN_ALWAYS).then((v) => setScanAlways(v === '1')).catch(() => {}); }, []);
  useEffect(() => { loadDraft().then((d) => { if (d?.pages?.length) setOffer(d); }).catch(() => {}); }, []);

  // Guardar lo que llevas (un momento después de cada cambio).
  useEffect(() => {
    if (!pages.length) return;
    const t = setTimeout(() => saveDraft({ mode, pages, title, subjectId }).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [pages, mode, title, subjectId]);

  // Título sugerido con lo primero que se lee.
  useEffect(() => {
    if (titleTouched || mode === 'schedule') return;
    const first = pages.find((p) => p.status === 'ok' && (p.markdown || p.title));
    if (first) setTitle(suggestTitle(first.markdown, new Date(), first.title));
  }, [pages, titleTouched, mode]);

  // ---------- Leer ----------
  const read = useCallback(async (id: string, base64: string) => {
    setPage(id, { status: 'ocr', error: null });
    try {
      const r = await readPage(base64, ocrMode(modeRef.current));
      setPage(id, { status: 'ok', markdown: r.markdown, figures: r.figures, title: r.title });
    } catch (e) {
      setPage(id, { status: 'fail', error: (e as Error).message });
    }
  }, [setPage]);

  const addImage = useCallback(async (originalB64: string) => {
    const scan = scanAlways && modeRef.current !== 'schedule' && isWeb;
    let base64 = originalB64;
    if (isWeb) { try { base64 = (await processImage(src(originalB64), { scan })).base64; } catch { /* se usa tal cual */ } }
    const id = newId();
    setPages((ps) => [...ps, { id, base64, original: originalB64, edit: { ...NO_EDIT, scan }, markdown: '', figures: [], title: null, status: 'ocr', source: 'photo' }]);
    read(id, base64);
  }, [scanAlways, read]);

  const addFiles = useCallback((files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    const pdf = list.find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (pdf) { setModeState('pdf'); modeRef.current = 'pdf'; addPdf(pdf); return; }
    list.filter((f) => f.type.startsWith('image/')).slice(0, 10)
      .forEach((f) => fileToImg(f, false).then((img) => addImage(img.base64)).catch(() => notify('No se pudo leer la imagen')));
  }, [addImage]);

  async function addPdf(file: Blob) {
    setPdfProgress({ done: 0, total: 0 });
    try {
      await pdfToPages(file, 20, (p, total) => {
        setPdfProgress({ done: p.page, total });
        const id = newId();
        if (p.text != null) {
          setPages((ps) => [...ps, { id, base64: '', original: null, edit: NO_EDIT, markdown: p.text as string, figures: [], title: null, status: 'ok', source: 'pdf-text' }]);
        } else if (p.img) {
          const b64 = p.img.base64;
          setPages((ps) => [...ps, { id, base64: b64, original: b64, edit: NO_EDIT, markdown: '', figures: [], title: null, status: 'ocr', source: 'pdf-image' }]);
          read(id, b64);
        }
      });
    } catch (e) { notify('No se pudo abrir el PDF', String((e as Error)?.message ?? e).includes('password') ? 'El PDF tiene contraseña.' : 'Revisa que el archivo no esté dañado.'); }
    finally { setPdfProgress(null); }
  }

  // Foto compartida desde otra app (la dejó el service worker en la caché).
  useEffect(() => {
    if (params.compartido !== '1' || !isWeb || typeof caches === 'undefined') return;
    (async () => {
      try {
        const cache = await caches.open('kaderno-compartido');
        const res = await cache.match('/compartido-foto');
        if (!res) return;
        const blob = await res.blob();
        await cache.delete('/compartido-foto');
        const img = await fileToImg(blob, false);
        addImage(img.base64);
      } catch { /* sin foto: se sigue normal */ }
    })();
  }, [params.compartido]);

  async function pick(fromCamera: boolean) {
    if (mode === 'pdf') { if (isWeb) pdfInput.current?.click(); return; }
    const P = await loadPicker();
    const perm = fromCamera ? await P.requestCameraPermissionsAsync() : await P.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify('Permiso necesario', 'Autoriza el acceso a la cámara o a las fotos para continuar.'); return; }
    const res = fromCamera
      ? await P.launchCameraAsync({ base64: true, quality: 0.7 })
      : await P.launchImageLibraryAsync({ base64: true, quality: 0.7, allowsMultipleSelection: true, selectionLimit: 10 });
    if (res.canceled) return;
    for (const a of res.assets) if (a.base64) addImage(a.base64);
  }

  // Arrastrar y soltar, y pegar, en el navegador.
  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    const onPaste = (e: ClipboardEvent) => { if (e.clipboardData?.files?.length) { e.preventDefault(); addFiles(e.clipboardData.files); } };
    const el = dropRef.current as unknown as HTMLElement | null;
    const over = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const leave = () => setDragging(false);
    const dropped = (e: DragEvent) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer?.files); };
    window.addEventListener('paste', onPaste);
    el?.addEventListener?.('dragover', over); el?.addEventListener?.('dragleave', leave); el?.addEventListener?.('drop', dropped);
    return () => {
      window.removeEventListener('paste', onPaste);
      el?.removeEventListener?.('dragover', over); el?.removeEventListener?.('dragleave', leave); el?.removeEventListener?.('drop', dropped);
    };
  }, [addFiles]);

  async function applyEdit(p: DraftPage, e: PageEdit) {
    setEditing(null);
    if (!p.original) return;
    try {
      const img = await processImage(src(p.original), { rotate: e.rotate, crop: e.crop, scan: e.scan });
      setPage(p.id, { base64: img.base64, edit: e, figures: [] });
      read(p.id, img.base64);
    } catch { notify('No se pudo editar la foto'); }
  }

  function changeMode(m: CaptureMode) {
    if (m === mode) return;
    if (pages.length) {
      confirm('¿Cambiar de modo?', 'Se descarta lo que llevas en esta captura.', 'Cambiar').then((ok) => { if (ok) { reset(); setModeState(m); } });
      return;
    }
    setModeState(m);
  }
  function reset() {
    setPages([]); setSel(0); setTitle(''); setTitleTouched(false); setDrop(new Set()); setThumbs({}); setDest({ kind: 'new' }); setView('text');
    clearDraft().catch(() => {});
  }
  function resume(d: CaptureDraft) {
    setOffer(null);
    setModeState((MODES.some((m) => m.key === d.mode) ? d.mode : 'notes') as CaptureMode);
    setPages(d.pages); setTitle(d.title); setTitleTouched(!!d.title); if (d.subjectId) setSubjectId(d.subjectId);
    // Las que quedaron leyéndose se vuelven a leer.
    d.pages.filter((p) => p.status === 'fail' && p.base64 && !p.markdown).forEach((p) => read(p.id, p.base64));
  }

  const cur = pages[Math.min(sel, Math.max(0, pages.length - 1))];
  const working = pages.some((p) => p.status === 'ocr') || !!pdfProgress;
  const doubt = cur ? uncertainCount(cur.markdown) : 0;
  const allText = pages.map((p) => p.markdown).filter(Boolean).join('\n\n');

  // Recortes de los dibujos de la página elegida.
  useEffect(() => {
    if (!cur?.figures?.length || !cur.base64 || !isWeb) return;
    let live = true;
    (async () => {
      for (const f of cur.figures as Figure[]) {
        const k = `${cur.id}:${f.id}`;
        if (thumbs[k]) continue;
        try { const img = await cropFigure(src(cur.base64), f); if (live) setThumbs((t) => ({ ...t, [k]: img.uri })); } catch { /* noop */ }
      }
    })();
    return () => { live = false; };
  }, [cur?.id, cur?.figures]);

  // "Ver cómo queda".
  useEffect(() => {
    if (view !== 'preview' || !cur) return;
    let live = true;
    noteToHtml(cur.markdown.replace(/!\[([^\]\n]*)\]\(figura:\d+\)/g, '*[dibujo: $1]*')).then((h) => live && setPreview(h)).catch(() => {});
    return () => { live = false; };
  }, [view, cur?.markdown]);

  // ---------- Guardar ----------
  async function save() {
    if (!pages.length || working) return;
    if (mode !== 'board' && !allText.trim()) { notify('No hay texto para guardar', 'Escribe el contenido a mano o lee las páginas otra vez.'); return; }
    setBusy(true);
    try {
      let markdown = '';
      let photos: string[] = [];
      if (mode === 'board') {
        const paths: string[] = [];
        for (const p of pages) if (p.base64) paths.push(await uploadPhoto(p.base64));
        markdown = boardMarkdown(paths, pages.map((p) => p.markdown), boardText);
      } else {
        const merged = mergePages(pages.map((p) => ({ markdown: p.markdown, figures: (p.figures as Figure[]).filter((f) => !drop.has(`${p.id}:${f.id}`)) })));
        const paths: Record<string, string> = {};
        for (const f of merged.figures) {
          const pg = pages[f.page];
          if (!pg?.base64 || !isWeb) continue;
          try { const img = await cropFigure(src(pg.base64), f); paths[f.key] = await uploadPhoto(img.base64); } catch { /* el dibujo se omite */ }
        }
        markdown = resolveFigures(merged.markdown, paths);
        photos = mode === 'notes' ? pages.filter((p) => p.base64).map((p) => p.base64) : [];
      }
      let target: { kind: 'new' } | { kind: 'note'; id: string } = { kind: 'new' };
      let label = 'una nota nueva';
      if (dest.kind === 'class' && subjectId) { target = { kind: 'note', id: (await openClassNote(subjectId)).id }; label = 'la clase de hoy'; }
      if (dest.kind === 'note') { target = { kind: 'note', id: dest.id }; label = `"${dest.title}"`; }
      const id = await saveCapture({ dest: target, title: title || suggestTitle(markdown, new Date()), subjectId, markdown, photos, keepPhotos: mode === 'notes' });
      if (subjectId) AsyncStorage.setItem(LAST_SUBJECT, subjectId).catch(() => {});
      reset();
      dataChanged();
      toast(target.kind === 'new' ? 'Nota guardada' : `Agregado a ${label}`, { tone: 'good', actionLabel: 'Abrir', onAction: () => router.push(`/nota/${id}`) });
      getNotes().then((n) => setRecent(n.slice(0, 12))).catch(() => {});
    } catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function toImport() {
    await AsyncStorage.setItem(IMPORT_TEXT, JSON.stringify({ text: allText, subjectId })).catch(() => {});
    reset();
    router.push('/importar?desde=captura' as any);
  }
  function toTask() {
    openTask(null, { title: firstLine(allText), subjectId, description: allText.slice(0, 4000) });
  }

  const subjOf = (id: string | null) => subjects.find((s) => s.id === id);
  const subjName = subjOf(subjectId)?.name;

  // ---------- Vista ----------
  const pageStrip = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {pages.map((p, i) => (
        <Pressable key={p.id} onPress={() => setSel(i)} accessibilityRole="tab" accessibilityState={{ selected: i === sel }} accessibilityLabel={`Página ${i + 1}`}
          style={{ width: 74, borderRadius: 10, borderWidth: 2, borderColor: i === sel ? C.brand : 'transparent', padding: 2 }}>
          {p.base64
            ? <Image source={{ uri: src(p.base64) }} style={{ width: 66, height: 84, borderRadius: 8, backgroundColor: C.surface2 }} resizeMode="cover" />
            : <View style={{ width: 66, height: 84, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="document-text-outline" size={22} color={C.muted} /></View>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, justifyContent: 'center' }}>
            {p.status === 'ocr' ? <ActivityIndicator size="small" color={C.brand} /> : <Ionicons name={p.status === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={13} color={p.status === 'ok' ? C.goodText : C.warnText} />}
            <Text style={{ color: C.muted, fontSize: 11.5 }}>{i + 1}</Text>
          </View>
        </Pressable>
      ))}
      {mode !== 'pdf' && (
        <Pressable onPress={() => pick(!isWide)} accessibilityRole="button" accessibilityLabel="Agregar otra página"
          style={{ width: 70, height: 88, marginTop: 2, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={22} color={C.muted} />
          <Text style={{ color: C.muted, fontSize: 11 }}>Otra</Text>
        </Pressable>
      )}
    </ScrollView>
  );

  const photoPane = cur && (
    <View style={{ gap: 8 }}>
      {cur.base64 ? (
        <Pressable onPress={() => setZoom(cur.base64)} accessibilityRole="button" accessibilityLabel="Ver la foto en grande">
          <Image source={{ uri: src(cur.base64) }} style={{ width: '100%', height: isWide ? 460 : 340, borderRadius: 12, backgroundColor: C.surface2 }} resizeMode="contain" />
        </Pressable>
      ) : (
        <View style={{ padding: 16, borderRadius: 12, backgroundColor: C.surface2 }}><Text style={{ color: C.muted, fontSize: 13 }}>Página {sel + 1} del PDF: el texto venía en el archivo, no hizo falta leer foto.</Text></View>
      )}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {cur.original && isWeb && <Button label="Girar, recortar o escáner" icon="crop-outline" size="sm" kind="secondary" onPress={() => setEditing(cur)} />}
        {cur.base64 && <Button label="Leer de nuevo" icon="refresh" size="sm" kind="ghost" busy={cur.status === 'ocr'} onPress={() => read(cur.id, cur.base64)} />}
        <Button label="Quitar página" icon="trash-outline" size="sm" kind="ghost" onPress={() => { setPages((ps) => ps.filter((x) => x.id !== cur.id)); setSel((s) => Math.max(0, s - 1)); }} />
      </View>
    </View>
  );

  const textPane = cur && (
    <View style={{ gap: 8 }}>
      {mode !== 'board' && mode !== 'schedule' && (
        <View style={{ flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: C.surface2, alignSelf: 'flex-start' }} accessibilityRole="radiogroup">
          {(['text', 'preview'] as const).map((k) => (
            <Pressable key={k} onPress={() => setView(k)} accessibilityRole="radio" accessibilityState={{ checked: view === k }}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: view === k ? C.surface : 'transparent' }}>
              <Text style={{ color: view === k ? C.text : C.muted, fontSize: 12.5, fontWeight: '700' }}>{k === 'text' ? 'Texto' : 'Ver cómo queda'}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {cur.status === 'ocr' && !cur.markdown ? (
        <View style={{ padding: 24, alignItems: 'center', gap: 8 }}><ActivityIndicator color={C.brand} /><Text style={{ color: C.muted, fontSize: 13 }}>Leyendo la página {sel + 1}…</Text></View>
      ) : view === 'preview' && isWeb && mode !== 'board' && mode !== 'schedule' ? (
        <div className="kd-cap-prev" style={{ color: C.text, font: '400 15px/1.6 system-ui', padding: 12, borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, maxHeight: 460, overflow: 'auto' }}
          dangerouslySetInnerHTML={{ __html: preview }} />
      ) : (
        <TextInput value={cur.markdown} onChangeText={(t) => setPage(cur.id, { markdown: t })} multiline accessibilityLabel={`Texto de la página ${sel + 1}`}
          placeholder={cur.status === 'fail' ? 'No se pudo leer: escribe el texto aquí o toca "Leer de nuevo".' : 'El texto leído aparece aquí…'} placeholderTextColor={C.muted}
          style={[{ minHeight: isWide ? 420 : 260, textAlignVertical: 'top', color: C.text, fontSize: 14, lineHeight: 21, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 },
            isWeb ? ({ fontFamily: 'ui-monospace, Menlo, monospace', outlineStyle: 'none' } as any) : null]} />
      )}
      {cur.status === 'fail' && <Text style={{ color: C.warnText, fontSize: 12.5 }}>{cur.error || 'No se pudo leer esta página.'}</Text>}
      {doubt > 0 && <Text style={{ color: C.warnText, fontSize: 12.5 }}>{doubt === 1 ? 'Una parte quedó marcada con [?]' : `${doubt} partes quedaron marcadas con [?]`}: revísalas con la foto.</Text>}
      {(cur.figures as Figure[]).length > 0 && (mode === 'notes' || mode === 'pdf') ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>Dibujos encontrados</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(cur.figures as Figure[]).map((f) => {
              const k = `${cur.id}:${f.id}`, off = drop.has(k);
              return (
                <Pressable key={k} onPress={() => setDrop((d) => { const n = new Set(d); off ? n.delete(k) : n.add(k); return n; })} accessibilityRole="checkbox" accessibilityState={{ checked: !off }} accessibilityLabel={`Incluir dibujo: ${f.caption || f.id}`}
                  style={{ width: 120, borderRadius: 10, borderWidth: 1, borderColor: off ? C.line : C.brand, padding: 4, opacity: off ? 0.5 : 1 }}>
                  {thumbs[k] ? <Image source={{ uri: thumbs[k] }} style={{ width: '100%', height: 80, borderRadius: 6, backgroundColor: '#fff' }} resizeMode="contain" /> : <View style={{ height: 80, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.brand} /></View>}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name={off ? 'square-outline' : 'checkbox'} size={15} color={off ? C.muted : C.brand} />
                    <Text style={{ color: C.text, fontSize: 11.5, flex: 1 }} numberOfLines={1}>{f.caption || 'Dibujo'}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );

  const destChip = (d: Dest, label: string, icon: any) => {
    const on = d.kind === dest.kind && (d.kind !== 'note' || (dest.kind === 'note' && dest.id === (d as any).id));
    return (
      <Pressable key={label} onPress={() => (d.kind === 'note' && !(d as any).id ? setPicking(true) : setDest(d))} accessibilityRole="radio" accessibilityState={{ checked: on }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand + '1f' : 'transparent' }}>
        <Ionicons name={icon} size={15} color={on ? C.brand : C.muted} />
        <Text style={{ color: C.text, fontSize: 13, fontWeight: on ? '700' : '500' }} numberOfLines={1}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Screen title="Capturar" subtitle="De la foto de tu cuaderno, la pizarra o un PDF a una nota fiel" maxWidth={1100} back={isWide ? undefined : '/estudiar'}>
      {isWeb && <input ref={pdfInput as any} type="file" accept="application/pdf" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addPdf(f); }} />}
      {isWeb && <style dangerouslySetInnerHTML={{ __html: `.kd-cap-prev h1,.kd-cap-prev h2,.kd-cap-prev h3{margin:.6em 0 .3em}.kd-cap-prev table{border-collapse:collapse}.kd-cap-prev td,.kd-cap-prev th{border:1px solid ${C.line};padding:4px 8px}.kd-cap-prev p{margin:.4em 0}` }} />}

      {offer && !pages.length && (
        <Card style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderLeftWidth: 4, borderLeftColor: C.brand }}>
          <Ionicons name="time-outline" size={22} color={C.brand} />
          <View style={{ flex: 1, minWidth: 180 }}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>Tienes una captura sin guardar</Text>
            <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{offer.pages.length} {offer.pages.length === 1 ? 'página' : 'páginas'}{offer.title ? ` · ${offer.title}` : ''}</Text>
          </View>
          <Button label="Seguir" size="sm" onPress={() => resume(offer)} />
          <Button label="Descartar" size="sm" kind="ghost" onPress={() => { setOffer(null); clearDraft().catch(() => {}); }} />
        </Card>
      )}

      <Segmented items={MODES.map((m) => ({ key: m.key, label: m.label, icon: m.icon }))} value={mode} onChange={changeMode} style={{ marginBottom: 12 }} />

      {!pages.length && (
        <View ref={dropRef}>
          <Card style={{ borderStyle: dragging ? 'dashed' : 'solid', borderColor: dragging ? C.brand : C.line, borderWidth: dragging ? 2 : 1, alignItems: 'center', paddingVertical: 28 }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: C.brand + '1f', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name={dragging ? 'download-outline' : MODES.find((m) => m.key === mode)!.icon} size={28} color={C.brand} />
            </View>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
              {dragging ? 'Suelta aquí' : mode === 'pdf' ? (isWide ? 'Arrastra un PDF aquí o elígelo' : 'Elige un PDF') : isWide ? 'Arrastra fotos aquí o pégalas con Ctrl V' : mode === 'board' ? 'Fotografía el tablero' : 'Fotografía una o varias páginas'}
            </Text>
            <Text style={{ color: C.muted, fontSize: 13.5, textAlign: 'center', marginTop: 6, maxWidth: 480 }}>{HINT[mode]}</Text>
            {pdfProgress && <Text style={{ color: C.brand, fontSize: 13, marginTop: 10 }}>Abriendo el PDF{pdfProgress.total ? `: página ${pdfProgress.done} de ${pdfProgress.total}` : '…'}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              {mode === 'pdf' ? <Button label="Elegir PDF" icon="document-attach-outline" onPress={() => pick(false)} busy={!!pdfProgress} />
                : isWide ? (
                  <>
                    <Button label="Elegir imágenes" icon="images-outline" onPress={() => pick(false)} />
                    <Button label="Usar cámara" icon="camera-outline" kind="secondary" onPress={() => pick(true)} />
                  </>
                ) : (
                  <>
                    <Button label="Tomar foto" icon="camera-outline" onPress={() => pick(true)} />
                    <Button label="Galería" icon="images-outline" kind="secondary" onPress={() => pick(false)} />
                  </>
                )}
            </View>
            {isWeb && mode !== 'pdf' && mode !== 'schedule' && (
              <View style={{ alignSelf: 'stretch', marginTop: 14, maxWidth: 420, width: '100%', marginHorizontal: 'auto' as any }}>
                <Toggle label="Modo escáner siempre" hint="Fondo blanco y más contraste al agregar cada foto." value={scanAlways} onChange={(v) => { setScanAlways(v); AsyncStorage.setItem(SCAN_ALWAYS, v ? '1' : '0').catch(() => {}); }} />
              </View>
            )}
          </Card>
        </View>
      )}

      {pages.length > 0 && (
        <Card style={{ gap: 14 }}>
          {pageStrip}
          {pdfProgress && <Text style={{ color: C.brand, fontSize: 13 }}>Abriendo el PDF: página {pdfProgress.done} de {pdfProgress.total}…</Text>}
          {isWide ? (
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
              <View style={{ width: '44%' }}>{photoPane}</View>
              <View style={{ flex: 1, minWidth: 0 }}>{textPane}</View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: C.surface2, alignSelf: 'flex-start' }} accessibilityRole="tablist">
                {(['photo', 'text'] as const).map((k) => (
                  <Pressable key={k} onPress={() => setMobileTab(k)} accessibilityRole="tab" accessibilityState={{ selected: mobileTab === k }}
                    style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: mobileTab === k ? C.surface : 'transparent' }}>
                    <Text style={{ color: mobileTab === k ? C.text : C.muted, fontSize: 13, fontWeight: '700' }}>{k === 'photo' ? 'Foto' : 'Texto'}</Text>
                  </Pressable>
                ))}
              </View>
              {mobileTab === 'photo' ? photoPane : textPane}
            </View>
          )}

          <View style={{ height: 1, backgroundColor: C.line }} />

          {mode === 'schedule' ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>¿Qué es?</Text>
              <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 10 }}>
                <Button label="Un cronograma: revisar las entregas" icon="list-outline" onPress={toImport} disabled={working || !allText.trim()} style={{ flex: 1 }} />
                <Button label="Un enunciado: crear una tarea" icon="add-circle-outline" kind="secondary" onPress={toTask} disabled={working || !allText.trim()} style={{ flex: 1 }} />
              </View>
              <Button label="Descartar" kind="ghost" onPress={reset} />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={{ gap: 6 }}>
                <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>Guardar en</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
                  {destChip({ kind: 'new' }, 'Nota nueva', 'document-outline')}
                  {subjectId && destChip({ kind: 'class' }, `Clase de hoy${subjName ? ` · ${subjName}` : ''}`, 'today-outline')}
                  {dest.kind === 'note' ? destChip(dest, dest.title, 'document-text-outline') : null}
                  {destChip({ kind: 'note', id: '', title: '' } as any, dest.kind === 'note' ? 'Otra…' : 'Agregar a otra nota…', 'add')}
                </View>
              </View>
              <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 10 }}>
                {dest.kind === 'new' && <Field label="Título" value={title} onChangeText={(t) => { setTitle(t); setTitleTouched(true); }} placeholder="Ej: Leyes de Newton" style={{ flex: 1 }} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>Materia</Text>
                  <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} />
                </View>
              </View>
              {mode === 'board' && <Toggle label="Incluir el texto leído debajo de la foto" value={boardText} onChange={setBoardText} />}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Descartar" kind="secondary" onPress={() => confirm('¿Descartar esta captura?', undefined, 'Descartar').then((ok) => ok && reset())} style={{ flex: 1 }} />
                <Button label={working ? 'Leyendo…' : dest.kind === 'new' ? 'Guardar nota' : 'Agregar a la nota'} icon="save-outline" onPress={save} busy={busy} disabled={working} style={{ flex: 2 }} />
              </View>
            </View>
          )}
        </Card>
      )}

      <SectionLabel text="Notas recientes" style={{ marginTop: 22 }} />
      {recent.length === 0 ? <EmptyState compact icon="document-text-outline" title="Todavía no tienes notas" /> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {recent.map((n) => {
            const su = subjOf(n.subject_id);
            return (
              <Card key={n.id} padded={false} onPress={() => router.push(`/nota/${n.id}`)} accessibilityLabel={`Abrir nota ${n.title ?? ''}`} style={{ width: isWide ? 220 : '47%', overflow: 'hidden' }}>
                <View style={{ height: 70, backgroundColor: (su?.color ?? C.brand) + '22', alignItems: 'center', justifyContent: 'center' }}>
                  {su ? <SubjectIcon icon={su.icon} box={40} emoji={24} /> : <Ionicons name="document-text-outline" size={24} color={C.muted} />}
                </View>
                <View style={{ padding: 12 }}>
                  <Text numberOfLines={1} style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>{n.title || 'Nota'}</Text>
                  <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{su?.name ?? 'Sin materia'} · {new Date(n.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</Text>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {editing && <PhotoEditor original={editing.original} edit={editing.edit} onCancel={() => setEditing(null)} onApply={(e) => applyEdit(editing, e)} />}
      <NotePickSheet visible={picking} onClose={() => setPicking(false)} onPick={(n: NoteRef) => setDest({ kind: 'note', id: n.id, title: n.title })} />
      <Modal visible={!!zoom} transparent onRequestClose={() => setZoom(null)}>
        <Pressable onPress={() => setZoom(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="Cerrar foto">
          {zoom && <Image source={{ uri: src(zoom) }} style={{ width: '94%', height: '86%' }} resizeMode="contain" />}
          <Text style={{ color: '#ccc', marginTop: 12, fontSize: 13 }}>Toca para cerrar</Text>
        </Pressable>
      </Modal>
    </Screen>
  );
}
