import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C, R } from '../../lib/theme';
import { Badge, Button, EmptyState, ErrorState, Field, IconButton, Skeleton } from '../ds';
import { confirm, friendlyError, notify, toast } from '../../lib/feedback';
import { pickAnyFile, readWebAny } from '../../lib/fileIO';
import { Member, nameOf } from '../../lib/projects';
import {
  FileVersion, NeedsV15, ProjectFile, Upload,
  deleteProjectFile, fileUrl, getFileVersions, getProjectFiles, hasFileVersions,
  restoreVersion, updateFileInfo, uploadNewFile, uploadVersion,
} from '../../lib/projectFiles';
import { KIND_ICON, MAX_FILE_BYTES, humanSize, kindOf, matchExisting, previewable, whenLabel } from '../../lib/fileVersions';

// ============================================================
//  Pestaña "Archivos" de un proyecto.
//
//  · Subir un archivo nuevo, o una versión nueva de uno que ya está.
//  · Si el nombre se parece a uno existente ("informe_v2.docx" frente a
//    "informe.docx"), se propone guardarlo como versión de ese.
//  · Cada archivo tiene su historial: abrir, descargar o restaurar cualquier
//    versión. Restaurar no borra nada: crea una versión nueva igual a la vieja.
//  · En la computadora se puede soltar un archivo sobre la lista (archivo
//    nuevo) o sobre una fila (versión nueva de ese archivo).
// ============================================================

