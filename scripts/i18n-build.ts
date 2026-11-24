// ============================================================
//  v30: arma lib/i18n/en.ts a partir de lib/i18n/src/*.tsv.
//
//    npx tsx scripts/i18n-build.ts
//
//  Cada línea del .tsv es: "texto en español"<TAB>"texto en inglés"
//  (las dos en formato JSON, así las comillas y los \n no dan problemas).
//  Un mismo texto con dos sentidos se escribe "contexto|texto".
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'lib', 'i18n', 'src');

export function readTsv(file: string): [string, string][] {
  const out: [string, string][] = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const tab = line.indexOf('"\t"');
    if (tab < 0) throw new Error(`${path.basename(file)}:${i + 1}: falta el tabulador entre las dos columnas`);
    try { out.push([JSON.parse(line.slice(0, tab + 1)), JSON.parse(line.slice(tab + 2))]); }
    catch (e) { throw new Error(`${path.basename(file)}:${i + 1}: ${String(e)}`); }
  });
  return out;
}

export function build(): { n: number; dups: string[] } {
  const all = new Map<string, string>();
  const dups: string[] = [];
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.tsv')).sort()) {
    for (const [es, en] of readTsv(path.join(SRC, f))) {
      if (all.has(es) && all.get(es) !== en) dups.push(`${f}: "${es}" -> "${en}" (ya era "${all.get(es)}")`);
      if (!all.has(es)) all.set(es, en);
    }
  }
  const body = [...all.entries()].map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'lib', 'i18n', 'en.ts'),
    `// v30: traducciones al inglés. NO editar a mano: sale de lib/i18n/src/*.tsv con\n// npx tsx scripts/i18n-build.ts. La llave es el texto en español (ver lib/i18n.ts).\nexport const EN: Record<string, string> = {\n${body}\n};\n`);
  return { n: all.size, dups };
}

if (require.main === module) {
  const r = build();
  console.log(`Traducciones: ${r.n}`);
  for (const d of r.dups) console.log('DISTINTA  ' + d);
}
