// ============================================================
//  v30: envuelve en t() los textos en español de la app.
//
//    npx tsx scripts/i18n-wrap.ts [--dry] [archivos o carpetas...]
//
//  Hace solo lo seguro (ver scripts/i18nRules.ts):
//    - el texto entre etiquetas de JSX (si la etiqueta solo tiene texto y
//      valores, todo queda en un t() con variables: "{n} pendientes");
//    - las props y llaves de texto (label, title, placeholder...);
//    - los textos y plantillas que parecen español.
//  Se corre varias veces hasta que no cambie nada (lo de adentro de una
//  plantilla se envuelve en la pasada siguiente). Lo dudoso lo marca el
//  revisor (scripts/i18n-check.ts) para hacerlo a mano.
// ============================================================
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { inNonUiPosition, insideT, inTVars, pluralBranch, isHumanText, isJsxHuman, jsxTextValue, looksLabel, looksSpanish, markedOk, fileOk, q, TEXT_PROPS } from './i18nRules';

const ROOT = path.resolve(__dirname, '..');

/** ¿Hay una variable local llamada `t` visible en este punto? */
function bindsT(name: ts.BindingName | undefined): boolean {
  if (!name) return false;
  if (ts.isIdentifier(name)) return name.text === 't';
  return name.elements.some((e) => !ts.isOmittedExpression(e) && bindsT(e.name));
}
export function shadowsT(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isFunctionLike(p) && p.parameters?.some((x) => bindsT(x.name))) return true;
    if (ts.isFunctionDeclaration(p) && p.name?.text === 't') return true;
    if (ts.isCatchClause(p) && p.variableDeclaration && bindsT(p.variableDeclaration.name)) return true;
    if ((ts.isForOfStatement(p) || ts.isForInStatement(p) || ts.isForStatement(p)) && p.initializer && ts.isVariableDeclarationList(p.initializer)
      && p.initializer.declarations.some((d) => bindsT(d.name))) return true;
    if (ts.isBlock(p) || ts.isSourceFile(p) || ts.isModuleBlock(p) || ts.isCaseClause(p) || ts.isDefaultClause(p)) {
      const stmts = (p as any).statements as ts.NodeArray<ts.Statement>;
      for (const st of stmts) {
        if (ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => bindsT(d.name))) {
          // Solo cuenta si es local (no el import del archivo).
          if (!ts.isSourceFile(p)) return true;
        }
      }
    }
  }
  return false;
}
const fn = (node: ts.Node) => (shadowsT(node) ? 'trn' : 't');
type Edit = { start: number; end: number; text: string };

/** Nombre de variable para una expresión dentro de una plantilla. */
function varName(e: ts.Expression, used: Set<string>, sf: ts.SourceFile): string {
  let base = 'v';
  let x: ts.Expression = e;
  while (ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x) || ts.isAsExpression(x)) x = x.expression;
  if (ts.isIdentifier(x)) base = x.text;
  else if (ts.isPropertyAccessExpression(x)) base = x.name.text;
  else if (ts.isCallExpression(x)) {
    const c = x.expression;
    const n = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : 'v';
    // fmt(x) -> x; si no, el nombre de la función
    const a0 = x.arguments[0];
    base = a0 && (ts.isIdentifier(a0) || ts.isPropertyAccessExpression(a0)) ? (ts.isIdentifier(a0) ? a0.text : a0.name.text) : n;
  }
  base = base.replace(/[^A-Za-z0-9_]/g, '') || 'v';
  if (/^\d/.test(base)) base = 'v' + base;
  let name = base, i = 2;
  while (used.has(name)) name = base + i++;
  used.add(name);
  return name;
}

function varsObj(pairs: [string, string][]): string {
  return '{ ' + pairs.map(([k, v]) => (k === v ? k : `${k}: ${v}`)).join(', ') + ' }';
}

/** t('texto {a}', { a }) a partir de una plantilla. */
function templateCall(node: ts.TemplateExpression, sf: ts.SourceFile): string {
  const used = new Set<string>();
  let key = node.head.text;
  const pairs: [string, string][] = [];
  for (const span of node.templateSpans) {
    const name = varName(span.expression, used, sf);
    pairs.push([name, span.expression.getText(sf)]);
    key += `{${name}}` + span.literal.text;
  }
  return `${fn(node)}(${q(key)}, ${varsObj(pairs)})`;
}

/** ¿La expresión de JSX es un valor (texto o número) y no un elemento? */
function valueLike(e: ts.Expression | undefined): boolean {
  if (!e) return false;
  let found = false;
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(e);
  if (found) return false;
  // && devuelve false o el valor: no sirve como texto
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return false;
  return true;
}

