import React, { useId } from 'react';
import type { RingProps } from './Ring';

// Anillo de progreso en web: <svg> nativo del navegador (sin react-native-svg).
// El arco avanza con una transición suave en vez de saltar cada segundo.
export function ProgressRing({ size, stroke, frac, color, color2, track, inset = 0 }: RingProps) {
  const id = 'ring' + useId().replace(/:/g, '');
  const r = (size - stroke) / 2 - inset;
  const circ = 2 * Math.PI * r;
  const c = size / 2;
  const h = React.createElement;
  return h('svg', {
    width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': true,
    style: { position: 'absolute', left: 0, top: 0, transform: 'rotate(-90deg)' },
  },
    color2 ? h('defs', null, h('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '1' },
      h('stop', { offset: '0', stopColor: color }), h('stop', { offset: '1', stopColor: color2 }))) : null,
    h('circle', { cx: c, cy: c, r, stroke: track, strokeWidth: stroke, fill: 'none' }),
    h('circle', {
      cx: c, cy: c, r, stroke: color2 ? `url(#${id})` : color, strokeWidth: stroke, fill: 'none', strokeLinecap: 'round',
      strokeDasharray: circ, strokeDashoffset: circ * (1 - Math.max(0, Math.min(1, frac))),
      style: { transition: 'stroke-dashoffset 1s linear, stroke .3s ease' },
    }),
  );
}
