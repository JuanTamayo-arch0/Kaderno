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
