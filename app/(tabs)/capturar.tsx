import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../../lib/theme';
import { useResponsive, SIDEBAR_W } from '../../lib/responsive';
import { Subject, Note, getSubjects, getNotes, uploadPhoto, runOCR, addNote, indexNote } from '../../lib/db';
import { Header, Chip } from '../../components/ui';
import { SubjectPicker } from '../../components/SubjectPicker';
import { SubjectIcon } from '../../components/SubjectIcon';

export default function Capturar() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [image, setImage] = useState<{ uri: string; base64: string } | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'ocr' | 'ready'>('idle');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Note[]>([]);

  useFocusEffect(useCallback(() => {
    getSubjects().then((s) => { setSubjects(s); if (s[0] && !subjectId) setSubjectId(s[0].id); }).catch(() => {});
    getNotes().then(setRecent).catch(() => {});
  }, [subjectId]));

  async function pick(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permiso necesario', 'Autoriza el acceso para continuar.');

    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
    if (res.canceled || !res.assets[0].base64) return;

    const a = res.assets[0];
    setImage({ uri: a.uri, base64: a.base64! });
    setStatus('ocr'); setOcrText('');
    try {
      const text = await runOCR(a.base64!);
      setOcrText(text);
      setStatus('ready');
    } catch (e: any) {
      setStatus('ready');
      Alert.alert('OCR no disponible', 'Puedes escribir el texto manualmente. (Configura la función OCR para automatizarlo.)');
    }
  }

  async function save() {
    if (!image) return;
    if (!ocrText.trim()) return Alert.alert('No hay texto para guardar');
    setBusy(true);
    try {
      const path = await uploadPhoto(image.base64);
      const newId = await addNote({ subject_id: subjectId, title: title.trim() || 'Nota sin título', content: ocrText.trim(), image_path: path });
      indexNote(newId, ocrText.trim(), subjectId); // best-effort para el Oráculo
      setImage(null); setOcrText(''); setTitle(''); setStatus('idle');
      Alert.alert('Guardado', 'Tu nota quedó digitalizada ✓');
      router.push('/(tabs)/materias');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  }

  const subjOf = (id: string | null) => subjects.find((s) => s.id === id);

  const ocrArea = status !== 'idle' && (
    <View style={cardBox}>
      {image && <Image source={{ uri: image.uri }} style={{ width: '100%', height: 220, borderRadius: 12 }} resizeMode="cover" />}
      {status === 'ocr' && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 }}><ActivityIndicator color={C.warn} /><Text style={{ color: C.warn }}>Digitalizando…</Text></View>}
      {status === 'ready' && (
        <>
          <Text style={lbl}>Texto extraído (editable)</Text>
          <TextInput value={ocrText} onChangeText={setOcrText} multiline placeholder="El texto reconocido aparece aquí…" placeholderTextColor={C.muted} style={[input, { minHeight: 140, textAlignVertical: 'top' }]} />
          <Text style={lbl}>Materia</Text>
          <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} allowNone={false} />
          <Text style={lbl}>Título de la nota</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Ej: Leyes de Newton" placeholderTextColor={C.muted} style={input} />
          <Pressable onPress={save} disabled={busy} style={[btn, { marginTop: 16 }]}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Guardando…' : 'Guardar nota'}</Text></Pressable>
        </>
      )}
    </View>
  );

  // ===================== ESCRITORIO =====================
  if (isWide) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: SIDEBAR_W }}>
        <ScrollView contentContainerStyle={{ paddingVertical: 36, paddingHorizontal: 44, paddingBottom: 60 }}>
          <View style={{ maxWidth: 1200, width: '100%' }}>
            <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>Capturar</Text>
            <Text style={{ color: C.muted, fontSize: 14, marginTop: 4, marginBottom: 20 }}>Digitaliza tu cuaderno</Text>

            <View style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 16, padding: 32, marginBottom: 24 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>📸 Digitalizar apunte</Text>
              <Text style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Toma o sube una foto de tu cuaderno. Se extrae el texto y se guarda editable, conservando la imagen original.</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable onPress={() => pick(true)} style={{ flex: 1, backgroundColor: C.brand, borderRadius: 10, padding: 14, alignItems: 'center' }}><Text style={{ color: '#0f1115', fontWeight: '700' }}>Tomar foto</Text></Pressable>
                <Pressable onPress={() => pick(false)} style={{ flex: 1, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 14, alignItems: 'center' }}><Text style={{ color: C.text, fontWeight: '700' }}>Galería</Text></Pressable>
              </View>
            </View>

            {ocrArea}

            <Text style={{ color: C.muted, fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 12 }}>Capturas recientes</Text>
            {recent.length === 0 ? (
              <Text style={{ color: C.muted, fontSize: 13 }}>Todavía no has digitalizado apuntes.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                {recent.slice(0, 10).map((n) => {
                  const su = subjOf(n.subject_id);
                  return (
                    <Pressable key={n.id} onPress={() => router.push(`/nota/${n.id}`)} style={{ width: 220, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, overflow: 'hidden' }}>
                      <View style={{ height: 120, backgroundColor: (su?.color ?? C.brand) + '22', alignItems: 'center', justifyContent: 'center' }}><SubjectIcon icon={su?.icon ?? '📝'} box={64} emoji={30} /></View>
                      <View style={{ padding: 12 }}>
                        <Text numberOfLines={1} style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{n.title || 'Nota'}</Text>
                        <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{su?.name ?? 'Sin materia'} · {new Date(n.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ===================== MÓVIL =====================
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: isWide ? SIDEBAR_W : 0 }}>
      <Header title="Capturar" subtitle="Digitaliza tu cuaderno" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={cardBox}>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 15, marginBottom: 6 }}>📸 Digitalizar apunte</Text>
          <Text style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>
            Toma o sube una foto de tu cuaderno. Se extrae el texto y se guarda editable, conservando la imagen original.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => pick(true)} style={[btn, { flex: 1 }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Tomar foto</Text>
            </Pressable>
            <Pressable onPress={() => pick(false)} style={[btnGhost, { flex: 1 }]}>
              <Text style={{ color: C.text }}>Galería</Text>
            </Pressable>
          </View>

          {image && <Image source={{ uri: image.uri }} style={{ width: '100%', height: 200, borderRadius: 12, marginTop: 12 }} resizeMode="cover" />}

          {status === 'ocr' && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 }}>
              <ActivityIndicator color={C.warn} />
              <Text style={{ color: C.warn }}>Digitalizando…</Text>
            </View>
          )}

          {status === 'ready' && (
            <>
              <Text style={lbl}>Texto extraído (editable)</Text>
              <TextInput value={ocrText} onChangeText={setOcrText} multiline
                placeholder="El texto reconocido aparece aquí…" placeholderTextColor={C.muted}
                style={[input, { minHeight: 120, textAlignVertical: 'top' }]} />

              <Text style={lbl}>Materia</Text>
              <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} allowNone={false} />

              <Text style={lbl}>Título de la nota</Text>
              <TextInput value={title} onChangeText={setTitle} placeholder="Ej: Leyes de Newton"
                placeholderTextColor={C.muted} style={input} />

              <Pressable onPress={save} disabled={busy} style={[btn, { marginTop: 16 }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Guardando…' : 'Guardar nota'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const cardBox = { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 16, padding: 14 } as const;
const btn = { backgroundColor: C.brand, borderRadius: 12, padding: 13, alignItems: 'center' } as const;
const btnGhost = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 13, alignItems: 'center' } as const;
const input = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 12, fontSize: 14 } as const;
const lbl = { color: C.muted, fontSize: 12, marginTop: 14, marginBottom: 6 } as const;
