import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { C } from '../../lib/theme';
import { petSheet, type Frame, type Mood, type Outfit, type Species } from '../../lib/pets/art';
import { ROOM_H, ROOM_W, roomSvg, type Home } from '../../lib/pets/home';
import { PatioSim, frameFor, moodFor, hopHeight, ballPos, type PatioMember } from '../../lib/pets/patio';
import { prefersReducedMotion } from '../../lib/motion';
import { PetImage } from '../pets/PetArt';

// ============================================================
//  El patio de la sala: un cuarto de estudio en pixel art donde están
//  las mascotas de cada quien. Se mueven según el estado de su dueño
//  (lib/pets/patio.ts). Tocar la mascota de alguien la saluda.
//
//  En la web se anima con requestAnimationFrame escribiendo directo en el
//  estilo de cada mascota (sin repintar React 60 veces por segundo).
// ============================================================

const FRAMES: Frame[] = ['quieto', 'respira', 'parpadeo', 'paso1', 'paso2', 'paso3', 'paso4', 'salto', 'sueno1', 'sueno2'];
const sheetCache = new Map<string, string>();
function sheetUrl(species: Species, mood: Mood, outfit: Outfit | null): string {
  const k = `${species}|${mood}|${JSON.stringify(outfit ?? {})}`;
  let u = sheetCache.get(k);
  if (!u) { u = `url("data:image/svg+xml,${encodeURIComponent(petSheet(species, FRAMES, { mood, outfit: outfit ?? {} }))}")`; sheetCache.set(k, u); }
  return u;
}

// El cuarto de la sala: estante, planta y lámpara, piso alfombrado.
const STUDY_ROOM: Home = { piso: 'piso_alfombrado', estante: true, planta: true, lampara: true };

type Props = {
  members: PatioMember[];
  height: number;
  compact?: boolean;
  onTapPet?: (uid: string) => void;
  /** Cambia la clave para que todas celebren. `big` = meta cumplida. */
  celebrate?: { key: number; big: boolean } | null;
  /** Saludos para animar: from → to. */
  greetings?: { id: string; from: string; fromName: string; to: string; at: number }[];
};

