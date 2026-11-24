// ============================================================
//  v30: reglas compartidas por el script que envuelve textos
//  (scripts/i18n-wrap.ts) y el revisor (scripts/i18n-check.ts).
//  ¿Este texto es para personas y está en español? ¿Este lugar del código
//  es de interfaz o es una llave, una ruta, una consulta...?
// ============================================================
import ts from 'typescript';

/** Props de JSX y llaves de objetos que llevan texto para personas. */
export const TEXT_PROPS = new Set([
  'label', 'title', 'subtitle', 'placeholder', 'accessibilityLabel', 'accessibilityHint', 'aria-label', 'hint',
  'text', 'eyebrow', 'message', 'empty', 'confirmLabel', 'cancelLabel', 'okLabel', 'description', 'caption',
  'heading', 'tooltip', 'body', 'sub', 'line', 'short', 'long', 'help', 'question', 'answer', 'tip', 'lead',
  'cta', 'action', 'detail', 'note', 'name', 'big', 'unit', 'one', 'many', 'pet', 'say', 'why', 'how',
  'emptyText', 'doneLabel', 'panelTitle', 'panelSub', 'headline', 'intro', 'labelOn', 'labelOff', 'success',
  'error', 'warning', 'info', 'prompt', 'summary', 'kicker', 'banner', 'chip', 'badge', 'subtitleText',
]);

/** Props de JSX que nunca son texto (aunque el valor parezca una palabra). */
const NON_TEXT_PROPS = new Set(['name', 'icon', 'testID', 'nativeID', 'href', 'key', 'kind', 'size', 'tone', 'mode', 'variant',
  'type', 'id', 'species', 'route', 'nav', 'back', 'keyboardType', 'autoComplete', 'autoCapitalize', 'enterKeyHint', 'inputMode',
  'textContentType', 'returnKeyType', 'accessibilityRole', 'role', 'behavior', 'resizeMode', 'pointerEvents', 'dir', 'lang',
  'color', 'stroke', 'fill', 'd', 'viewBox', 'transform', 'src', 'alt', 'target', 'rel', 'method', 'action', 'encType',
  'animationType', 'presentationStyle', 'keyboardShouldPersistTaps', 'importantForAccessibility', 'accessibilityLiveRegion',
  'selectionColor', 'placeholderTextColor', 'cursorColor', 'textAlign', 'tab', 'value', 'defaultValue', 'item', 'slot']);

const ACCENT = /[áéíóúñÁÉÍÓÚÑ¿¡üÜ]/;

/** Palabras que delatan español: conectores y vocabulario de la interfaz. */
export const SPANISH_WORDS = new Set(`
de la el los las un una unos unas y o u que para con sin por del al en es son está están ya no sí si su sus tu tus mi mis
lo le les se nos te me más menos muy hoy ayer mañana aquí ahí este esta estos estas ese esa eso cada todo todos toda todas
nada algo hay ser hacer puedes quieres tienes vas va hace
guardar guardado guardada cancelar borrar borrado borrada listo lista listos editar agregar abrir cerrar volver seguir
nuevo nueva nuevos nuevas tarea tareas nota notas materia materias horario semana semanas mes meses año años día días hora
horas minutos segundos pendiente pendientes vencida vencidas hecha hechas hecho enfoque descanso repaso tarjeta tarjetas
proyecto proyectos equipo plan cuenta cuentas cobro cobrar ajustes mascota monedas nivel tienda ropa casa pared piso vista
buscar subir bajar mover copiar pegar compartir enviar mandar pedir elegir escoger quitar poner usar ver
importante urgente planear soltar rápido entregar entrega clase clases parcial examen quiz calificación calificaciones
promedio créditos profesor salón archivo archivos foto fotos cámara galería pizarra apuntes resumen resumir pregunta
preguntas respuesta respuestas oráculo simulacro racha rachas meta metas logro logros sala salas mañanas tardes noches
mañana tarde noche lunes martes miércoles jueves viernes sábado domingo enero febrero marzo abril mayo junio julio agosto
septiembre octubre noviembre diciembre lun mar mié jue vie sáb dom
correo contraseña nombre entrar salir sesión registro crear iniciar terminar empezar pausar reiniciar saltar anotar
estudio trabajo estudiar trabajar área áreas cliente clientes datos tus propio propia gratis pago pagar pagada
error intenta otra vez algún alguna ninguna ninguno ahora después antes luego siempre nunca también solo aún todavía
desde hasta entre sobre bajo contra hacia durante mientras cuando donde como cual cuál qué quién cuánto cuántas
`.split(/\s+/).filter(Boolean));

