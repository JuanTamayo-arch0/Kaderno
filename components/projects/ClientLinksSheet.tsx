import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button } from '../ds';
import { getLinks, linkUrl, openWhatsApp, setLink, NEEDS_V24_4, type LinkKind, type ProjectLink } from '../../lib/clientLinks';
import { copyText } from '../../lib/fileIO';
import { confirm, friendlyError, notify, toast } from '../../lib/feedback';
import { t } from '../../lib/i18n';

// ============================================================
//  Enlaces para el cliente (v25, fase 4): el formulario de solicitudes y
//  la vista del avance. Se prenden, se copian, se mandan por WhatsApp y se
//  cambian (el enlace viejo deja de servir).
// ============================================================

const INFO: Record<LinkKind, { title: string; icon: string; text: string; share: (name: string, url: string) => string }> = {
  form: { title: t('Formulario de solicitudes'), icon: 'create-outline', text: t('Quien tenga el enlace pide algo sin cuenta; llega como tarea a la columna "Solicitudes" y te avisa.'),
    share: (n, u) => t('Hola. Para pedir algo de {n}, llena este formulario: {u}', { n, u }) },
  view: { title: t('Avance para el cliente'), icon: 'eye-outline', text: t('Solo lectura: porcentaje, lo que viene, lo entregado y el último estado. No muestra nombres, comentarios, horas ni tareas con #interno.'),
    share: (n, u) => t('Hola. Aquí puedes ver el avance de {n} cuando quieras: {u}', { n, u }) },
};

export function ClientLinksSheet({ visible, projectId, projectName, editable, onClose }: { visible: boolean; projectId: string; projectName: string; editable: boolean; onClose: () => void }) {
  const [links, setLinks] = useState<ProjectLink[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<LinkKind | null>(null);
  const [intro, setIntro] = useState<Record<LinkKind, string>>({ form: '', view: '' });
  useEffect(() => {
    if (!visible) return;
    setLinks(null);
    getLinks(projectId).then((l) => { setMissing(l === null); setLinks(l ?? []); setIntro({ form: l?.find((x) => x.kind === 'form')?.intro ?? '', view: l?.find((x) => x.kind === 'view')?.intro ?? '' }); })
      .catch((e) => { notify(t('No se pudo cargar'), friendlyError(e)); setLinks([]); });
  }, [visible, projectId]);
  async function set(kind: LinkKind, enabled: boolean, rotate = false) {
    if (rotate && !(await confirm(t('¿Cambiar el enlace?'), t('El enlace que ya mandaste deja de funcionar.'), t('Cambiar')))) return;
    setBusy(kind);
    try { const r = await setLink(projectId, kind, enabled, { rotate, intro: intro[kind] }); setLinks((l) => [...(l ?? []).filter((x) => x.kind !== kind), r]); if (rotate) toast(t('Enlace nuevo listo')); }
    catch (e) { notify(t('No se pudo'), friendlyError(e)); }
    finally { setBusy(null); }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Enlaces para el cliente')} subtitle={t('{projectName}. Sin cuenta para quien lo abre. Con Gratis, en 1 proyecto.', { projectName })} maxWidth={600}>
      {missing && <Text style={{ color: C.warnText, fontSize: 13 }}>{NEEDS_V24_4}</Text>}
      {links === null && <ActivityIndicator color={C.brand} />}
      {links && !missing && (['form', 'view'] as LinkKind[]).map((kind) => {
        const l = links.find((x) => x.kind === kind);
        const on = !!l?.enabled;
        const url = l ? linkUrl(kind, l.token) : '';
        return (
          <View key={kind} style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? C.brand : C.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={INFO[kind].icon as any} size={18} color={on ? C.brand : C.muted} />
              <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }}>{INFO[kind].title}</Text>
              {editable && <Button label={on ? t('Apagar') : t('Prender')} size="sm" kind={on ? 'ghost' : 'primary'} busy={busy === kind} onPress={() => set(kind, !on)} />}
            </View>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>{INFO[kind].text}</Text>
            {on && (
              <>
                <Text selectable style={{ color: C.text, fontSize: 12.5, padding: 8, borderRadius: 8, backgroundColor: C.surface2, fontFamily: Platform.OS === 'web' ? 'ui-monospace, monospace' : undefined }} numberOfLines={1}>{url}</Text>
                {editable && (
                  <TextInput value={intro[kind]} onChangeText={(t) => setIntro({ ...intro, [kind]: t })} onBlur={() => set(kind, true)} maxLength={500} multiline
                    placeholder={kind === 'form' ? t('Mensaje arriba del formulario (opcional)') : t('Mensaje arriba del avance (opcional)')} placeholderTextColor={C.muted} accessibilityLabel={t('Mensaje para el cliente')}
                    style={[{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 8, fontSize: 13 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
                )}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Button label={t('Copiar')} icon="copy-outline" size="sm" kind="secondary" onPress={async () => toast((await copyText(url)) ? t('Enlace copiado') : t('No se pudo copiar'))} />
                  <Button label="WhatsApp" icon="logo-whatsapp" size="sm" kind="secondary" onPress={() => openWhatsApp(INFO[kind].share(projectName, url))} />
                  {Platform.OS === 'web' && <Button label={t('Abrir')} icon="open-outline" size="sm" kind="ghost" onPress={() => window.open(url, '_blank')} />}
                  {editable && <Pressable onPress={() => set(kind, true, true)} hitSlop={6} style={{ justifyContent: 'center' }}><Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Cambiar enlace')}</Text></Pressable>}
                </View>
              </>
            )}
          </View>
        );
      })}
      {!editable && <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Solo quien edita el proyecto prende los enlaces.')}</Text>}
    </Sheet>
  );
}
