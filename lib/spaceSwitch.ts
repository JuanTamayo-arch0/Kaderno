import { Platform } from 'react-native';
import { C } from './theme';
import { getSpace, saveSpace, type Space } from './mode';

// ============================================================
//  Cambiar de espacio (v26, fase 2) con una transición suave: un velo del
//  color de fondo actual tapa el repintado y se desvanece sobre el espacio
//  nuevo (unos 400 ms). Con "reducir movimiento" el cambio es inmediato.
// ============================================================

export function switchSpace(to: Space): void {
  if (to === getSpace()) return;
  const reduce = Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (Platform.OS !== 'web' || typeof document === 'undefined' || reduce) { saveSpace(to); return; }
  const veil = document.createElement('div');
  veil.setAttribute('aria-hidden', 'true');
  Object.assign(veil.style, {
    position: 'fixed', inset: '0', zIndex: '9999', pointerEvents: 'none',
    background: String(C.bg), opacity: '1', transition: 'opacity 380ms cubic-bezier(.2,.8,.2,1)',
  } as CSSStyleDeclaration);
  document.body.appendChild(veil);
  saveSpace(to);
  // Dos cuadros: el primero pinta el espacio nuevo debajo del velo; el segundo lo descubre.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    veil.style.opacity = '0';
    setTimeout(() => veil.remove(), 420);
  }));
}
