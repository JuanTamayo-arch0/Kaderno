// ============================================================
//  v30: revisor de idiomas.
//
//    npx tsx scripts/i18n-check.ts            resumen
//    npx tsx scripts/i18n-check.ts --list     detalle de lo que falta
//    npx tsx scripts/i18n-check.ts --missing archivo.json   llaves sin inglés, por archivo
//
//  Revisa tres cosas:
//    1. Textos en español sin envolver en t() (en app/, components/, lib/).
//    2. Llaves sin traducción al inglés.
//    3. Traducciones que no conservan las {variables} o los espacios de los bordes.
//  Lo que debe quedarse en español se marca con `// i18n-ok` (línea) o
//  `// i18n-ok-archivo` (archivo entero, al principio).
// ============================================================
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { inNonUiPosition, insideT, inTVars, isJsxHuman, jsxTextValue, looksLabel, looksSpanish, markedOk, fileOk } from './i18nRules';
import { EN } from '../lib/i18n/en';

const ROOT = path.resolve(__dirname, '..');

export type Finding = { file: string; line: number; text: string };
export type Report = { keys: Map<string, Finding>; unwrapped: Finding[]; missing: Finding[]; broken: Finding[]; manualFiles: string[]; dynamic: Finding[] };

function walk(p: string, out: string[]) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const f of fs.readdirSync(p)) if (f !== 'node_modules') walk(path.join(p, f), out); }
  else if (/\.tsx?$/.test(p) && !/\.d\.ts$/.test(p)) out.push(p);
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const edges = (s: string) => [/^\s/.test(s), /\s$/.test(s)].join(',');

export function check(dirs = ['app', 'components', 'lib']): Report {
  const files: string[] = [];
  for (const d of dirs) walk(path.join(ROOT, d), files);
  const rep: Report = { keys: new Map(), unwrapped: [], missing: [], broken: [], manualFiles: [], dynamic: [] };
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (/^lib\/i18n(\.ts|\/)/.test(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const manual = fileOk(text);
    if (manual) rep.manualFiles.push(rel);
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    const addKey = (k: string, n: ts.Node) => { if (!rep.keys.has(k)) rep.keys.set(k, { file: rel, line: at(n), text: k }); };
    const visit = (node: ts.Node): void => {
      // Llaves usadas.
      if (ts.isCallExpression(node)) {
        const c = node.expression;
        const name = ts.isIdentifier(c) ? c.text : '';
        const lit = (a: ts.Expression | undefined) => a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : null;
        if (name === 't' || name === 'trn') {
          const k = lit(node.arguments[0]);
          if (k != null) addKey(k, node); else if (node.arguments[0]) rep.dynamic.push({ file: rel, line: at(node), text: node.arguments[0].getText(sf).slice(0, 80) });
        } else if (name === 'tc') {
          const ctx = lit(node.arguments[0]), k = lit(node.arguments[1]);
          if (ctx != null && k != null) addKey(`${ctx}|${k}`, node);
        } else if (name === 'tp') {
          for (const a of node.arguments.slice(1, 3)) { const k = lit(a); if (k != null) addKey(k, node); }
        }
      }
      if (!manual && !markedOk(sf, node)) {
        if (ts.isJsxText(node)) {
          const v = jsxTextValue(node.text);
          if (v.trim() && isJsxHuman(v)) rep.unwrapped.push({ file: rel, line: at(node), text: v.trim().slice(0, 100) });
        } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !insideT(node)) {
          if ((looksSpanish(node.text) || looksLabel(node.text) || inTVars(node) && isJsxHuman(node.text) && /[a-záéíóúñ]/.test(node.text)) && !inNonUiPosition(node)) rep.unwrapped.push({ file: rel, line: at(node), text: node.text.slice(0, 100) });
        } else if (ts.isTemplateExpression(node) && !insideT(node)) {
          const lits = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ');
          if (looksSpanish(lits) && !inNonUiPosition(node)) rep.unwrapped.push({ file: rel, line: at(node), text: node.getText(sf).slice(0, 100) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  for (const [k, f] of rep.keys) {
    const base = k.includes('|') && !(k in EN) ? k.slice(k.indexOf('|') + 1) : k;
    const en = EN[k] ?? EN[base];
    if (en == null) { rep.missing.push(f); continue; }
    if (placeholders(en) !== placeholders(base) || edges(en) !== edges(base)) rep.broken.push({ ...f, text: `${k}  ->  ${en}` });
  }
  return rep;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const rep = check();
  const list = args.includes('--list');
  console.log(`Llaves: ${rep.keys.size} · sin inglés: ${rep.missing.length} · traducciones rotas: ${rep.broken.length} · sin envolver: ${rep.unwrapped.length} · dinámicas: ${rep.dynamic.length}`);
  console.log(`Archivos que se traducen a mano: ${rep.manualFiles.join(', ') || 'ninguno'}`);
  if (list) {
    for (const f of rep.unwrapped) console.log(`SIN ENVOLVER  ${f.file}:${f.line}  ${f.text}`);
    for (const f of rep.broken) console.log(`ROTA          ${f.file}:${f.line}  ${f.text}`);
    for (const f of rep.dynamic) console.log(`DINÁMICA      ${f.file}:${f.line}  ${f.text}`);
  }
  const mi = args.indexOf('--missing');
  if (mi >= 0) {
    const byFile: Record<string, string[]> = {};
    for (const f of rep.missing) (byFile[f.file] ??= []).push(f.text);
    fs.writeFileSync(args[mi + 1], JSON.stringify(byFile, null, 1));
    console.log(`Faltantes por archivo en ${args[mi + 1]}`);
  }
  if (args.includes('--strict') && (rep.unwrapped.length || rep.broken.length || rep.missing.length)) process.exit(1);
}
