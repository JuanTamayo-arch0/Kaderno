import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RequireAuth } from '../../components/RequireAuth';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R, screenBg } from '../../lib/theme';
import { useResponsive, SIDEBAR_W } from '../../lib/responsive';
import { notify } from '../../lib/confirm';
import { loadHoyHidden, setProjectHidden } from '../../lib/hoyHidden';
import { toast } from '../../lib/feedback';
import { roomForProject } from '../../lib/roomsDb';
import { enterRoom } from '../../lib/rooms';
import { useAuth } from '../../lib/auth';
import { ImportSheet } from '../../components/projects/ImportSheet';
import { BoardCleanup } from '../../components/projects/BoardCleanup';
import { ProjectFiles } from '../../components/projects/ProjectFiles';
import { readSnap, writeSnap } from '../../lib/snapshot';
import { play } from '../../lib/sound';
import { BulkAction, BulkBar, BulkDialog, ExportSheet, confirmBulkDelete } from '../../components/projects/BulkTools';
import { ReportSheet } from '../../components/projects/ReportSheet';
import { BudgetSheet } from '../../components/projects/BudgetSheet';
import { undoProjectBatch } from '../../lib/projectsBulk';
import { Subject, getSubjects } from '../../lib/db';
import { Activity, Member, PStep, PTask, Profile, Project, ProjectRole, canEdit, columnsOf, getActivity, getMembers, getProject, getProjectSteps, getProjectTasks, logActivity, moveTask, myRole, setBoardColumns, updateProjectTask } from '../../lib/projects';
import { ColumnsModal } from '../../components/projects/ColumnsModal';
import { PTaskModal } from '../../components/projects/PTaskModal';
import { MoveMenu, Tablero } from '../../components/projects/ProjectBoard';
import { Lista } from '../../components/projects/ProjectList';
import { HeaderBtn, MoreMenu, OptionsButton } from '../../components/projects/ProjectMenu';
import { Equipo } from '../../components/projects/ProjectTeam';
import { getCommentCounts } from '../../lib/commentsDb';
import { ProjectCalendar } from '../../components/projects/ProjectCalendar';

// ============================================================
//  Pantalla de un proyecto: Tablero, Lista, Calendario, Archivos y Equipo.
//  Las vistas y ventanas viven en components/projects/ (versión 23).
//
//  Sobre el arrastrar y soltar: en web NO se usa PanResponder ni una librería
//  de gestos. Se envuelven las tarjetas en un <div draggable> de verdad con
//  React.createElement, porque react-native-web no reenvía de forma fiable la
//  propiedad `draggable` de un <View>. El div va sin estilos propios (solo el
//  cursor): por dentro sigue habiendo Views normales, así que la tarjeta se ve
//  igual en los dos mundos. En móvil no hay arrastre nativo: cada tarjeta trae
//  un botón "mover" que abre la lista de columnas, que además es más cómodo con
//  el dedo que arrastrar en horizontal dentro de un carrusel que también scrollea.

type ProjSnap = { project: Project; members: Member[]; tasks: PTask[]; steps: Record<string, PStep[]>; subjects: Subject[] };

