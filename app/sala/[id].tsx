import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { getRoom, roomPeople, leaveRoom, updateRoom, newRoomCode, type StudyRoom } from '../../lib/roomsDb';
import { useLiveRoom, enterRoom, exitRoom, proposeTogether, acceptProposal, setShareTask, setViewingRoom } from '../../lib/rooms';
import { mergePeople, groupProgress, proposalOpen, proposalText, formatCode, joinLink, stateCounts, type RoomPerson } from '../../lib/roomsLogic';
import { useFocusTimer } from '../../lib/focusTimer';
import { confirm, toast } from '../../lib/feedback';
import { copyText } from '../../lib/fileIO';
import { Screen, Card, Button, Toggle, EmptyState, Skeleton } from '../../components/ds';
import { Avatar, useNow } from '../../components/focus/RoomsCard';
import { RequireAuth } from '../../components/RequireAuth';
import { PetPatio, PatioHint, patioMembers } from '../../components/rooms/PetPatio';
import { usePets, activePet } from '../../lib/pets/store';
import { petsSeen, sendGreeting } from '../../lib/rooms';

// ============================================================
//  Sala de estudio: quién está, en qué estado y cuánto le queda,
//  "Empezar juntos" y la meta del grupo para hoy.
// ============================================================

const PILL: Record<string, { bg: string; fg: string }> = {
  work: { bg: '#1a2036', fg: '#a9bbff' }, break: { bg: '#142a22', fg: '#5fd8a4' },
  online: { bg: '#20242e', fg: '#c9ced8' }, away: { bg: 'transparent', fg: '#7c8494' },
};

export default function SalaConSesion() {
  return <RequireAuth><Sala /></RequireAuth>;
}

