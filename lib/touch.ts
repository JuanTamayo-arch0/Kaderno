import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// ============================================================
//  v29, fase 1: base táctil para el celular (solo web).
//
//  - Área de toque de 44 px como mínimo en pantallas táctiles (Apple pide
//    44 pt; WCAG 2.2 exige 24 px). Se agranda el área con un ::after
//    invisible, sin cambiar el dibujo del botón.
//  - Sin zoom automático al escribir en el iPhone: Safari acerca la pantalla
//    si el campo tiene letra de menos de 16 px. `maximum-scale=1` lo evita y
//    en iOS no bloquea el zoom con dos dedos (iOS ignora ese límite). En
//    Android sí lo bloquearía, por eso va solo en iPhone y iPad.
//  - Toque sin la espera del doble toque, sin el recuadro gris de Android y
//    con estado presionado.
//  - Hojas y diálogos: al llegar al final no arrastran lo de atrás.
//  - Teclado: `useKeyboardOpen()` dice si está abierto, para esconder la
//    barra de pestañas mientras se escribe.
// ============================================================

import { TOUCH_CSS, isIOS, viewportContent, isTypingTarget, keyboardLikelyOpen } from './touchCore';
export * from './touchCore';

let installed = false;
/** Se llama una vez al arrancar la app. */
export function installTouch(): void {
  if (installed || Platform.OS !== 'web' || typeof document === 'undefined') return;
  installed = true;
  try {
    const tag = document.createElement('style');
    tag.id = 'kd-touch';
    tag.textContent = TOUCH_CSS;
    document.head.appendChild(tag);
    const ios = isIOS(navigator.userAgent, navigator.maxTouchPoints || 0);
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'viewport'); document.head.appendChild(meta); }
    meta.setAttribute('content', viewportContent(ios));
    // Safari solo pinta :active si hay un oyente de toque en la página.
    document.addEventListener('touchstart', () => {}, { passive: true });
  } catch { /* noop */ }
}

const coarse = () => { try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; } };

/** Abierto mientras se escribe en un celular (para esconder la barra de abajo). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !coarse()) return;
    const vv = window.visualViewport;
    let maxH = 0, lastW = window.innerWidth;
    const h = () => (vv ? vv.height : window.innerHeight);
    const check = () => {
      // Al girar el teléfono cambia el ancho: se vuelve a medir el alto completo.
      if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; maxH = 0; }
      const typing = isTypingTarget(document.activeElement as any);
      // El alto completo se aprende cuando no se escribe (sin teclado).
      if (!typing) maxH = Math.max(maxH, h());
      setOpen(keyboardLikelyOpen(typing, h(), maxH || h()));
    };
    maxH = h();
    const later = () => setTimeout(check, 120);
    document.addEventListener('focusin', later);
    document.addEventListener('focusout', later);
    vv?.addEventListener('resize', check);
    window.addEventListener('resize', check);
    return () => {
      document.removeEventListener('focusin', later);
      document.removeEventListener('focusout', later);
      vv?.removeEventListener('resize', check);
      window.removeEventListener('resize', check);
    };
  }, []);
  return open;
}

/** Vibración corta (Android; el iPhone no la permite en la web). */
export function tapHaptic(ms = 12): void {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    (navigator as any).vibrate?.(ms);
  } catch { /* noop */ }
}
