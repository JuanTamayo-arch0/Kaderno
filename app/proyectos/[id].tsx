import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RequireAuth } from '../../components/RequireAuth';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, R, shadow, uiScheme, SUBJECT_COLORS } from '../../lib/theme';
import { useResponsive, SIDEBAR_W } from '../../lib/responsive';
import { confirm, notify } from '../../lib/confirm';
import { ProgressBar } from '../../components/ProgressBar';
import { SideNav } from '../../components/SideNav';
import { useAuth } from '../../lib/auth';
import { ImportSheet } from '../../components/projects/ImportSheet';
import { BulkAction, BulkBar, BulkDialog, ExportSheet, confirmBulkDelete } from '../../components/projects/BulkTools';
import { undoProjectBatch } from '../../lib/projectsBulk';
import { Subject, getSubjects } from '../../lib/db';
import {
  Activity, BoardColumn, Load, Member, PStep, PTask, Profile, Project, ProjectRole,
  DEFAULT_COLUMNS,
  addProjectStep, addProjectTask, canEdit, colorOf, columnsOf, deleteProject,
  deleteProjectStep, deleteProjectTask, getActivity, getMembers, getProject,
  getProjectSteps, getProjectTasks, initialsOf, leaveProject, logActivity, moveTask,
  myRole, nameOf, regenJoinCode, removeMember, setBoardColumns, setMemberRole,
  toggleProjectStep, updateProjectTask, workload,
} from '../../lib/projects';

// ============================================================
//  Pantalla de un proyecto: Tablero, Lista y Equipo.
//
//  Sobre el arrastrar y soltar: en web NO se usa PanResponder ni una librería
//  de gestos. Se envuelven las tarjetas en un <div draggable> de verdad con
//  React.createElement, porque react-native-web no reenvía de forma fiable la
//  propiedad `draggable` de un <View>. El div va sin estilos propios (solo el
//  cursor): por dentro sigue habiendo Views normales, así que la tarjeta se ve
//  igual en los dos mundos. En móvil no hay arrastre nativo: cada tarjeta trae
//  un botón "mover" que abre la lista de columnas, que además es más cómodo con
//  el dedo que arrastrar en horizontal dentro de un carrusel que también scrollea.
// ============================================================

const isWeb = Platform.OS === 'web';

// ¿El dedo es el puntero? El arrastrar-y-soltar de HTML5 NO existe en los
// navegadores de celular: se puede arrastrar con el ratón, pero con el dedo el
// gesto se lo queda el scroll. Como Kaderno se entrega como web (también se
// abre desde el teléfono), no basta con preguntar por la plataforma: hay que
// preguntar por el puntero, y en ese caso mostrar el botón "mover".
const COARSE_POINTER = (() => {
  try {
    return isWeb && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  } catch { return false; }
})();