const isWeb = Platform.OS === 'web';
const FINE_POINTER = (() => {
  try { return isWeb && typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
})();

type Pending = { projectId: string; upload: Upload; target: ProjectFile | null; suggested: ProjectFile | null };

export function ProjectFiles({ projectId, members, editable, isWide, onChanged }: {
  projectId: string; members: Member[]; editable: boolean; isWide: boolean; onChanged?: () => void;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(true);          // ¿está corrida la v15?
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [detail, setDetail] = useState<ProjectFile | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);  // 'list' o id de archivo

  const load = useCallback(async () => {
    try {
      setError(null);
      const [fs, ok] = await Promise.all([getProjectFiles(projectId), hasFileVersions()]);
      setFiles(fs); setReady(ok);
    } catch (e) { setError(friendlyError(e)); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const who = useCallback((id: string | null) => {
    if (!id) return 'Alguien';
    const m = members.find((x) => x.user_id === id);
    return m ? nameOf(m.profile) : 'Alguien';
  }, [members]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!files) return [];
    return q ? files.filter((f) => f.name.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q)) : files;
  }, [files, query]);

  function stage(upload: Upload, target: ProjectFile | null) {
    if (!ready) { notify('Falta un paso en Supabase', 'Para guardar versiones hay que correr supabase/schema_v15.sql una vez. Está explicado en RUNBOOK.md.'); return; }
    if (upload.size > MAX_FILE_BYTES) { notify('Archivo muy grande', `"${upload.name}" pesa ${humanSize(upload.size)}. El máximo es ${humanSize(MAX_FILE_BYTES)}.`); return; }
    const suggested = target ? null : matchExisting(upload.name, files ?? []);
    setPending({ projectId, upload, target, suggested });
  }

  async function pick(target: ProjectFile | null) {
    try {
      const f = await pickAnyFile();
      if (f) stage(f, target);
    } catch (e) { notify('No se pudo leer el archivo', friendlyError(e)); }
  }

  async function onDropFiles(list: FileList | null | undefined, target: ProjectFile | null) {
    setDragOver(null);
    if (!editable || !list || !list.length) return;
    if (list.length > 1) toast('Se toma un archivo a la vez: subo el primero.');
    try { stage(await readWebAny(list[0]), target); } catch (e) { notify('No se pudo leer el archivo', friendlyError(e)); }
  }

  async function open(f: { name: string; path: string; mime: string | null }) {
    try {
      if (previewable(f.name, f.mime)) {
        const url = await fileUrl(f.path);
        router.push({ pathname: '/visor', params: { url, name: f.name, mime: f.mime ?? '' } });
      } else {
        await Linking.openURL(await fileUrl(f.path, f.name));
      }
    } catch (e) { notify('No se pudo abrir', friendlyError(e)); }
  }
  async function download(f: { name: string; path: string }) {
    try { await Linking.openURL(await fileUrl(f.path, f.name)); } catch (e) { notify('No se pudo descargar', friendlyError(e)); }
  }

  const list = (
    <View>
      {/* encabezado */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>Archivos del proyecto</Text>
          <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>
            Cada vez que subes una versión nueva, la anterior queda guardada en el historial.
          </Text>
        </View>
        {editable && <Button label="Subir archivo" icon="cloud-upload-outline" size="sm" onPress={() => pick(null)} />}
      </View>

      {!ready && (
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.warn + '66', backgroundColor: C.warn + '14', marginBottom: 12 }}>
          <Ionicons name="construct-outline" size={18} color={C.warnText} />
          <Text style={{ color: C.text, fontSize: 13, flex: 1, lineHeight: 19 }}>
            Las versiones de archivos todavía no están activadas en la base. Quien administra Kaderno debe correr
            <Text style={{ fontWeight: '700' }}> supabase/schema_v15.sql</Text> (ver RUNBOOK.md).
          </Text>
        </View>
      )}

      {(files?.length ?? 0) > 6 && (
        <Field placeholder="Buscar archivo" value={query} onChangeText={setQuery} accessibilityLabel="Buscar archivo"
          right={query ? <IconButton icon="close" label="Borrar búsqueda" size={16} onPress={() => setQuery('')} /> : undefined} />
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : files === null ? (
        <><Skeleton /><Skeleton /><Skeleton /></>
      ) : files.length === 0 ? (
        <EmptyState icon="folder-open-outline" title="Todavía no hay archivos"
          text={editable
            ? (FINE_POINTER ? 'Sube el informe, la presentación o los datos del grupo. También puedes soltar un archivo aquí.' : 'Sube el informe, la presentación o los datos del grupo. Cada versión queda guardada.')
            : 'Cuando alguien del equipo suba un archivo, aparecerá aquí.'}
          action={editable ? { label: 'Subir el primero', icon: 'cloud-upload-outline', onPress: () => pick(null) } : undefined} />
      ) : shown.length === 0 ? (
        <Text style={{ color: C.muted, paddingVertical: 16, textAlign: 'center' }}>Ningún archivo coincide con “{query}”.</Text>
      ) : (
        <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.surface, overflow: 'hidden' }}>
          {shown.map((f, i) => (
            <RowDrop key={f.id} enabled={editable && FINE_POINTER}
              onOver={() => setDragOver(f.id)} onLeave={() => setDragOver((d) => (d === f.id ? 'list' : d))}
              onDrop={(fl) => onDropFiles(fl, f)}>
              <FileRow file={f} first={i === 0} who={who} editable={editable} isWide={isWide}
                highlight={dragOver === f.id}
                onOpen={() => setDetail(f)} onPreview={() => open(f)} onNewVersion={() => pick(f)} />
            </RowDrop>
          ))}
        </View>
      )}
      {editable && FINE_POINTER && (files?.length ?? 0) > 0 && (
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          Suelta un archivo sobre una fila para subirlo como versión nueva de ese archivo.
        </Text>
      )}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: isWide ? 22 : 14, paddingBottom: 60, maxWidth: 920, width: '100%', alignSelf: 'center' }}>
      <ListDrop enabled={editable && FINE_POINTER} active={dragOver === 'list'}
        onOver={() => setDragOver((d) => d ?? 'list')} onLeave={() => setDragOver(null)}
        onDrop={(fl) => onDropFiles(fl, null)}>
        {list}
      </ListDrop>

      <UploadDialog
        pending={pending}
        onClose={() => setPending(null)}
        onDone={async (msg, file) => { setPending(null); toast(msg, { tone: 'good' }); await load(); onChanged?.(); if (detail && file && detail.id === file.id) setDetail({ ...file }); }}
      />
      <FileSheet
        file={detail ? (files?.find((x) => x.id === detail.id) ?? detail) : null}
        who={who}
        editable={editable}
        onClose={() => setDetail(null)}
        onOpen={open}
        onDownload={download}
        onNewVersion={(f) => pick(f)}
        onChanged={async () => { await load(); onChanged?.(); }}
        onDeleted={async () => { setDetail(null); await load(); onChanged?.(); }}
      />
    </ScrollView>
  );
}

// ---------- Fila ----------

