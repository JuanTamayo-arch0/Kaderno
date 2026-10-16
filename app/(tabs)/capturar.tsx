import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { Subject, Note, getSubjects, getNotes, uploadPhoto, runOCR, addNote, addNoteImage, indexNote } from '../../lib/db';
import { notify, toast, friendlyError } from '../../lib/feedback';
import { Screen, Button, Card, Field, IconButton, SectionLabel, EmptyState } from '../../components/ds';
import { SubjectPicker } from '../../components/SubjectPicker';
import { SubjectIcon } from '../../components/SubjectIcon';

// Se carga al usarlo: así expo-image-picker no se descarga al abrir la app.
const loadPicker = () => import('expo-image-picker');
// Se precarga en segundo plano poco después de abrir, para que al tocar "subir foto" ya esté listo.
if (typeof window !== 'undefined') setTimeout(() => { Promise.resolve().then(loadPicker).catch(() => {}); }, 4000);

// ============================================================
//  Capturar: de foto a nota editable.
//  - Varias páginas en una sola nota (cada una pasa por el OCR).
//  - En computador: arrastrar y soltar o pegar (Ctrl V) una imagen.
//  - Si el OCR no responde, se puede escribir el texto a mano.
// ============================================================

type Page = { uri: string; base64: string; status: 'ocr' | 'ok' | 'fail'; text: string };