const VIEWS = [
  { key: 'tablero', label: 'Tablero', icon: 'grid-outline' },
  { key: 'lista', label: 'Lista', icon: 'list-outline' },
  { key: 'equipo', label: 'Equipo', icon: 'people-outline' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

function ProyectoDetalle() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const projectId = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');
  const router = useRouter();
  const { isWide } = useResponsive();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<PTask[]>([]);
  const [steps, setSteps] = useState<Record<string, PStep[]>>({});
  const [activity, setActivity] = useState<(Activity & { profile?: Profile | null })[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);

  const [view, setView] = useState<ViewKey>('tablero');
  const [editingTask, setEditingTask] = useState<PTask | null>(null);
  const [newIn, setNewIn] = useState<string | null>(null);   // clave de columna donde se crea
  const [colsModal, setColsModal] = useState(false);
  const [moving, setMoving] = useState<PTask | null>(null);  // tarjeta en el menú "mover a"

  // Importar / exportar / edición en masa
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [undo, setUndo] = useState<{ batchId: string; text: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);   // menú de acciones en el celular
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const p = await getProject(projectId);
      if (!p) { setGone(true); return; }
      const [ms, ts, st, ac, sj] = await Promise.all([
        getMembers(projectId),
        getProjectTasks(projectId),
        getProjectSteps(projectId),
        getActivity(projectId, 30),
        getSubjects(),
      ]);
      setProject(p); setMembers(ms); setTasks(ts); setSteps(st); setActivity(ac); setSubjects(sj);
    } catch (e: any) {
      notify('No se pudo abrir el proyecto', e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Igual que en la lista: sin websockets todavía, se recarga al volver.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cols = useMemo(() => columnsOf(project), [project]);
  const role: ProjectRole | null = useMemo(() => myRole(members, myId), [members, myId]);
  const editable = canEdit(role);
  const subject = subjects.find((s) => s.id === project?.subject_id) ?? null;

  // Tarjetas agrupadas por columna. Las que quedaron con un `status` que ya no
  // existe (porque alguien borró esa columna) se recogen en la primera, para que
  // no desaparezcan del tablero.
  const grouped = useMemo(() => {
    const known = new Set(cols.map((c) => c.key));
    const first = cols[0]?.key ?? 'todo';
    const out: Record<string, PTask[]> = {};
    cols.forEach((c) => { out[c.key] = []; });
    tasks.forEach((t) => {
      const k = known.has(t.status) ? t.status : first;
      (out[k] ??= []).push(t);
    });
    Object.values(out).forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return out;
  }, [tasks, cols]);

  const doneCount = tasks.filter((t) => t.done).length;

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function endSelecting() { setSelecting(false); setSelected(new Set()); }

  // Aviso con "Deshacer" tras cualquier cambio masivo. Se va solo a los 20 s.
  function showUndo(batchId: string, text: string) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ batchId, text });
    undoTimer.current = setTimeout(() => setUndo(null), 20000);
  }
  async function doUndo() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    try { await undoProjectBatch(u.batchId); await load(); }
    catch (e: any) { notify('No se pudo deshacer', e.message); }
  }
  async function onBulkAction(a: BulkAction) {
    const sel = tasks.filter((t) => selected.has(t.id));
    if (a !== 'borrar') return setBulkAction(a);
    try {
      const res = await confirmBulkDelete(projectId, sel);
      if (!res) return;
      endSelecting();
      await load();
      if (res.r.batch_id) showUndo(res.r.batch_id, res.text);
    } catch (e: any) { notify('No se pudo borrar', e.message); }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.push('/proyectos');
  }

  // Mueve una tarjeta a `colKey`, delante de `beforeId` (o al final si es null).
  async function drop(taskId: string, colKey: string, beforeId: string | null) {
    const colTasks = grouped[colKey] ?? [];
    const others = colTasks.filter((t) => t.id !== taskId);
    const idx = beforeId ? Math.max(0, others.findIndex((t) => t.id === beforeId)) : others.length;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    // Optimista: la tarjeta se pinta ya en su nueva columna y luego se confirma.
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: colKey } : t)));
    try {
      await moveTask(taskId, colKey, colTasks, idx);
      const label = cols.find((c) => c.key === colKey)?.label ?? colKey;
      if (task.status !== colKey) {
        await logActivity(projectId, 'task_move', `movió “${task.title}” a ${label}`, { task_id: taskId });
      }
    } catch (e: any) {
      notify('No se pudo mover', e.message);
    }
    load();
  }

  if (gone) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 30, paddingLeft: isWide ? SIDEBAR_W : 30 }}>
        {isWide && <SideNav active="proyectos" />}
        <Text style={{ fontSize: 34, marginBottom: 10 }}>🚪</Text>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Este proyecto ya no está disponible</Text>
        <Text style={{ color: C.muted, fontSize: 13, marginTop: 6, textAlign: 'center', maxWidth: 340, lineHeight: 20 }}>
          Puede que lo hayan borrado, o que te hayan sacado del equipo.
        </Text>
        <Pressable onPress={() => router.push('/proyectos')} style={{ marginTop: 18, backgroundColor: C.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 }}>
          <Text style={{ color: '#0f1115', fontWeight: '700' }}>Volver a proyectos</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: isWide ? SIDEBAR_W : 0 }}>
      {isWide && <SideNav active="proyectos" />}

      {/* ---------- Barra de arriba ---------- */}
      <View style={{ paddingTop: isWide ? 26 : 56, paddingHorizontal: isWide ? 32 : 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={goBack} hitSlop={10} accessibilityLabel="Volver">
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </Pressable>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: (project?.color ?? C.brand) + '26', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 17 }}>{project?.icon ?? '📦'}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>
              {project?.name ?? (loading ? 'Cargando…' : 'Proyecto')}
            </Text>
            <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>
              {members.length} {members.length === 1 ? 'integrante' : 'integrantes'}
              {subject ? ` · ${subject.name}` : ''}
              {tasks.length ? ` · ${doneCount}/${tasks.length} hechas` : ''}
              {role === 'viewer' ? ' · solo lectura' : ''}
            </Text>
          </View>
          {isWide ? (
            <>
              {editable && view !== 'equipo' && !selecting && (
                <HeaderBtn icon="checkbox-outline" label="Seleccionar" wide onPress={() => setSelecting(true)} />
              )}
              {editable && project && (
                <HeaderBtn icon="cloud-upload-outline" label="Importar" wide onPress={() => setImportOpen(true)} />
              )}
              {project && (
                <HeaderBtn icon="download-outline" label="Exportar" wide onPress={() => setExportOpen(true)} />
              )}
              {editable && view === 'tablero' && (
                <HeaderBtn icon="options-outline" label="Columnas" wide onPress={() => setColsModal(true)} />
              )}
            </>
          ) : project ? (
            <HeaderBtn icon="ellipsis-horizontal" label="Más opciones" wide={false} onPress={() => setMoreOpen(true)} />
          ) : null}
        </View>

        {/* pestañas */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {VIEWS.map((v) => {
            const on = v.key === view;
            return (
              <Pressable key={v.key} onPress={() => setView(v.key)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, backgroundColor: on ? C.brand : C.surface2, borderColor: on ? C.brand : C.line }}>
                <Ionicons name={v.icon as any} size={14} color={on ? '#0b0d11' : C.muted} />
                <Text style={{ color: on ? '#0b0d11' : C.text, fontSize: 13, fontWeight: on ? '700' : '500' }}>{v.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ---------- Cuerpo ---------- */}
      {loading ? (
        <Text style={{ color: C.muted, padding: 24 }}>Cargando…</Text>
      ) : view === 'tablero' ? (
        <Tablero
          cols={cols} grouped={grouped} steps={steps} members={members} subject={subject}
          editable={editable} isWide={isWide} myId={myId}
          selecting={selecting} selected={selected} onToggleSelect={toggleSelect}
          onOpen={setEditingTask}
          onAdd={(k) => setNewIn(k)}
          onMove={(t) => setMoving(t)}
          onDrop={drop}
        />
      ) : view === 'lista' ? (
        <Lista
          tasks={tasks} cols={cols} steps={steps} members={members}
          editable={editable} isWide={isWide}
          selecting={selecting} selected={selected} onToggleSelect={toggleSelect}
          onOpen={setEditingTask}
          onAdd={() => setNewIn(cols[0]?.key ?? 'todo')}
          onToggle={async (t) => {
            const doneCol = cols.find((c) => c.done)?.key;
            const openCol = cols.find((c) => !c.done)?.key ?? cols[0]?.key;
            const target = t.done ? openCol : doneCol;
            if (!target) return notify('Falta una columna final', 'Marca una columna como “termina aquí” para poder tachar tareas.');
            setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: target, done: !t.done } : x)));
            try {
              await updateProjectTask(t.id, { status: target });
              if (!t.done) await logActivity(projectId, 'task_done', `terminó “${t.title}”`, { task_id: t.id });
            } catch (e: any) { notify('No se pudo actualizar', e.message); }
            load();
          }}
        />
      ) : (
        <Equipo
          project={project} members={members} tasks={tasks} activity={activity}
          myId={myId} role={role} isWide={isWide}
          onChanged={load}
          onLeft={() => router.push('/proyectos')}
        />
      )}

      {/* ---------- Ventanas ---------- */}
      <PTaskModal
        visible={!!editingTask || !!newIn}
        task={editingTask}
        projectId={projectId}
        status={editingTask?.status ?? newIn ?? cols[0]?.key ?? 'todo'}
        cols={cols}
        members={members}
        steps={editingTask ? steps[editingTask.id] ?? [] : []}
        editable={editable}
        onClose={() => { setEditingTask(null); setNewIn(null); }}
        onSaved={() => { setEditingTask(null); setNewIn(null); load(); }}
        onStepsChanged={load}
      />

      <ColumnsModal
        visible={colsModal}
        cols={cols}
        counts={grouped}
        onClose={() => setColsModal(false)}
        onSave={async (next) => {
          try {
            await setBoardColumns(projectId, next);
            await logActivity(projectId, 'columns', 'cambió las columnas del tablero', {});
            setColsModal(false);
            load();
          } catch (e: any) { notify('No se pudieron guardar las columnas', e.message); }
        }}
      />

      <MoveMenu
        task={moving}
        cols={cols}
        onClose={() => setMoving(null)}
        onPick={(k) => { const t = moving; setMoving(null); if (t) drop(t.id, k, null); }}
      />

      <MoreMenu
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        items={[
          ...(editable && view !== 'equipo' && !selecting ? [{ icon: 'checkbox-outline', label: 'Seleccionar varias', hint: 'Cambiar columna, responsable o fechas a la vez', onPress: () => setSelecting(true) }] : []),
          ...(editable ? [{ icon: 'cloud-upload-outline', label: 'Importar tareas', hint: 'Desde un CSV, un JSON o una IA', onPress: () => setImportOpen(true) }] : []),
          { icon: 'download-outline', label: 'Exportar tareas', hint: 'Para editarlas en Excel y volver a subirlas', onPress: () => setExportOpen(true) },
          ...(editable && view === 'tablero' ? [{ icon: 'options-outline', label: 'Columnas del tablero', onPress: () => setColsModal(true) }] : []),
        ]}
      />

      {project && (
        <ImportSheet
          visible={importOpen}
          project={project}
          members={members}
          subjectName={subject?.name ?? null}
          onClose={() => setImportOpen(false)}
          onDone={async ({ batchId, text }) => {
            setImportOpen(false);
            await load();
            if (batchId) showUndo(batchId, text);
          }}
        />
      )}
      {project && (
        <ExportSheet visible={exportOpen} project={project} members={members} onClose={() => setExportOpen(false)} />
      )}

      <BulkDialog
        action={bulkAction}
        projectId={projectId}
        tasks={tasks.filter((t) => selected.has(t.id))}
        cols={cols}
        members={members}
        onClose={() => setBulkAction(null)}
        onDone={async (r, text) => {
          setBulkAction(null);
          endSelecting();
          await load();
          if (r.batch_id) showUndo(r.batch_id, text);
        }}
      />

      {selecting && view !== 'equipo' && (
        <BulkBar
          count={selected.size}
          total={tasks.length}
          isWide={isWide}
          onSelectAll={() => setSelected(new Set(tasks.map((t) => t.id)))}
          onClear={endSelecting}
          onAction={onBulkAction}
        />
      )}

      {undo && !selecting && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: isWide ? 22 : 16, alignItems: 'center', paddingHorizontal: 12, paddingLeft: isWide ? SIDEBAR_W + 12 : 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.text, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14, maxWidth: 560, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
            <Ionicons name="checkmark-circle" size={18} color={C.good} />
            <Text style={{ color: C.bg, fontSize: 13, fontWeight: '600', flexShrink: 1 }}>{undo.text}</Text>
            <Pressable onPress={doUndo} hitSlop={8}>
              <Text style={{ color: C.brand, fontSize: 13, fontWeight: '800' }}>Deshacer</Text>
            </Pressable>
            <Pressable onPress={() => setUndo(null)} hitSlop={8} accessibilityLabel="Cerrar aviso">
              <Ionicons name="close" size={16} color={C.bg} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function MoreMenu({ visible, items, onClose }: {
  visible: boolean; onClose: () => void;
  items: { icon: string; label: string; hint?: string; onPress: () => void }[];
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 14, paddingBottom: 30, borderTopWidth: 1, borderColor: C.line }}>
          {items.map((it) => (
            <Pressable key={it.label} onPress={() => { onClose(); it.onPress(); }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 10, borderRadius: 12, backgroundColor: pressed ? C.surface2 : 'transparent' })}>
              <Ionicons name={it.icon as any} size={20} color={C.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600' }}>{it.label}</Text>
                {it.hint ? <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>{it.hint}</Text> : null}
              </View>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 8 }}>
            <Text style={{ color: C.muted }}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HeaderBtn({ icon, label, wide, onPress }: { icon: string; label: string; wide: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2, borderRadius: R.pill, paddingVertical: 7, paddingHorizontal: wide ? 12 : 9 }}>
      <Ionicons name={icon as any} size={15} color={C.muted} />
      {wide && <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>}
    </Pressable>
  );
}

