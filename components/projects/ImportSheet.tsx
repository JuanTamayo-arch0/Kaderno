import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R } from '../../lib/theme';
import { notify } from '../../lib/confirm';
import { copyText, pickTextFile, readWebFile, saveFile } from '../../lib/fileIO';
import { Member, Project, nameOf } from '../../lib/projects';
import {
  applyProjectFile, getProjectTasksForBulk, importColumns, importMembers, importProjectTasks,
} from '../../lib/projectsBulk';
import {
  FIELD_ALIASES, FIELD_LABELS, ImportError, TEMPLATE_CSV, TEMPLATE_JSON,
  autoMap, buildAiPrompt, columnLabel, computeFileDiff, diffSummary, encodeUtf8, findDuplicates,
  formatHuman, hasTitleColumn, importableTasks, issuesForRow, parseDateTime, parseImportFile,
  parseImportText, summarizeIssues, toFilePayload, toImportPayload, unmappedHeaders, normalizeRows,
  type ColumnMapping, type DuplicatePolicy, type ExistingTask, type Field, type NormalizedTask,
  type ParsedFile, type RowIssue,
} from '../../lib/import';

// ============================================================
//  Importar tareas a un proyecto (CSV o JSON), con vista previa.
//
//  Paso 1: elegir archivo, pegar texto o copiar el prompt para una IA.
//  Paso 2: revisar fila por fila. Nada se guarda hasta tocar "Importar".
//  Si el archivo trae ids (viene de "Exportar"), en vez de crear tareas se
//  muestra qué cambia en cada una y se aplica como actualización en masa.
// ============================================================

const isWeb = Platform.OS === 'web';
// En el navegador del celular no se puede arrastrar un archivo: ahí solo se ofrece elegirlo.
const COARSE = (() => {
  try { return isWeb && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches; }
  catch { return false; }
})();
const canDrop = isWeb && !COARSE;

type Props = {
  visible: boolean;
  project: Project;
  members: Member[];
  subjectName?: string | null;
  onClose: () => void;
  onDone: (r: { batchId: string; text: string }) => void;
};