function FileRow({ file, first, who, editable, isWide, highlight, onOpen, onPreview, onNewVersion }: {
  file: ProjectFile; first: boolean; who: (id: string | null) => string; editable: boolean; isWide: boolean; highlight: boolean;
  onOpen: () => void; onPreview: () => void; onNewVersion: () => void;
}) {
  const kind = kindOf(file.name, file.mime);
  const meta = [
    `v${file.current_version}`,
    humanSize(file.size),
    `${whenLabel(file.updated_at)}${isWide ? ` por ${who(file.updated_by ?? file.uploaded_by)}` : ''}`,
  ].filter(Boolean).join(' · ');
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 6,
      borderTopWidth: first ? 0 : 1, borderTopColor: C.line,
      backgroundColor: highlight ? C.brand + '1f' : 'transparent',
      borderWidth: highlight ? 2 : 0, borderColor: C.brand,
    }}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${file.name}, versión ${file.current_version}. Ver historial`}
        style={({ pressed, hovered }: any) => ({
          flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 14, paddingRight: 6,
          backgroundColor: !highlight && (pressed || hovered) ? C.surface2 : 'transparent',
        })}>
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.brand + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={KIND_ICON[kind] as any} size={20} color={C.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }}>{file.name}</Text>
          <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{highlight ? 'Suelta para subir una versión nueva' : meta}</Text>
          {!!file.description && !highlight && <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12.5, marginTop: 1 }}>{file.description}</Text>}
        </View>
      </Pressable>
      <IconButton icon={previewable(file.name, file.mime) ? 'eye-outline' : 'download-outline'} label={previewable(file.name, file.mime) ? `Ver ${file.name}` : `Descargar ${file.name}`} onPress={onPreview} />
      {editable && isWide && <IconButton icon="cloud-upload-outline" label={`Subir versión nueva de ${file.name}`} onPress={onNewVersion} />}
      {isWide && <IconButton icon="time-outline" label={`Historial de ${file.name}`} onPress={onOpen} />}
    </View>
  );
}

// ---------- Ventana: confirmar la subida ----------

function UploadDialog({ pending, onClose, onDone }: {
  pending: Pending | null; onClose: () => void; onDone: (msg: string, file?: ProjectFile) => void;
}) {
  const [asVersion, setAsVersion] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const last = useRef<Pending | null>(null);
  if (pending !== last.current) {
    last.current = pending;
    if (pending) { setAsVersion(true); setNote(''); setBusy(false); }
  }
  if (!pending) return null;
  const { projectId, upload, target, suggested } = pending;
  const versionOf = target ?? (asVersion ? suggested : null);

  async function go() {
    setBusy(true);
    try {
      if (versionOf) {
        const n = await uploadVersion(versionOf, upload, note);
        onDone(`Versión ${n} de “${versionOf.name}” guardada`, { ...versionOf, current_version: n });
      } else {
        await uploadNewFile(projectId, upload, { description: note });
        onDone(`“${upload.name}” subido`);
      }
    } catch (e) {
      setBusy(false);
      if (e instanceof NeedsV15) notify('Falta un paso en Supabase', e.message);
      else notify('No se pudo subir', friendlyError(e));
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <Pressable onPress={busy ? undefined : onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 480 }}>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{versionOf ? 'Subir versión nueva' : 'Subir archivo'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: C.surface2 }}>
            <Ionicons name={KIND_ICON[kindOf(upload.name, upload.mime)] as any} size={20} color={C.brand} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: C.text, fontWeight: '700' }}>{upload.name}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>{humanSize(upload.size)}</Text>
            </View>
          </View>

          {target ? (
            <Text style={{ color: C.muted, fontSize: 13, marginTop: 12, lineHeight: 19 }}>
              Se guardará como <Text style={{ color: C.text, fontWeight: '700' }}>versión {target.current_version + 1}</Text> de “{target.name}”. La versión {target.current_version} queda en el historial.
            </Text>
          ) : suggested ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={{ color: C.muted, fontSize: 13 }}>Se parece a un archivo que ya está en el proyecto:</Text>
              <Choice on={asVersion} onPress={() => setAsVersion(true)} title={`Versión ${suggested.current_version + 1} de “${suggested.name}”`} hint="Recomendado: mantiene todo el historial junto" />
              <Choice on={!asVersion} onPress={() => setAsVersion(false)} title="Como archivo aparte" hint="Aparece como otro archivo en la lista" />
            </View>
          ) : null}

          <Field
            label={versionOf ? '¿Qué cambió? (opcional)' : 'Descripción (opcional)'}
            placeholder={versionOf ? 'Ej.: corregí la introducción y las gráficas' : 'Ej.: borrador del informe final'}
            value={note} onChangeText={setNote} maxLength={500} multiline
            style={{ marginTop: 14 }} inputStyle={{ minHeight: 60, textAlignVertical: 'top' }}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <Button label="Cancelar" kind="ghost" onPress={onClose} disabled={busy} />
            <Button label={busy ? 'Subiendo…' : versionOf ? 'Guardar versión' : 'Subir'} icon="cloud-upload-outline" busy={busy} onPress={go} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function Choice({ on, onPress, title, hint }: { on: boolean; onPress: () => void; title: string; hint: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand + '12' : 'transparent' }}>
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? C.brand : C.muted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 13.5 }}>{title}</Text>
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>{hint}</Text>
      </View>
    </Pressable>
  );
}

// ---------- Ventana: detalle e historial ----------

function FileSheet({ file, who, editable, onClose, onOpen, onDownload, onNewVersion, onChanged, onDeleted }: {
  file: ProjectFile | null; who: (id: string | null) => string; editable: boolean;
  onClose: () => void;
  onOpen: (f: { name: string; path: string; mime: string | null }) => void;
  onDownload: (f: { name: string; path: string }) => void;
  onNewVersion: (f: ProjectFile) => void;
  onChanged: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}) {
  const [versions, setVersions] = useState<FileVersion[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const fileId = file?.id ?? null;
  const stamp = file ? `${file.id}:${file.current_version}` : '';
  useEffect(() => {
    if (!fileId) { setVersions(null); setEditing(false); return; }
    setErr(null);
    getFileVersions(fileId).then(setVersions).catch((e) => setErr(e instanceof NeedsV15 ? e.message : friendlyError(e)));
  }, [fileId, stamp]);

  if (!file) return null;
  const current = file;

  async function saveInfo() {
    setBusy('info');
    try { await updateFileInfo(current, { name, description: desc }); setEditing(false); toast('Cambios guardados'); await onChanged(); }
    catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(null); }
  }
  async function restore(v: FileVersion) {
    const ok = await confirm(`¿Volver a la versión ${v.version}?`,
      `Se creará la versión ${current.current_version + 1} con el contenido de la ${v.version}. No se pierde ninguna versión.`, 'Restaurar');
    if (!ok) return;
    setBusy(v.id);
    try { const n = await restoreVersion(current, v); toast(`Listo: la versión ${n} es igual a la ${v.version}`, { tone: 'good' }); await onChanged(); }
    catch (e) { notify('No se pudo restaurar', friendlyError(e)); }
    finally { setBusy(null); }
  }
  async function remove() {
    const n = versions?.length ?? current.current_version;
    const ok = await confirm(`¿Eliminar “${current.name}”?`,
      `Se borran el archivo y ${n === 1 ? 'su única versión' : `sus ${n} versiones`} para todo el equipo. No se puede deshacer.`, 'Eliminar');
    if (!ok) return;
    setBusy('delete');
    try { await deleteProjectFile(current); toast('Archivo eliminado'); await onDeleted(); }
    catch (e) { notify('No se pudo eliminar', friendlyError(e)); setBusy(null); }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 620, maxHeight: '92%', overflow: 'hidden' }}>
          {/* cabecera */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: C.brand + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={KIND_ICON[kindOf(current.name, current.mime)] as any} size={21} color={C.brand} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>{current.name}</Text>
              <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>Versión actual: {current.current_version} · {humanSize(current.size)}</Text>
            </View>
            <IconButton icon="close" label="Cerrar" onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {editing ? (
              <View>
                <Field label="Nombre" value={name} onChangeText={setName} maxLength={200} />
                <Field label="Descripción" value={desc} onChangeText={setDesc} maxLength={500} multiline inputStyle={{ minHeight: 56, textAlignVertical: 'top' }} />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                  <Button label="Cancelar" kind="ghost" size="sm" onPress={() => setEditing(false)} />
                  <Button label="Guardar" size="sm" busy={busy === 'info'} onPress={saveInfo} />
                </View>
              </View>
            ) : (
              <>
                {!!current.description && <Text style={{ color: C.text, fontSize: 14, lineHeight: 20, marginBottom: 12 }}>{current.description}</Text>}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {previewable(current.name, current.mime) && <Button label="Ver" icon="eye-outline" size="sm" kind="secondary" onPress={() => onOpen(current)} />}
                  <Button label="Descargar" icon="download-outline" size="sm" kind="secondary" onPress={() => onDownload(current)} />
                  {editable && <Button label="Subir versión nueva" icon="cloud-upload-outline" size="sm" onPress={() => onNewVersion(current)} />}
                  {editable && <Button label="Editar datos" icon="create-outline" size="sm" kind="ghost" onPress={() => { setName(current.name); setDesc(current.description ?? ''); setEditing(true); }} />}
                </View>
              </>
            )}

            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 20, marginBottom: 8 }}>
              Historial{versions ? ` · ${versions.length} ${versions.length === 1 ? 'versión' : 'versiones'}` : ''}
            </Text>
            {err ? (
              <Text style={{ color: C.badText, fontSize: 13 }}>{err}</Text>
            ) : versions === null ? (
              <ActivityIndicator color={C.brand} style={{ marginVertical: 16 }} />
            ) : versions.map((v) => {
              const isCurrent = v.version === current.current_version;
              const same = !isCurrent && v.path === current.path;
              const label = v.name ?? current.name;
              return (
                <View key={v.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line }}>
                  <View style={{ alignItems: 'center', width: 38 }}>
                    <View style={{ minWidth: 34, paddingVertical: 3, paddingHorizontal: 6, borderRadius: R.pill, backgroundColor: isCurrent ? C.brand : C.surface2, alignItems: 'center' }}>
                      <Text style={{ color: isCurrent ? C.onBrand : C.text, fontSize: 12, fontWeight: '800' }}>v{v.version}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text numberOfLines={1} style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flexShrink: 1 }}>{v.note ?? (v.version === 1 ? 'Primera versión' : 'Sin nota')}</Text>
                      {isCurrent && <Badge text="Actual" color={C.good} />}
                      {v.restored_from != null && <Badge text={`igual a v${v.restored_from}`} />}
                    </View>
                    <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                      {who(v.uploaded_by)} · {whenLabel(v.created_at)}{v.size ? ` · ${humanSize(v.size)}` : ''}{label !== current.name ? ` · ${label}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                      {previewable(label, v.mime) && <LinkBtn label="Ver" onPress={() => onOpen({ name: label, path: v.path, mime: v.mime })} />}
                      <LinkBtn label="Descargar" onPress={() => onDownload({ name: versionedName(label, v.version), path: v.path })} />
                      {editable && !isCurrent && !same && (busy === v.id ? <ActivityIndicator size="small" color={C.brand} /> : <LinkBtn label="Restaurar" onPress={() => restore(v)} />)}
                    </View>
                  </View>
                </View>
              );
            })}

            {editable && !editing && (
              <Pressable onPress={remove} disabled={busy === 'delete'} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, alignSelf: 'flex-start', paddingVertical: 8 }}>
                {busy === 'delete' ? <ActivityIndicator size="small" color={C.bad} /> : <Ionicons name="trash-outline" size={16} color={C.badText} />}
                <Text style={{ color: C.badText, fontWeight: '700', fontSize: 13.5 }}>Eliminar archivo y su historial</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LinkBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Text style={{ color: C.brand, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** "informe.docx", versión 2 -> "informe (v2).docx" para no pisar descargas. */
function versionedName(name: string, v: number): string {
  const m = /^(.*?)(\.[a-z0-9]{1,8})?$/i.exec(name);
  return `${m?.[1] ?? name} (v${v})${m?.[2] ?? ''}`;
}

// ---------- Soltar archivos (solo web con ratón) ----------

function hasFiles(e: any): boolean {
  try { return Array.from(e.dataTransfer?.types ?? []).includes('Files'); } catch { return false; }
}

function ListDrop({ enabled, active, onOver, onLeave, onDrop, children }: {
  enabled: boolean; active: boolean; onOver: () => void; onLeave: () => void; onDrop: (f: FileList) => void; children: React.ReactNode;
}) {
  const depth = useRef(0);
  if (!enabled) return <>{children}</>;
  return React.createElement('div', {
    onDragEnter: (e: any) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current += 1; onOver(); },
    onDragOver: (e: any) => { if (!hasFiles(e)) return; e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch { /* */ } },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) onLeave(); },
    onDrop: (e: any) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current = 0; onDrop(e.dataTransfer.files); },
    style: { borderRadius: 16, outline: active ? `2px dashed ${C.brand}` : 'none', outlineOffset: 6, transition: 'outline-color .1s' },
  }, children);
}

function RowDrop({ enabled, onOver, onLeave, onDrop, children }: {
  enabled: boolean; onOver: () => void; onLeave: () => void; onDrop: (f: FileList) => void; children: React.ReactNode;
}) {
  const depth = useRef(0);
  if (!enabled) return <>{children}</>;
  return React.createElement('div', {
    onDragEnter: (e: any) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current += 1; onOver(); },
    onDragOver: (e: any) => { if (!hasFiles(e)) return; e.preventDefault(); },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) onLeave(); },
    onDrop: (e: any) => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); depth.current = 0; onDrop(e.dataTransfer.files); },
  }, children);
}
