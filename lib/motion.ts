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

const CSS = `
@keyframes kd-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes kd-page { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes kd-sheet { from { opacity: 0; transform: translateY(18px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes kd-pop { 0% { transform: scale(.85); } 55% { transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes kd-grow { from { opacity: 0; transform: scaleY(.6); } to { opacity: 1; transform: none; } }
@keyframes kd-toast { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes kd-landed { 0% { transform: scale(.97); filter: brightness(1.25); } 100% { transform: none; filter: none; } }
@keyframes kd-shimmer { from { background-position: 150% 0; } to { background-position: -50% 0; } }
@keyframes kd-fade { from { opacity: 0; } to { opacity: 1; } }

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
[data-anim="sheet"] { animation: kd-sheet .24s ${EASE} both; }
[data-anim="pop"] { animation: kd-pop .34s ${EASE} both; }
[data-anim="grow"] { animation: kd-grow .16s ${EASE} both; transform-origin: top; }
[data-anim="toast"] { animation: kd-toast .24s ${EASE} both; }
[data-anim="fade"] { animation: kd-fade .2s ease both; }
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
  [data-anim], [data-landed] > *, [data-skeleton] { animation: none !important; }
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