function Sala() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isWide } = useResponsive();
  const live = useLiveRoom();
  const f = useFocusTimer();
  const now = useNow(1000);
  const [room, setRoom] = useState<StudyRoom | null | undefined>(undefined);
  const [people, setPeople] = useState<RoomPerson[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const pets = usePets();

  const loadPeople = useCallback(() => { if (id) roomPeople(id).then(setPeople).catch(() => {}); }, [id]);
  useFocusEffect(useCallback(() => {
    if (!id) return;
    getRoom(id).then((r) => {
      setRoom(r);
      if (r) { void enterRoom({ id: r.id, name: r.name }); loadPeople(); }
    }).catch((e) => { setErr(String(e.message ?? e)); setRoom(null); });
    const t = setInterval(loadPeople, 60_000);
    setViewingRoom(id);
    return () => { clearInterval(t); setViewingRoom(null); };
  }, [id, loadPeople]));
  // Al terminar un pomodoro (mío o de alguien), refrescar la meta.
  const lastAt = f.state.last?.at ?? 0;
  const onlineSig = Object.values(live.online).map((o) => `${o.uid}:${o.state}`).join(',');
  useEffect(() => { const t = setTimeout(loadPeople, 2000); return () => clearTimeout(t); }, [lastAt, onlineSig, loadPeople]);

  if (room === undefined) return <Screen title="Sala" back="/enfoque"><Skeleton height={120} /><Skeleton height={220} /></Screen>;
  if (!room) {
    return (
      <Screen title="Sala" back="/enfoque">
        <EmptyState icon="people-outline" title="No encontramos esta sala" text={err ?? 'Puede que la hayan borrado o que ya no estés en ella.'}
          action={{ label: 'Volver a Enfoque', onPress: () => router.replace('/enfoque' as any) }} />
      </Screen>
    );
  }

  const me = live.me ?? '';
  const isOwner = room.owner_id === me;
  const rows = mergePeople(people, live.online, me, now);
  const goal = groupProgress(people, room.goal);
  const myPet = pets.prefs.enabled ? activePet(pets) : null;
  const patio = patioMembers(rows, petsSeen(room.id), myPet ? { species: myPet.species, outfit: myPet.outfit } : null, now);
  const p = live.proposal;
  const canJoin = p && proposalOpen(p, now) && live.joinedProposal !== p.id && p.by !== me;
  const waiting = f.state.startsAt && f.state.startsAt > now ? Math.ceil((f.state.startsAt - now) / 1000) : 0;
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'https://kaderno.app';

  const share = async () => {
    if (!room.code) return;
    const link = joinLink(origin, room.code);
    const text = `Estudiemos juntos en Kaderno: entra a "${room.name}" con el código ${formatCode(room.code)} o en ${link}`;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share && !isWide) {
      try { await (navigator as any).share({ title: room.name, text, url: link }); return; } catch { /* cancelado */ }
    }
    if (await copyText(link)) toast('Enlace copiado. Quien lo abra entra a la sala.', { tone: 'good' });
  };
  const leave = async () => {
    const msg = room.project_id ? 'Puedes volver desde el proyecto cuando quieras.' : isOwner && people.length > 1 ? 'La sala pasa a quien llegó primero después de ti.' : people.length <= 1 ? 'Eres la última persona: la sala se borra.' : 'Para volver necesitas el código.';
    if (!(await confirm('¿Salir de la sala?', msg, 'Salir de la sala'))) return;
    try { await leaveRoom(room.id); await exitRoom(); router.replace('/enfoque' as any); }
    catch (e: any) { toast(String(e.message ?? e), { tone: 'bad' }); }
  };
  const setGoal = async (g: number) => {
    try { const r = await updateRoom(room.id, null, Math.min(50, Math.max(1, g))); setRoom(r); } catch (e: any) { toast(String(e.message ?? e), { tone: 'bad' }); }
  };
  const regen = async () => {
    if (!(await confirm('¿Cambiar el código?', 'El código y el enlace de ahora dejan de servir. Quienes ya están en la sala siguen adentro.', 'Cambiar código'))) return;
    try { setRoom(await newRoomCode(room.id)); toast('Código nuevo listo.', { tone: 'good' }); } catch (e: any) { toast(String(e.message ?? e), { tone: 'bad' }); }
  };

  const together = (
    <Card>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', marginBottom: 8 }} accessibilityRole="header">Empezar juntos</Text>
      {canJoin ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: C.text, fontSize: 14 }} accessibilityLiveRegion="polite">{proposalText(p!, now)}</Text>
          <Button label="Me uno" icon="play" onPress={() => acceptProposal(p!)} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : waiting ? (
        <Text style={{ color: C.goodText, fontSize: 22, fontWeight: '800' }} accessibilityLiveRegion="polite">Empiezan todos en {waiting} s</Text>
      ) : f.state.running ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: f.state.mode === 'work' ? C.brand : C.goodText, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{f.label}</Text>
          <Text style={{ color: C.muted, fontSize: 13.5, flex: 1 }}>{f.state.mode === 'work' ? 'Estás enfocado. Este pomodoro cuenta para la meta.' : 'Descanso.'}</Text>
          <Button label="Ir a Enfoque" kind="secondary" size="sm" onPress={() => router.push('/enfoque' as any)} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ color: C.muted, fontSize: 13.5, lineHeight: 19 }}>Propón un pomodoro de {f.state.workMin} min. A los demás les llega un aviso y, si se unen, todos terminan a la misma hora.</Text>
          <Button label={`Empezar juntos (${f.state.workMin} min)`} icon="people" onPress={() => { void proposeTogether(); }} disabled={live.status !== 'on'} style={{ alignSelf: 'flex-start' }} />
        </View>
      )}
    </Card>
  );

  const goalCard = (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{goal.label}</Text>
        {isOwner && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable onPress={() => setGoal(room.goal - 1)} accessibilityRole="button" accessibilityLabel="Bajar la meta" hitSlop={6}><Ionicons name="remove-circle-outline" size={22} color={C.muted} /></Pressable>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>meta</Text>
            <Pressable onPress={() => setGoal(room.goal + 1)} accessibilityRole="button" accessibilityLabel="Subir la meta" hitSlop={6}><Ionicons name="add-circle-outline" size={22} color={C.muted} /></Pressable>
          </View>
        )}
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: C.surface2, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: goal.goal, now: goal.done }}>
        <View style={{ width: `${goal.frac * 100}%`, height: 10, borderRadius: 5, backgroundColor: goal.reached ? C.good : C.brand }} />
      </View>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Cuentan los pomodoros de 10 min o más que cada quien termina con la sala abierta.</Text>
    </Card>
  );

  const list = (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', flex: 1 }}>En la sala · {rows.length}</Text>
        <Text style={{ color: C.muted, fontSize: 12.5 }}>{live.status === 'on' ? stateCounts(rows) : live.status === 'error' ? (live.error ?? '') : 'Conectando...'}</Text>
      </View>
      {rows.map((r) => {
        const pill = PILL[r.state];
        return (
          <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.surface2 }}
            accessibilityLabel={`${r.name}${r.me ? ' (tú)' : ''}: ${r.label}${r.detail ? ', ' + r.detail : ''}. ${r.pomodoros} pomodoros hoy.`}>
            <Avatar name={r.name} state={r.state} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }} numberOfLines={1}>{r.name}{r.me ? ' (tú)' : ''}</Text>
              <Text style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={1}>
                {r.detail || (r.state === 'away' ? 'No está conectado' : 'Listo para empezar')}{r.live?.task ? ` · ${r.live.task}` : ''}{r.is_owner ? ' · creó la sala' : ''}
              </Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{r.pomodoros} hoy</Text>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: pill.bg, borderWidth: r.state === 'away' ? 1 : 0, borderColor: C.line }}>
              <Text style={{ color: pill.fg, fontSize: 12, fontWeight: '700' }}>{r.label}</Text>
            </View>
          </View>
        );
      })}
    </Card>
  );

  const settings = (
    <Card>
      {room.code ? (
        <View style={{ gap: 10, marginBottom: 10 }}>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>Código para invitar</Text>
          <Text style={{ color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: 2 }} selectable>{formatCode(room.code)}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label={isWide ? 'Copiar enlace' : 'Invitar'} icon="link-outline" size="sm" onPress={share} />
            {isOwner && <Button label="Cambiar código" kind="ghost" size="sm" onPress={regen} />}
          </View>
        </View>
      ) : (
        <Text style={{ color: C.muted, fontSize: 13, marginBottom: 6 }}>Sala del proyecto: entra cualquiera del equipo.</Text>
      )}
      <View style={{ borderTopWidth: 1, borderTopColor: C.line }}>
        <Toggle label="Mostrar en qué tarea estoy" hint="Si está apagado, solo ven si estás enfocado o en descanso." value={live.shareTask} onChange={setShareTask} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <Button label="Desconectarme" kind="secondary" size="sm" onPress={async () => { await exitRoom(); router.replace('/enfoque' as any); }} />
        <Button label="Salir de la sala" kind="ghost" size="sm" onPress={leave} />
      </View>
    </Card>
  );

  return (
    <Screen title={room.name} subtitle={room.project_id ? 'Sala del proyecto' : 'Sala de estudio'} back="/enfoque" maxWidth={1100}>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ flex: isWide ? 3 : undefined, width: isWide ? undefined : '100%', gap: 16, minWidth: 0 }}>
          {together}
          {patio.length > 0 || !myPet ? (
            <Card>
              {patio.length > 0 && (
                <PetPatio members={patio} height={isWide ? 168 : 132} onTapPet={(uid) => { void sendGreeting(uid); }}
                  celebrate={{ key: goal.done + 1, big: goal.done === goal.goal }} greetings={live.greetings} />
              )}
              <PatioHint hasPet={!!myPet} count={patio.length} />
            </Card>
          ) : null}
          {list}
        </View>
        <View style={{ flex: isWide ? 2 : undefined, width: isWide ? undefined : '100%', gap: 16, minWidth: 0 }}>
          {goalCard}
          {settings}
        </View>
      </View>
    </Screen>
  );
}
