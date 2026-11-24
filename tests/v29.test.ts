import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOUCH_CSS, MIN_TAP, isIOS, viewportContent, isTypingTarget, keyboardLikelyOpen } from '../lib/touchCore';

test('v29 táctil: área mínima de 44 px solo con dedo, sin cambiar el dibujo', () => {
  assert.equal(MIN_TAP, 44);
  const coarse = TOUCH_CSS.slice(TOUCH_CSS.indexOf('@media (pointer: coarse)'));
  assert.match(coarse, /button\[class\^="css-"\]:not\(\[data-anim=pop\]\)::after/);
  assert.match(coarse, /\[tabindex="0"\]\[class\^="css-"\]/, 'también los Pressable sin rol');
  assert.match(coarse, /min\(0px, calc\(\(100% - 44px\) \/ 2\)\)/, 'el área solo crece, nunca encoge');
  assert.match(TOUCH_CSS, /touch-action: manipulation/);
  assert.match(TOUCH_CSS, /-webkit-tap-highlight-color: transparent/);
  assert.match(TOUCH_CSS, /overscroll-behavior: contain/);
  assert.match(TOUCH_CSS, /100dvh/);
  assert.match(TOUCH_CSS, /:not\(:has\(/, 'solo se oscurece lo más interno que se toca');
});

test('v29 táctil: sin zoom al escribir solo en iPhone y iPad; Android conserva el zoom', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile';
  assert.equal(isIOS(iphone, 5), true);
  assert.equal(isIOS(ipad, 5), true, 'el iPad dice ser Mac pero tiene toque');
  assert.equal(isIOS(ipad, 0), false, 'un Mac de verdad');
  assert.equal(isIOS(android, 5), false);
  assert.match(viewportContent(true), /maximum-scale=1/);
  assert.doesNotMatch(viewportContent(false), /maximum-scale|user-scalable/);
  for (const ios of [true, false]) {
    assert.match(viewportContent(ios), /viewport-fit=cover/);
    assert.match(viewportContent(ios), /interactive-widget=resizes-content/);
  }
  const html = readFileSync('public/index.html', 'utf8');
  assert.match(html, /interactive-widget=resizes-content/);
  assert.doesNotMatch(html, /user-scalable=no/);
});

test('v29 táctil: el teclado se detecta al escribir y con la pantalla visible más baja', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'email' }), true);
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'date' }), false, 'la fecha abre un selector, no el teclado');
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV' }), false);
  assert.equal(isTypingTarget(null), false);
  assert.equal(keyboardLikelyOpen(true, 420, 844), true);
  assert.equal(keyboardLikelyOpen(true, 800, 844), false, 'solo cambió la barra del navegador');
  assert.equal(keyboardLikelyOpen(false, 420, 844), false, 'sin escribir no hay teclado');
});

test('v29 táctil: los campos base y del login usan 16 px', () => {
  assert.match(readFileSync('components/ds.tsx', 'utf8'), /paddingVertical: 11, fontSize: 16, minHeight: 44/);
  assert.match(readFileSync('app/login.tsx', 'utf8'), /paddingVertical: 13, fontSize: 16/);
  assert.match(readFileSync('components/SideNav.tsx', 'utf8'), /if \(typing\) return null;/);
});

test('v29 PWA: el manifiesto tiene id, categorías y capturas para instalar', () => {
  const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(m.id, '/');
  assert.ok(m.categories.includes('education'));
  const narrow = m.screenshots.filter((s: any) => s.form_factor === 'narrow');
  const wide = m.screenshots.filter((s: any) => s.form_factor === 'wide');
  assert.ok(narrow.length >= 1 && wide.length >= 1);
  for (const s of m.screenshots) {
    const [w, h] = s.sizes.split('x').map(Number);
    assert.ok(Math.max(w, h) / Math.min(w, h) <= 2.3, 'proporción válida para Chrome');
    assert.ok(readFileSync('public' + s.src).length > 1000, s.src);
  }
});

// ---------------- Fase 2: pantallas ----------------
import { headerStacks, statParts, tileWidth, focusRingSize, boardColumnWidth } from '../lib/mobileLayout';

test('v29 pantallas: las acciones del encabezado bajan solo si no caben', () => {
  const base = { titleSize: 28, back: false, subtitle: false };
  assert.equal(headerStacks({ ...base, rowW: 288, rightW: 132, title: 'Hoy' }), false, 'Hoy conserva sus íconos al lado a 320 px');
  assert.equal(headerStacks({ rowW: 288, rightW: 117, title: 'Tipos de tarea', titleSize: 22, back: true, subtitle: false }), true, 'Tipos de tarea a 320 px');
  assert.equal(headerStacks({ rowW: 358, rightW: 117, title: 'Tipos de tarea', titleSize: 22, back: true, subtitle: false }), false, 'a 390 px cabe');
  assert.equal(headerStacks({ rowW: 288, rightW: 150, title: 'Horas', titleSize: 22, back: true, subtitle: true }), true, 'el subtítulo quedaría en una columna diminuta');
  assert.equal(headerStacks({ rowW: 358, rightW: 150, title: 'Horas', titleSize: 22, back: true, subtitle: true }), false);
  assert.equal(headerStacks({ ...base, rowW: 0, rightW: 100, title: 'X' }), false, 'sin medir no se mueve nada');
});