// ============================================================
//  Envoltorios de arrastrar y soltar (solo web)
// ============================================================

function Draggable({ id, enabled, onStart, onEnd, children }: {
  id: string; enabled: boolean; onStart: () => void; onEnd: () => void; children: React.ReactNode;
}) {
  if (!isWeb || !enabled) return <>{children}</>;
  return React.createElement('div', {
    draggable: true,
    onDragStart: (e: any) => {
      // Algunos navegadores no inician el arrastre si no hay datos puestos.
      try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch { /* da igual */ }
      onStart();
    },
    onDragEnd: onEnd,
    style: { cursor: 'grab' },
  }, children);
}

function DropZone({ enabled, onOver, onLeave, onDrop, grow, children }: {
  enabled: boolean; onOver: () => void; onLeave: () => void; onDrop: () => void;
  grow?: boolean; children: React.ReactNode;
}) {
  if (!isWeb || !enabled) return <>{children}</>;
  return React.createElement('div', {
    // stopPropagation para que una tarjeta y su columna no se peleen por el mismo
    // arrastre: gana la zona más interna, que es la que el dedo/ratón señala.
    onDragOver: (e: any) => { e.preventDefault(); e.stopPropagation(); try { e.dataTransfer.dropEffect = 'move'; } catch {} onOver(); },
    onDragLeave: (e: any) => { e.stopPropagation(); onLeave(); },
    onDrop: (e: any) => { e.preventDefault(); e.stopPropagation(); onDrop(); },
    style: grow ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : { display: 'block' },
  }, children);
}

// ============================================================
//  Vista TABLERO
// ============================================================

