import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Button } from '../../components/ds';
import { fetchSharedNote, type SharedNote } from '../../lib/calendarsDb';
import { noteToHtml } from '../../lib/noteHtml';
import { useAuth } from '../../lib/auth';

// ============================================================
//  Nota compartida (v21, sección 10): pública, de solo lectura, sin sesión.
//  El dueño puede apagar el enlace cuando quiera.
// ============================================================

function useKatexCss() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('kd-katex-css')) return;
    const l = document.createElement('link');
    l.id = 'kd-katex-css'; l.rel = 'stylesheet'; l.href = '/katex/katex.min.css';
    document.head.appendChild(l);
  }, []);
}

const CSS = `
.kd-shared{color:${C.text};font-size:16px;line-height:1.65;word-wrap:break-word}
.kd-shared h1,.kd-shared h2,.kd-shared h3{line-height:1.25;margin:1.2em 0 .4em}
.kd-shared p{margin:.6em 0}
.kd-shared a{color:${C.brand}}
.kd-shared img{max-width:100%;border-radius:10px}
.kd-shared pre{background:${C.surface2};padding:12px;border-radius:10px;overflow:auto}
.kd-shared code{font-family:ui-monospace,Menlo,monospace;font-size:.9em}
.kd-shared blockquote{border-left:3px solid ${C.line};margin:.8em 0;padding-left:12px;color:${C.muted}}
.kd-shared table{border-collapse:collapse;display:block;overflow:auto}
.kd-shared td,.kd-shared th{border:1px solid ${C.line};padding:6px 10px}
.kd-shared .math{overflow-x:auto}
`;

export default function NotaCompartida() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [note, setNote] = useState<SharedNote | null>(null);
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  useKatexCss();

  useEffect(() => {
    let live = true;
    setNote(null); setError(null);
    fetchSharedNote(String(token ?? ''))
      .then(async (n) => { if (!live) return; setNote(n); setHtml(await noteToHtml(n.content)); })
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [token]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.title = note ? `${note.title} · Kaderno` : 'Nota compartida · Kaderno';
  }, [note]);

  const updated = note?.updated_at ? new Date(note.updated_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ alignItems: 'center', padding: 16, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 760 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <Ionicons name="book-outline" size={18} color={C.brand} />
          <Text style={{ color: C.muted, fontSize: 13, fontWeight: '700', flex: 1 }}>Kaderno · nota compartida</Text>
          <Button label={session ? 'Ir a Kaderno' : 'Probar Kaderno'} size="sm" kind="ghost" onPress={() => router.replace(session ? '/' : '/login')} />
        </View>
        {!note && !error && <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />}
        {error && (
          <View style={{ alignItems: 'center', gap: 10, marginTop: 40 }} accessibilityLiveRegion="polite">
            <Ionicons name="link-outline" size={36} color={C.muted} />
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>Este enlace ya no funciona</Text>
            <Text style={{ color: C.muted, fontSize: 13.5, textAlign: 'center' }}>Quien lo compartió pudo desactivarlo o cambiarlo. Pídele uno nuevo.</Text>
          </View>
        )}
        {note && (
          <>
            <Text accessibilityRole="header" style={{ color: C.text, fontSize: 28, fontWeight: '800', lineHeight: 34 }}>{note.title}</Text>
            {updated && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 6 }}>Actualizada el {updated}</Text>}
            {Platform.OS === 'web' ? (
              <>
                <style dangerouslySetInnerHTML={{ __html: CSS }} />
                <div className="kd-shared" dangerouslySetInnerHTML={{ __html: html }} />
              </>
            ) : (
              <Text style={{ color: C.text, fontSize: 15, marginTop: 16 }}>{note.content}</Text>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}
