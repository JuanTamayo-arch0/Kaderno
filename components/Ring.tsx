import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

// Anillo de progreso (nativo). En web se usa Ring.web.tsx, que dibuja un <svg>
// del navegador y así no carga react-native-svg (unos 100 KB menos al abrir).
export type RingProps = { size: number; stroke: number; frac: number; color: string; color2?: string; track: string; /** espacio entre el borde y el anillo */ inset?: number };

export function ProgressRing({ size, stroke, frac, color, color2, track, inset = 0 }: RingProps) {
  const r = (size - stroke) / 2 - inset;
  const circ = 2 * Math.PI * r;
  const c = size / 2;
  return (
    <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
      {color2 ? <Defs><LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={color} /><Stop offset="1" stopColor={color2} /></LinearGradient></Defs> : null}
      <Circle cx={c} cy={c} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <Circle cx={c} cy={c} r={r} stroke={color2 ? 'url(#ring)' : color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.max(0, Math.min(1, frac)))} />
    </Svg>
  );
}
