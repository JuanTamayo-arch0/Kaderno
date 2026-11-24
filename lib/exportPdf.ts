// i18n-ok-archivo: se traduce a mano (v30, fase 6): tiene palabras que el lector reconoce o texto legal.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Note, signedUrl } from './db';
import { noteToHtml } from './noteHtml';
import { docFooter } from './brand';

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
      /* Sobrio, como los demás documentos de Kaderno: Times New Roman y todo en negro. */
      body { font-family: 'Times New Roman', Times, serif; color: #000; padding: 32px; line-height: 1.5; font-size: 12pt; }
      h1 { font-size: 18pt; margin-bottom: 4px; }
      .subtitle { margin-top: 0; font-size: 11pt; }
      section { page-break-inside: avoid; margin: 22px 0; padding-bottom: 16px; border-bottom: 1px solid #000; }
      h2 { font-size: 14pt; margin-bottom: 2px; }
      .date { font-size: 10pt; margin: 0 0 8px; }
      .summary { border-left: 2px solid #000; padding: 4px 12px; margin-bottom: 10px; }
      p, li { font-size: 12pt; }
      .note h1, .note h2, .note h3 { font-size: 13pt; margin: 14px 0 4px; }
      .note blockquote { margin: 10px 0; padding: 4px 12px; border-left: 2px solid #000; }
      .note table { border-collapse: collapse; margin: 10px 0; font-size: 11pt; }
      .note th, .note td { border: 1px solid #000; padding: 5px 8px; text-align: left; }
      .note th { font-weight: bold; }
      .note img { max-width: 100%; margin: 8px 0; }
      .note pre { border: 1px solid #000; padding: 10px; overflow-x: auto; font-size: 10pt; }
      .note .math { text-align: center; margin: 10px 0; }
      @media print { body { padding: 0; margin: 18mm; } }
    </style></head>
    <body>
      <h1>${esc(subjectName)}</h1>
      <p class="subtitle">Apuntes · ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      ${body}
      ${docFooter()}
    </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Apuntes de ${subjectName}` });
  }
}
