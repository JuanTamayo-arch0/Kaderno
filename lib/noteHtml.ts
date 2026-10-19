// ============================================================
//  Convierte una nota (Markdown con fórmulas e imágenes) a HTML para el PDF.
//  marked y KaTeX se cargan solo al exportar.
// ============================================================

const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KD_IMG = 'kd-img:';

export async function noteToHtml(md: string, resolveImg: (path: string) => Promise<string | null> = async () => null): Promise<string> {
  const [{ Marked }, katexMod] = await Promise.all([import('marked'), import('katex')]);
  const katex: any = (katexMod as any).default ?? katexMod;
  const math: string[] = [];
  const put = (latex: string, display: boolean) => {
    let html = '';
    try { html = katex.renderToString(latex.trim(), { throwOnError: false, displayMode: display }); } catch { html = esc(latex); }
    math.push(display ? `<div class="math">${html}</div>` : html);
    return `@@KDMATH${math.length - 1}@@`;
  };
  // Fórmulas fuera de los bloques de código: $$...$$ y $...$ (no "$20 y $30").
  const parts = (md || '').split(/(```[\s\S]*?```)/g).map((chunk) => chunk.startsWith('```') ? chunk : chunk
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, l) => `\n\n${put(l, true)}\n\n`)
    .replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\d$])/g, (_m, l) => put(l, false)));
  // Imágenes guardadas en el almacenamiento: a URL firmada.
  let text = parts.join('');
  const paths = Array.from(new Set(Array.from(text.matchAll(/\]\(kd-img:([^)\s]+)\)/g)).map((m) => m[1])));
  const urls = await Promise.all(paths.map((p) => resolveImg(p).catch(() => null)));
  paths.forEach((p, i) => { text = text.split(`](${KD_IMG}${p})`).join(`](${urls[i] ?? ''})`); });

  const marked = new Marked({ gfm: true, breaks: false });
  // El HTML escrito a mano en la nota se muestra como texto, no se ejecuta.
  marked.use({ renderer: { html: (t: any) => esc(t.text ?? t.raw ?? '') } });
  let html = await marked.parse(text);
  html = safeUrls(html);
  html = html.replace(/@@KDMATH(\d+)@@/g, (_m, i) => math[Number(i)] ?? '');
  return html;
}

/** Solo enlaces http(s), mailto o anclas; imágenes http(s) o blob. Lo demás (javascript:, data:…) se quita. */
export function safeUrls(html: string): string {
  return html
    .replace(/<a\s+href="([^"]*)"/gi, (_m, u) => (/^(https?:|mailto:|#)/i.test(u.replace(/&amp;/g, '&').trim()) ? `<a rel="noopener noreferrer nofollow" target="_blank" href="${u}"` : '<a href="#"'))
    .replace(/<img\s+src="([^"]*)"/gi, (_m, u) => (/^(https?:|blob:)/i.test(u.trim()) ? `<img src="${u}"` : '<img src=""'));
}
