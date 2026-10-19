import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { RequireAuth } from '../../components/RequireAuth';
import { Screen, EmptyState, useGoBack } from '../../components/ds';
import { Note, Subject, getNote, getSubjects } from '../../lib/db';
import { NoteDocument } from '../../components/notes/NoteDocument';

// ============================================================
//  Nota a pantalla completa (celular, o notas sin materia en el computador).
//  En el computador, una nota con materia se abre dentro de su materia, con la
//  lista de notas al lado.
// ============================================================

function NotaDetalle() {
  const { id, edit, titulo } = useLocalSearchParams<{ id: string; edit?: string; titulo?: string }>();
  const router = useRouter();
  const { isWide, width } = useResponsive();
  const [note, setNote] = useState<Note | null | undefined>(undefined);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const back = note?.subject_id ? `/materia/${note.subject_id}?tab=notas` : '/materias';
  const goBack = useGoBack(back);

  useEffect(() => {
    let alive = true;
    Promise.all([getNote(id).catch(() => null), getSubjects().catch(() => [])]).then(([n, subs]) => {
      if (!alive) return;
      setSubjects(subs);
      if (!n || n.deleted_at) { setNote(null); return; }
      if (isWide && n.subject_id) {
        router.replace({ pathname: '/materia/[id]', params: { id: n.subject_id, tab: 'notas', nota: n.id, ...(titulo ? { titulo } : {}) } } as any);
        return;
      }
      setNote(n);
    });
    return () => { alive = false; };
  }, [id]);

  if (note === undefined) return <Screen back={back} nav="materias"><ActivityIndicator color={C.brand} style={{ marginTop: 40 }} /></Screen>;
  if (note === null) return (
    <Screen back="/materias" nav="materias" title="Nota">
      <EmptyState icon="document-outline" title="No encontramos esta nota" text="Puede que esté en la papelera." action={{ label: 'Ir a la Papelera', onPress: () => router.replace('/papelera') }} />
    </Screen>
  );

  const onDeleted = () => router.replace(back as any);
  if (isWide) {
    return (
      <Screen back={back} nav="materias" scroll={false} padded={false}>
        <View style={{ flex: 1, minHeight: 0 }}>
          <NoteDocument noteId={id} subjects={subjects} scroll side={width >= 1300} startEditing={edit === '1'} onDeleted={onDeleted} focusHeading={titulo ?? null} />
        </View>
      </Screen>
    );
  }
  return (
    <Screen back={back} nav="materias" maxWidth={760}>
      <NoteDocument noteId={id} subjects={subjects} scroll={false} side={false} startEditing={edit === '1'} onDeleted={onDeleted} focusHeading={titulo ?? null} />
    </Screen>
  );
}

export default function NotaProtegida() {
  return <RequireAuth><NotaDetalle /></RequireAuth>;
}
