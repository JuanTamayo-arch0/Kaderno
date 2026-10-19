import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { addTask } from '../lib/db';
import { toast, friendlyError } from '../lib/feedback';

// ============================================================
//  Compartir hacia Kaderno (v21, sección 2; Android con Web Share Target):
//  un texto o enlace compartido desde otra app cae en la bandeja.
//  Las fotos las recibe el service worker y se abren en Capturar.
// ============================================================

export function sharedToTask(p: { title?: string; text?: string; url?: string }): { title: string; description: string | null } {
  const text = (p.text ?? '').trim(), url = (p.url ?? '').trim();
  const firstLine = text.split('\n')[0].trim();
  const title = ((p.title ?? '').trim() || firstLine || url || 'Compartido').slice(0, 120);
  const rest = [text && text !== title ? text : '', url && !text.includes(url) ? url : ''].filter(Boolean).join('\n').slice(0, 2000);
  return { title, description: rest || null };
}

function Compartir() {
  const router = useRouter();
  const p = useLocalSearchParams<{ title?: string; text?: string; url?: string }>();
  const [err, setErr] = useState<string | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const { title, description } = sharedToTask(p);
    addTask({ title, description, subject_id: null, due_date: null, remind_days: 0, inbox: true })
      .then(() => { toast(`A la bandeja: ${title}`, { tone: 'good' }); router.replace({ pathname: '/', params: { bandeja: '1' } } as any); })
      .catch((e) => setErr(friendlyError(e)));
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: C.bg, padding: 24 }}>
      {err ? <Text style={{ color: C.badText, fontSize: 15, textAlign: 'center' }}>No se pudo guardar: {err}</Text> : <>
        <ActivityIndicator color={C.brand} />
        <Text style={{ color: C.muted, fontSize: 14 }}>Guardando en tu bandeja…</Text>
      </>}
    </View>
  );
}

export default function CompartirProtegido() {
  return <RequireAuth><Compartir /></RequireAuth>;
}
