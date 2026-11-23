import React, { useEffect, useRef } from 'react';
import { Platform, Pressable } from 'react-native';
import { LOGO, logoColors, pencilShapes, PENCIL, type LogoTone } from '../../lib/brand';
import { PENCIL_ANIM_TOTAL, pencilPoseAt } from '../../lib/pencilAnim';
import { prefersReducedMotion } from '../../lib/motion';
import { KadernoMark } from './KadernoLogo';

// ============================================================
//  El logo que se escribe (v28): el lápiz sale de la margen, escribe la K y
//  vuelve a su lugar. Solo en la web; en el teléfono nativo y con "reducir
//  movimiento" se ve el logo quieto. Se repite al tocarlo o al cambiar
//  `replay`. El lápiz puede salirse del cuadro mientras escribe.
// ============================================================

const h = React.createElement;

export function KadernoWrites({ size = 96, tone = 'papel', replay = 0, delay = 0.35 }: {
  size?: number; tone?: LogoTone; replay?: number; delay?: number;
}) {
  const pen = useRef<SVGGElement | null>(null);
  const shadow = useRef<SVGEllipseElement | null>(null);
  const ks = useRef<(SVGPathElement | null)[]>([]);
  const [tap, setTap] = React.useState(0);
  const still = Platform.OS !== 'web' || prefersReducedMotion();

  useEffect(() => {
    if (still) return;
    let raf = 0;
    const start = performance.now() + delay * 1000;
    const lens = LOGO.kStrokes.map((s) => Math.hypot(s[2] - s[0], s[3] - s[1]));
    const paint = (now: number) => {
      const t = Math.max(0, (now - start) / 1000);
      const p = pencilPoseAt(t);
      pen.current?.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${p.a.toFixed(2)})`);
      const sh = shadow.current;
      if (sh) {
        sh.setAttribute('cx', p.x.toFixed(2));
        sh.setAttribute('cy', (p.y + 0.5 + p.lift * 2.5).toFixed(2));
        sh.setAttribute('rx', p.lift < 0.15 ? '0' : (2.2 - p.lift * 0.8).toFixed(2));
      }
      ks.current.forEach((el, i) => {
        if (!el) return;
        el.style.strokeDashoffset = (lens[i] * (1 - p.k[i])).toFixed(2);
        el.style.opacity = p.k[i] > 0.001 ? '1' : '0';
      });
      if (t < PENCIL_ANIM_TOTAL) raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [replay, tap, still, delay]);

  if (still) return <KadernoMark size={size} tone={tone} />;
  const c = logoColors(tone);
  const pieces = pencilShapes(c).map((s, i) => s.t === 'rect'
    ? h('rect', { key: i, x: s.x, y: s.y, width: s.w, height: s.h, rx: s.rx, fill: s.fill, opacity: s.op })
    : h('path', { key: i, d: s.d, fill: s.fill ?? 'none', stroke: s.stroke, strokeWidth: s.sw, strokeLinejoin: 'round', opacity: s.op }));
  const svg = h('svg', { width: size, height: size, viewBox: `0 0 ${LOGO.size} ${LOGO.size}`, style: { overflow: 'visible', display: 'block' }, 'aria-hidden': true },
    c.tile ? h('rect', { width: LOGO.size, height: LOGO.size, rx: LOGO.radius, fill: c.tile }) : null,
    h('g', { fill: 'none', stroke: c.k, strokeWidth: LOGO.kWidth, strokeLinecap: 'round', strokeLinejoin: 'round' },
      LOGO.kStrokes.map((s, i) => {
        const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
        return h('path', { key: i, ref: (el: SVGPathElement | null) => { ks.current[i] = el; }, d: `M${s[0]} ${s[1]}L${s[2]} ${s[3]}`,
          style: { strokeDasharray: len, strokeDashoffset: len, opacity: 0 } });
      })),
    h('ellipse', { ref: shadow, cx: PENCIL.cx, cy: PENCIL.tip + 0.5, rx: 0, ry: 0.9, fill: '#000', opacity: 0.22 }),
    h('g', { ref: pen, transform: `translate(${PENCIL.cx} ${PENCIL.tip})` }, h('g', { transform: `translate(${-PENCIL.cx} ${-PENCIL.tip})` }, pieces)),
  );
  return (
    <Pressable onPress={() => setTap((n) => n + 1)} accessibilityRole="image" accessibilityLabel="Logo de Kaderno" accessibilityHint="Tócalo para ver el lápiz escribir otra vez">
      {svg}
    </Pressable>
  );
}