function wrapFile(file: string): { edits: Edit[]; text: string } {
  const text = fs.readFileSync(file, 'utf8');
  if (fileOk(text)) return { edits: [], text };
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits: Edit[] = [];

  const visit = (node: ts.Node): void => {
    if (markedOk(sf, node) && (ts.isStringLiteral(node) || ts.isJsxText(node) || ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node))) return;
    // ---- Elemento de JSX cuyo contenido es solo texto y valores ----
    if (ts.isJsxElement(node)) {
      const kids = node.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim() && c.text.includes('\n')));
      const texts = kids.filter(ts.isJsxText);
      const allSimple = kids.length > 1 && kids.every((c) => ts.isJsxText(c) || ts.isJsxExpression(c) && valueLike(c.expression));
      const human = texts.some((c) => isJsxHuman(jsxTextValue(c.text)));
      if (allSimple && human && !markedOk(sf, node)) {
        const used = new Set<string>();
        const pairs: [string, string][] = [];
        let key = '';
        for (const c of node.children) {
          if (ts.isJsxText(c)) key += jsxTextValue(c.text);
          else if (ts.isJsxExpression(c) && c.expression) {
            const e = c.expression;
            if (ts.isStringLiteral(e)) { key += e.text; continue; }
            const name = varName(e, used, sf);
            pairs.push([name, e.getText(sf)]);
            key += `{${name}}`;
          }
        }
        const start = node.openingElement.getEnd();
        const end = node.closingElement.getStart(sf);
        if (!key.includes('{') || pairs.length) {
          edits.push({ start, end, text: `{${fn(node)}(${q(key)}${pairs.length ? ', ' + varsObj(pairs) : ''})}` });
          return; // lo de adentro ya quedó
        }
      }
    }
    if (ts.isJsxText(node)) {
      const v = jsxTextValue(node.text);
      if (v.trim() && isJsxHuman(v)) {
        // Conserva los espacios de afuera como JSX los mostraría.
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `{${fn(node)}(${q(v)})}` });
      }
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !insideT(node)) {
      const v = node.text;
      const p = node.parent;
      const textKey = p && ts.isPropertyAssignment(p) && p.initializer === node && TEXT_PROPS.has(p.name.getText(sf));
      const jsxProp = p && ts.isJsxAttribute(p);
      const varText = (inTVars(node) || pluralBranch(node)) && isJsxHuman(v) && /[a-záéíóúñ]/i.test(v);
      const ok = (varText || looksSpanish(v) || looksLabel(v) || ((textKey || jsxProp) && isHumanText(v) && /^[A-ZÁÉÍÓÚÑ¿¡]/.test(v.trim()))) && !inNonUiPosition(node);
      if (ok) {
        const call = `${fn(node)}(${q(v)})`;
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: jsxProp ? `{${call}}` : call });
      }
      return;
    }
    if (ts.isTemplateExpression(node) && !insideT(node)) {
      const lits = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ');
      if (looksSpanish(lits) && !inNonUiPosition(node)) {
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: templateCall(node, sf) });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { edits, text };
}

function apply(text: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  let lastStart = Infinity;
  for (const e of sorted) {
    if (e.end > lastStart) continue; // se solapa: queda para la siguiente pasada
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
  }
  return out;
}

/** Agrega `import { t } from '.../lib/i18n'` (y `trn` si se usó) si hace falta. */
function ensureImport(file: string, text: string): string {
  const need = ['t', 'trn'].filter((n) => new RegExp(`(^|[^\\w.$])${n}\\(`).test(text));
  if (!need.length) return text;
  const rel = path.relative(path.dirname(file), path.join(ROOT, 'lib', 'i18n')).replace(/\\/g, '/');
  const spec = rel.startsWith('.') ? rel : './' + rel;
  const re = new RegExp(`import \\{([^}]*)\\} from '${spec.replace(/[.\/]/g, (c) => '\\' + c)}';`);
  const m = text.match(re);
  if (m) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const all = [...new Set([...need, ...names])];
    return text.replace(re, `import { ${all.join(', ')} } from '${spec}';`);
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = sf.statements.filter(ts.isImportDeclaration);
  const at = imports.length ? imports[imports.length - 1].getEnd() : 0;
  return text.slice(0, at) + `\nimport { ${need.join(', ')} } from '${spec}';` + text.slice(at);
}

export function wrapPath(file: string, dry: boolean): number {
  let total = 0;
  for (let pass = 0; pass < 6; pass++) {
    const { edits, text } = wrapFile(file);
    if (!edits.length) break;
    total += edits.length;
    if (dry) { for (const e of edits.slice(0, 400)) console.log(`  ${path.relative(ROOT, file)}: ${e.text.slice(0, 140)}`); break; }
    fs.writeFileSync(file, ensureImport(file, apply(text, edits)));
  }
  return total;
}

function walk(p: string, out: string[]) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const f of fs.readdirSync(p)) if (f !== 'node_modules' && f !== 'i18n') walk(path.join(p, f), out); }
  else if (/\.(tsx?|ts)$/.test(p) && !/\.d\.ts$/.test(p)) out.push(p);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const targets = args.filter((a) => !a.startsWith('--'));
  const files: string[] = [];
  for (const tg of targets.length ? targets : ['app', 'components', 'lib']) walk(path.resolve(ROOT, tg), files);
  let n = 0;
  for (const f of files) {
    if (/lib[\\/]i18n(\.ts|[\\/])/.test(f)) continue;
    const c = wrapPath(f, dry);
    if (c) { n += c; console.log(`${dry ? '[prueba] ' : ''}${path.relative(ROOT, f)}: ${c}`); }
  }
  console.log(`${dry ? 'Se envolverían' : 'Envueltos'}: ${n}`);
}
