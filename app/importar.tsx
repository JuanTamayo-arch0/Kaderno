import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import { RequireAuth } from '../components/RequireAuth';
import { Subject, getSubjects, addTask, deleteTask } from '../lib/db';
import { taskTypeList, taskTypeMeta, loadTaskTypes } from '../lib/taskTypes';
import { parseSyllabus, syllabusPrompt, type SylRow } from '../lib/syllabus';
import { combine, fmtDue } from '../lib/time';
import { remindAt, remindDays } from '../lib/reminders';
import { pickTextFile, copyText } from '../lib/fileIO';
import { decodeUtf8Strict, decodeCp1252 } from '../lib/import/encoding';
import { notify, toast, friendlyError } from '../lib/feedback';
import { dataChanged } from '../lib/uiBus';
import { refreshNavCounts } from '../lib/navCounts';
import { Screen, Button, Card, Badge, Dot, SectionLabel, EmptyState } from '../components/ds';
import { SubjectPicker } from '../components/SubjectPicker';

// ============================================================
//  Importar cronograma: las entregas del semestre (tareas personales).
//  1. Elige la materia, pega el cronograma o sube un archivo. Si el
//     sílabo está desordenado, copia el prompt y pásalo por una IA.
//  2. Revisa la lista, quita lo que no sirva y confirma.
//  Todo lo importado se puede deshacer de una vez.
// ============================================================