export function PetPatio({ members, height, compact, onTapPet, celebrate, greetings }: Props) {
  const [w, setW] = useState(0);
  const [hour, setHour] = useState(new Date().getHours());
  useEffect(() => { const id = setInterval(() => setHour(new Date().getHours()), 5 * 60_000); return () => clearInterval(id); }, []);
  const scale = height / ROOM_H;
  const cols = w ? Math.max(ROOM_W, Math.min(400, Math.ceil(w / scale))) : ROOM_W;
  const roomXml = useMemo(() => roomSvg(STUDY_ROOM, { hour, slice: true, cols }), [hour, cols]);
  const petSize = Math.round(24 * scale);
  const web = Platform.OS === 'web' && !prefersReducedMotion();

  const sim = useRef<PatioSim | null>(null);
  if (!sim.current) sim.current = new PatioSim(cols);
  sim.current.width = cols;
  const nodes = useRef(new Map<string, { box: HTMLElement | null; sprite: HTMLElement | null; bubble: HTMLElement | null; badge: HTMLElement | null }>());
  const ballEl = useRef<HTMLElement | null>(null);
  const membersRef = useRef(members);
  membersRef.current = members;

  // Celebración (cada pomodoro del grupo, y más larga al cumplir la meta).
  const lastCelebrate = useRef(0);
  useEffect(() => {
    if (!celebrate || celebrate.key === lastCelebrate.current) return;
    const first = lastCelebrate.current === 0;
    lastCelebrate.current = celebrate.key;
    if (first) return; // al abrir la sala no se celebra lo de antes
    const now = Date.now();
    sim.current!.celebrate(now, celebrate.big ? 5000 : 2200);
    if (celebrate.big) membersRef.current.forEach((m) => sim.current!.sayFor(m.uid, '¡Meta!', now, 4000));
  }, [celebrate?.key]);

  // Saludos.
  const seenGreet = useRef(new Set<string>());
  useEffect(() => {
    (greetings ?? []).forEach((g) => {
      if (seenGreet.current.has(g.id)) return;
      seenGreet.current.add(g.id);
      if (Date.now() - g.at > 15_000) return; // los viejos no se animan
      const to = membersRef.current.find((m) => m.uid === g.to);
      sim.current!.greet(g.from, g.to, g.fromName.split(' ')[0], (to?.name ?? '').split(' ')[0], membersRef.current, Date.now());
    });
  }, [greetings]);

  // Animación (web).
  useEffect(() => {
    if (!web || !w) return;
    let raf = 0, last = performance.now();
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (typeof document !== 'undefined' && document.hidden) { last = t; return; }
      const dt = (t - last) / 1000; last = t;
      const now = Date.now();
      const s = sim.current!;
      const ms = membersRef.current;
      s.step(ms, dt, now);
      const ox = (w - cols * scale) / 2;
      ms.forEach((m) => {
        const a = s.actors.get(m.uid); const n = nodes.current.get(m.uid);
        if (!a || !n?.box || !n.sprite) return;
        const px = ox + a.x * scale - petSize / 2;
        const py = a.lane * scale - petSize - hopHeight(a) * scale;
        n.box.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
        n.box.style.zIndex = String(Math.round(a.lane));
        const fr = frameFor(a, m.state, now);
        const mood = moodFor(m.state, a, now);
        const url = sheetUrl(m.species, mood, m.outfit);
        if (n.sprite.dataset.url !== url) { n.sprite.dataset.url = url; n.sprite.style.backgroundImage = url; }
        n.sprite.style.backgroundPosition = `${-FRAMES.indexOf(fr) * petSize}px 0`;
        n.sprite.style.transform = `scaleX(${a.dir})`;
        n.sprite.style.opacity = m.state === 'away' ? '0.7' : '1';
        if (n.bubble) {
          const txt = a.say ?? '';
          if (n.bubble.textContent !== txt) n.bubble.textContent = txt;
          n.bubble.style.display = txt ? 'block' : 'none';
        }
        if (n.badge) {
          const txt = m.state === 'work' && m.left ? `${m.left} min` : '';
          if (n.badge.textContent !== txt) n.badge.textContent = txt;
          n.badge.style.display = txt && !a.say ? 'block' : 'none';
        }
      });
      const b = s.ball, el = ballEl.current;
      if (el) {
        if (!b) el.style.display = 'none';
        else {
          const p = ballPos(b);
          const size = Math.max(8, Math.round(4.2 * scale));
          el.style.display = 'block';
          el.style.transform = `translate(${(ox + p.x * scale - size / 2).toFixed(1)}px, ${((56 - p.h) * scale - size).toFixed(1)}px)`;
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [web, w, cols, scale, petSize]);

  const tap = (m: PatioMember) => {
    if (m.me) {
      const lines = ['¡A estudiar!', '¡Vamos!', 'Aquí estoy', '¡Hola!'];
      sim.current!.hop(m.uid); sim.current!.sayFor(m.uid, lines[Math.floor(Math.random() * lines.length)], Date.now(), 2000);
    } else {
      sim.current!.hop(m.uid);
      onTapPet?.(m.uid);
    }
  };

  const setNode = (uid: string, key: 'box' | 'sprite' | 'bubble' | 'badge') => (el: any) => {
    const cur = nodes.current.get(uid) ?? { box: null, sprite: null, bubble: null, badge: null };
    cur[key] = el as HTMLElement | null;
    nodes.current.set(uid, cur);
    if (key === 'sprite' && el?.style) {
      Object.assign(el.style, { backgroundSize: `${FRAMES.length * petSize}px ${petSize}px`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', transformOrigin: '50% 50%' });
    }
  };

  // Sin animación (celular nativo o "reducir movimiento"): fila quieta.
  if (!web) {
    return (
      <View style={{ height, borderRadius: 14, overflow: 'hidden', backgroundColor: '#2b2433', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, paddingBottom: 6 }}
        accessibilityRole="image" accessibilityLabel={`Mascotas de la sala: ${members.map((m) => m.name).join(', ')}`}>
        {members.map((m) => (
          <Pressable key={m.uid} onPress={() => onTapPet?.(m.uid)} accessibilityRole="button" accessibilityLabel={m.me ? 'Tu mascota' : `Saludar a ${m.name}`} style={{ alignItems: 'center' }}>
            <PetImage species={m.species} outfit={m.outfit} mood={moodFor(m.state)} frame={m.state === 'away' ? 'sueno1' : 'quieto'} size={petSize} />
            {!compact && <Text style={{ color: '#e8eaf0', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{m.name.split(' ')[0]}</Text>}
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}
      style={{ height, borderRadius: 14, overflow: 'hidden', backgroundColor: '#2b2433' }}
      accessibilityLabel={`Patio de la sala con ${members.length} ${members.length === 1 ? 'mascota' : 'mascotas'}`}>
      {w > 0 && <SvgXml xml={roomXml} width={w} height={height} />}
      {w > 0 && members.map((m) => (
        <Pressable key={m.uid} ref={setNode(m.uid, 'box')} onPress={() => tap(m)}
          accessibilityRole="button" accessibilityLabel={m.me ? 'Tu mascota' : `Saludar a la mascota de ${m.name}`}
          style={{ position: 'absolute', left: 0, top: 0, width: petSize, height: petSize, alignItems: 'center', cursor: 'pointer' } as any}>
          <View ref={setNode(m.uid, 'sprite')} style={{ width: petSize, height: petSize }} />
          <Text ref={setNode(m.uid, 'bubble')}
            style={{ display: 'none', position: 'absolute', bottom: petSize + 2, backgroundColor: '#fffaf0', color: '#1f2433', fontSize: compact ? 10 : 11.5, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, whiteSpace: 'nowrap' } as any} />
          <Text ref={setNode(m.uid, 'badge')}
            style={{ display: 'none', position: 'absolute', bottom: petSize - 2, backgroundColor: 'rgba(26,32,54,0.92)', color: '#a9bbff', fontSize: 10, fontWeight: '800', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, whiteSpace: 'nowrap' } as any} />
          {!compact && (
            <Text numberOfLines={1} style={{ position: 'absolute', top: petSize - 2, color: '#fff', fontSize: 10.5, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 3, whiteSpace: 'nowrap' } as any}>
              {m.me ? 'Tú' : m.name.split(' ')[0]}
            </Text>
          )}
        </Pressable>
      ))}
      {w > 0 && (
        <View ref={ballEl as any} style={{ display: 'none', position: 'absolute', left: 0, top: 0, width: Math.max(8, Math.round(4.2 * scale)), height: Math.max(8, Math.round(4.2 * scale)), borderRadius: 99, backgroundColor: '#f5b64c', borderWidth: 1, borderColor: '#1f2433', zIndex: 99 } as any} />
      )}
    </View>
  );
}

/** Junta lo que se sabe de cada persona para el patio. */
export function patioMembers(
  rows: { user_id: string; name: string; me: boolean; state: 'work' | 'break' | 'online' | 'away'; live?: { pet: string | null; outfit: Outfit | null; endsAt: number | null; remainingMs: number | null } }[],
  seen: Record<string, { species: Species; outfit: Outfit | null }>,
  mine: { species: Species; outfit: Outfit } | null,
  now: number,
): PatioMember[] {
  const out: PatioMember[] = [];
  rows.forEach((r) => {
    const species = (r.me && mine ? mine.species : (r.live?.pet as Species | null)) ?? seen[r.user_id]?.species ?? null;
    if (!species) return;
    const outfit = (r.me && mine ? mine.outfit : r.live?.outfit) ?? seen[r.user_id]?.outfit ?? {};
    const ms = r.live?.endsAt ? r.live.endsAt - now : r.live?.remainingMs ?? null;
    out.push({ uid: r.user_id, name: r.name, species, outfit, state: r.state, left: ms && ms > 0 ? Math.ceil(ms / 60000) : null, me: r.me });
  });
  // Orden estable (por id) para que cada quien conserve su puesto.
  return out.sort((a, b) => a.uid.localeCompare(b.uid));
}

export function PatioHint({ hasPet, count, enabled = true }: { hasPet: boolean; count: number; enabled?: boolean }) {
  const text = !enabled ? 'Las mascotas están apagadas (Ajustes → Mascota).'
    : !hasPet ? 'Adopta una mascota (en Mascota) para que ande por la sala con las de tus compañeros.'
    : count > 1 ? 'Las mascotas de la sala andan por la pantalla. Toca la de alguien para saludar; en el descanso juegan juntas.'
    : 'Cuando entren tus compañeros, sus mascotas aparecen por la pantalla.';
  return <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 17 }}>{text}</Text>;
}
