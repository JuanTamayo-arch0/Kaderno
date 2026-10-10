import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Note } from './db';

// Genera un PDF con las notas de una materia y abre el menú de compartir/guardar.
export async function exportSubjectPdf(subjectName: string, icon: string, notes: Note[]): Promise<void> {
  const esc = (s: string) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');

  const body = notes.length
    ? notes.map((n) => `
        <section>
          <h2>${esc(n.title || 'Nota')}</h2>
          <p class="date">${new Date(n.created_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          ${n.summary ? `<div class="summary"><strong>Resumen:</strong> ${esc(n.summary)}</div>` : ''}
          <p>${esc(n.content || '')}</p>
        </section>`).join('')
    : '<p>Esta materia aún no tiene notas.</p>';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 32px; line-height: 1.55; }
      h1 { font-size: 26px; margin-bottom: 4px; }
      .subtitle { color: #666; margin-top: 0; }
      section { page-break-inside: avoid; margin: 22px 0; padding-bottom: 16px; border-bottom: 1px solid #eee; }
      h2 { font-size: 18px; margin-bottom: 2px; }
      .date { color: #888; font-size: 12px; margin: 0 0 8px; }
      .summary { background: #f3f5ff; border-left: 3px solid #6c8cff; padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; font-size: 14px; }
      p { font-size: 14px; }
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
