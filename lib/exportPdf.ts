import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Note, signedUrl } from './db';
import { noteToHtml } from './noteHtml';

// Genera un PDF con las notas de una materia y abre el menú de compartir/guardar.
export async function exportSubjectPdf(subjectName: string, icon: string, notes: Note[]): Promise<void> {
  const esc = (s: string) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');

  const rendered = await Promise.all(notes.map((n) => noteToHtml(n.content || '', signedUrl).catch(() => `<p>${esc(n.content || '')}</p>`)));
  const body = notes.length
    ? notes.map((n, i) => `
        <section>
          <h2>${esc(n.title || 'Nota')}</h2>
          <p class="date">${new Date(n.created_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          ${n.summary ? `<div class="summary"><strong>Resumen:</strong> ${esc(n.summary)}</div>` : ''}
          <div class="note">${rendered[i]}</div>
        </section>`).join('')
    : '<p>Esta materia aún no tiene notas.</p>';

  const katexCss = Platform.OS === 'web' && typeof location !== 'undefined' ? `<link rel="stylesheet" href="${location.origin}/katex/katex.min.css"/>` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>${katexCss}
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 32px; line-height: 1.55; }
      h1 { font-size: 26px; margin-bottom: 4px; }
      .subtitle { color: #666; margin-top: 0; }
      section { page-break-inside: avoid; margin: 22px 0; padding-bottom: 16px; border-bottom: 1px solid #eee; }
      h2 { font-size: 18px; margin-bottom: 2px; }
      .date { color: #888; font-size: 12px; margin: 0 0 8px; }
      .summary { background: #f3f5ff; border-left: 3px solid #6c8cff; padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; font-size: 14px; }
      p, li { font-size: 14px; }
      .note h1, .note h2, .note h3 { font-size: 15.5px; margin: 14px 0 4px; }
      .note blockquote { margin: 10px 0; padding: 8px 12px; background: #fff8e6; border: 1px solid #f1d58a; border-radius: 6px; }
      .note table { border-collapse: collapse; margin: 10px 0; font-size: 13px; }
      .note th, .note td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; }
      .note th { background: #f5f5f5; }
      .note img { max-width: 100%; border-radius: 6px; margin: 8px 0; }
      .note pre { background: #f5f5f5; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 12.5px; }
      .note .math { text-align: center; margin: 10px 0; }
    </style></head>
    <body>
      <h1>${icon} ${esc(subjectName)}</h1>
      <p class="subtitle">Apuntes exportados desde Kaderno · ${new Date().toLocaleDateString('es')}</p>
      ${body}
    </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Apuntes de ${subjectName}` });
  }
}
