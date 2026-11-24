// ============================================================
//  v29, fase 1: lo puro de la base táctil (sin react-native, para probarlo).
//  El uso está en lib/touch.ts.
// ============================================================

/** Lo que se puede tocar. react-native-web dibuja un Pressable como <button>
 *  (o con rol), y uno sin rol como un div con tabindex 0. */
const HOSTS = ['button', '[role=button]', '[role=tab]', '[role=checkbox]', '[role=radio]', '[role=switch]', '[role=menuitem]', '[role=link]', '[tabindex="0"]'];
export const TAP_SELECTOR = HOSTS.join(',');

/** Mínimo de área de toque en px. */
export const MIN_TAP = 44;

// Solo los elementos de react-native-web (sus clases empiezan por "css-"):
// ya tienen position: relative, así el área de más queda centrada en el
// botón. Un enlace dentro del texto de una nota no se toca. Con z-index -1
// el área queda debajo de los hijos: una tarjeta que se toca no tapa sus botones.
const RNW = '[class^="css-"]';
const hit = HOSTS.map((h) => `${h}${RNW}:not([data-anim=pop])::after`).join(',\n  ');
const pressed = HOSTS.filter((h) => h !== '[role=link]')
  .map((h) => `${h}${RNW}:active:not([aria-disabled=true]):not(:has(${HOSTS.map((x) => x + ':active').join(',')}))`).join(',\n  ');
const half = `min(0px, calc((100% - ${MIN_TAP}px) / 2))`;

export const TOUCH_CSS = `
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
${TAP_SELECTOR} { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
[aria-modal=true] *, [role=dialog] * { overscroll-behavior: contain; }
@media (pointer: coarse) {
  ${hit} {
    content: ''; position: absolute; z-index: -1; top: ${half}; bottom: ${half}; left: ${half}; right: ${half};
  }
  input, textarea, select { touch-action: manipulation; }
}
@media (hover: none) {
  ${pressed} {
    opacity: .72; transition: opacity 0s;
  }
}
`;

/** ¿iPhone o iPad? (el iPad nuevo dice ser Mac, pero tiene toque). */
export function isIOS(ua: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

/** El contenido de la etiqueta viewport para este equipo. */
export function viewportContent(ios: boolean): string {
  const base = 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';
  return ios ? base + ', maximum-scale=1' : base;
}

// ---------- Teclado ----------

/** ¿Es un campo donde se escribe con el teclado en pantalla? */
export function isTypingTarget(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  const t = (el.type || 'text').toLowerCase();
  return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color', 'date', 'time', 'datetime-local', 'month', 'week', 'image', 'hidden'].includes(t);
}

/** El teclado se considera abierto si se está escribiendo y la parte visible bajó de alto. */
export function keyboardLikelyOpen(typing: boolean, visibleH: number, maxH: number): boolean {
  return typing && maxH > 0 && visibleH < maxH * 0.8;
}

