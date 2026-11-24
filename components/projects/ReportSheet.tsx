import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button } from '../ds';
import { nameOf, type Member, type PTask, type Project } from '../../lib/projects';
import { weeklyReport, weeklyReportMarkdown } from '../../lib/projectReport';
import { uploadNewFile } from '../../lib/projectFiles';
import { copyText, saveFile } from '../../lib/fileIO';
import { openWhatsApp } from '../../lib/clientLinks';
import { toast, friendlyError } from '../../lib/feedback';
import { t } from '../../lib/i18n';

// ============================================================
//  Informe semanal del proyecto (v24, fase 5): lo hecho, lo que viene, lo
//  atrasado y la carga de cada quien. Se copia, se descarga o se guarda en
//  Archivos.
// ============================================================

export function ReportSheet({ visible, project, tasks, members, editable, onClose }: {
  visible: boolean; project: Project | null; tasks: PTask[]; members: Member[]; editable: boolean; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => members.map((m) => ({ user_id: m.user_id, name: nameOf(m.profile) })), [members]);
  const md = useMemo(() => (project && visible ? weeklyReportMarkdown(project.name, weeklyReport(tasks, people), people) : ''), [project, tasks, people, visible]);
  if (!project) return null;
  const file = `Informe semanal ${new Date().toISOString().slice(0, 10)}.md`;
  async function copy() { const ok = await copyText(md); toast(ok ? t('Informe copiado: pégalo en un correo o un chat') : t('No se pudo copiar')); }
  async function download() { try { await saveFile(file, md, 'text/markdown'); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } }
  async function toFiles() {
    setBusy(true);
    try { const bytes = new TextEncoder().encode(md); await uploadNewFile(project!.id, { name: file, bytes, mime: 'text/markdown', size: bytes.length }, { description: t('Informe semanal hecho con Kaderno') }); toast(t('Guardado en Archivos'), { tone: 'good' }); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setBusy(false); }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Informe semanal')} subtitle={t('Para tu jefe, tu cliente o el grupo. Se arma con las tareas del proyecto.')} maxWidth={680}
      footer={<>
        <Button label={t('Copiar')} icon="copy-outline" onPress={copy} />
        <Button label="WhatsApp" icon="logo-whatsapp" kind="secondary" onPress={() => openWhatsApp(md.replace(/^#+ /gm, '').replace(/\n{3,}/g, '\n\n').slice(0, 3500))} />
        <Button label={t('Descargar')} icon="download-outline" kind="secondary" onPress={download} />
        {editable && <Button label={t('Guardar en Archivos')} icon="folder-outline" kind="secondary" busy={busy} onPress={toFiles} />}
      </>}>
      <ScrollView style={{ maxHeight: 420, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.surface2 }} contentContainerStyle={{ padding: 14 }}>
        {md.split('\n').map((l, i) => (
          <Text key={i} selectable style={{ color: C.text, fontSize: l.startsWith('# ') ? 17 : l.startsWith('## ') ? 14.5 : 13.5, fontWeight: l.startsWith('#') ? '800' : '400', lineHeight: 20, marginTop: l.startsWith('## ') ? 8 : 0 }}>
            {l.replace(/^#+ /, '')}
          </Text>
        ))}
      </ScrollView>
    </Sheet>
  );
}
