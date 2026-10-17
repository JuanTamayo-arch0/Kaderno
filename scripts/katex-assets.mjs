// Copia la hoja de estilos y las fuentes woff2 de KaTeX a public/katex/.
// Se corre a mano al actualizar katex: node scripts/katex-assets.mjs
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('katex/dist/katex.min.css'));
const out = 'public/katex';
mkdirSync(join(out, 'fonts'), { recursive: true });
// Solo woff2: todos los navegadores actuales lo usan; se quitan woff y ttf.
const css = readFileSync(join(dist, 'katex.min.css'), 'utf8')
  .replace(/,url\(fonts\/[^)]+\.woff\) format\("woff"\)/g, '')
  .replace(/,url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, '');
writeFileSync(join(out, 'katex.min.css'), css);
for (const f of readdirSync(join(dist, 'fonts')).filter((x) => x.endsWith('.woff2'))) copyFileSync(join(dist, 'fonts', f), join(out, 'fonts', f));
console.log('KaTeX', require('katex/package.json').version, '-> public/katex');
