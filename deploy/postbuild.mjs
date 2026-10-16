#!/usr/bin/env node
// =====================================================================
//  Kaderno · ajustes al build web después de `expo export`.
//
//    node deploy/postbuild.mjs dist
//
//  1. precache.json: lista de los archivos JS del build y de la fuente de
//     íconos. El service worker los descarga en segundo plano la primera vez,
//     así las pantallas siguientes abren sin esperar a la red.
//  2. sw.js: le pone al caché un nombre con la huella del build, para que
//     cada versión nueva limpie lo viejo (antes crecía sin límite).
//  3. index.html: precarga la fuente de íconos (sin esto los íconos aparecen
//     un instante después que el texto).
// =====================================================================
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = process.argv[2] || 'dist';
if (!existsSync(join(dist, 'index.html'))) { console.error(`No encuentro ${dist}/index.html`); process.exit(1); }

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const url = (p) => '/' + relative(dist, p).split(sep).join('/');

const files = walk(dist);
const js = files.filter((p) => url(p).startsWith('/_expo/static/js/') && p.endsWith('.js')).map(url).sort();
const icons = files.filter((p) => /Ionicons\.[a-f0-9]+\.ttf$/.test(p)).map(url);
const list = [...js, ...icons];

const hash = createHash('sha256').update(list.join('\n')).digest('hex').slice(0, 10);
writeFileSync(join(dist, 'precache.json'), JSON.stringify({ version: hash, files: list }));

const swPath = join(dist, 'sw.js');
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = 'kaderno-${hash}';`);
  writeFileSync(swPath, sw);
}

const htmlPath = join(dist, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
if (icons[0] && !html.includes('rel="preload" href="' + icons[0])) {
  html = html.replace('</head>', `<link rel="preload" href="${icons[0]}" as="font" type="font/ttf" crossorigin></head>`);
  writeFileSync(htmlPath, html);
}

const kb = (n) => `${Math.round(n / 1024)} KB`;
const size = (u) => statSync(join(dist, u.slice(1))).size;
console.log(`postbuild: ${js.length} archivos JS (${kb(js.reduce((a, u) => a + size(u), 0))}), caché kaderno-${hash}`);
