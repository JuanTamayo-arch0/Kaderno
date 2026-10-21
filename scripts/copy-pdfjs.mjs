#!/usr/bin/env node
// Copia pdf.js (versión legacy, con compatibilidad para Safari viejo) a public/pdfjs.
// La app lo carga solo al abrir un PDF, fuera del paquete principal.
//   node scripts/copy-pdfjs.mjs
import { cpSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
const src = 'node_modules/pdfjs-dist';
const out = 'public/pdfjs';
mkdirSync(out, { recursive: true });
copyFileSync(`${src}/legacy/build/pdf.min.mjs`, `${out}/pdf.min.js`);
copyFileSync(`${src}/legacy/build/pdf.worker.min.mjs`, `${out}/pdf.worker.min.js`);
cpSync(`${src}/standard_fonts`, `${out}/standard_fonts`, { recursive: true });
const v = JSON.parse(readFileSync(`${src}/package.json`, 'utf8')).version;
console.log(`pdf.js ${v} copiado a ${out}`);
