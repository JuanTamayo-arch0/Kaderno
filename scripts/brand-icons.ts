// ============================================================
//  Íconos de la app con el logo de la marca (v26, fase 1).
//
//    npx tsx scripts/brand-icons.ts
//
//  Dibuja cada ícono con el mismo SVG que usa la app (lib/brand.ts) y lo
//  rasteriza con el Chromium de Playwright. Escribe en public/: icon.svg,
//  favicon.ico (16, 32 y 48), favicon.png, apple-touch-icon.png, icon-192,
//  icon-512, icon-maskable-512, badge-72 (silueta blanca para los avisos) y
//  og.png (la imagen al compartir un enlace). Solo hay que correrlo de nuevo
//  si cambia el logo.
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore: Playwright viene instalado en la máquina que genera los íconos, no es dependencia de la app.
import { chromium } from 'playwright';
import { BRAND, logoSvg } from '../lib/brand';

const OUT = join(__dirname, '..', 'public');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  async function png(svg: string, w: number, h = w): Promise<Buffer> {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  }

  // Vector para navegadores que lo aceptan.
  writeFileSync(join(OUT, 'icon.svg'), logoSvg({ size: 512, tone: 'tinta' }));

  // Pestaña del navegador: cuadro de tinta con esquinas redondas.
  const fav = { 16: await png(logoSvg({ size: 16, tone: 'tinta' }), 16), 32: await png(logoSvg({ size: 32, tone: 'tinta' }), 32), 48: await png(logoSvg({ size: 48, tone: 'tinta' }), 48) };
  writeFileSync(join(OUT, 'favicon.png'), fav[32]);
  writeFileSync(join(OUT, 'favicon.ico'), ico([[16, fav[16]], [32, fav[32]], [48, fav[48]]]));

  // App instalada: Android recorta solo (maskable) e iOS pone sus esquinas.
  writeFileSync(join(OUT, 'icon-192.png'), await png(logoSvg({ size: 192, tone: 'tinta' }), 192));
  writeFileSync(join(OUT, 'icon-512.png'), await png(logoSvg({ size: 512, tone: 'tinta' }), 512));
  writeFileSync(join(OUT, 'icon-maskable-512.png'), await png(logoSvg({ size: 512, tone: 'tinta', bleed: 0.72 }), 512));
  writeFileSync(join(OUT, 'apple-touch-icon.png'), await png(logoSvg({ size: 180, tone: 'tinta', bleed: 0.8 }), 180));

  // Insignia de los avisos en Android: solo la silueta, en blanco.
  writeFileSync(join(OUT, 'badge-72.png'), await png(logoSvg({ size: 72, tone: 'silueta' }), 72));

  // Imagen al compartir un enlace (1200 x 630): hoja de tinta con el margen.
  const og = `<div style="width:1200px;height:630px;box-sizing:border-box;background:${BRAND.ink};background-image:linear-gradient(90deg,transparent 96px,${BRAND.margin} 96px,${BRAND.margin} 104px,transparent 104px),repeating-linear-gradient(180deg,transparent 0 63px,rgba(255,255,255,.07) 63px 64px);display:flex;align-items:center;gap:44px;padding:0 150px;font-family:'Plus Jakarta Sans',sans-serif">
    <style>@font-face{font-family:'Plus Jakarta Sans';src:url('data:font/woff2;base64,${readFileSync(join(OUT, 'fonts', 'plus-jakarta-sans.woff2')).toString('base64')}') format('woff2');font-weight:200 800}</style>
    <div style="flex-shrink:0;display:flex">${logoSvg({ size: 180, tone: 'papel' })}</div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="color:#fff;font-size:120px;font-weight:800;letter-spacing:-0.035em;line-height:1">kaderno</div>
      <div style="color:#C9C8DA;font-size:32px;font-weight:500;white-space:nowrap">Tus tareas, apuntes, horario y estudio.</div>
    </div>
  </div>`;
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<html><body style="margin:0">${og}</body></html>`);
  await page.evaluate(() => (document as any).fonts.ready);
  writeFileSync(join(OUT, 'og.png'), await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }));

  await browser.close();
  console.log('Íconos escritos en public/');
}

/** Un .ico con PNG adentro (lo aceptan todos los navegadores actuales). */
function ico(images: [number, Buffer][]): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(([size, data], i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, o); head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt8(0, o + 2); head.writeUInt8(0, o + 3);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map(([, d]) => d)]);
}

main().catch((e) => { console.error(e); process.exit(1); });