/** ¿Tiene letras y no parece una llave, una ruta o un identificador? */
export function isHumanText(s: string): boolean {
  const x = s.trim();
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(x)) return false;
  if (/^(https?:|mailto:|tel:|data:|\/|\.\/|\.\.\/|#|@)/.test(x)) return false;
  if (/^</.test(x) || /<\/?[a-z][^>]*>/i.test(x) && /[="]/.test(x)) return false; // HTML o SVG: se traduce a mano
  if (/^[a-z0-9_.:\/\-]+$/.test(x) && !ACCENT.test(x)) return false; // llave o ruta
  if (/^[a-z]{2}(-[A-Z]{2})?$/.test(x)) return false;                 // código de idioma (es-CO)
  if (/^[a-zA-Z]+[A-Z][a-zA-Z]*$/.test(x)) return false;           // camelCase
  if (/^[A-Z0-9_]+$/.test(x) && x.length > 1 && !SPANISH_WORDS.has(x.toLowerCase())) return false; // CONSTANTE, PDF, CSV
  if (/^\s*[\[{(].*[\]})]\s*$/.test(x) && /["':]/.test(x)) return false; // JSON o similar
  return true;
}

/** ¿Parece español? (tildes, ñ, ¿¡ o alguna palabra de la lista). */
export function looksSpanish(s: string): boolean {
  if (!isHumanText(s)) return false;
  if (ACCENT.test(s)) return true;
  const words = s.toLowerCase().replace(/\{\w+\}/g, ' ').match(/[a-záéíóúñü]+/g) ?? [];
  const hits = words.filter((w) => SPANISH_WORDS.has(w));
  // "y", "o", "u" solas no bastan (aparecen en código: "x y").
  return hits.some((w) => w.length > 1) || hits.length >= 2;
}

/** Llamadas cuyos textos son llaves, consultas, rutas, etc. (método o función). */
const SKIP_CALLS = new Set([
  'from', 'rpc', 'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'like', 'ilike', 'contains', 'order', 'upsert',
  'insert', 'update', 'delete', 'match', 'filter', 'or', 'not', 'channel', 'on', 'storage', 'invoke', 'getItem', 'setItem',
  'removeItem', 'push', 'replace', 'navigate', 'openURL', 'startsWith', 'endsWith', 'includes', 'indexOf', 'split', 'test',
  'lastIndexOf', 'addEventListener', 'removeEventListener', 'setAttribute', 'getAttribute', 'querySelector', 'querySelectorAll',
  'createElement', 'get', 'set', 'has', 'require', 'log', 'warn', 'debug', 'info', 'trace', 'error', 'getElementById', 'matchMedia',
  'emitPetEvent', 'play', 'normalize', 'localeCompare', 'padStart', 'padEnd', 'join', 'createSignedUrl', 'upload', 'download',
  'list', 'remove', 'fetch', 'decode', 'encode', 'Date', 'RegExp', 'atob', 'btoa', 'track', 'vtRef', 'useLocalSearchParams',
  't', 'tc', 'tp', 'trn', 'fill', 'dataChanged', 'emit', 'subscribe', 'useState', 'useRef', 'textTone', 'hexA', 'raise',
]);

function calleeName(e: ts.Expression): string | null {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

/** ¿Esta prop de JSX lleva texto para personas? */
export function jsxTextProp(n: string): boolean {
  if (NON_TEXT_PROPS.has(n)) return false;
  return TEXT_PROPS.has(n) || /(Label|Title|Text|Hint|Placeholder|Message)$/.test(n);
}

/** ¿Este nodo de texto está en un lugar que no es interfaz? */
export function inNonUiPosition(node: ts.Node): boolean {
  let child: ts.Node = node;
  let p: ts.Node | undefined = node.parent;
  // Subir por paréntesis, condicionales y || / ?? (el texto sigue siendo el mismo valor).
  while (p && (ts.isParenthesizedExpression(p) || ts.isConditionalExpression(p) && p.condition !== child
    || ts.isBinaryExpression(p) && (p.operatorToken.kind === ts.SyntaxKind.BarBarToken || p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    || ts.isAsExpression(p) || ts.isSatisfiesExpression?.(p))) { child = p; p = p.parent; }
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isImportTypeNode(p)) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isPropertyAssignment(p) && p.name === child) return true;
  if (ts.isPropertyAssignment(p)) {
    const k = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : '';
    if (['style', 'dataSet', 'key', 'id', 'icon', 'species', 'kind', 'type', 'route', 'href', 'color', 'slot', 'status', 'mode', 'tone', 'value', 'k', 'event', 'reason'].includes(k)) return true;
  }
  if (ts.isElementAccessExpression(p) && p.argumentExpression === child) return true;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return true;
  if (ts.isCaseClause(p)) return true;
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const n = calleeName(p.expression);
    if (n && SKIP_CALLS.has(n)) return true;
    if (ts.isPropertyAccessExpression(p.expression) && ['console', 'Deno', 'Math', 'JSON', 'Object'].includes(p.expression.expression.getText())) return true;
  }
  if (ts.isJsxAttribute(p)) return !jsxTextProp(p.name.getText());
  if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) return !jsxTextProp(p.parent.name.getText());
  // Dentro de style={{ ... }} o dataSet={{ ... }}
  for (let a: ts.Node | undefined = p; a; a = a.parent) {
    if (ts.isJsxAttribute(a)) { const n = a.name.getText(); if (n === 'style' || n === 'dataSet' || n === 'contentContainerStyle') return true; break; }
    if (ts.isPropertyAssignment(a)) { const k = a.name.getText(); if (k === 'style' || k === 'dataSet') return true; }
    if (ts.isFunctionLike(a) || ts.isSourceFile(a)) break;
  }
  return false;
}

/** ¿El nodo es la llave de un t/trn/tc/tp? (las variables de adentro sí se revisan: se muestran). */
export function insideT(node: ts.Node): boolean {
  let child: ts.Node = node;
  for (let p = node.parent; p; child = p, p = p.parent) {
    if (ts.isCallExpression(p)) {
      const n = calleeName(p.expression);
      if (n === 't' || n === 'trn' || n === 'tc' || n === 'tp') {
        const i = p.arguments.indexOf(child as ts.Expression);
        if (n === 't' || n === 'trn') return i === 0;
        if (n === 'tc') return i === 0 || i === 1;
        return i === 1 || i === 2;
      }
    }
    if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

/** ¿El nodo es el valor de una variable de t()? (`{ v: n === 1 ? 'tarea' : 'tareas' }`). */
export function inTVars(node: ts.Node): boolean {
  let child: ts.Node = node;
  for (let p = node.parent; p; child = p, p = p.parent) {
    if (ts.isCallExpression(p)) {
      const n = calleeName(p.expression);
      if (n === 't' || n === 'trn' || n === 'tc' || n === 'tp') {
        const i = p.arguments.indexOf(child as ts.Expression);
        return (n === 'tc' ? i === 2 : n === 'tp' ? i === 3 : i === 1);
      }
      return false; // otra llamada en medio (fmt(x)): no es texto directo
    }
    if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

/** ¿La línea (o la anterior) tiene la marca i18n-ok? */
export function markedOk(sf: ts.SourceFile, node: ts.Node): boolean {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const lines = sf.text.split('\n');
  if (/i18n-ok/.test(lines[line] ?? '') || /i18n-ok/.test(lines[line - 1] ?? '')) return true;
  // Bloque: desde una línea con "i18n-ok-desde" hasta una con "i18n-ok-hasta".
  for (let i = line; i >= 0; i--) {
    if (/i18n-ok-hasta/.test(lines[i] ?? '') && i < line) return false;
    if (/i18n-ok-desde/.test(lines[i] ?? '')) return true;
  }
  return false;
}

/** ¿El archivo entero queda en español a propósito? (marca en las primeras líneas). */
export function fileOk(text: string): boolean {
  return /i18n-ok-archivo/.test(text.slice(0, 2000));
}

/** Texto de JSX tal como React lo muestra (como hace Babel con los saltos de línea). */
export function jsxTextValue(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/);
  let last = 0;
  lines.forEach((l, i) => { if (/[^ \t]/.test(l)) last = i; });
  let out = '';
  lines.forEach((l, i) => {
    const first = i === 0, isLast = i === lines.length - 1;
    let x = l.replace(/\t/g, ' ');
    if (!first) x = x.replace(/^[ ]+/, '');
    if (!isLast) x = x.replace(/[ ]+$/, '');
    if (x) { if (i !== last) x += ' '; out += x; }
  });
  return decodeEntities(out);
}

export function decodeEntities(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

/** Literal de JS en comillas simples. */
export function q(s: string): string {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '') + "'";
}

/** Nombres propios que no se traducen. */
export const KEEP = new Set(['Kaderno', 'kaderno', 'Pomodoro', 'Wompi', 'Nequi', 'Google', 'Outlook', 'Apple', 'Chrome', 'Safari', 'Supabase',
  'Gemini', 'Claude', 'Markdown', 'KaTeX', 'Excel', 'Android', 'Telegram', 'WhatsApp', 'Bancolombia', 'Cornell', 'Daviplata', 'iCal', 'iPhone',
  'PDF', 'CSV', 'JSON', 'URL', 'IA', 'OK', 'Pro', 'Flashcards', 'Esc', 'Ctrl', 'Alt', 'Shift', 'Enter', 'Tab', 'Cmd', 'Marketing', 'Quiz', 'Nginx']);

/** Una o varias palabras con mayúscula inicial, como un rótulo ("Deshacer", "Permiso necesario"). */
export function looksLabel(s: string): boolean {
  const x = s.trim();
  return /^[¿¡]?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+([ ,][a-záéíóúñüA-Z0-9]+)*[.!?…:]?$/.test(x) && !KEEP.has(x.replace(/[.!?…:]$/, ''));
}

/** ¿Texto de JSX para personas? (aunque sea una sola palabra en minúscula como "de"). */
export function isJsxHuman(s: string): boolean {
  const x = s.trim();
  return /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(x) && !KEEP.has(x) && !/^(https?:|\/)/.test(x);
}

/** ¿Es una rama de un plural? `n === 1 ? 'tarea' : 'tareas'` (las dos ramas son texto). */
export function pluralBranch(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isConditionalExpression(p) || p.condition === node) return false;
  const lit = (e: ts.Expression) => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e);
  if (!lit(p.whenTrue) || !lit(p.whenFalse)) return false;
  let c: ts.Expression = p.condition;
  while (ts.isParenthesizedExpression(c)) c = c.expression;
  if (!ts.isBinaryExpression(c)) return false;
  const num = (e: ts.Expression) => ts.isNumericLiteral(e) && (e.text === '1' || e.text === '0');
  if (!lit(p.whenTrue) || !/[a-záéíóúñ]/i.test((p.whenTrue as ts.StringLiteral).text) || /^#/.test((p.whenTrue as ts.StringLiteral).text)) return false;
  return (num(c.right) || num(c.left)) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.EqualsEqualsToken].includes(c.operatorToken.kind);
}
