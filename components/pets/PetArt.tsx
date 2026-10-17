// Dibujos de la mascota para las pantallas (tienda, elegir, ajustes).
import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { ANIMS, coinSvg, petSheet, petSvg, type Frame, type Mood, type Outfit, type Species } from '../../lib/pets/art';
import { prefersReducedMotion } from '../../lib/motion';

/** Un cuadro quieto. `size` mejor múltiplo de 32. */
export function PetImage({ species, mood, outfit, frame, size = 96, label }: { species: Species; mood?: Mood; outfit?: Outfit; frame?: Frame; size?: number; label?: string }) {
  const xml = useMemo(() => petSvg(species, { mood, outfit, frame, size }), [species, mood, JSON.stringify(outfit), frame, size]);
  return (
    <View accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label} style={{ width: size, height: size }}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

const cssDone = new Set<string>();
/** Una animación por tamaño: mueve el fondo de 0 a -(cuadros x tamaño) px. */
function ensureCss(n: number, size: number): string {
  const name = `kd-pet-idle-${n}-${size}`;
  if (cssDone.has(name) || typeof document === 'undefined') return name;
  cssDone.add(name);
  const st = document.createElement('style');
  st.textContent = `@keyframes ${name} { from { background-position: 0 0; } to { background-position: -${n * size}px 0; } }`;
  document.head.appendChild(st);
  return name;
}

/** En web, la mascota respirando y parpadeando (tira de cuadros con CSS). */
export function PetSprite({ species, mood, outfit, size = 160, label }: { species: Species; mood?: Mood; outfit?: Outfit; size?: number; label?: string }) {
  const frames = ANIMS.quieto.frames;
  const web = Platform.OS === 'web' && !prefersReducedMotion();
  const ref = useRef<any>(null);
  const url = useMemo(() => web
    ? `url("data:image/svg+xml,${encodeURIComponent(petSheet(species, frames, { mood, outfit }))}")` : '',
  [web, species, mood, JSON.stringify(outfit)]);
  // Los estilos de animación se ponen directo en el elemento (react-native-web
  // no deja pasar todas las propiedades de CSS).
  useEffect(() => {
    const el = ref.current as HTMLElement | null;
    if (!web || !el || !el.style) return;
    const anim = ensureCss(frames.length, size);
    Object.assign(el.style, {
      backgroundImage: url, backgroundSize: `${frames.length * size}px ${size}px`, backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated', animation: `${anim} ${frames.length / ANIMS.quieto.fps}s steps(${frames.length}) infinite`,
    });
  }, [web, url, size]);
  if (!web) return <PetImage species={species} mood={mood} outfit={outfit} size={size} label={label} />;
  return <View ref={ref} accessible={!!label} accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }} />;
}

export function CoinIcon({ species, size = 18 }: { species: Species; size?: number }) {
  const xml = useMemo(() => coinSvg(species, size), [species, size]);
  return <SvgXml xml={xml} width={size} height={size} />;
}
