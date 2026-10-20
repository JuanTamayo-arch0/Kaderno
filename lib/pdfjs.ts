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