const VIEWS = [
  { key: 'tablero', label: 'Tablero', icon: 'grid-outline' },
  { key: 'lista', label: 'Lista', icon: 'list-outline' },
  { key: 'calendario', label: 'Calendario', icon: 'calendar-outline' },
  { key: 'archivos', label: 'Archivos', icon: 'folder-open-outline' },
  { key: 'equipo', label: 'Equipo', icon: 'people-outline' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

function ProyectoDetalle() {
  const params = useLocalSearchParams<{ id: string | string[]; tarea?: string }>();
  const projectId = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');
  const router = useRouter();
  const { isWide } = useResponsive();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;

  // Foto de la última visita: el tablero aparece al instante y se actualiza al llegar los datos.
  const snapKey = myId && projectId ? `proj:${myId}:${projectId}` : null;
  const [snap] = useState(() => readSnap<ProjSnap>(snapKey));
  const [project, setProject] = useState<Project | null>(snap?.project ?? null);
  const [members, setMembers] = useState<Member[]>(snap?.members ?? []);
  const [tasks, setTasks] = useState<PTask[]>(snap?.tasks ?? []);
  const [steps, setSteps] = useState<Record<string, PStep[]>>(snap?.steps ?? {});
  const [activity, setActivity] = useState<(Activity & { profile?: Profile | null })[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>(snap?.subjects ?? []);
  const [comments, setComments] = useState<Record<string, number>>({});   // comentarios por tarea (v23)
  const [loading, setLoading] = useState(!snap);
  const [gone, setGone] = useState(false);

  const [view, setView] = useState<ViewKey>('tablero');
  const [editingTask, setEditingTask] = useState<PTask | null>(null);
  const [newIn, setNewIn] = useState<string | null>(null);   // clave de columna donde se crea
  const [newDate, setNewDate] = useState<Date | null>(null); // fecha al crear desde el calendario
  const [colsModal, setColsModal] = useState(false);
  const [moving, setMoving] = useState<PTask | null>(null);  // tarjeta en el menú "mover a"

  // Importar / exportar / edición en masa
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [undo, setUndo] = useState<{ batchId: string; text: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);   // menú de opciones del proyecto
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si ya hay una carga en curso, la segunda llamada espera esa misma en vez de
  // lanzar otra igual (antes, al abrir el proyecto se pedía todo dos veces).
  const loading_ = useRef<Promise<void> | null>(null);
  const load = useCallback(async (): Promise<void> => {
    if (!projectId) return;
    if (loading_.current) return loading_.current;
    loading_.current = loadNow().finally(() => { loading_.current = null; });
    return loading_.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  async function loadNow() {
    try {
      // Todo a la vez (antes primero el proyecto y después lo demás).
      getCommentCounts(projectId).then(setComments).catch(() => {});
      const [p, ms, ts, st, ac, sj] = await Promise.all([
        getProject(projectId),
        getMembers(projectId),
        getProjectTasks(projectId),
        getProjectSteps(projectId),
        getActivity(projectId, 30),
        getSubjects(),
      ]);
      if (!p) { setGone(true); return; }
      setProject(p); setMembers(ms); setTasks(ts); setSteps(st); setActivity(ac); setSubjects(sj);
      writeSnap(snapKey, { project: p, members: ms, tasks: ts, steps: st, subjects: sj } satisfies ProjSnap);
    } catch (e: any) {
      notify('No se pudo abrir el proyecto', e.message);
    } finally {
      setLoading(false);
    }
  }

  // Igual que en la lista: sin websockets todavía, se recarga al volver.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Un aviso ("te mencionaron", "te asignaron") abre la tarea directamente.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    const tid = params.tarea;
    if (!tid || opened.current === tid || !tasks.length) return;
    const t = tasks.find((x) => x.id === tid);
    if (t) { opened.current = tid; setView('tablero'); setEditingTask(t); }
  }, [params.tarea, tasks]);

  const cols = useMemo(() => columnsOf(project), [project]);
  const role: ProjectRole | null = useMemo(() => myRole(members, myId), [members, myId]);
  const editable = canEdit(role);
  const isTaskView = view === 'tablero' || view === 'lista';
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
  const myTasksHere = myId ? tasks.filter((t) => t.assignee_id === myId && !t.done).length : 0;

  // Ocultar o mostrar las tareas de este proyecto en "Hoy" (solo para mí).
  const [hiddenInHoy, setHiddenInHoy] = useState(false);
  useEffect(() => { loadHoyHidden().then((h) => setHiddenInHoy(h.projects.includes(projectId))).catch(() => {}); }, [projectId]);
  // Sala de estudio del proyecto (se crea la primera vez que alguien la abre).
  async function openStudyRoom() {
    try {
      const r = await roomForProject(projectId);
      void enterRoom({ id: r.id, name: r.name });
      router.push(`/sala/${r.id}` as any);
    } catch (e: any) { toast(String(e?.message ?? e), { tone: 'bad' }); }
  }

  async function toggleHoy() {
    const next = !hiddenInHoy;
    setHiddenInHoy(next);
    try { await setProjectHidden(projectId, next); toast(next ? 'Tus tareas de este proyecto ya no aparecen en Hoy' : 'Tus tareas de este proyecto vuelven a aparecer en Hoy'); }
    catch (e: any) { setHiddenInHoy(!next); notify('No se pudo cambiar', e?.message ?? ''); }
  }

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
    const toDone = !!cols.find((c) => c.key === colKey)?.done && !cols.find((c) => c.key === task.status)?.done;
    play(toDone ? 'complete' : 'drop');
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: colKey, done: toDone ? true : t.done } : t)));
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
      <View style={{ flex: 1, backgroundColor: screenBg(), alignItems: 'center', justifyContent: 'center', padding: 30, paddingLeft: isWide ? SIDEBAR_W : 30 }}>
        <Ionicons name="lock-closed-outline" size={34} color={C.muted} style={{ marginBottom: 10 }} />
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Este proyecto ya no está disponible</Text>
        <Text style={{ color: C.muted, fontSize: 13, marginTop: 6, textAlign: 'center', maxWidth: 340, lineHeight: 20 }}>
          Puede que lo hayan borrado, o que te hayan sacado del equipo.
        </Text>
        <Pressable onPress={() => router.push('/proyectos')} style={{ marginTop: 18, backgroundColor: C.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 }}>
          <Text style={{ color: C.onBrand, fontWeight: '700' }}>Volver a proyectos</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: screenBg(), paddingLeft: isWide ? SIDEBAR_W : 0 }}>

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
          {isWide && editable && isTaskView && !selecting && (
            <HeaderBtn icon="checkbox-outline" label="Seleccionar" wide onPress={() => setSelecting(true)} />
          )}
          {project ? (
            <OptionsButton wide={isWide} open={moreOpen} onPress={(r) => { setMenuAnchor(r); setMoreOpen(true); }} />
          ) : null}
        </View>

        {/* pestañas */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist">
          {VIEWS.map((v) => {
            const on = v.key === view;
            return (
              <Pressable key={v.key} onPress={() => { setView(v.key); if (v.key !== 'tablero' && v.key !== 'lista') endSelecting(); }}
                accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, backgroundColor: on ? C.brand : C.surface2, borderColor: on ? C.brand : C.line }}>
                <Ionicons name={v.icon as any} size={14} color={on ? C.onBrand : C.muted} />
                <Text style={{ color: on ? C.onBrand : C.text, fontSize: 13, fontWeight: on ? '700' : '500' }}>{v.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ---------- Cuerpo ---------- */}
      {loading ? (
        <Text style={{ color: C.muted, padding: 24 }}>Cargando…</Text>
      ) : view === 'tablero' ? (
        <Tablero
          cols={cols} grouped={grouped} steps={steps} members={members} subject={subject} comments={comments}
          editable={editable} isWide={isWide} myId={myId}
          selecting={selecting} selected={selected} onToggleSelect={toggleSelect}
          onOpen={setEditingTask}
          onAdd={(k) => setNewIn(k)}
          onMove={(t) => setMoving(t)}
          onDrop={drop}
        />
      ) : view === 'lista' ? (
        <Lista
          tasks={tasks} cols={cols} steps={steps} members={members} comments={comments}
          editable={editable} isWide={isWide}
          selecting={selecting} selected={selected} onToggleSelect={toggleSelect}
          onOpen={setEditingTask}
          onAdd={() => setNewIn(cols[0]?.key ?? 'todo')}
          onToggle={async (t) => {
            const doneCol = cols.find((c) => c.done)?.key;
            const openCol = cols.find((c) => !c.done)?.key ?? cols[0]?.key;
            const target = t.done ? openCol : doneCol;
            if (!target) return notify('Falta una columna final', 'Marca una columna como “termina aquí” para poder tachar tareas.');
            play(t.done ? 'uncheck' : 'complete');
            setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: target, done: !t.done } : x)));
            try {
              await updateProjectTask(t.id, { status: target });
              if (!t.done) await logActivity(projectId, 'task_done', `terminó “${t.title}”`, { task_id: t.id });
            } catch (e: any) { notify('No se pudo actualizar', e.message); }
            load();
          }}
        />
      ) : view === 'calendario' ? (
        <ProjectCalendar projectId={projectId} tasks={tasks} cols={cols} members={members} editable={editable} isWide={isWide} myId={myId}
          onOpen={setEditingTask} onAddOn={(d) => { setNewDate(d); setNewIn(cols[0]?.key ?? 'todo'); }} />
      ) : view === 'archivos' ? (
        <ProjectFiles projectId={projectId} members={members} editable={editable} isWide={isWide} onChanged={load} />
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
        defaultDate={newDate}
        myId={myId}
        isOwner={role === 'owner'}
        onCommentCount={(tid, n) => setComments((c) => (c[tid] === n ? c : { ...c, [tid]: n }))}
        status={editingTask?.status ?? newIn ?? cols[0]?.key ?? 'todo'}
        cols={cols}
        members={members}
        steps={editingTask ? steps[editingTask.id] ?? [] : []}
        editable={editable}
        onClose={() => { setEditingTask(null); setNewIn(null); setNewDate(null); }}
        onSaved={() => { setEditingTask(null); setNewIn(null); setNewDate(null); load(); }}
        onStepsChanged={load}
        onStepPatch={(stepId, done) => setSteps((prev) => {
          const out: Record<string, PStep[]> = {};
          for (const k of Object.keys(prev)) out[k] = prev[k].map((st) => (st.id === stepId ? { ...st, done } : st));
          return out;
        })}
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
        anchor={isWide ? menuAnchor : null}
        onClose={() => setMoreOpen(false)}
        groups={[
          {
            title: 'Tareas',
            items: [
              ...(editable && isTaskView && !selecting && !isWide ? [{ icon: 'checkbox-outline', label: 'Seleccionar varias', hint: 'Cambiar columna, responsable o fechas a la vez', onPress: () => setSelecting(true) }] : []),
              ...(editable ? [{ icon: 'cloud-upload-outline', label: 'Importar tareas', hint: 'Desde un CSV, un JSON o una IA', onPress: () => setImportOpen(true) }] : []),
              { icon: 'download-outline', label: 'Exportar tareas', hint: 'Para editarlas en Excel o pasarlas a una IA', onPress: () => setExportOpen(true) },
              { icon: 'document-text-outline', label: 'Informe semanal', hint: 'Lo hecho, lo que viene y lo atrasado, listo para mandar', onPress: () => setReportOpen(true) },
              { icon: 'hourglass-outline', label: 'Presupuesto de horas', hint: 'Cuánto va el equipo y aviso al 80 % y al 100 %', onPress: () => setBudgetOpen(true) },
            ],
          },
          {
            title: 'Estudiar',
            items: [{ icon: 'people-outline', label: 'Sala de estudio', hint: 'Enfóquense juntos y vean quién está estudiando', onPress: openStudyRoom }],
          },
          {
            title: 'Tablero',
            items: [
              ...(editable ? [{ icon: 'sparkles-outline', label: 'Ordenar el tablero', hint: 'Quitar repetidas o vaciarlo', onPress: () => setCleanupOpen(true) }] : []),
              ...(editable ? [{ icon: 'options-outline', label: 'Columnas del tablero', hint: 'Nombres, colores y cuál cuenta como terminada', onPress: () => { setView('tablero'); setColsModal(true); } }] : []),
            ],
          },
          ...(myTasksHere > 0 || hiddenInHoy ? [{
            title: 'Para mí',
            items: [{
              icon: hiddenInHoy ? 'eye-outline' : 'eye-off-outline',
              label: hiddenInHoy ? 'Volver a mostrar mis tareas en Hoy' : 'No mostrar mis tareas en Hoy',
              hint: hiddenInHoy ? 'Ahora están ocultas en tu pantalla Hoy' : `Tienes ${myTasksHere} ${myTasksHere === 1 ? 'tarea asignada' : 'tareas asignadas'} aquí. Solo cambia tu vista.`,
              onPress: toggleHoy,
            }],
          }] : []),
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
        <>
        <ExportSheet visible={exportOpen} project={project} members={members} onClose={() => setExportOpen(false)} />
        <BudgetSheet visible={budgetOpen} projectId={project.id} projectName={project.name} editable={editable} onClose={() => setBudgetOpen(false)} />
        <ReportSheet visible={reportOpen} project={project} tasks={tasks} members={members} editable={editable} onClose={() => setReportOpen(false)} />
        </>
      )}
      <BoardCleanup visible={cleanupOpen} projectId={projectId} cols={cols} onClose={() => setCleanupOpen(false)}
        onDone={async ({ batchId, text }) => { setCleanupOpen(false); await load(); if (batchId) showUndo(batchId, text); }} />

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

      {selecting && isTaskView && (
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


// Esta pantalla no es una pestaña, así que el candado de sesión va aquí.
export default function ProyectoDetalleProtegida() {
  return (
    <RequireAuth>
      <ProyectoDetalle />
    </RequireAuth>
  );
}
