import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { Task, Note, Subject, getTrash, restoreTask, purgeTask, restoreNote, purgeNote, restoreSubject, hasV14 } from '../lib/db';
import { confirm, notify, toast, friendlyError } from '../lib/feedback';
import { dataChanged } from '../lib/uiBus';
import { Screen, Button, Card, EmptyState, SectionLabel, Skeleton, Dot } from '../components/ds';
import { t, trn } from '../lib/i18n';

// ============================================================
//  Papelera: tareas y notas borradas (30 días) y materias archivadas.
// ============================================================

function daysLeft(iso?: string | null): string {
  if (!iso) return '';
  const left = 30 - Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return left <= 1 ? t('se borra mañana') : t('se borra en {left} días', { left });
}

function Papelera() {
  const router = useRouter();
  const [data, setData] = useState<{ tasks: Task[]; notes: Note[]; subjects: (Subject & { archived_at?: string | null })[] } | null>(null);
  const load = useCallback(() => { getTrash().then(setData).catch((e) => { setData({ tasks: [], notes: [], subjects: [] }); notify(t('No se pudo cargar'), friendlyError(e)); }); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function act(fn: () => Promise<void>, msg: string) {
    try { await fn(); toast(msg, { tone: 'good' }); dataChanged(); load(); } catch (e) { notify(t('No se pudo completar'), friendlyError(e)); }
  }
  async function purge(label: string, fn: () => Promise<void>) {
    if (!(await confirm(t('¿Borrar para siempre?'), t('"{label}" no se podrá recuperar.', { label }), t('Borrar para siempre')))) return;
    act(fn, t('Borrado para siempre'));
  }

  const empty = data && !data.tasks.length && !data.notes.length && !data.subjects.length;
  const row = (key: string, icon: any, title: string, sub: string, onRestore: () => void, onPurge?: () => void, color?: string) => (
    <Card key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, paddingVertical: 12 }}>
      {color ? <Dot color={color} size={12} /> : <Ionicons name={icon} size={19} color={C.muted} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{sub}</Text>
      </View>
      <Button label={t('Restaurar')} icon="arrow-undo-outline" size="sm" kind="secondary" onPress={onRestore} />
      {onPurge && <Button label={t('Borrar')} size="sm" kind="ghost" onPress={onPurge} accessibilityLabel={t('Borrar para siempre {title}', { title })} />}
    </Card>
  );

  return (
    <Screen title={t('Papelera')} subtitle={t('Lo que borras se guarda 30 días')} back="/ajustes" nav="papelera" maxWidth={760}>
      {!hasV14() && (
        <Card style={{ marginBottom: 12, borderColor: C.warn }}>
          <Text style={{ color: C.text }}>{t('La papelera de tareas y notas necesita actualizar la base de datos (schema_v14.sql). Mientras tanto, solo se muestran las materias archivadas.')}</Text>
        </Card>
      )}
      {data === null ? <><Skeleton /><Skeleton /></> : empty ? (
        <EmptyState icon="trash-outline" title={t('La papelera está vacía')} text={t('Cuando borres una tarea o una nota, podrás recuperarla aquí durante 30 días.')} />
      ) : (
        <>
          {data.tasks.length > 0 && <SectionLabel text={t('Tareas')} count={data.tasks.length} />}
          {data.tasks.map((t) => row(t.id, 'checkbox-outline', t.title, daysLeft(t.deleted_at), () => act(() => restoreTask(t.id), trn('Tarea restaurada')), () => purge(t.title, () => purgeTask(t.id))))}
          {data.notes.length > 0 && <SectionLabel text={t('Notas')} count={data.notes.length} />}
          {data.notes.map((n) => row(n.id, 'document-text-outline', n.title || t('Nota'), daysLeft(n.deleted_at), () => act(() => restoreNote(n.id), t('Nota restaurada')), () => purge(n.title || t('Nota'), () => purgeNote(n.id))))}
          {data.subjects.length > 0 && <SectionLabel text={t('Materias archivadas')} count={data.subjects.length} />}
          {data.subjects.map((s) => row(s.id, 'book-outline', s.name, t('Sus tareas y notas se conservan'), () => act(() => restoreSubject(s.id), `${s.name} restaurada`), undefined, s.color))}
        </>
      )}
    </Screen>
  );
}

export default function PapeleraProtegida() {
  return <RequireAuth><Papelera /></RequireAuth>;
}
