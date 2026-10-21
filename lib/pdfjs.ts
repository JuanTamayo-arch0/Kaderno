// ============================================================
//  pdf.js se carga solo al abrir un PDF, desde public/pdfjs (versión legacy,
//  compatible con Safari viejo). Fuera del paquete principal de la app.
//  Para actualizarlo: cambiar la versión de pdfjs-dist y correr
//  `node scripts/copy-pdfjs.mjs`.
// ============================================================

let loading: Promise<any> | null = null;

export function loadPdfjs(): Promise<any> {
  if (loading) return loading;
  // import() nativo del navegador (Metro no debe empaquetarlo).
  const nativeImport = new Function('u', 'return import(u)') as (u: string) => Promise<any>;
  loading = nativeImport('/pdfjs/pdf.min.js').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';
    return lib;
  }).catch((e) => { loading = null; throw e; });
  return loading;
}

export async function openPdf(url: string): Promise<any> {
  const lib = await loadPdfjs();
  return lib.getDocument({ url, standardFontDataUrl: '/pdfjs/standard_fonts/', isEvalSupported: false }).promise;
}

/** Texto de todas las páginas (para Capturar un PDF que ya trae texto). */
export async function pdfPagesText(doc: any, max = 20): Promise<string[]> {
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, max); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = '', text = '', lastY: number | null = null;
    for (const it of tc.items as any[]) {
      if (typeof it.str !== 'string') continue;
      const y = it.transform?.[5] ?? 0;
      if (lastY != null && Math.abs(y - lastY) > 2) { text += line.trim() + '\n'; line = ''; }
      line += it.str + (it.hasEOL ? '\n' : '');
      lastY = y;
    }
    text += line.trim();
    out.push(text.replace(/\n{3,}/g, '\n\n').trim());
  }
  return out;
}