function Tablero({ cols, grouped, steps, members, subject, editable, isWide, myId, selecting, selected, onToggleSelect, onOpen, onAdd, onMove, onDrop }: {
  selecting: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  cols: BoardColumn[];
  grouped: Record<string, PTask[]>;
  steps: Record<string, PStep[]>;
  members: Member[];
  subject: Subject | null;
  editable: boolean;
  isWide: boolean;
  myId: string | null;
  onOpen: (t: PTask) => void;
  onAdd: (colKey: string) => void;
  onMove: (t: PTask) => void;
  onDrop: (taskId: string, colKey: string, beforeId: string | null) => void;
}) {
  const dragRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);  // "colKey|beforeId" o "colKey|end"

  const width = isWide ? 300 : 270;

  function fire(colKey: string, beforeId: string | null) {
    const id = dragRef.current;
    setOver(null); setDragId(null); dragRef.current = null;
    if (id) onDrop(id, colKey, beforeId);
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={isWide}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: isWide ? 24 : 12, gap: 12, alignItems: 'stretch' }}>
      {cols.map((col) => {
        const list = grouped[col.key] ?? [];
        const endKey = `${col.key}|end`;
        return (
          <View key={col.key} style={{ width, backgroundColor: C.surface + 'cc', borderRadius: R.lg, borderWidth: 1, borderColor: over?.startsWith(col.key + '|') ? col.color : C.line, padding: 10 }}>
            {/* cabecera de columna */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 2 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: col.color }} />
              <Text numberOfLines={1} style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>{col.label}</Text>
              <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>{list.length}</Text>
              {editable && (
                <Pressable onPress={() => onAdd(col.key)} hitSlop={8}>
                  <Ionicons name="add" size={17} color={C.muted} />
                </Pressable>
              )}
            </View>

            <DropZone
              enabled={editable}
              grow
              onOver={() => setOver(endKey)}
              onLeave={() => setOver((o) => (o === endKey ? null : o))}
              onDrop={() => fire(col.key, null)}
            >
              <ScrollView style={{ maxHeight: isWide ? 620 : 460 }} showsVerticalScrollIndicator={false}>
                {list.map((t) => {
                  const k = `${col.key}|${t.id}`;
                  return (
                    <View key={t.id}>
                      {/* línea que indica dónde va a caer la tarjeta */}
                      {over === k && <View style={{ height: 3, borderRadius: 2, backgroundColor: col.color, marginBottom: 6 }} />}
                      <DropZone
                        enabled={editable && dragId !== t.id}
                        onOver={() => setOver(k)}
                        onLeave={() => setOver((o) => (o === k ? null : o))}
                        onDrop={() => fire(col.key, t.id)}
                      >
                        <Draggable
                          id={t.id}
                          enabled={editable && !selecting}
                          onStart={() => { dragRef.current = t.id; setDragId(t.id); }}
                          onEnd={() => { dragRef.current = null; setDragId(null); setOver(null); }}
                        >
                          <TaskCard
                            task={t} steps={steps[t.id] ?? []} members={members} subject={subject}
                            color={col.color} dim={dragId === t.id} mine={!!myId && t.assignee_id === myId}
                            showMove={editable && !selecting && (!isWeb || !isWide || COARSE_POINTER)}
                            selecting={selecting} selected={selected.has(t.id)}
                            onPress={() => (selecting ? onToggleSelect(t.id) : onOpen(t))} onMove={() => onMove(t)}
                            onLongPress={editable ? () => onToggleSelect(t.id) : undefined}
                          />
                        </Draggable>
                      </DropZone>
                    </View>
                  );
                })}

                {over === endKey && <View style={{ height: 3, borderRadius: 2, backgroundColor: col.color, marginBottom: 6 }} />}

                {list.length === 0 && (
                  <View style={{ paddingVertical: 22, alignItems: 'center', borderWidth: 1, borderColor: C.line, borderStyle: 'dashed', borderRadius: 12 }}>
                    <Text style={{ color: C.muted, fontSize: 12 }}>Nada por aquí</Text>
                  </View>
                )}

                {editable && (
                  <Pressable onPress={() => onAdd(col.key)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' }}>
                    <Ionicons name="add" size={14} color={C.muted} />
                    <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>Agregar tarjeta</Text>
                  </Pressable>
                )}
              </ScrollView>
            </DropZone>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ---------- Tarjeta del tablero ----------

function TaskCard({ task, steps, members, subject, color, dim, mine, showMove, selecting, selected, onPress, onMove, onLongPress }: {
  task: PTask; steps: PStep[]; members: Member[]; subject: Subject | null;
  color: string; dim: boolean; mine: boolean; showMove: boolean;
  selecting: boolean; selected: boolean;
  onPress: () => void; onMove: () => void; onLongPress?: () => void;
}) {
  const who = members.find((m) => m.user_id === task.assignee_id) ?? null;
  const doneSteps = steps.filter((s) => s.done).length;
  const due = dueInfo(task, task.done);

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => ({
      backgroundColor: selected ? C.brand + '1a' : C.surface, borderRadius: 12, borderWidth: 1, borderColor: selected ? C.brand : mine ? C.brand + '77' : C.line,
      padding: 11, marginBottom: 8, opacity: dim ? 0.4 : pressed ? 0.8 : 1, borderLeftWidth: 3, borderLeftColor: color, ...shadow,
    })}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        {selecting && <SelectBox on={selected} />}
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600', flex: 1, lineHeight: 19, textDecorationLine: task.done ? 'line-through' : 'none' }}>
          {task.title}
        </Text>
        {showMove && (
          <Pressable onPress={onMove} hitSlop={8}>
            <Ionicons name="swap-horizontal" size={16} color={C.muted} />
          </Pressable>
        )}
      </View>

      {steps.length > 0 && (
        <View style={{ marginTop: 9 }}>
          <ProgressBar done={doneSteps} total={steps.length} height={5} compact />
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {who ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colorOf(who.user_id), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#0f1115', fontSize: 8.5, fontWeight: '800' }}>{initialsOf(who.profile)}</Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 11 }}>{nameOf(who.profile)}</Text>
          </View>
        ) : (
          <Text style={{ color: C.muted, fontSize: 11 }}>Sin asignar</Text>
        )}

        <View style={{ flex: 1 }} />

        {subject && <View style={{ paddingVertical: 2, paddingHorizontal: 7, borderRadius: R.pill, backgroundColor: subject.color + '22' }}>
          <Text style={{ color: subject.color, fontSize: 10, fontWeight: '700' }}>{subject.name}</Text>
        </View>}

        {due && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="calendar-outline" size={11} color={due.color} />
            <Text style={{ color: due.color, fontSize: 10.5, fontWeight: '700' }}>{due.label}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// Fecha en corto + color según lo apretado que esté. Devuelve null si no hay fecha.
// Si la tarea tiene hora (due_at distinta de las 11:59 p. m.), se muestra también.
function dueInfo(t: Pick<PTask, 'due_date' | 'due_at'>, done: boolean): { label: string; color: string } | null {
  const at = t.due_at ? new Date(t.due_at) : null;
  const d = at && !isNaN(at.getTime()) ? new Date(at) : t.due_date ? new Date(t.due_date + 'T00:00:00') : null;
  if (!d || isNaN(d.getTime())) return null;
  const hasTime = !!at && !(at.getHours() === 23 && at.getMinutes() === 59);
  d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  let label = days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : days === -1 ? 'Ayer'
    : days < 0 ? `Hace ${-days}d`
    : d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  if (hasTime && at) label += ` ${at.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' })}`;
  const late = at ? at.getTime() < Date.now() : days < 0;
  const color = done ? C.muted : late ? C.bad : days <= 2 ? C.warn : C.muted;
  return { label, color };
}

function SelectBox({ on }: { on: boolean }) {
  return (
    <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: on ? C.brand : C.muted, backgroundColor: on ? C.brand : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 0.5 }}>
      {on && <Ionicons name="checkmark" size={13} color="#0f1115" />}
    </View>
  );
}

// ---------- Menú "mover a" (móvil) ----------

function MoveMenu({ task, cols, onClose, onPick }: {
  task: PTask | null; cols: BoardColumn[]; onClose: () => void; onPick: (colKey: string) => void;
}) {
  return (
    <Modal visible={!!task} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, borderTopWidth: 1, borderColor: C.line }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Mover tarjeta</Text>
          <Text numberOfLines={2} style={{ color: C.muted, fontSize: 12.5, marginTop: 3, marginBottom: 12 }}>{task?.title}</Text>
          {cols.map((c) => {
            const on = c.key === task?.status;
            return (
              <Pressable key={c.key} onPress={() => onPick(c.key)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12, backgroundColor: on ? C.surface2 : 'transparent' }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />
                <Text style={{ color: C.text, fontSize: 14, fontWeight: on ? '700' : '500', flex: 1 }}>{c.label}</Text>
                {on ? <Text style={{ color: C.muted, fontSize: 11.5 }}>aquí está</Text> : <Ionicons name="arrow-forward" size={15} color={C.muted} />}
              </Pressable>
            );
          })}
          <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 10 }}>
            <Text style={{ color: C.muted }}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ============================================================
//  Vista LISTA
// ============================================================

function Lista({ tasks, cols, steps, members, editable, isWide, selecting, selected, onToggleSelect, onOpen, onAdd, onToggle }: {
  tasks: PTask[]; cols: BoardColumn[]; steps: Record<string, PStep[]>; members: Member[];
  editable: boolean; isWide: boolean;
  selecting: boolean; selected: Set<string>; onToggleSelect: (id: string) => void;
  onOpen: (t: PTask) => void; onAdd: () => void; onToggle: (t: PTask) => void;
}) {
  const [orden, setOrden] = useState<'fecha' | 'responsable' | 'columna'>('fecha');
  const [soloMias, setSoloMias] = useState(false);
  const { session } = useAuth();
  const myId = session?.user.id ?? null;

  const shown = useMemo(() => {
    const base = soloMias && myId ? tasks.filter((t) => t.assignee_id === myId) : tasks;
    const copy = [...base];
    if (orden === 'fecha') {
      // Sin fecha al final: una tarea sin fecha no es urgente, es indefinida.
      copy.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const x = a.due_date ?? '9999-99-99', y = b.due_date ?? '9999-99-99';
        return x < y ? -1 : x > y ? 1 : 0;
      });
    } else if (orden === 'responsable') {
      const nameFor = (uid: string | null) => {
        const m = members.find((x) => x.user_id === uid);
        return m ? nameOf(m.profile).toLowerCase() : 'zzz sin asignar';
      };
      copy.sort((a, b) => nameFor(a.assignee_id).localeCompare(nameFor(b.assignee_id)) || a.position - b.position);
    } else {
      const rank = new Map(cols.map((c, i) => [c.key, i]));
      copy.sort((a, b) => (rank.get(a.status) ?? 99) - (rank.get(b.status) ?? 99) || a.position - b.position);
    }
    return copy;
  }, [tasks, orden, soloMias, myId, members, cols]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isWide ? 24 : 14, paddingBottom: 120, maxWidth: 900, width: '100%' }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {(['fecha', 'responsable', 'columna'] as const).map((o) => (
          <Pressable key={o} onPress={() => setOrden(o)}
            style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: R.pill, borderWidth: 1, backgroundColor: orden === o ? C.surface2 : 'transparent', borderColor: orden === o ? C.brand : C.line }}>
            <Text style={{ color: orden === o ? C.brand : C.muted, fontSize: 12.5, fontWeight: orden === o ? '700' : '500' }}>
              Por {o}
            </Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setSoloMias((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 13, borderRadius: R.pill, borderWidth: 1, backgroundColor: soloMias ? C.brand + '1f' : 'transparent', borderColor: soloMias ? C.brand : C.line }}>
          <Ionicons name={soloMias ? 'person' : 'person-outline'} size={13} color={soloMias ? C.brand : C.muted} />
          <Text style={{ color: soloMias ? C.brand : C.muted, fontSize: 12.5, fontWeight: soloMias ? '700' : '500' }}>Solo lo mío</Text>
        </Pressable>
      </View>

      {shown.length === 0 ? (
        <Text style={{ color: C.muted, paddingVertical: 24, textAlign: 'center' }}>
          {tasks.length === 0 ? 'Todavía no hay tareas en este proyecto.' : 'Nada con ese filtro.'}
        </Text>
      ) : shown.map((t) => {
        const col = cols.find((c) => c.key === t.status) ?? cols[0];
        const who = members.find((m) => m.user_id === t.assignee_id) ?? null;
        const st = steps[t.id] ?? [];
        const due = dueInfo(t, t.done);
        const sel = selected.has(t.id);
        return (
          <Pressable key={t.id} onPress={() => (selecting ? onToggleSelect(t.id) : onOpen(t))}
            onLongPress={editable ? () => onToggleSelect(t.id) : undefined} delayLongPress={350}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: sel ? C.brand + '1a' : C.surface,
              borderWidth: 1, borderColor: sel ? C.brand : C.line, borderRadius: 12, padding: 12, marginBottom: 8, opacity: pressed ? 0.8 : 1,
            })}>
            {selecting ? (
              <Pressable onPress={() => onToggleSelect(t.id)} hitSlop={8} accessibilityLabel={sel ? 'Quitar de la selección' : 'Seleccionar'}>
                <SelectBox on={sel} />
              </Pressable>
            ) : (
              <Pressable onPress={() => editable && onToggle(t)} hitSlop={8} disabled={!editable}
                style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: t.done ? C.good : C.line, backgroundColor: t.done ? C.good : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {t.done && <Ionicons name="checkmark" size={13} color="#0f1115" />}
              </Pressable>
            )}

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: C.text, fontSize: 14, fontWeight: '600', textDecorationLine: t.done ? 'line-through' : 'none' }}>{t.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: col?.color ?? C.muted }} />
                  <Text style={{ color: C.muted, fontSize: 11.5 }}>{col?.label ?? t.status}</Text>
                </View>
                <Text style={{ color: C.muted, fontSize: 11.5 }}>· {who ? nameOf(who.profile) : 'sin asignar'}</Text>
                {due && <Text style={{ color: due.color, fontSize: 11.5, fontWeight: '700' }}>· {due.label}</Text>}
                {st.length > 0 && <Text style={{ color: C.muted, fontSize: 11.5 }}>· {st.filter((s) => s.done).length}/{st.length}</Text>}
              </View>
            </View>

            {who && (
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colorOf(who.user_id), alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#0f1115', fontSize: 9.5, fontWeight: '800' }}>{initialsOf(who.profile)}</Text>
              </View>
            )}
          </Pressable>
        );
      })}

      {editable && (
        <Pressable onPress={onAdd}
          style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand, borderRadius: 12, padding: 13, marginTop: 12, alignSelf: isWide ? 'flex-start' : 'stretch', paddingHorizontal: 20 }}>
          <Ionicons name="add" size={18} color="#0f1115" />
          <Text style={{ color: '#0f1115', fontWeight: '700' }}>Nueva tarea</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// ============================================================
