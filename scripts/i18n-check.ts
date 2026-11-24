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
//  Para 1 también usa el vocabulario de las llaves: una palabra que solo sale en
//  español ("Agregado", "Bloque") dentro de un texto o una plantilla `...` sin t().
//  Lo que debe quedarse en español se marca con `// i18n-ok` (línea) o
//  `// i18n-ok-archivo` (archivo entero, al principio).
// ============================================================
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { inNonUiPosition, insideT, inTVars, pluralBranch, isJsxHuman, jsxTextValue, looksLabel, looksSpanish, markedOk, fileOk } from './i18nRules';
import { EN } from '../lib/i18n/en';

const ROOT = path.resolve(__dirname, '..');

export type Finding = { file: string; line: number; text: string };
export type Report = { keys: Map<string, Finding>; unwrapped: Finding[]; missing: Finding[]; broken: Finding[]; manualFiles: string[]; dynamic: Finding[] };

function walk(p: string, out: string[]) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const f of fs.readdirSync(p)) if (f !== 'node_modules') walk(path.join(p, f), out); }
  else if (/\.tsx?$/.test(p) && !/\.d\.ts$/.test(p)) out.push(p);
}

const WORD = /[A-Za-záéíóúñÁÉÍÓÚÑü]{3,}/g;
/** Palabras que solo aparecen en las llaves en español, nunca en las traducciones. */
function spanishVocab(): Set<string> {
  const es = new Set<string>(), en = new Set<string>();
  for (const [k, v] of Object.entries(EN)) {
    for (const w of k.match(WORD) ?? []) es.add(w.toLowerCase());
    for (const w of v.match(WORD) ?? []) en.add(w.toLowerCase());
  }
  return new Set([...es].filter((w) => !en.has(w)));
}
/** Un identificador, una ruta o un nombre de archivo: no es texto para la gente. */
const notProse = (s: string) => /^[\w\-.:#?=&%@/]*$/.test(s.trim()) || /^[a-z_:\-]+$/.test(s.trim()) || /^\/|\/[a-z]/.test(s);

const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const edges = (s: string) => [/^\s/.test(s), /\s$/.test(s)].join(',');

export function check(dirs = ['app', 'components', 'lib']): Report {
  const files: string[] = [];
  for (const d of dirs) walk(path.join(ROOT, d), files);
  const rep: Report = { keys: new Map(), unwrapped: [], missing: [], broken: [], manualFiles: [], dynamic: [] };
  const vocab = spanishVocab();
  const vocabHit = (s: string) => !notProse(s) && (s.match(WORD) ?? []).some((w) => vocab.has(w.toLowerCase()));
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
          const p = node.parent;
          const skip = ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isCaseClause(p) || (ts.isPropertyAssignment(p) && p.name === node) || ts.isElementAccessExpression(p) || (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText(sf)));
          if ((looksSpanish(node.text) || looksLabel(node.text) || (inTVars(node) || pluralBranch(node)) && isJsxHuman(node.text) && /[a-záéíóúñ]/.test(node.text) || !skip && vocabHit(node.text)) && !inNonUiPosition(node)) rep.unwrapped.push({ file: rel, line: at(node), text: node.text.slice(0, 100) });
        } else if (ts.isTemplateExpression(node) && !insideT(node)) {
          const lits = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ');
          if ((looksSpanish(lits) || vocabHit(lits)) && !inNonUiPosition(node)) rep.unwrapped.push({ file: rel, line: at(node), text: node.getText(sf).slice(0, 100) });
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
    // El inglés puede no usar una variable ("pendiente{v}" -> "to do"), pero no inventar otras.
    const extra = [...placeholders(en)].filter((x) => !placeholders(base).has(x));
    if (extra.length || edges(en) !== edges(base)) rep.broken.push({ ...f, text: `${k}  ->  ${en}` });
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
