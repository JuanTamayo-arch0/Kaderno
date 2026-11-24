import { Platform } from 'react-native';

// ============================================================
//  Movimiento de la interfaz (web).
//
//  Las animaciones van en CSS, no en JavaScript: el navegador las hace en la
//  GPU y no compiten con React por el hilo principal. Los componentes solo se
//  marcan con `dataSet` (react-native-web lo vuelve data-*):
//
//    dataSet={{ anim: 'enter', i: '3' }}  entra subiendo y apareciendo; `i`
//                                         escalona la lista (0 a 8).
//    dataSet={{ anim: 'page' }}           entrada suave de una pantalla.
//    dataSet={{ anim: 'sheet' }}          ventana o menú que sube.
//    dataSet={{ anim: 'pop' }}            rebote corto (al marcar hecha).
//    dataSet={{ anim: 'grow' }}           hueco del tablero al arrastrar.
//    dataSet={{ anim: 'toast' }}          aviso que sube desde abajo.
//    dataSet={{ press: '1' }}             se hunde un poco al presionar.
//    dataSet={{ lift: '1' }}              se eleva al pasar el ratón.
//    dataSet={{ skeleton: '1' }}          brillo de carga.
//    data-landed="1"                      tarjeta que acaba de caer.
//
//  Reglas: duraciones cortas (120 a 260 ms), curvas que frenan al final y
//  nada que se mueva solo sin que la persona haya hecho algo. Con "reducir
//  movimiento" activado en el sistema, todo queda quieto.
// ============================================================

const EASE = 'cubic-bezier(.2,.8,.2,1)';

const CSS = `/* i18n-ok: CSS */
/* El anillo de foco solo con teclado: al hacer clic no aparece el recuadro. */
:focus:not(:focus-visible) { outline: none !important; }
@keyframes kd-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes kd-page { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes kd-sheet { from { opacity: 0; transform: translateY(18px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes kd-pop { 0% { transform: scale(.85); } 55% { transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes kd-grow { from { opacity: 0; transform: scaleY(.6); } to { opacity: 1; transform: none; } }
@keyframes kd-toast { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes kd-landed { 0% { transform: scale(.97); filter: brightness(1.25); } 100% { transform: none; filter: none; } }
@keyframes kd-shimmer { from { background-position: 150% 0; } to { background-position: -50% 0; } }
@keyframes kd-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes kd-leave {
  0% { opacity: 1; max-height: 260px; }
  45% { opacity: 1; transform: none; max-height: 260px; }
  100% { opacity: 0; transform: translateX(28px); max-height: 0; }
}
@keyframes kd-ring { from { box-shadow: 0 0 0 0 rgba(55,201,139,.6); } to { box-shadow: 0 0 0 11px rgba(55,201,139,0); } }

[data-anim="enter"] { animation: kd-enter .26s ${EASE} both; }
[data-anim="enter"][data-i="1"] { animation-delay: 25ms; }
[data-anim="enter"][data-i="2"] { animation-delay: 50ms; }
[data-anim="enter"][data-i="3"] { animation-delay: 75ms; }
[data-anim="enter"][data-i="4"] { animation-delay: 100ms; }
[data-anim="enter"][data-i="5"] { animation-delay: 120ms; }
[data-anim="enter"][data-i="6"] { animation-delay: 140ms; }
[data-anim="enter"][data-i="7"] { animation-delay: 155ms; }
[data-anim="enter"][data-i="8"] { animation-delay: 170ms; }
[data-anim="page"] { animation: kd-page .22s ${EASE} both; }
/* v28: entrada en cascada (login y registro) y la raya del margen que se dibuja. */
@keyframes kd-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes kd-line { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes kd-swap { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
[data-anim="rise"] { animation: kd-rise .6s ${EASE} both; }
[data-anim="rise"][data-i="1"] { animation-delay: 90ms; }
[data-anim="rise"][data-i="2"] { animation-delay: 180ms; }
[data-anim="rise"][data-i="3"] { animation-delay: 270ms; }
[data-anim="rise"][data-i="4"] { animation-delay: 360ms; }
[data-anim="rise"][data-i="5"] { animation-delay: 450ms; }
[data-anim="rise"][data-i="6"] { animation-delay: 540ms; }
[data-anim="rise"][data-i="7"] { animation-delay: 630ms; }
[data-anim="rise"][data-i="8"] { animation-delay: 720ms; }
[data-anim="line"] { animation: kd-line 1s cubic-bezier(.65,0,.35,1) both; transform-origin: top; }
[data-anim="swap"] { animation: kd-swap .32s ${EASE} both; }
[data-anim="sheet"] { animation: kd-sheet .24s ${EASE} both; }
[data-anim="pop"] { animation: kd-pop .34s ${EASE} both; }
[data-anim="grow"] { animation: kd-grow .16s ${EASE} both; transform-origin: top; }
[data-anim="toast"] { animation: kd-toast .24s ${EASE} both; }
[data-anim="fade"] { animation: kd-fade .2s ease both; }
[data-anim="leave"] { animation: kd-leave .42s cubic-bezier(.4,0,.2,1) both; overflow: hidden; pointer-events: none; }
[data-anim="pop"] { position: relative; }
[data-anim="pop"]::after { content: ''; position: absolute; inset: -2px; border-radius: inherit; animation: kd-ring .5s ease-out both; pointer-events: none; }
[data-landed="1"] > * { animation: kd-landed .45s ${EASE} both; }

[data-press] { transition: transform .12s ease, background-color .15s ease, border-color .15s ease, box-shadow .2s ease, opacity .15s ease; }
[data-press]:active { transform: scale(.985); }
@media (hover: hover) {
  [data-lift] { transition: transform .16s ${EASE}, box-shadow .2s ease, border-color .15s ease; }
  [data-lift]:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0,0,0,.22); }
}
[data-skeleton] {
  background-image: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.07) 50%, rgba(255,255,255,0) 100%) !important;
  background-size: 200% 100%; background-repeat: no-repeat;
  animation: kd-shimmer 1.3s linear infinite;
}
[data-ghost] > * { transform: scale(1.03); transition: transform .15s ${EASE}; }

@media (prefers-reduced-motion: reduce) {
  [data-anim], [data-anim]::after, [data-landed] > *, [data-skeleton] { animation: none !important; }
  [data-press], [data-lift], [data-ghost] > * { transition: none !important; transform: none !important; }
}
`;