test('v29 pantallas: cifras, resúmenes, reloj y tablero se acomodan al ancho', () => {
  assert.deepEqual(statParts('0 semanas'), ['0', 'semanas']);
  assert.deepEqual(statParts('4h 15m'), ['4h', '15m']);
  assert.deepEqual(statParts('12'), ['12', '']);
  assert.equal(tileWidth(390), 174, 'dos por fila a 390 px');
  assert.equal(tileWidth(320), 139);
  assert.equal(tileWidth(768), 176, 'cuatro por fila en tableta');
  assert.equal(focusRingSize(390, 844), 228);
  assert.equal(focusRingSize(320, 568), 170, 'en un SE el reloj se achica');
  assert.ok(focusRingSize(320, 400) >= 168, 'nunca menos de 168');
  assert.equal(boardColumnWidth(390), 320);
  assert.equal(boardColumnWidth(320), 262, 'se asoma la columna siguiente');
});

test('v29 pantallas: Horario llena el ancho y los botones pequeños crecieron', () => {
  const horario = readFileSync('app/(tabs)/horario.tsx', 'utf8');
  assert.match(horario, /alignItems: isWide \? 'flex-start' : 'stretch'/);
  const tipos = readFileSync('app/tipos.tsx', 'utf8');
  assert.match(tipos, /const ARROW = \{ width: 40, height: 30/);
  assert.match(tipos, /const ICON = \{ width: 40, height: 40/);
  const board = readFileSync('components/projects/ProjectBoard.tsx', 'utf8');
  assert.match(board, /scrollSnapType: 'x proximity'/);
  assert.match(board, /accessibilityLabel=\{`Mover "\$\{task.title\}" a otra columna`\}\s+style=\{\{ width: 34, height: 34/);
  assert.match(readFileSync('app/(tabs)/estudiar.tsx', 'utf8'), /flex: 1, minWidth: 0, color: C.text, fontSize: 15/);
  assert.match(readFileSync('components/pets/PetInvite.tsx', 'utf8'), /const narrow = useWindowDimensions\(\)\.width < 420/);
  assert.match(readFileSync('app/login.tsx', 'utf8'), /paddingTop: insets\.top \+ \(short \? 22 : 44\)/);
});

// ---------------- Fase 3: sensación de app ----------------
import { isDownDrag, shouldDismiss, inDragZone } from '../lib/mobileLayout';

test('v29 nativo: las hojas se cierran al arrastrar hacia abajo, no con un toque ni de lado', () => {
  assert.equal(isDownDrag(4, 0), false, 'un toque no arrastra');
  assert.equal(isDownDrag(20, 2), true);
  assert.equal(isDownDrag(20, 30), false, 'de lado es otro gesto');
  assert.equal(isDownDrag(-30, 0), false, 'hacia arriba no');
  assert.equal(shouldDismiss(120, 0), true);
  assert.equal(shouldDismiss(60, 1.4), true, 'un gesto rápido también cierra');
  assert.equal(shouldDismiss(60, 0.3), false, 'vuelve a su lugar');
  assert.equal(inDragZone(110, 100, 72), true, 'empezó en la rayita');
  assert.equal(inDragZone(300, 100, 72), false, 'empezó en el contenido: se desplaza, no cierra');
  assert.equal(inDragZone(110, null, 72), false, 'sin medir la hoja no se arrastra');
  for (const f of ['components/TaskModal.tsx', 'components/ActionMenu.tsx', 'components/GlobalPanels.tsx', 'components/cards/CardForms.tsx']) {
    assert.match(readFileSync(f, 'utf8'), /useSheetDrag\(visible, onClose(, \d+)?\)/, f);
    assert.match(readFileSync(f, 'utf8'), /<Animated.View ref=\{drag.ref\} onLayout=\{drag.onLayout\}/, f);
  }
});

test('v29 nativo: vibración corta al completar y al abrir el menú con toque largo', () => {
  const row = readFileSync('components/TaskRow.tsx', 'utf8');
  assert.match(row, /if \(!done\) tapHaptic\(\); onToggle\(task\);/);
  assert.match(row, /tapHaptic\(8\); setMenu\(true\);/);
  assert.match(row, /tapHaptic\(right \? 12 : 8\)/, 'también al deslizar');
  const touch = readFileSync('lib/touch.ts', 'utf8');
  assert.match(touch, /prefers-reduced-motion: reduce\)'\)\.matches\) return;/, 'respeta reducir movimiento');
});
