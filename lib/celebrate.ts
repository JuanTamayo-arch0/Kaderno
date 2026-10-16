import { Platform } from 'react-native';
import { play } from './sound';
import { prefersReducedMotion } from './motion';

// ============================================================
//  Celebración corta: confeti que sale desde un punto y cae.
//  Se usa al terminar todo lo del día. Son 36 piezas de DOM animadas con
//  Web Animations (en la GPU) que se borran solas en ~1,2 s. Con "reducir
//  movimiento" solo suena.
// ============================================================

const COLORS = ['#6c8cff', '#37c98b', '#f5b64c', '#ff8fab', '#8b6cff', '#22c1c3'];

export function celebrate(origin?: { x: number; y: number }): void {
  play('celebrate');
  if (Platform.OS !== 'web' || typeof document === 'undefined' || prefersReducedMotion()) return;
  try {
    const x0 = origin?.x ?? window.innerWidth / 2;
    const y0 = origin?.y ?? window.innerHeight * 0.35;
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '3000', overflow: 'hidden' });
    document.body.appendChild(layer);
    const n = 36;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      const w = 6 + Math.random() * 5, h = w * (0.4 + Math.random() * 0.8);
      Object.assign(p.style, {
        position: 'absolute', left: `${x0}px`, top: `${y0}px`, width: `${w}px`, height: `${h}px`,
        background: COLORS[i % COLORS.length], borderRadius: Math.random() < 0.3 ? '50%' : '2px', willChange: 'transform, opacity',
      });
      layer.appendChild(p);
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const dist = 90 + Math.random() * 140;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 60;
      const rot = (Math.random() - 0.5) * 720;
      p.animate([
        { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 220}px)) rotate(${rot}deg)`, opacity: 0 },
      ], { duration: 1000 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
    }
    setTimeout(() => layer.remove(), 1600);
  } catch { /* sin animaciones: solo el sonido */ }
}
