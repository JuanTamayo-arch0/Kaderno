import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button } from '../ds';
import { getShareToken, enableShare, disableShare, sharedNoteUrl } from '../../lib/calendarsDb';
import { getProjects, type Project } from '../../lib/projects';
import { uploadNewFile } from '../../lib/projectFiles';
import { copyText } from '../../lib/fileIO';
import { noteForExport } from '../../lib/noteLinks';
import { confirm, toast, friendlyError } from '../../lib/feedback';
import { t, trn } from '../../lib/i18n';

// ============================================================
//  Compartir una nota (v21, sección 10): un enlace de solo lectura que
//  se puede apagar, o una copia .md en los archivos de un proyecto.
// ============================================================

export function ShareNoteSheet({ visible, mode, noteId, title, getContent, onClose }: {
  visible: boolean; mode: 'link' | 'project'; noteId: string; title: string; getContent: () => string; onClose: () => void;
}) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    if (mode === 'link') { setToken(undefined); getShareToken(noteId).then(setToken); }
    else { setProjects(null); getProjects().then(setProjects).catch(() => setProjects([])); }
  }, [visible, mode, noteId]);

  async function on(regen = false) {
    if (regen && !(await confirm(t('¿Cambiar el enlace?'), t('El enlace anterior deja de funcionar.'), t('Cambiar')))) return;
    setBusy('on');
    try { const t = await enableShare(noteId); setToken(t); const ok = await copyText(sharedNoteUrl(t)); toast(ok ? trn('Enlace copiado') : trn('Enlace listo')); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function off() {
    setBusy('off');
    try { await disableShare(noteId); setToken(null); toast(t('Enlace desactivado: ya nadie la puede abrir')); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function toProject(p: Project) {
    setBusy(p.id);
    try {
      const md = noteForExport(title, getContent());
      const bytes = new TextEncoder().encode(md);
      const name = `${(title || t('Nota')).replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 80) || t('Nota')}.md`;
      await uploadNewFile(p.id, { name, bytes, mime: 'text/markdown', size: bytes.length }, { description: t('Copiada desde una nota de Kaderno') });
      toast(trn('Copiada a {name}', { name: p.name }), { tone: 'good' }); onClose();
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setBusy(null); }
  }

  if (mode === 'project') return (
    <Sheet visible={visible} onClose={onClose} title={t('Copiar a un proyecto')} subtitle={t('Queda como archivo .md en Archivos. Los cambios en la nota no se copian solos.')}>
      {projects === null && <ActivityIndicator color={C.brand} />}
      {projects?.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>{t('No tienes proyectos activos.')}</Text>}
      {projects?.map((p) => (
        <Pressable key={p.id} onPress={() => toProject(p)} disabled={!!busy} accessibilityRole="button" accessibilityLabel={t('Copiar a {name}', { name: p.name })}
          style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
          <Text style={{ fontSize: 18 }}>{p.icon || '📦'}</Text>
          <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600', flex: 1 }} numberOfLines={1}>{p.name}</Text>
          {busy === p.id ? <ActivityIndicator color={C.brand} /> : <Ionicons name="arrow-forward" size={16} color={C.muted} />}
        </Pressable>
      ))}
    </Sheet>
  );

  const url = token ? sharedNoteUrl(token) : '';
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Compartir con un enlace')} subtitle={t('Quien tenga el enlace ve la nota (sin editarla). No necesita cuenta.')}>
      {token === undefined && <ActivityIndicator color={C.brand} />}
      {token === null && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: C.text, fontSize: 13.5 }}>{t('La nota es privada. Al crear el enlace, verán el título, el contenido y las imágenes; nada más de tu cuenta.')}</Text>
          <Button label={t('Crear enlace')} icon="link-outline" busy={busy === 'on'} onPress={() => on()} />
        </View>
      )}
      {!!token && (
        <View style={{ gap: 10 }}>
          <View style={{ padding: 12, borderRadius: 10, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line }}>
            <Text selectable style={{ color: C.text, fontSize: 13 }} numberOfLines={2}>{url}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label={t('Copiar')} icon="copy-outline" onPress={async () => toast((await copyText(url)) ? t('Enlace copiado') : t('No se pudo copiar'))} />
            <Button label={t('Cambiar enlace')} kind="secondary" busy={busy === 'on'} onPress={() => on(true)} />
            <Button label={t('Desactivar')} kind="ghost" busy={busy === 'off'} onPress={off} />
          </View>
          <Text style={{ color: C.muted, fontSize: 12 }}>{t('Siempre muestra la versión más reciente de la nota.')}</Text>
        </View>
      )}
    </Sheet>
  );
}
