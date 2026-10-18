// ============================================================
//  Las mascotas de los compañeros de sala, sueltas por la pantalla (web).
//
//  No dibuja nada con React: maneja un FriendsController (lib/pets/friends.ts).
//  · En la pantalla de la sala: hasta 6, se pueden tocar para saludar, con
//    nombre, minutos y globos.
//  · En el resto de la app (si se activa en Ajustes → Mascota): hasta 3, sin
//    hablar y sin capturar clics. Si tú estás enfocado, se quedan quietas.
// ============================================================
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { C } from '../../lib/theme';
import { FriendsController, type FriendSpec } from '../../lib/pets/friends';
import { pickFriends } from '../../lib/pets/patio';
import { usePets } from '../../lib/pets/store';
import type { Species } from '../../lib/pets/art';
import { useLiveRoom, getLiveRoom, petsSeen, roomMembers, sendGreeting, onRoomFx } from '../../lib/rooms';
import { personState } from '../../lib/roomsLogic';
import { useFocusTimer, getFocus } from '../../lib/focusTimer';

const HIDDEN = ['/login', '/bienvenida', '/visor', '/mascota', '/oraculo'];

export function FriendPets() {
  const live = useLiveRoom();
  const pets = usePets();
  const pathname = usePathname();
  const f = useFocusTimer();
  const ctl = useRef<FriendsController | null>(null);
  const seen = useRef(new Set<string>());

  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  const roomId = live.room?.id ?? null;
  const inRoom = !!roomId && pathname === `/sala/${roomId}`;
  const hidden = HIDDEN.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const show = web && pets.prefs.enabled && !!roomId && !hidden && live.status === 'on' && (inRoom || pets.prefs.friendsEverywhere);

  // Crear o quitar el controlador.
  useEffect(() => {
    if (!show) { ctl.current?.destroy(); ctl.current = null; return; }
    if (!ctl.current) {
      ctl.current = new FriendsController((uid) => { void sendGreeting(uid); }, { paper: '#fffaf0', ink: '#1f2433', brand: C.brand });
      // Los saludos que ya pasaron no se repiten al aparecer.
      getLiveRoom().greetings.forEach((g) => seen.current.add(g.id));
    }
  }, [show]);
  useEffect(() => () => { ctl.current?.destroy(); ctl.current = null; }, []);

  // Quiénes y cómo (se refresca cada segundo para los minutos que quedan).
  useEffect(() => {
    if (!show) return;
    const sync = () => {
      const c = ctl.current; if (!c || !roomId) return;
      const lr = getLiveRoom();
      const me = lr.me ?? '';
      const now = Date.now();
      const known = petsSeen(roomId);
      const list: FriendSpec[] = [];
      Object.values(lr.online).forEach((o) => {
        if (o.uid === me || !o.pet) return;
        const st = personState(o, now);
        const ms = o.endsAt ? o.endsAt - now : o.remainingMs;
        list.push({ uid: o.uid, name: o.name, species: o.pet as Species, outfit: o.outfit ?? {}, state: st.state, left: ms && ms > 0 ? Math.ceil(ms / 60000) : null });
      });
      if (inRoom) {
        // Las de quien está fuera, dormidas (solo miembros de la sala).
        roomMembers().forEach((uid) => {
          if (uid === me || lr.online[uid] || !known[uid]) return;
          list.push({ uid, name: known[uid].name, species: known[uid].species, outfit: known[uid].outfit ?? {}, state: 'away', left: null });
        });
      }
      const fs = getFocus();
      const meWorking = fs.running && fs.mode === 'work';
      c.set(pickFriends(list, inRoom ? 6 : 3, inRoom), {
        interactive: inRoom,
        quiet: !inRoom && meWorking,
        meOnBreak: fs.running && fs.mode === 'break',
      });
    };
    sync();
    const t = setInterval(sync, 1000);
    return () => clearInterval(t);
  }, [show, inRoom, roomId, live.online, f.state.mode, f.state.running]);

  // Saludos y celebraciones.
  useEffect(() => {
    const c = ctl.current; if (!show || !c) return;
    const me = live.me ?? '';
    live.greetings.forEach((g) => {
      if (seen.current.has(g.id)) return;
      seen.current.add(g.id);
      if (Date.now() - g.at > 15_000) return;
      const toName = g.to === me ? '' : (live.online[g.to]?.name ?? '');
      c.greet(g.from, g.to, g.fromName, toName, me);
    });
  }, [show, live.greetings]);
  useEffect(() => onRoomFx((fx) => { if (fx.type === 'celebrar') ctl.current?.celebrate(fx.big); }), []);

  return null;
}