//  Vista EQUIPO
// ============================================================

function Equipo({ project, members, tasks, activity, myId, role, isWide, onChanged, onLeft }: {
  project: Project | null; members: Member[]; tasks: PTask[];
  activity: (Activity & { profile?: Profile | null })[];
  myId: string | null; role: ProjectRole | null; isWide: boolean;
  onChanged: () => void; onLeft: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isOwner = role === 'owner';
  const { loads, unassigned, balanced } = useMemo(() => workload(tasks, members), [tasks, members]);

  async function copyCode() {
    const code = project?.join_code ?? '';
    if (!code) return;
    if (isWeb && typeof navigator !== 'undefined' && navigator.clipboard) {
      try { await navigator.clipboard.writeText(code); notify('Código copiado', 'Pásaselo a quien quieras invitar.'); return; } catch { /* sigue abajo */ }
    }
    notify('Código del proyecto', code);
  }

  async function regen() {
    if (!project) return;
    const ok = await confirm('¿Cambiar el código?',
      'El código de ahora deja de servir. Quien ya está adentro se queda; quien tenga el código viejo no podrá entrar.', 'Cambiar');
    if (!ok) return;
    setBusy(true);
    try { await regenJoinCode(project.id); onChanged(); }
    catch (e: any) { notify('No se pudo cambiar', e.message); }
    finally { setBusy(false); }
  }

  async function salir() {
    if (!project) return;
    if (isOwner) return notify('Eres quien creó el proyecto', 'No puedes salirte de tu propio proyecto: bórralo o pásalo a otra persona sacándote después.');
    const ok = await confirm('¿Salir del proyecto?', 'Dejarás de ver el tablero. Puedes volver a entrar con el código.', 'Salir');
    if (!ok) return;
    try { await leaveProject(project.id); onLeft(); }
    catch (e: any) { notify('No se pudo salir', e.message); }
  }

  async function borrar() {
    if (!project) return;
    const ok = await confirm('¿Borrar el proyecto?',
      `Se borra "${project.name}" con sus ${tasks.length} tarjetas para todo el equipo. Esto no se puede deshacer.`, 'Borrar');
    if (!ok) return;
    try { await deleteProject(project.id); onLeft(); }
    catch (e: any) { notify('No se pudo borrar', e.message); }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isWide ? 24 : 14, paddingBottom: 70, maxWidth: 900, width: '100%' }}>
      {/* ---------- Invitar ---------- */}
      <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 16, marginBottom: 14 }}>
        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }}>Invitar al proyecto</Text>
        <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 4, lineHeight: 19 }}>
          Quien tenga este código puede entrar desde la pantalla de Proyectos. Entra como editor.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18 }}>
            <Text style={{ color: C.text, fontSize: 21, fontWeight: '800', letterSpacing: 5 }}>{project?.join_code ?? '······'}</Text>
          </View>
          <Pressable onPress={copyCode}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Ionicons name="copy-outline" size={15} color="#0f1115" />
            <Text style={{ color: '#0f1115', fontWeight: '700', fontSize: 13 }}>Copiar</Text>
          </Pressable>
          {isOwner && (
            <Pressable onPress={regen} disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16 }}>
              <Ionicons name="refresh" size={15} color={C.muted} />
              <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>Cambiar código</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ---------- Reparto del trabajo ---------- */}
      <WorkloadPanel loads={loads} unassigned={unassigned} balanced={balanced} myId={myId} />

      {/* ---------- Integrantes ---------- */}
      <Text style={secTitle}>Integrantes</Text>
      <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, overflow: 'hidden', marginBottom: 14 }}>
        {members.map((m, i) => (
          <MemberRow key={m.id} member={m} first={i === 0} isMe={m.user_id === myId} canManage={isOwner}
            onChanged={onChanged} />
        ))}
      </View>

      {/* ---------- Bitácora ---------- */}
      <Text style={secTitle}>Movimientos recientes</Text>
      <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 14, marginBottom: 18 }}>
        {activity.length === 0 ? (
          <Text style={{ color: C.muted, fontSize: 12.5 }}>Todavía no hay movimientos.</Text>
        ) : activity.map((a) => (
          <View key={a.id} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colorOf(a.actor_id), alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Text style={{ color: '#0f1115', fontSize: 8.5, fontWeight: '800' }}>{initialsOf(a.profile)}</Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 12.5, flex: 1, lineHeight: 18 }}>
              <Text style={{ color: C.text, fontWeight: '700' }}>{nameOf(a.profile)}</Text> {a.summary}
              <Text style={{ color: C.muted }}>  ·  {hace(a.created_at)}</Text>
            </Text>
          </View>
        ))}
      </View>

      {/* ---------- Cosas peligrosas ---------- */}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {!isOwner && (
          <Pressable onPress={salir} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>Salir del proyecto</Text>
          </Pressable>
        )}
        {isOwner && (
          <Pressable onPress={borrar} style={{ borderWidth: 1, borderColor: C.bad + '66', borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ color: C.bad, fontWeight: '700', fontSize: 13 }}>Borrar proyecto</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

function MemberRow({ member, first, isMe, canManage, onChanged }: {
  member: Member; first: boolean; isMe: boolean; canManage: boolean; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const esOwner = member.role === 'owner';

  async function cambiarPapel() {
    if (esOwner) return;
    const next = member.role === 'editor' ? 'viewer' : 'editor';
    setBusy(true);
    try { await setMemberRole(member.id, next); onChanged(); }
    catch (e: any) { notify('No se pudo cambiar', e.message); }
    finally { setBusy(false); }
  }

  async function sacar() {
    const ok = await confirm(`¿Sacar a ${nameOf(member.profile)}?`,
      'Deja de ver el proyecto. Sus tarjetas se quedan, pero sin responsable.', 'Sacar');
    if (!ok) return;
    setBusy(true);
    try { await removeMember(member.id); onChanged(); }
    catch (e: any) { notify('No se pudo sacar', e.message); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colorOf(member.user_id), alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#0f1115', fontSize: 11.5, fontWeight: '800' }}>{initialsOf(member.profile)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>
          {nameOf(member.profile)}{isMe ? '  (tú)' : ''}
        </Text>
        <Text numberOfLines={1} style={{ color: C.muted, fontSize: 11.5, marginTop: 1 }}>
          {esOwner ? 'Creó el proyecto' : member.role === 'editor' ? 'Puede editar' : 'Solo mira'}
        </Text>
      </View>

      {canManage && !esOwner && (
        <>
          <Pressable onPress={cambiarPapel} disabled={busy}
            style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingVertical: 6, paddingHorizontal: 11 }}>
            <Text style={{ color: C.text, fontSize: 11.5, fontWeight: '600' }}>
              {member.role === 'editor' ? 'Pasar a solo mirar' : 'Dejar editar'}
            </Text>
          </Pressable>
          <Pressable onPress={sacar} disabled={busy} hitSlop={8}>
            <Ionicons name="close" size={17} color={C.muted} />
          </Pressable>
        </>
      )}
    </View>
  );
}

// ---------- Panel de carga ----------

function WorkloadPanel({ loads, unassigned, balanced, myId }: {
  loads: Load[]; unassigned: number; balanced: boolean; myId: string | null;
}) {
  const conAlgo = loads.filter((l) => l.total > 0).length;
  // Cuántos están de brazos cruzados: es la causa más común de que el reparto
  // salga disparejo, y merece un aviso distinto al de "a fulano le tocó doble".
  const sinNada = loads.filter((l) => l.pending === 0).length;

  return (
    <>
      <Text style={secTitle}>Cómo va repartido</Text>
      <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 14, marginBottom: 14 }}>
        {conAlgo === 0 ? (
          <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 19 }}>
            Todavía nadie tiene tareas asignadas. Abre una tarjeta y elige quién la hace: aquí verás si el trabajo quedó parejo.
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <Ionicons name={balanced ? 'checkmark-circle' : 'alert-circle'} size={16} color={balanced ? C.good : C.warn} />
              <Text style={{ color: balanced ? C.good : C.warn, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
                {/* El aviso dice POR QUÉ está disparejo: no es lo mismo que a
                    alguien le toque el doble a que alguien no tenga nada. */}
                {balanced
                  ? 'El trabajo está bastante parejo'
                  : sinNada > 0
                    ? `El reparto está disparejo: ${sinNada === 1 ? 'hay 1 integrante' : `hay ${sinNada} integrantes`} sin nada pendiente`
                    : 'El reparto está disparejo: a alguien le tocó bastante más que al resto'}
              </Text>
            </View>

            {loads.map((l) => (
              <View key={l.user_id} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colorOf(l.user_id), alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#0f1115', fontSize: 8.5, fontWeight: '800' }}>{initialsOf(l.profile)}</Text>
                  </View>
                  <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', flex: 1 }}>
                    {nameOf(l.profile)}{l.user_id === myId ? ' (tú)' : ''}
                  </Text>
                  {l.late > 0 && <Pill text={`${l.late} atrasada${l.late === 1 ? '' : 's'}`} color={C.bad} />}
                  {l.late === 0 && l.soon > 0 && <Pill text={`${l.soon} pronto`} color={C.warn} />}
                  <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '700' }}>{l.pending} pend.</Text>
                </View>
                <ProgressBar done={l.done} total={l.total} height={6} compact />
              </View>
            ))}

            {unassigned > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 11, marginTop: 2 }}>
                <Ionicons name="help-circle-outline" size={15} color={C.muted} />
                <Text style={{ color: C.muted, fontSize: 12.5, flex: 1 }}>
                  {unassigned === 1 ? '1 tarjeta sin dueño: nadie la está mirando.' : `${unassigned} tarjetas sin dueño: nadie las está mirando.`}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </>
  );
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: R.pill, backgroundColor: color + '22' }}>
      <Text style={{ color, fontSize: 10.5, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

// "hace 3 h". Sin librerías: son cuatro casos y no vale la pena traer moment.
function hace(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const min = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

// ============================================================
//  Ventana de una tarea de proyecto
// ============================================================

function PTaskModal({ visible, task, projectId, status, cols, members, steps, editable, onClose, onSaved, onStepsChanged }: {
  visible: boolean; task: PTask | null; projectId: string; status: string;
  cols: BoardColumn[]; members: Member[]; steps: PStep[]; editable: boolean;
  onClose: () => void; onSaved: () => void; onStepsChanged: () => void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [st, setSt] = useState(status);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState('');   // 'HH:MM' o vacío (= 11:59 p. m.)
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nuevoPaso, setNuevoPaso] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);

  // Rellenar el formulario al abrir. Es el patrón de "ajustar estado durante el
  // render" que React permite, y no un useEffect: así no hay un parpadeo con los
  // datos de la tarea anterior. La clave incluye el cerrado (null), porque si no
  // volver a abrir la MISMA tarjeta no restablecería lo que se dejó a medias.
  const clave = visible ? `${task?.id ?? 'nueva'}:${status}` : null;
  if (clave !== abierta) {
    setAbierta(clave);
    if (clave) {
      setTitle(task?.title ?? '');
      setDesc(task?.description ?? '');
      setSt(task?.status ?? status);
      setAssignee(task?.assignee_id ?? null);
      const at = task?.due_at ? new Date(task.due_at) : null;
      if (at && !isNaN(at.getTime())) {
        setDate(new Date(at.getFullYear(), at.getMonth(), at.getDate()));
        setTime(at.getHours() === 23 && at.getMinutes() === 59 ? '' : `${pad(at.getHours())}:${pad(at.getMinutes())}`);
      } else {
        setDate(task?.due_date ? new Date(task.due_date + 'T00:00:00') : null);
        setTime('');
      }
      setNuevoPaso('');
      setShowPicker(false);
    }
  }

  async function guardar() {
    if (!title.trim()) return notify('Ponle título a la tarea');
    setBusy(true);
    const due = date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : null;
    const [hh, mm] = /^\d{2}:\d{2}$/.test(time) ? time.split(':').map(Number) : [23, 59];
    const dueAt = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm).toISOString() : null;
    try {
      if (task) {
        await updateProjectTask(task.id, {
          title: title.trim(), description: desc.trim() || null, status: st,
          assignee_id: assignee, due_date: due, due_at: dueAt,
        });
      } else {
        const creada = await addProjectTask({
          project_id: projectId, title: title.trim(), status: st,
          description: desc.trim() || null, assignee_id: assignee, due_date: due, due_at: dueAt,
        });
        await logActivity(projectId, 'task_new', `creó “${creada.title}”`, { task_id: creada.id });
      }
      onSaved();
    } catch (e: any) { notify('No se pudo guardar', e.message); }
    finally { setBusy(false); }
  }

  async function borrar() {
    if (!task) return;
    const ok = await confirm('¿Borrar esta tarea?', `Se borra "${task.title}" para todo el equipo.`, 'Borrar');
    if (!ok) return;
    try { await deleteProjectTask(task.id); onSaved(); }
    catch (e: any) { notify('No se pudo borrar', e.message); }
  }

  async function agregarPaso() {
    const t = nuevoPaso.trim();
    if (!t || !task) return;
    setNuevoPaso('');
    try {
      await addProjectStep(projectId, task.id, t, (steps.length + 1) * 1000);
      onStepsChanged();
    } catch (e: any) { notify('No se pudo agregar', e.message); }
  }

  const hechos = steps.filter((s) => s.done).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 540, maxHeight: '90%' }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', flex: 1 }}>
                {task ? 'Tarea' : 'Nueva tarea'}
              </Text>
              <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={20} color={C.muted} /></Pressable>
            </View>

            {!editable && (
              <Text style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>
                Solo puedes mirar: en este proyecto no tienes permiso de editar.
              </Text>
            )}

            <TextInput value={title} onChangeText={setTitle} editable={editable}
              placeholder="¿Qué hay que hacer?" placeholderTextColor={C.muted} style={input} />

            <Text style={lbl}>Detalle (opcional)</Text>
            <TextInput value={desc} onChangeText={setDesc} editable={editable} multiline
              placeholder="Instrucciones, enlaces, lo que sea" placeholderTextColor={C.muted}
              style={[input, { minHeight: 70, textAlignVertical: 'top' }]} />

            <Text style={lbl}>Columna</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {cols.map((c) => {
                const on = c.key === st;
                return (
                  <Pressable key={c.key} onPress={() => editable && setSt(c.key)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, backgroundColor: on ? c.color + '22' : C.surface2, borderColor: on ? c.color : C.line }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                    <Text style={{ color: on ? c.color : C.text, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={lbl}>¿Quién la hace?</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Pressable onPress={() => editable && setAssignee(null)}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, backgroundColor: assignee === null ? C.surface2 : 'transparent', borderColor: assignee === null ? C.brand : C.line }}>
                <Text style={{ color: assignee === null ? C.brand : C.muted, fontSize: 12.5, fontWeight: assignee === null ? '700' : '500' }}>Nadie aún</Text>
              </Pressable>
              {members.map((m) => {
                const on = m.user_id === assignee;
                return (
                  <Pressable key={m.id} onPress={() => editable && setAssignee(m.user_id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, paddingHorizontal: 11, borderRadius: R.pill, borderWidth: 1, backgroundColor: on ? C.surface2 : 'transparent', borderColor: on ? colorOf(m.user_id) : C.line }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colorOf(m.user_id), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#0f1115', fontSize: 8.5, fontWeight: '800' }}>{initialsOf(m.profile)}</Text>
                    </View>
                    <Text style={{ color: on ? C.text : C.muted, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{nameOf(m.profile)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={lbl}>Fecha y hora de entrega</Text>
            {isWeb ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {React.createElement('input', {
                  type: 'date',
                  value: date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '',
                  disabled: !editable,
                  onChange: (e: any) => { const v = e.target.value; setDate(v ? new Date(v + 'T00:00:00') : null); },
                  style: { backgroundColor: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, color: C.text, padding: 12, fontSize: 14, colorScheme: uiScheme(), flex: 2, minWidth: 0, boxSizing: 'border-box' },
                })}
                {React.createElement('input', {
                  type: 'time',
                  value: time,
                  disabled: !editable || !date,
                  'aria-label': 'Hora de entrega',
                  onChange: (e: any) => setTime(e.target.value),
                  style: { backgroundColor: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, color: C.text, padding: 12, fontSize: 14, colorScheme: uiScheme(), flex: 1, minWidth: 0, boxSizing: 'border-box', opacity: date ? 1 : 0.5 },
                })}
              </View>
            ) : (
              <>
                <Pressable onPress={() => editable && setShowPicker(true)} style={input}>
                  <Text style={{ color: date ? C.text : C.muted }}>{date ? date.toLocaleDateString('es') : 'Sin fecha'}</Text>
                </Pressable>
                {showPicker && (
                  <DateTimePicker value={date ?? new Date()} mode="date"
                    onChange={(_, d) => { setShowPicker(false); if (d) setDate(d); }} />
                )}
              </>
            )}
            {date && editable && (
              <Pressable onPress={() => { setDate(null); setTime(''); }} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                <Text style={{ color: C.muted, fontSize: 12 }}>Quitar la fecha</Text>
              </Pressable>
            )}

            {/* ---------- Microtareas ---------- */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 }}>
              <Ionicons name="list-outline" size={15} color={C.muted} />
              <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>Microtareas</Text>
              {steps.length > 0 && <Text style={{ color: C.muted, fontSize: 12 }}>{hechos}/{steps.length}</Text>}
            </View>

            {!task ? (
              <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
                Guarda la tarea primero y aquí podrás partirla en pasos con su barra de avance.
              </Text>
            ) : (
              <View style={{ backgroundColor: C.surface2 + '80', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 10 }}>
                {steps.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <ProgressBar done={hechos} total={steps.length} height={6} />
                  </View>
                )}
                {steps.map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 }}>
                    <Pressable disabled={!editable} hitSlop={8}
                      onPress={async () => {
                        try { await toggleProjectStep(s.id, !s.done); onStepsChanged(); }
                        catch (e: any) { notify('No se pudo marcar', e.message); }
                      }}
                      style={{ width: 19, height: 19, borderRadius: 6, borderWidth: 2, borderColor: s.done ? C.good : C.line, backgroundColor: s.done ? C.good : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {s.done && <Ionicons name="checkmark" size={11} color="#0f1115" />}
                    </Pressable>
                    <Text style={{ color: s.done ? C.muted : C.text, fontSize: 13, flex: 1, textDecorationLine: s.done ? 'line-through' : 'none' }}>{s.title}</Text>
                    {editable && (
                      <Pressable hitSlop={8}
                        onPress={async () => {
                          try { await deleteProjectStep(s.id); onStepsChanged(); }
                          catch (e: any) { notify('No se pudo borrar', e.message); }
                        }}>
                        <Ionicons name="close" size={15} color={C.muted} />
                      </Pressable>
                    )}
                  </View>
                ))}
                {editable && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <TextInput value={nuevoPaso} onChangeText={setNuevoPaso} onSubmitEditing={agregarPaso}
                      placeholder="Agregar un paso" placeholderTextColor={C.muted} returnKeyType="done"
                      style={{ flex: 1, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 9, color: C.text, paddingVertical: 9, paddingHorizontal: 11, fontSize: 13 }} />
                    <Pressable onPress={agregarPaso} hitSlop={8}><Ionicons name="add-circle" size={22} color={C.brand} /></Pressable>
                  </View>
                )}
              </View>
            )}

            {editable && (
              <Pressable onPress={guardar} disabled={busy} style={btnPrimary}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '…' : task ? 'Guardar' : 'Crear tarea'}</Text>
              </Pressable>
            )}
            {editable && task && (
              <Pressable onPress={borrar} style={{ alignItems: 'center', marginTop: 14 }}>
                <Text style={{ color: C.bad, fontWeight: '600', fontSize: 13 }}>Borrar tarea</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: C.muted }}>Cerrar</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ============================================================
//  Ventana de columnas del tablero
// ============================================================

function ColumnsModal({ visible, cols, counts, onClose, onSave }: {
  visible: boolean; cols: BoardColumn[]; counts: Record<string, PTask[]>;
  onClose: () => void; onSave: (next: BoardColumn[]) => void;
}) {
  const [draft, setDraft] = useState<BoardColumn[]>(cols);
  const [abierta, setAbierta] = useState(false);

  // Copia fresca de las columnas cada vez que se ABRE la ventana. Se compara
  // contra `visible` y no contra el contenido: si alguien edita, cancela y
  // vuelve a entrar, tiene que ver lo que está guardado, no su borrador viejo.
  if (visible !== abierta) {
    setAbierta(visible);
    if (visible) setDraft(cols.map((c) => ({ ...c })));
  }

  function set(i: number, patch: Partial<BoardColumn>) {
    setDraft((d) => d.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }
  function mover(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.length) return;
    setDraft((d) => { const copy = [...d]; const [x] = copy.splice(i, 1); copy.splice(j, 0, x); return copy; });
  }
  async function quitar(i: number) {
    const col = draft[i];
    const n = (counts[col.key] ?? []).length;
    if (draft.length <= 1) return notify('Tiene que quedar al menos una columna');
    if (n > 0) {
      const ok = await confirm(`¿Quitar "${col.label}"?`,
        `Sus ${n} ${n === 1 ? 'tarjeta pasa' : 'tarjetas pasan'} a la primera columna. No se borra nada.`, 'Quitar');
      if (!ok) return;
    }
    setDraft((d) => d.filter((_, j) => j !== i));
  }
  function agregar() {
    if (draft.length >= 8) return notify('Ocho columnas es el tope', 'Más que eso ya no cabe en pantalla y deja de ayudar.');
    const key2 = `col${Math.random().toString(36).slice(2, 8)}`;
    setDraft((d) => [...d, { key: key2, label: 'Nueva columna', color: SUBJECT_COLORS[d.length % SUBJECT_COLORS.length] }]);
  }
  function guardar() {
    const limpio = draft
      .map((c) => ({ ...c, label: c.label.trim() || 'Sin nombre' }))
      .filter((c) => !!c.key);
    if (!limpio.length) return notify('Tiene que quedar al menos una columna');
    onSave(limpio);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 560, maxHeight: '90%' }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>Columnas del tablero</Text>
            <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 4, marginBottom: 14, lineHeight: 19 }}>
              Cada equipo trabaja distinto. Marca con la bandera la columna donde una tarea ya se considera terminada:
              de ahí sale el porcentaje de avance del proyecto.
            </Text>

            {draft.map((c, i) => (
              <View key={c.key} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 11, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />
                  <TextInput value={c.label} onChangeText={(t) => set(i, { label: t.slice(0, 24) })}
                    placeholder="Nombre" placeholderTextColor={C.muted}
                    style={{ flex: 1, color: C.text, fontSize: 14, fontWeight: '600', paddingVertical: 4 }} />
                  <Text style={{ color: C.muted, fontSize: 11.5 }}>{(counts[c.key] ?? []).length}</Text>
                  <Pressable onPress={() => mover(i, -1)} hitSlop={6} disabled={i === 0}>
                    <Ionicons name="chevron-up" size={17} color={i === 0 ? C.line : C.muted} />
                  </Pressable>
                  <Pressable onPress={() => mover(i, 1)} hitSlop={6} disabled={i === draft.length - 1}>
                    <Ionicons name="chevron-down" size={17} color={i === draft.length - 1 ? C.line : C.muted} />
                  </Pressable>
                  <Pressable onPress={() => quitar(i)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={16} color={C.muted} />
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {SUBJECT_COLORS.slice(0, 8).map((col) => (
                    <Pressable key={col} onPress={() => set(i, { color: col })}
                      style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: col, borderWidth: 2, borderColor: c.color.toLowerCase() === col.toLowerCase() ? C.text : 'transparent' }} />
                  ))}
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => set(i, { done: !c.done })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: R.pill, borderWidth: 1, backgroundColor: c.done ? C.good + '22' : 'transparent', borderColor: c.done ? C.good : C.line }}>
                    <Ionicons name={c.done ? 'flag' : 'flag-outline'} size={13} color={c.done ? C.good : C.muted} />
                    <Text style={{ color: c.done ? C.good : C.muted, fontSize: 11.5, fontWeight: c.done ? '700' : '500' }}>Termina aquí</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <Pressable onPress={agregar}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' }}>
                <Ionicons name="add" size={15} color={C.muted} />
                <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>Agregar columna</Text>
              </Pressable>
              <Pressable onPress={() => setDraft(DEFAULT_COLUMNS.map((c) => ({ ...c })))}
                style={{ paddingVertical: 11, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>Volver a las de siempre</Text>
              </Pressable>
            </View>

            <Pressable onPress={guardar} style={btnPrimary}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar columnas</Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: C.muted }}>Cancelar</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- estilos sueltos ----------

function pad(n: number): string { return String(n).padStart(2, '0'); }

const input = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 12, fontSize: 14 } as const;
const lbl = { color: C.muted, fontSize: 12, marginTop: 14, marginBottom: 8 } as const;
const btnPrimary = { backgroundColor: C.brand, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 } as const;
const secTitle = { color: C.text, fontSize: 14.5, fontWeight: '700', marginBottom: 9, marginTop: 4 } as const;

// Esta pantalla no es una pestaña, así que el candado de sesión va aquí.
export default function ProyectoDetalleProtegida() {
  return (
    <RequireAuth>
      <ProyectoDetalle />
    </RequireAuth>
  );
}
