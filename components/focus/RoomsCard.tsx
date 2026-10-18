import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { listRooms, createRoom, joinRoom, type StudyRoom, ROOMS_MISSING } from '../../lib/roomsDb';
import { useLiveRoom, enterRoom, proposeTogether, acceptProposal } from '../../lib/rooms';
import { normalizeCode, proposalOpen, proposalText, stateCounts, mergePeople } from '../../lib/roomsLogic';
import { toast } from '../../lib/feedback';
import { useFocusTimer } from '../../lib/focusTimer';
import { Button, Card, focusRingStyle } from '../ds';

// ============================================================
//  Tarjeta "Enfocar juntos" en la pantalla de Enfoque: la sala
//  activa (quién está enfocado, Empezar juntos) o la lista de tus
//  salas con Crear y Unirme con código.
// ============================================================

export function useNow(everyMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(t); }, [everyMs]);
  return now;
}

export function Avatar({ name, state, size = 30 }: { name: string; state: 'work' | 'break' | 'online' | 'away'; size?: number }) {
  const ring = state === 'work' ? C.brand : state === 'break' ? C.good : state === 'online' ? C.muted : C.line;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: ring, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', opacity: state === 'away' ? 0.55 : 1 }}>
      <Text style={{ color: C.text, fontSize: size * 0.4, fontWeight: '800' }}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

export function RoomsCard() {
  const router = useRouter();
  const live = useLiveRoom();
  const f = useFocusTimer();
  const now = useNow(1000);
  const [rooms, setRooms] = useState<StudyRoom[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listRooms().then((r) => { setRooms(r); setErr(null); }).catch((e) => setErr(String(e.message ?? e)));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (r: { id: string; name: string }) => { void enterRoom(r); router.push(`/sala/${r.id}` as any); };

  const submit = async () => {
    if (busy) return;
    if (mode === 'join') {
      const code = normalizeCode(text);
      if (!code) { toast('El código tiene 6 letras y números, por ejemplo KD7-X4P.', { tone: 'bad' }); return; }
      setBusy(true);
      try {
        const r = await joinRoom(code);
        if (!r) { toast('No encontramos una sala con ese código.', { tone: 'bad' }); return; }
        setMode('none'); setText(''); await open(r);
      } catch (e: any) { toast(String(e.message ?? e), { tone: 'bad' }); } finally { setBusy(false); }
    } else if (mode === 'create') {
      if (!text.trim()) return;
      setBusy(true);
      try { const r = await createRoom(text.trim()); setMode('none'); setText(''); await open(r); }
      catch (e: any) { toast(String(e.message ?? e), { tone: 'bad' }); } finally { setBusy(false); }
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <Ionicons name="people-outline" size={18} color={C.brand} />
      <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }} accessibilityRole="header">Enfocar juntos</Text>
    </View>
  );

  if (err === ROOMS_MISSING) {
    return <Card>{header}<Text style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}>{ROOMS_MISSING}</Text></Card>;
  }

  // ---------- Sala activa ----------
  if (live.room) {
    const rows = mergePeople([], live.online, live.me ?? '', now);
    const p = live.proposal;
    const canJoin = p && proposalOpen(p, now) && live.joinedProposal !== p.id && p.by !== live.me;
    const waiting = f.state.startsAt && f.state.startsAt > now ? Math.ceil((f.state.startsAt - now) / 1000) : 0;
    return (
      <Card>
        {header}
        <Pressable onPress={() => router.push(`/sala/${live.room!.id}` as any)} accessibilityRole="button" accessibilityLabel={`Abrir la sala ${live.room.name}`}
          style={({ hovered, focused }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: hovered ? C.surface2 : '#1a2036', borderWidth: 1, borderColor: '#34437a' }, focused ? focusRingStyle() : null]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{live.room.name}</Text>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>
              {live.status === 'on' ? stateCounts(rows) : live.status === 'error' ? (live.error ?? 'Sin conexión') : 'Conectando...'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {rows.slice(0, 5).map((r, i) => <View key={r.user_id} style={{ marginLeft: i ? -8 : 0 }}><Avatar name={r.name} state={r.state} size={28} /></View>)}
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
        {canJoin ? (
          <View style={{ marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: '#142a22', borderWidth: 1, borderColor: '#22604a', gap: 8 }}>
            <Text style={{ color: C.text, fontSize: 13.5 }}>{proposalText(p!, now)}</Text>
            <Button label="Me uno" icon="play" size="sm" onPress={() => acceptProposal(p!)} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : waiting ? (
          <Text style={{ color: C.goodText, fontSize: 13.5, fontWeight: '700', marginTop: 10 }} accessibilityLiveRegion="polite">Empiezan todos en {waiting} s</Text>
        ) : !f.state.running ? (
          <Button label={`Empezar juntos (${f.state.workMin} min)`} icon="people" kind="secondary" size="sm" onPress={() => { void proposeTogether(); }}
            disabled={live.status !== 'on'} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
        ) : null}
      </Card>
    );
  }

  // ---------- Sin sala activa ----------
  return (
    <Card>
      {header}
      <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
        Estudia con tus compañeros: ven quién está enfocado, arrancan el pomodoro a la vez y suman a una meta del grupo.
      </Text>
      {(rooms ?? []).slice(0, 4).map((r) => (
        <Pressable key={r.id} onPress={() => open(r)} accessibilityRole="button" accessibilityLabel={`Entrar a la sala ${r.name}`}
          style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
          <Ionicons name={r.project_id ? 'briefcase-outline' : 'people-circle-outline'} size={18} color={C.muted} />
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>{r.name}</Text>
          <Text style={{ color: C.brand, fontSize: 13, fontWeight: '700' }}>Entrar</Text>
        </Pressable>
      ))}
      {mode === 'none' ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <Button label="Crear sala" icon="add" size="sm" onPress={() => { setMode('create'); setText(''); }} />
          <Button label="Unirme con código" kind="secondary" size="sm" onPress={() => { setMode('join'); setText(''); }} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <TextInput value={text} onChangeText={setText} autoFocus onSubmitEditing={submit} maxLength={mode === 'join' ? 9 : 60}
            autoCapitalize={mode === 'join' ? 'characters' : 'sentences'}
            placeholder={mode === 'join' ? 'Código, p. ej. KD7-X4P' : 'Nombre, p. ej. Cálculo II juntos'} placeholderTextColor={C.muted}
            accessibilityLabel={mode === 'join' ? 'Código de la sala' : 'Nombre de la sala'}
            style={{ flex: 1, minWidth: 0, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, paddingHorizontal: 12, minHeight: 40, fontSize: 14 }} />
          <Button label={mode === 'join' ? 'Unirme' : 'Crear'} size="sm" busy={busy} disabled={!text.trim()} onPress={submit} />
          <Pressable onPress={() => setMode('none')} accessibilityRole="button" accessibilityLabel="Cancelar" style={{ width: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={18} color={C.muted} />
          </Pressable>
        </View>
      )}
    </Card>
  );
}
