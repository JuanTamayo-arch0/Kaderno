import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';
import { SubjectFile, getSubjectFiles, uploadSubjectFile, deleteSubjectFile, signedUrl } from '../lib/db';

function human(size: number | null): string {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function iconFor(mime: string | null): any {
  if (!mime) return 'document-outline';
  if (mime.includes('pdf')) return 'document-text-outline';
  if (mime.includes('image')) return 'image-outline';
  if (mime.includes('zip') || mime.includes('rar')) return 'archive-outline';
  return 'document-outline';
}

export function SubjectFiles({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<SubjectFile[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setFiles(await getSubjectFiles(subjectId)); } catch { /* noop */ }
  }, [subjectId]);
  useEffect(() => { load(); }, [load]);

  async function pickAndUpload() {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setBusy(true);
    try {
      let body: Blob | ArrayBuffer | Uint8Array;
      if ((a as any).file) {
        body = (a as any).file; // web: objeto File
      } else if ((FileSystem as any).readAsStringAsync) {
        const b64 = await (FileSystem as any).readAsStringAsync(a.uri, { encoding: 'base64' });
        body = decode(b64);
      } else {
        body = await (await fetch(a.uri)).blob();
      }
      await uploadSubjectFile(subjectId, { name: a.name ?? 'archivo', mime: a.mimeType ?? null, size: a.size ?? null, body });
      await load();
    } catch (e: any) { Alert.alert('Error al subir', e.message); }
    finally { setBusy(false); }
  }

  async function open(f: SubjectFile) {
    const url = await signedUrl(f.path);
    if (!url) return Alert.alert('No se pudo abrir el archivo');
    router.push({ pathname: '/visor', params: { url, name: f.name, mime: f.mime ?? '' } });
  }

  function confirmDelete(f: SubjectFile) {
    Alert.alert('Eliminar archivo', `¿Borrar "${f.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { try { await deleteSubjectFile(f.id, f.path); load(); } catch (e: any) { Alert.alert('Error', e.message); } } },
    ]);
  }

  return (
    <View>
      {files.length === 0 && <Text style={{ color: C.muted, fontSize: 13, paddingVertical: 8 }}>Aún no hay materiales. Sube PDFs de libros, guías, etc.</Text>}
      {files.map((f) => (
        <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 }}>
          <Ionicons name={iconFor(f.mime)} size={22} color={C.brand} />
          <Pressable style={{ flex: 1 }} onPress={() => open(f)}>
            <Text numberOfLines={1} style={{ color: C.text, fontWeight: '600' }}>{f.name}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>{human(f.size)}{f.mime?.includes('pdf') ? ' · PDF' : ''}</Text>
          </Pressable>
          <Pressable onPress={() => open(f)} hitSlop={8} accessibilityLabel="Abrir"><Ionicons name="eye-outline" size={18} color={C.muted} /></Pressable>
          <Pressable onPress={() => confirmDelete(f)} hitSlop={8} accessibilityLabel="Eliminar"><Ionicons name="trash-outline" size={18} color={C.muted} /></Pressable>
        </View>
      ))}
      <Pressable onPress={pickAndUpload} disabled={busy}
        style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, borderRadius: 12, padding: 13, marginTop: 4 }}>
        {busy ? <ActivityIndicator color={C.brand} /> : <Ionicons name="cloud-upload-outline" size={18} color={C.muted} />}
        <Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}>{busy ? 'Subiendo…' : 'Subir archivo (PDF, etc.)'}</Text>
      </Pressable>
    </View>
  );
}