/** En web: reduce la imagen (máx. 2000 px) y la pasa a JPEG en base64. */
async function fileToBase64(file: File): Promise<{ uri: string; base64: string }> {
  const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const img: HTMLImageElement = await new Promise((res, rej) => { const i = new (window as any).Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL('image/jpeg', 0.75);
  return { uri: out, base64: out.split(',')[1] };
}

export default function Capturar() {
  const router = useRouter();
  const params = useLocalSearchParams<{ subjectId?: string }>();
  const { isWide } = useResponsive();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState<string | null>(params.subjectId ?? null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Note[]>([]);
  const [dragging, setDragging] = useState(false);
  const dropRef = useRef<View>(null);

  useFocusEffect(useCallback(() => {
    getSubjects().then((s) => { setSubjects(s); setSubjectId((cur) => cur ?? params.subjectId ?? s[0]?.id ?? null); }).catch(() => {});
    getNotes().then((n) => setRecent(n.slice(0, 12))).catch(() => {});
  }, [params.subjectId]));

  const addPage = useCallback(async (img: { uri: string; base64: string }) => {
    setPages((ps) => [...ps, { ...img, status: 'ocr', text: '' }]);
    try {
      const text = await runOCR(img.base64);
      setPages((ps) => ps.map((p) => p.uri === img.uri ? { ...p, status: 'ok', text } : p));
    } catch {
      setPages((ps) => ps.map((p) => p.uri === img.uri ? { ...p, status: 'fail' } : p));
    }
  }, []);

  async function pick(fromCamera: boolean) {
    const perm = fromCamera ? await (await loadPicker()).requestCameraPermissionsAsync() : await (await loadPicker()).requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify('Permiso necesario', 'Autoriza el acceso a la cámara o a las fotos para continuar.'); return; }
    const res = fromCamera
      ? await (await loadPicker()).launchCameraAsync({ base64: true, quality: 0.6 })
      : await (await loadPicker()).launchImageLibraryAsync({ base64: true, quality: 0.6, allowsMultipleSelection: true, selectionLimit: 10 });
    if (res.canceled) return;
    for (const a of res.assets) if (a.base64) addPage({ uri: a.uri, base64: a.base64 });
  }

  // Arrastrar y soltar, y pegar, en el navegador.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const takeFiles = (files: FileList | null | undefined) => {
      Array.from(files ?? []).filter((f) => f.type.startsWith('image/')).slice(0, 10)
        .forEach((f) => fileToBase64(f).then(addPage).catch(() => notify('No se pudo leer la imagen')));
    };
    const onPaste = (e: ClipboardEvent) => { if (e.clipboardData?.files?.length) { e.preventDefault(); takeFiles(e.clipboardData.files); } };
    const el = dropRef.current as unknown as HTMLElement | null;
    const over = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const leave = () => setDragging(false);
    const drop = (e: DragEvent) => { e.preventDefault(); setDragging(false); takeFiles(e.dataTransfer?.files); };
    window.addEventListener('paste', onPaste);
    el?.addEventListener?.('dragover', over); el?.addEventListener?.('dragleave', leave); el?.addEventListener?.('drop', drop);
    return () => {
      window.removeEventListener('paste', onPaste);
      el?.removeEventListener?.('dragover', over); el?.removeEventListener?.('dragleave', leave); el?.removeEventListener?.('drop', drop);
    };
  }, [addPage]);

  const text = pages.map((p) => p.text).filter(Boolean).join('\n\n---\n\n');
  const [manual, setManual] = useState<string | null>(null);
  const finalText = manual ?? text;
  const working = pages.some((p) => p.status === 'ocr');

  async function save() {
    if (!pages.length) return;
    if (!finalText.trim()) { notify('No hay texto para guardar', 'Escribe el contenido a mano o espera a que termine de leer la foto.'); return; }
    setBusy(true);
    try {
      const path = await uploadPhoto(pages[0].base64);
      const id = await addNote({ subject_id: subjectId, title: title.trim() || 'Nota sin título', content: finalText.trim(), image_path: path });
      for (const p of pages.slice(1)) { try { await addNoteImage(id, p.base64); } catch { /* la nota ya quedó */ } }
      indexNote(id, finalText.trim(), subjectId);
      setPages([]); setTitle(''); setManual(null);
      toast('Nota digitalizada', { tone: 'good', actionLabel: 'Abrir', onAction: () => router.push(`/nota/${id}`) });
      getNotes().then((n) => setRecent(n.slice(0, 12))).catch(() => {});
    } catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }

  const subjOf = (id: string | null) => subjects.find((s) => s.id === id);

  return (
    <Screen title="Capturar" subtitle="De la foto de tu cuaderno a una nota editable" maxWidth={1000} back={isWide ? undefined : '/estudiar'}>
      <View ref={dropRef}>
        <Card style={{ borderStyle: dragging ? 'dashed' : 'solid', borderColor: dragging ? C.brand : C.line, borderWidth: dragging ? 2 : 1, alignItems: 'center', paddingVertical: 28 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: C.brand + '1f', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Ionicons name={dragging ? 'download-outline' : 'camera-outline'} size={28} color={C.brand} />
          </View>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{dragging ? 'Suelta la imagen aquí' : isWide ? 'Arrastra fotos aquí o pégalas con Ctrl V' : 'Fotografía una o varias páginas'}</Text>
          <Text style={{ color: C.muted, fontSize: 13.5, textAlign: 'center', marginTop: 6, maxWidth: 460 }}>Se extrae el texto y queda editable. La foto original se guarda con la nota.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            {isWide ? (
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
        </Card>
      </View>

      {pages.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {pages.map((p, i) => (
              <View key={p.uri} style={{ width: 120 }}>
                <Image source={{ uri: p.uri }} style={{ width: 120, height: 150, borderRadius: 10, backgroundColor: C.surface2 }} resizeMode="cover" accessibilityLabel={`Página ${i + 1}`} />
                <View style={{ position: 'absolute', top: 4, right: 4 }}>
                  <IconButton icon="close-circle" label={`Quitar página ${i + 1}`} color="#fff" size={22} onPress={() => setPages((ps) => ps.filter((x) => x.uri !== p.uri))} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  {p.status === 'ocr' ? <ActivityIndicator size="small" color={C.brand} /> : <Ionicons name={p.status === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={15} color={p.status === 'ok' ? C.goodText : C.warnText} />}
                  <Text style={{ color: C.muted, fontSize: 12 }}>{p.status === 'ocr' ? 'Leyendo…' : p.status === 'ok' ? `Página ${i + 1}` : 'Sin texto'}</Text>
                </View>
              </View>
            ))}
            <Pressable onPress={() => pick(!isWide)} accessibilityRole="button" accessibilityLabel="Agregar otra página"
              style={{ width: 120, height: 150, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={26} color={C.muted} />
              <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 4 }}>Otra página</Text>
            </Pressable>
          </ScrollView>

          {pages.some((p) => p.status === 'fail') && (
            <Text style={{ color: C.warnText, fontSize: 13, marginTop: 12 }}>No se pudo leer el texto de alguna página. Puedes escribirlo abajo.</Text>
          )}
          <Field label={working ? 'Texto extraído (leyendo…)' : 'Texto extraído, puedes corregirlo'} value={finalText} onChangeText={setManual} multiline
            placeholder="El texto reconocido aparece aquí…" inputStyle={{ minHeight: 160, textAlignVertical: 'top' }} style={{ marginTop: 14 }} />
          <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 10 }}>
            <Field label="Título" value={title} onChangeText={setTitle} placeholder="Ej: Leyes de Newton" style={{ flex: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>Materia</Text>
              <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Button label="Descartar" kind="secondary" onPress={() => { setPages([]); setManual(null); setTitle(''); }} style={{ flex: 1 }} />
            <Button label="Guardar nota" icon="save-outline" onPress={save} busy={busy} disabled={working} style={{ flex: 2 }} />
          </View>
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
    </Screen>
  );
}
