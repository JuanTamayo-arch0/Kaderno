import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { C, R } from '../lib/theme';
import { NoteImage, getNoteImages, addNoteImage, deleteNoteImage, signedUrl } from '../lib/db';

// Muestra y gestiona los diagramas/imágenes adjuntas de una nota.
// Al adjuntar, el sistema ofrece recortar la imagen (allowsEditing).
export function NoteAttachments({ noteId }: { noteId: string }) {
  const [imgs, setImgs] = useState<NoteImage[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await getNoteImages(noteId);
      setImgs(list);
      const entries = await Promise.all(list.map(async (i) => [i.id, await signedUrl(i.path)] as const));
      const m: Record<string, string> = {};
      entries.forEach(([id, u]) => { if (u) m[id] = u; });
      setUrls(m);
    } catch { /* noop */ }
  }, [noteId]);
  useEffect(() => { load(); }, [load]);

  async function attach(fromCamera: boolean) {
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permiso necesario', 'Autoriza el acceso para adjuntar.');
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, base64: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, base64: true, quality: 0.7 });
    if (res.canceled || !res.assets[0].base64) return;
    setBusy(true);
    try { await addNoteImage(noteId, res.assets[0].base64!); await load(); }
    catch (e: any) { Alert.alert('Error', e.message); } finally { setBusy(false); }
  }

  function confirmRemove(i: NoteImage) {
    Alert.alert('Quitar adjunto', '¿Eliminar esta imagen?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { try { await deleteNoteImage(i.id, i.path); load(); } catch (e: any) { Alert.alert('Error', e.message); } } },
    ]);
  }

  return (
    <View style={{ marginTop: 20 }}>
      <Text style={{ color: C.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '700', marginBottom: 10 }}>Diagramas y adjuntos</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {imgs.map((i) => (
          <View key={i.id} style={{ width: 104, height: 104 }}>
            <Pressable onPress={() => urls[i.id] && setViewer(urls[i.id])} style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line }}>
              {urls[i.id] ? <Image source={{ uri: urls[i.id] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.muted} /></View>}
            </Pressable>
            <Pressable onPress={() => confirmRemove(i)} accessibilityLabel="Quitar" style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: C.bad, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => attach(false)} disabled={busy} accessibilityLabel="Adjuntar imagen"
          style={{ width: 104, height: 104, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Ionicons name="image-outline" size={22} color={C.muted} />
          <Text style={{ color: C.muted, fontSize: 11 }}>Adjuntar</Text>
        </Pressable>
        <Pressable onPress={() => attach(true)} disabled={busy} accessibilityLabel="Tomar foto"
          style={{ width: 104, height: 104, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Ionicons name="camera-outline" size={22} color={C.muted} />
          <Text style={{ color: C.muted, fontSize: 11 }}>Cámara</Text>
        </Pressable>
      </View>
      {busy && <View style={{ marginTop: 10 }}><ActivityIndicator color={C.brand} /></View>}
      <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 8 }}>Al adjuntar puedes recortar la imagen para dejar solo el diagrama o dibujo.</Text>

      <Modal visible={!!viewer} transparent onRequestClose={() => setViewer(null)}>
        <Pressable onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
          {viewer && <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
          <Text style={{ color: C.muted, marginTop: 16, fontSize: 13 }}>Toca para cerrar</Text>
        </Pressable>
      </Modal>
    </View>
  );
}