function Importar() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<SylRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useFocusEffect(useCallback(() => { getSubjects().then(setSubjects).catch(() => {}); loadTaskTypes().catch(() => {}); }, []));
  // v22: el cronograma leído desde una foto en Capturar.
  useEffect(() => {
    AsyncStorage.getItem('kd-import-text').then((raw) => {
      if (!raw) return;
      AsyncStorage.removeItem('kd-import-text').catch(() => {});
      try { const j = JSON.parse(raw); if (j?.text) { setText(String(j.text)); if (j.subjectId) setSubjectId(j.subjectId); toast('Texto del cronograma leído de la foto: revísalo y toca Revisar.'); } } catch { /* noop */ }
    }).catch(() => {});
  }, []);
  const subj = subjects.find((s) => s.id === subjectId) ?? null;

  function review() {
    const r = parseSyllabus(text, subjects, taskTypeList(), subjectId);
    if (!r.length) { notify('No encontré entregas', 'Pega el cronograma con una entrega por línea, o usa el prompt para IA.'); return; }
    setRows(r);
  }
  async function upload() {
    try {
      const f = await pickTextFile();
      if (!f) return;
      const t = decodeUtf8Strict(f.bytes) ?? decodeCp1252(f.bytes);
      setText(t);
      setRows(parseSyllabus(t, subjects, taskTypeList(), subjectId));
    } catch (e) { notify('No se pudo leer el archivo', friendlyError(e)); }
  }
  async function copyPrompt() {
    const ok = await copyText(syllabusPrompt(subj?.name ?? null, new Date().getFullYear()));
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2500); toast('Prompt copiado. Pégalo en tu IA junto con el cronograma o el programa del curso.'); }
  }
  const chosen = useMemo(() => (rows ?? []).filter((r) => r.include), [rows]);

  async function doImport() {
    if (!chosen.length) return;
    setBusy(true);
    const ids: string[] = [];
    try {
      for (const r of chosen) {
        const choice = r.dueTime ? '1h' : 'evening';
        const at = remindAt(choice, r.dueDate, r.dueTime);
        ids.push(await addTask({
          title: r.title, subject_id: r.subjectId, type: r.typeKey ?? 'tarea', description: r.description,
          due_date: r.dueDate, due_at: r.dueDate && r.dueTime ? combine(r.dueDate, r.dueTime) : null,
          remind_days: remindDays(choice), remind_at: at?.toISOString() ?? null,
        }));
      }
      dataChanged(); refreshNavCounts(true);
      toast(`${ids.length} ${ids.length === 1 ? 'entrega importada' : 'entregas importadas'}`, {
        tone: 'good', actionLabel: 'Deshacer',
        onAction: () => { Promise.all(ids.map((id) => deleteTask(id))).then(() => { dataChanged(); toast('Importación deshecha'); }).catch(() => {}); },
      });
      router.replace('/');
    } catch (e) {
      notify('La importación quedó a medias', `${ids.length} de ${chosen.length} se guardaron. ${friendlyError(e)}`);
    } finally { setBusy(false); }
  }

  const setRow = (i: number, patch: Partial<SylRow>) => setRows((rs) => rs ? rs.map((r, k) => k === i ? { ...r, ...patch } : r) : rs);

  return (
    <Screen title="Importar cronograma" subtitle="Todas las entregas del semestre en un paso" back="/" nav="index" maxWidth={900}>
      {rows === null ? (
        <>
          <Card>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>1. ¿De qué materia es?</Text>
            <Text style={{ color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 10 }}>Se usa cuando la línea no dice la materia.</Text>
            <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} placeholder="Varias o ninguna" />
          </Card>
          <Card style={{ marginTop: 12 }}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>2. Pega el cronograma</Text>
            <Text style={{ color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 10, lineHeight: 19 }}>
              Una entrega por línea (por ejemplo "20/10 Parcial 1"), una tabla copiada de Excel o un archivo CSV.
            </Text>
            <TextInput value={text} onChangeText={setText} multiline accessibilityLabel="Cronograma"
              placeholder={'20/10/2026 10:00 | Examen | Parcial 1 | Temas 1 a 4\n27/10 Quiz de lectura\nSemana 8: Entrega del proyecto 6 nov'}
              placeholderTextColor={C.muted}
              style={[{ minHeight: 180, textAlignVertical: 'top', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 12, fontSize: 14, lineHeight: 20 }, Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : null]} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <Button label="Revisar" icon="eye-outline" onPress={review} disabled={!text.trim()} />
              <Button label="Subir archivo" icon="document-attach-outline" kind="secondary" onPress={upload} />
            </View>
          </Card>
          <Card style={{ marginTop: 12, flexDirection: isWide ? 'row' : 'column', gap: 12, alignItems: isWide ? 'center' : 'flex-start' }}>
            <Ionicons name="sparkles-outline" size={22} color={C.brand2} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: '700' }}>¿El cronograma está en PDF o desordenado?</Text>
              <Text style={{ color: C.muted, fontSize: 13, marginTop: 3, lineHeight: 19 }}>Copia este prompt, pégalo en ChatGPT, Claude o Gemini junto con el cronograma o el programa del curso, y pega aquí lo que te responda.</Text>
            </View>
            <Button label={copied ? 'Copiado' : 'Copiar prompt'} icon={copied ? 'checkmark' : 'copy-outline'} kind="secondary" onPress={copyPrompt} />
          </Card>
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15, flex: 1 }}>{chosen.length} de {rows.length} para importar</Text>
            <Button label="Volver a editar" kind="ghost" size="sm" icon="arrow-back" onPress={() => setRows(null)} />
          </View>
          {rows.some((r) => r.warning) && <Text style={{ color: C.muted, fontSize: 13, marginBottom: 8 }}>Las entregas con fecha pasada quedan sin marcar. Revisa las que no tienen fecha.</Text>}
          {rows.length === 0 && <EmptyState compact icon="document-outline" title="No hay filas" />}
          {rows.map((r, i) => {
            const sub = subjects.find((s) => s.id === r.subjectId);
            const tm = taskTypeMeta(r.typeKey);
            const due = fmtDue({ due_date: r.dueDate, due_at: r.dueDate && r.dueTime ? combine(r.dueDate, r.dueTime) : null });
            return (
              <Card key={i} style={{ marginBottom: 8, paddingVertical: 10, opacity: r.include ? 1 : 0.6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable onPress={() => setRow(i, { include: !r.include })} accessibilityRole="checkbox" accessibilityState={{ checked: r.include }} accessibilityLabel={`Importar ${r.title}`}
                    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}>
                    <Ionicons name={r.include ? 'checkbox' : 'square-outline'} size={22} color={r.include ? C.brand : C.muted} />
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <TextInput value={r.title} onChangeText={(v) => setRow(i, { title: v })} accessibilityLabel="Título"
                      style={[{ color: C.text, fontSize: 15, fontWeight: '600', paddingVertical: 2 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      {sub ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Dot color={sub.color} /><Text style={{ color: C.muted, fontSize: 12.5 }}>{sub.name}</Text></View> : <Text style={{ color: C.muted, fontSize: 12.5 }}>Sin materia</Text>}
                      {r.typeKey && r.typeKey !== 'tarea' && <Badge text={tm.label} color={tm.color} />}
                      <Text style={{ color: r.dueDate ? C.text : C.muted, fontSize: 12.5 }}>{due || 'Sin fecha'}</Text>
                      {!!r.warning && <Badge text={r.warning} color={C.warn} />}
                    </View>
                    {!!r.description && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 4 }} numberOfLines={2}>{r.description}</Text>}
                  </View>
                </View>
              </Card>
            );
          })}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Button label="Cancelar" kind="secondary" onPress={() => setRows(null)} style={{ flex: 1 }} />
            <Button label={`Importar ${chosen.length}`} icon="download-outline" onPress={doImport} busy={busy} disabled={!chosen.length} style={{ flex: 2 }} />
          </View>
        </>
      )}
    </Screen>
  );
}

export default function ImportarProtegida() {
  return <RequireAuth><Importar /></RequireAuth>;
}