export function ImportSheet({ visible, project, members, subjectName, onClose, onDone }: Props) {
  const [step, setStep] = useState<'inicio' | 'revisar'>('inicio');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fileName, setFileName] = useState('');
  const [paste, setPaste] = useState('');
  const [existing, setExisting] = useState<ExistingTask[]>([]);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [dupPolicy, setDupPolicy] = useState<DuplicatePolicy>('omitir');
  const [editRow, setEditRow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  // Al abrir, empezar de cero (patrón de "ajustar estado durante el render").
  if (visible !== wasOpen) {
    setWasOpen(visible);
    if (visible) {
      setStep('inicio'); setParsed(null); setMapping({}); setFileName(''); setPaste('');
      setSkip(new Set()); setDupPolicy('omitir'); setEditRow(null); setBusy(false);
    }
  }

  const ctx = useMemo(() => ({ members: importMembers(members), columns: importColumns(project) }), [members, project]);
  const firstCol = ctx.columns[0]?.key ?? 'todo';

  const result = useMemo(() => {
    if (!parsed) return null;
    const r = normalizeRows(parsed, mapping, ctx);
    r.tasks.forEach((t) => { if (skip.has(t.row)) t.skip = true; });
    return r;
  }, [parsed, mapping, ctx, skip]);

  const importable = useMemo(() => (result ? importableTasks(result.tasks, result.issues) : []), [result]);
  const isUpdate = result?.mode === 'update';
  const diff = useMemo(() => (isUpdate ? computeFileDiff(importable, existing, ctx) : null), [isUpdate, importable, existing, ctx]);
  const dups = useMemo(() => (result && !isUpdate ? findDuplicates(importable, existing) : new Map<number, string>()), [result, isUpdate, importable, existing]);
  const summary = result ? summarizeIssues(result.tasks, result.issues) : null;

  // ---------- Paso 1: cargar ----------

  async function load(source: () => ParsedFile, name: string) {
    let p: ParsedFile;
    try {
      p = source();
    } catch (e: any) {
      return notify('No se pudo leer', e instanceof ImportError ? e.message : String(e?.message ?? e));
    }
    setBusy(true);
    try {
      setExisting(await getProjectTasksForBulk(project.id));
    } catch (e: any) {
      setBusy(false);
      return notify('No se pudo preparar la importación', e.message);
    }
    setBusy(false);
    setParsed(p);
    setMapping(autoMap(p.headers));
    setFileName(name);
    setSkip(new Set());
    setStep('revisar');
  }

  async function elegir() {
    try {
      const f = await pickTextFile();
      if (f) load(() => parseImportFile(f), f.name);
    } catch (e: any) { notify('No se pudo abrir el archivo', e.message); }
  }

  async function soltar(file: any) {
    try {
      const f = await readWebFile(file);
      load(() => parseImportFile(f), f.name);
    } catch (e: any) { notify('No se pudo abrir el archivo', e.message); }
  }

  // ---------- Paso 2: corregir una fila ----------

  function setCell(row: number, field: Field, value: string) {
    if (!parsed) return;
    let header = Object.keys(mapping).find((h) => mapping[h] === field);
    const nextMapping = { ...mapping };
    const headers = [...parsed.headers];
    if (!header) {
      header = FIELD_ALIASES[field][0];
      while (headers.includes(header)) header += '_';
      headers.push(header);
      nextMapping[header] = field;
      setMapping(nextMapping);
    }
    const idx = parsed.rowNumbers.indexOf(row);
    if (idx < 0) return;
    const rows = parsed.rows.map((r, i) => (i === idx ? { ...r, [header as string]: value } : r));
    setParsed({ ...parsed, headers, rows });
  }

  function cellOf(row: number, field: Field): string {
    if (!parsed) return '';
    const header = Object.keys(mapping).find((h) => mapping[h] === field);
    const idx = parsed.rowNumbers.indexOf(row);
    if (!header || idx < 0) return '';
    const v = parsed.rows[idx][header];
    if (v === null || v === undefined) return '';
    return Array.isArray(v) ? '' : String(v);
  }

  // ---------- Guardar ----------

  async function importar() {
    if (!result) return;
    setBusy(true);
    try {
      if (isUpdate && diff) {
        const rows = toFilePayload(diff, firstCol);
        if (!rows.length) { setBusy(false); return notify('No hay cambios para aplicar'); }
        const r = await applyProjectFile(project.id, rows);
        onDone({ batchId: r.batch_id, text: `Proyecto actualizado: ${diffSummary(diff)}` });
      } else {
        const payload = toImportPayload(importable, firstCol);
        if (!payload.length) { setBusy(false); return notify('No hay tareas para importar'); }
        const r = await importProjectTasks(project.id, payload, dups.size ? dupPolicy : 'crear');
        const parts = [`${r.created} ${r.created === 1 ? 'tarea importada' : 'tareas importadas'}`];
        if (r.updated) parts.push(`${r.updated} actualizadas`);
        if (r.skipped) parts.push(`${r.skipped} repetidas omitidas`);
        if (r.steps) parts.push(`${r.steps} ítems de checklist`);
        onDone({ batchId: r.batch_id, text: parts.join(' · ') });
      }
    } catch (e: any) {
      notify('No se pudo importar', e.message);
    } finally {
      setBusy(false);
    }
  }

  const nombre = (uid: string | null) => {
    if (!uid) return 'Sin asignar';
    const m = members.find((x) => x.user_id === uid);
    return m ? nameOf(m.profile) : 'Integrante';
  };

  const total = isUpdate && diff ? diff.updates.length + diff.creates.length + diff.deletes.length : importable.length;
  const accion = isUpdate ? `Aplicar cambios` : `Importar ${importable.length} ${importable.length === 1 ? 'tarea' : 'tareas'}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }} style={{ backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: step === 'revisar' ? 760 : 640, maxHeight: '92%', overflow: 'hidden' }}>
          {/* cabecera */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
            {step === 'revisar' && (
              <Pressable onPress={() => setStep('inicio')} hitSlop={10} accessibilityLabel="Volver" style={{ paddingTop: 2 }}>
                <Ionicons name="chevron-back" size={20} color={C.text} />
              </Pressable>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>
                {step === 'inicio' ? 'Importar tareas' : isUpdate ? 'Revisar cambios' : 'Revisar antes de importar'}
              </Text>
              <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12.5, marginTop: 3 }}>
                {step === 'inicio' ? 'CSV o JSON, con fechas, hora y checklist' : fileName}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar"><Ionicons name="close" size={20} color={C.muted} /></Pressable>
          </View>

          {step === 'inicio' ? (
            <Inicio
              project={project} members={members} subjectName={subjectName} ctxColumns={ctx.columns}
              paste={paste} setPaste={setPaste} busy={busy} dragOver={dragOver} setDragOver={setDragOver}
              onPick={elegir} onDropFile={soltar}
              onPasteSubmit={() => load(() => parseImportText(paste), 'Texto pegado')}
            />
          ) : result && summary ? (
            <>
              <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 18, paddingBottom: 8 }}>
                {/* resumen */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {isUpdate && diff ? (
                    <Chip icon="git-compare-outline" color={C.brand} text={diffSummary(diff)} />
                  ) : (
                    <Chip icon="checkmark-circle" color={C.good} text={`${summary.ok} ${summary.ok === 1 ? 'lista' : 'listas'}`} />
                  )}
                  {summary.withWarnings > 0 && <Chip icon="alert-circle" color={C.warn} text={`${summary.withWarnings} con avisos`} />}
                  {summary.withErrors > 0 && <Chip icon="close-circle" color={C.bad} text={`${summary.withErrors} con errores (no se importan)`} />}
                  {summary.skipped > 0 && <Chip icon="remove-circle-outline" color={C.muted} text={`${summary.skipped} omitidas`} />}
                </View>

                {parsed?.warnings.map((w, i) => <Note key={i} color={C.warn} text={w} />)}

                <MappingEditor mapping={mapping} onChange={setMapping} />

                {!isUpdate && !hasTitleColumn(mapping) && (
                  <Note color={C.bad} text="No encontré la columna del título. Asígnala arriba (por ejemplo «titulo»)." />
                )}

                {/* duplicados */}
                {!isUpdate && dups.size > 0 && (
                  <View style={{ borderWidth: 1, borderColor: C.warn + '66', backgroundColor: C.warn + '12', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                    <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>
                      {dups.size} {dups.size === 1 ? 'tarea ya existe' : 'tareas ya existen'} en el proyecto
                    </Text>
                    <Text style={{ color: C.muted, fontSize: 12, marginTop: 3, marginBottom: 9 }}>Mismo título y misma entrega. ¿Qué hago con ellas?</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {([['omitir', 'Omitirlas'], ['actualizar', 'Actualizarlas'], ['crear', 'Crearlas igual']] as const).map(([k, l]) => (
                        <Pressable key={k} onPress={() => setDupPolicy(k)}
                          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, borderColor: dupPolicy === k ? C.brand : C.line, backgroundColor: dupPolicy === k ? C.brand + '22' : 'transparent' }}>
                          <Text style={{ color: dupPolicy === k ? C.brand : C.text, fontSize: 12.5, fontWeight: dupPolicy === k ? '700' : '500' }}>{l}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {/* actualización por archivo */}
                {isUpdate && diff && (
                  <View style={{ marginBottom: 6 }}>
                    {diff.deletes.length > 0 && <Note color={C.bad} text={`Se van a borrar ${diff.deletes.length}: ${diff.deletes.map((d) => `«${d.existing.title}»`).join(', ')}. Tenían «sí» en la columna eliminar.`} />}
                    {diff.unknownIds.length > 0 && <Note color={C.warn} text={`${diff.unknownIds.length} ${diff.unknownIds.length === 1 ? 'fila tiene' : 'filas tienen'} un id que no está en este proyecto y se ignoran.`} />}
                    {diff.updates.map((u) => (
                      <View key={u.existing.id} style={rowBox}>
                        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }} numberOfLines={1}>{u.existing.title}</Text>
                        {u.changes.map((c) => (
                          <Text key={c.field} style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                            <Text style={{ color: C.text, fontWeight: '600' }}>{c.label}: </Text>
                            <Text style={{ textDecorationLine: 'line-through' }}>{c.before}</Text>
                            {'  →  '}
                            <Text style={{ color: C.brand, fontWeight: '600' }}>{c.after}</Text>
                          </Text>
                        ))}
                      </View>
                    ))}
                    {diff.unchanged > 0 && (
                      <Text style={{ color: C.muted, fontSize: 12, marginTop: 2, marginBottom: 8 }}>
                        {diff.unchanged} {diff.unchanged === 1 ? 'tarea queda igual' : 'tareas quedan iguales'}.
                      </Text>
                    )}
                    {diff.creates.length > 0 && (
                      <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '700', marginTop: 6, marginBottom: 8 }}>Nuevas (filas sin id)</Text>
                    )}
                  </View>
                )}

                {/* filas */}
                {result.tasks
                  .filter((t) => !isUpdate || !t.id)
                  .map((t) => (
                    <TaskRow
                      key={t.row} task={t} issues={issuesForRow(result.issues, t.row)}
                      colLabel={columnLabel(ctx.columns, t.status ?? firstCol)}
                      who={t.assignee_id ? nombre(t.assignee_id) : t.assignee_input ? `${t.assignee_input} (sin asignar)` : 'Sin asignar'}
                      duplicate={dups.has(t.row)} dupPolicy={dupPolicy}
                      editing={editRow === t.row}
                      onToggleSkip={() => setSkip((s) => { const n = new Set(s); n.has(t.row) ? n.delete(t.row) : n.add(t.row); return n; })}
                      onEdit={() => setEditRow(editRow === t.row ? null : t.row)}
                      cell={(f) => cellOf(t.row, f)}
                      setCell={(f, v) => setCell(t.row, f, v)}
                    />
                  ))}
              </ScrollView>

              {/* pie */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={{ color: C.muted, fontSize: 12, flex: 1 }}>
                  {isUpdate ? 'Solo cambia lo que viene en el archivo. Nada se borra por faltar.' : 'Se puede deshacer al terminar.'}
                </Text>
                <Pressable onPress={importar} disabled={busy || total === 0}
                  style={{ backgroundColor: total === 0 ? C.surface2 : C.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {busy ? <ActivityIndicator color={C.onBrand} /> : <Ionicons name="cloud-upload-outline" size={17} color={total === 0 ? C.muted : C.onBrand} />}
                  <Text style={{ color: total === 0 ? C.muted : C.onBrand, fontWeight: '700' }}>{accion}</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ============================================================
//  Paso 1
// ============================================================

function Inicio({ project, members, subjectName, ctxColumns, paste, setPaste, busy, dragOver, setDragOver, onPick, onDropFile, onPasteSubmit }: {
  project: Project; members: Member[]; subjectName?: string | null; ctxColumns: { key: string; label: string; done?: boolean }[];
  paste: string; setPaste: (s: string) => void; busy: boolean;
  dragOver: boolean; setDragOver: (b: boolean) => void;
  onPick: () => void; onDropFile: (f: any) => void; onPasteSubmit: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [verPrompt, setVerPrompt] = useState(false);
  const [entregaFinal, setEntregaFinal] = useState('');

  const deadline = useMemo(() => {
    const r = parseDateTime(entregaFinal, 'due');
    return r.ok ? r.iso : null;
  }, [entregaFinal]);

  const prompt = useMemo(() => buildAiPrompt({
    projectName: project.name,
    subjectName: subjectName ?? null,
    members: importMembers(members),
    now: new Date().toISOString(),
    deadline,
    columns: ctxColumns,
  }), [project.name, subjectName, members, deadline, ctxColumns]);

  async function copiar() {
    const ok = await copyText(prompt);
    if (ok) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    }
  }

  const editores = members.filter((m) => m.role !== 'viewer').length;

  const zona = (
    <Pressable onPress={onPick} disabled={busy}
      style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: dragOver ? C.brand : C.line, backgroundColor: dragOver ? C.brand + '12' : C.surface2 + '80', borderRadius: 14, paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', gap: 6 }}>
      {busy ? <ActivityIndicator color={C.brand} /> : <Ionicons name="cloud-upload-outline" size={28} color={C.brand} />}
      <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600', textAlign: 'center' }}>
        {canDrop ? 'Arrastra tu archivo aquí o ' : ''}<Text style={{ color: C.brand }}>{canDrop ? 'elige uno' : 'Elegir archivo'}</Text>
      </Text>
      <Text style={{ color: C.muted, fontSize: 12 }}>.csv (separado por , o ;) o .json</Text>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
      {canDrop
        ? React.createElement('div', {
            onDragOver: (e: any) => { e.preventDefault(); setDragOver(true); },
            onDragLeave: () => setDragOver(false),
            onDrop: (e: any) => {
              e.preventDefault(); setDragOver(false);
              const f = e.dataTransfer?.files?.[0];
              if (f) onDropFile(f);
            },
          }, zona)
        : zona}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text style={{ color: C.muted, fontSize: 12.5 }}>Plantillas:</Text>
        <Pressable onPress={() => saveFile('plantilla_tareas.csv', encodeUtf8(TEMPLATE_CSV, true), 'text/csv')} hitSlop={6}>
          <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>Descargar CSV</Text>
        </Pressable>
        <Text style={{ color: C.muted }}>·</Text>
        <Pressable onPress={() => saveFile('plantilla_tareas.json', TEMPLATE_JSON, 'application/json')} hitSlop={6}>
          <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>Descargar JSON</Text>
        </Pressable>
      </View>

      {/* pegar */}
      <View>
        <TextInput value={paste} onChangeText={setPaste} multiline
          placeholder="…o pega aquí el JSON que te dio la IA (o el contenido de un CSV)"
          placeholderTextColor={C.muted}
          style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 12, fontSize: 13, minHeight: 74, maxHeight: 160, textAlignVertical: 'top', fontFamily: isWeb ? 'ui-monospace, Menlo, monospace' : undefined }} />
        {paste.trim().length > 0 && (
          <Pressable onPress={onPasteSubmit} disabled={busy}
            style={{ alignSelf: 'flex-end', marginTop: 8, backgroundColor: C.brand, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 }}>
            <Text style={{ color: C.onBrand, fontWeight: '700', fontSize: 13 }}>Revisar texto pegado</Text>
          </Pressable>
        )}
      </View>

      {/* IA */}
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: C.brand + '55', backgroundColor: C.brand + '12', padding: 16, gap: 11 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 220, gap: 5 }}>
            <Text style={{ color: C.text, fontSize: 15.5, fontWeight: '700' }}>Planéalo con IA</Text>
            <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 18 }}>
              Copia el prompt, pégalo en tu IA junto con el enunciado del proyecto y pega aquí arriba el JSON que te devuelva.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
              <MiniChip text={`${editores} ${editores === 1 ? 'integrante' : 'integrantes'}`} />
              {subjectName ? <MiniChip text={subjectName} /> : null}
              <MiniChip text={`${ctxColumns.length} columnas`} />
              {deadline ? <MiniChip text={`Entrega ${formatHuman(deadline)}`} /> : null}
            </View>
          </View>
          <Pressable onPress={copiar}
            style={{ backgroundColor: copiado ? C.good : C.brand, borderRadius: 12, height: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name={copiado ? 'checkmark' : isWeb ? 'copy-outline' : 'share-outline'} size={17} color="#0f1115" />
            <Text style={{ color: C.onBrand, fontWeight: '700' }}>{copiado ? 'Prompt copiado' : isWeb ? 'Copiar prompt para IA' : 'Compartir prompt para IA'}</Text>
          </Pressable>
        </View>

        <TextInput value={entregaFinal} onChangeText={setEntregaFinal}
          placeholder="Entrega final del proyecto (opcional), ej. 30/10/2026 6:00 pm"
          placeholderTextColor={C.muted}
          style={{ backgroundColor: C.surface, borderColor: entregaFinal && !deadline ? C.bad : C.line, borderWidth: 1, borderRadius: 10, color: C.text, paddingVertical: 9, paddingHorizontal: 11, fontSize: 13 }} />

        <Pressable onPress={() => setVerPrompt((v) => !v)} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '600' }}>{verPrompt ? 'Ocultar prompt' : 'Ver prompt'}</Text>
        </Pressable>
        {verPrompt && (
          <ScrollView style={{ maxHeight: 200, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.line }} contentContainerStyle={{ padding: 12 }}>
            <Text selectable style={{ color: C.text, fontSize: 11.5, lineHeight: 17, fontFamily: isWeb ? 'ui-monospace, Menlo, monospace' : undefined }}>{prompt}</Text>
          </ScrollView>
        )}
      </View>

      <Text style={{ color: C.muted, fontSize: 11.5, lineHeight: 17 }}>
        ¿Quieres cambiar muchas tareas que ya existen? Usa «Exportar», edita el archivo y súbelo aquí: se actualizan en vez de duplicarse.
      </Text>
    </ScrollView>
  );
}

// ============================================================
//  Piezas
// ============================================================

const rowBox = { backgroundColor: C.surface2 + '66', borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 11, marginBottom: 8 } as const;

function TaskRow({ task, issues, colLabel, who, duplicate, dupPolicy, editing, onToggleSkip, onEdit, cell, setCell }: {
  task: NormalizedTask; issues: RowIssue[]; colLabel: string; who: string;
  duplicate: boolean; dupPolicy: DuplicatePolicy; editing: boolean;
  onToggleSkip: () => void; onEdit: () => void;
  cell: (f: Field) => string; setCell: (f: Field, v: string) => void;
}) {
  const hasError = issues.some((i) => i.level === 'error');
  const hasWarn = issues.some((i) => i.level === 'warning');
  const icon = task.skip ? 'remove-circle-outline' : hasError ? 'close-circle' : hasWarn ? 'alert-circle' : 'checkmark-circle';
  const color = task.skip ? C.muted : hasError ? C.bad : hasWarn ? C.warn : C.good;
  const willSkipDup = duplicate && dupPolicy === 'omitir';

  return (
    <View style={[rowBox, { opacity: task.skip || willSkipDup ? 0.55 : 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
        <Ionicons name={icon as any} size={18} color={color} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>
            {task.title ?? <Text style={{ color: C.muted, fontStyle: 'italic' }}>Sin título</Text>}
          </Text>
          <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 3 }}>
            Fila {task.row} · {colLabel} · {who}
            {task.due_at ? ` · ${formatHuman(task.due_at)}` : ''}
            {task.checklist?.length ? ` · ${task.checklist.length} ítems` : ''}
          </Text>
          {duplicate && (
            <Text style={{ color: C.warn, fontSize: 11.5, marginTop: 3 }}>
              Ya existe en el proyecto · {dupPolicy === 'omitir' ? 'se omitirá' : dupPolicy === 'actualizar' ? 'se actualizará' : 'se creará otra'}
            </Text>
          )}
          {issues.map((i, k) => (
            <Text key={k} style={{ color: i.level === 'error' ? C.bad : C.warn, fontSize: 11.5, marginTop: 3 }}>
              {i.field !== 'row' ? `${FIELD_LABELS[i.field]}: ` : ''}{i.message}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable onPress={onEdit} hitSlop={6} accessibilityLabel="Corregir fila" style={{ padding: 4 }}>
            <Ionicons name={editing ? 'chevron-up' : 'create-outline'} size={17} color={C.muted} />
          </Pressable>
          <Pressable onPress={onToggleSkip} hitSlop={6} accessibilityLabel={task.skip ? 'Incluir fila' : 'Omitir fila'} style={{ padding: 4 }}>
            <Ionicons name={task.skip ? 'add-circle-outline' : 'remove-circle-outline'} size={17} color={C.muted} />
          </Pressable>
        </View>
      </View>

      {editing && (
        <View style={{ marginTop: 10, gap: 8 }}>
          {(['title', 'status', 'assignee', 'start', 'due'] as Field[]).map((f) => (
            <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: C.muted, fontSize: 12, width: 92 }}>{FIELD_LABELS[f]}</Text>
              <TextInput defaultValue={cell(f)} onEndEditing={(e) => setCell(f, e.nativeEvent.text)}
                onBlur={(e: any) => { const v = e?.nativeEvent?.text ?? e?.target?.value; if (typeof v === 'string') setCell(f, v); }}
                placeholder={f === 'start' || f === 'due' ? '15/10/2026 2:30 pm' : f === 'assignee' ? 'correo o nombre' : ''}
                placeholderTextColor={C.muted}
                style={{ flex: 1, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 9, color: C.text, paddingVertical: 7, paddingHorizontal: 10, fontSize: 13 }} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const ASSIGNABLE: Field[] = ['title', 'description', 'status', 'assignee', 'start', 'due', 'checklist', 'id', 'delete'];

function MappingEditor({ mapping, onChange }: { mapping: ColumnMapping; onChange: (m: ColumnMapping) => void }) {
  const unmapped = unmappedHeaders(mapping);
  if (!unmapped.length) return null;
  const used = new Set(Object.values(mapping).filter(Boolean) as Field[]);
  const free = ASSIGNABLE.filter((f) => !used.has(f));
  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>Columnas que no reconocí</Text>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 3, marginBottom: 6 }}>Se ignoran, a menos que les digas qué son.</Text>
      {unmapped.map((h) => (
        <View key={h} style={{ marginTop: 6 }}>
          <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600', marginBottom: 5 }}>«{h}»</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {free.map((f) => (
              <Pressable key={f} onPress={() => onChange({ ...mapping, [h]: f })}
                style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: R.pill, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ color: C.muted, fontSize: 11.5 }}>{FIELD_LABELS[f]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Chip({ icon, color, text }: { icon: string; color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: color + '1c' }}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={{ color, fontSize: 12.5, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

function MiniChip({ text }: { text: string }) {
  return (
    <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: R.pill, backgroundColor: C.surface }}>
      <Text style={{ color: C.text, fontSize: 11, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

function Note({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 10, backgroundColor: color + '14', padding: 10, marginBottom: 10 }}>
      <Ionicons name="information-circle" size={16} color={color} style={{ marginTop: 1 }} />
      <Text style={{ color: C.text, fontSize: 12.5, flex: 1, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}