let injected = false;
/** Se llama una vez al arrancar la app. En nativo no hace nada. */
export function installMotion(): void {
  if (injected || Platform.OS !== 'web' || typeof document === 'undefined') return;
  injected = true;
  const tag = document.createElement('style');
  tag.id = 'kd-motion';
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

/** ¿La persona pidió menos movimiento? (para animaciones hechas en JS). */
export function prefersReducedMotion(): boolean {
  try { return Platform.OS === 'web' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// ---------- v26, fase 4: paso entre pantallas y listas que se reacomodan ----------

/**
 * Cambia de pantalla. En v26 (fase 4) esto usaba las transiciones de vista
 * del navegador, pero congelaba la página: mientras arranca una transición el
 * navegador no pinta, y la función esperaba a que pintara, así que cada cambio
 * de pantalla quedaba quieto hasta 4 segundos (el límite del navegador). Ahora
 * navega directo; la pantalla nueva entra con su animación de CSS
 * (data-anim="page"), que no bloquea nada. Se deja la función para no tocar a
 * quienes la llaman.
 */
export function vtNavigate(go: () => void): void {
  go();
}

/** Antes daba un nombre de transición a un elemento; ya no hace nada (ver vtNavigate). */
export function vtRef(_name: string | null | undefined) {
  // Sin transiciones de vista no hace falta nombrar elementos.
  return undefined;
}

/**
 * Listas que se reacomodan suave (FLIP): cuando una fila cambia de lugar
 * (se completa otra, se filtra, se reordena), se desliza a su nuevo puesto
 * en vez de saltar. Los hijos se marcan con dataSet={{ flip: id }}.
 */
export type FlipPos = { left: number; top: number };
export function flipChildren(container: HTMLElement | null, prev: Map<string, FlipPos>): Map<string, FlipPos> {
  const next = new Map<string, FlipPos>();
  if (!container || typeof window === 'undefined') return next;
  const reduce = prefersReducedMotion();
  // Posiciones relativas a la lista: así desplazar la página no cuenta como movimiento.
  const box = container.getBoundingClientRect();
  container.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
    const key = el.dataset.flip as string;
    const b = el.getBoundingClientRect();
    const r = { left: b.left - box.left, top: b.top - box.top };
    next.set(key, r);
    const before = prev.get(key);
    if (!before || reduce || typeof el.animate !== 'function') return;
    const dx = before.left - r.left, dy = before.top - r.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    if (Math.abs(dy) > window.innerHeight) return; // muy lejos: no vale la pena animar
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
  return next;
}
