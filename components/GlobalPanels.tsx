import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import {
  Subject, Task, getSubjects, addTask, addNote, search, getNotifications, markNotificationsRead,
  type AppNotification, type ProjectTaskHit, type Note, type Flashcard,
} from '../lib/db';
import { taskTypeList, taskTypeMeta, loadTaskTypes } from '../lib/taskTypes';
import { parseQuickAdd, type QuickResult } from '../lib/quickAdd';
import { combine, fmtDue, fromISODate, fmtDay, fmtHHMM } from '../lib/time';
import { remindAt, remindDays } from '../lib/reminders';
import {
  subscribePanels, closeAdd, openTask, closeTask, closeCommand, openCommand, closeInbox, openAdd,
  dataChanged, type Panels,
} from '../lib/uiBus';
import { toast, notify, friendlyError } from '../lib/feedback';
import { refreshNavCounts, setNavCounts } from '../lib/navCounts';
import { startFocus } from '../lib/focusTimer';
import { TaskModal } from './TaskModal';
import { Button, Dot, EmptyState, IconButton } from './ds';
import { Kbd } from './SideNav';
import { SubjectIcon } from './SubjectIcon';

// ============================================================
//  Paneles globales: hoja "Agregar", formulario de tarea, paleta de
//  comandos (Ctrl K) y bandeja de avisos. Se montan una vez en el layout
//  raíz y se abren desde cualquier pantalla con lib/uiBus.ts.
// ============================================================

export function GlobalPanels() {
  const [p, setP] = useState<Panels | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  useEffect(() => subscribePanels(setP), []);

  // Materias frescas cada vez que se abre algo que las necesita.
  const anyOpen = !!p && (p.add || p.task.open || p.command);
  useEffect(() => { if (anyOpen) getSubjects().then(setSubjects).catch(() => {}); }, [anyOpen]);

  // Atajos de teclado (web): Ctrl/Cmd+K busca, N agrega, / busca.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommand(); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openAdd(); }
      if (e.key === '/') { e.preventDefault(); openCommand(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!p) return null;
  return (
    <>
      <AddSheet visible={p.add} subjects={subjects} />
      <TaskModal
        visible={p.task.open} subjects={subjects} editTask={p.task.edit} draft={p.task.draft}
        onClose={closeTask}
        onSaved={() => { closeTask(); dataChanged(); refreshNavCounts(true); }}
        onDeleted={() => { dataChanged(); }}
      />
      <CommandPalette visible={p.command} />
      <InboxPanel visible={p.inbox} />
    </>
  );
}

// ---------- Marco de panel: hoja abajo en celular, diálogo en computador ----------
function Panel({ visible, onClose, children, top, maxWidth = 560 }: { visible: boolean; onClose: () => void; children: React.ReactNode; top?: boolean; maxWidth?: number }) {
  const { isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [visible, onClose]);
  return (
    <Modal visible={visible} transparent animationType={isWide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: isWide ? (top ? 'flex-start' : 'center') : 'flex-end', alignItems: isWide ? 'center' : 'stretch', padding: isWide ? 24 : 0, paddingTop: isWide && top ? 90 : undefined }}>
        <Pressable onPress={() => {}} accessibilityViewIsModal
          style={isWide
            ? { width: '100%', maxWidth, maxHeight: '80%', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 18 }
            : { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 16 + insets.bottom, maxHeight: '92%', borderTopWidth: 1, borderColor: C.line }}>
          {!isWide && <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 12 }} />}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- Agregar ----------
function AddSheet({ visible, subjects }: { visible: boolean; subjects: Subject[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setText(''); loadTaskTypes().catch(() => {}); } }, [visible]);
  const parsed: QuickResult | null = useMemo(
    () => (text.trim() ? parseQuickAdd(text, subjects, taskTypeList()) : null),
    [text, subjects],
  );

  async function quickCreate() {
    if (!parsed || busy) return;
    setBusy(true);
    try {
      const choice = parsed.dueTime ? '1h' : 'evening';
      const at = remindAt(choice, parsed.dueDate, parsed.dueTime);
      const row = {
        title: parsed.title, subject_id: parsed.subjectId, type: parsed.typeKey ?? 'tarea',
        due_date: parsed.dueDate, due_at: parsed.dueDate && parsed.dueTime ? combine(parsed.dueDate, parsed.dueTime) : null,
        remind_days: remindDays(choice), remind_at: at ? at.toISOString() : null,
      };
      const id = await addTask(row);
      closeAdd();
      dataChanged(); refreshNavCounts(true);
      const when = fmtDue(row);
      toast(`Agregada: ${parsed.title}${when ? ' · ' + when : ''}`, {
        actionLabel: 'Editar',
        onAction: () => openTask({ id, status: 'pending', description: null, ...row } as Task),
      });
    } catch (e) { notify('No se pudo agregar', friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function blankNote() {
    closeAdd();
    try {
      const id = await addNote({ subject_id: null, title: 'Nota sin título', content: '', image_path: null });
      router.push({ pathname: '/nota/[id]', params: { id, edit: '1' } } as any);
    } catch (e) { notify('No se pudo crear la nota', friendlyError(e)); }
  }

  const subj = parsed?.subjectId ? subjects.find((s) => s.id === parsed.subjectId) : null;
  const tmeta = parsed?.typeKey ? taskTypeMeta(parsed.typeKey) : null;
  const actions: { icon: any; label: string; hint: string; onPress: () => void }[] = [
    { icon: 'checkbox-outline', label: 'Tarea o examen', hint: 'Con todos los detalles', onPress: () => openTask(null, parsed ? { title: parsed.title, subjectId: parsed.subjectId, typeKey: parsed.typeKey, dueDate: parsed.dueDate, dueTime: parsed.dueTime } : null) },
    { icon: 'camera-outline', label: 'Digitalizar apunte', hint: 'Foto o imagen a texto', onPress: () => { closeAdd(); router.push('/capturar'); } },
    { icon: 'document-text-outline', label: 'Nota en blanco', hint: 'Escribe con formato', onPress: blankNote },
    { icon: 'download-outline', label: 'Importar del sílabo', hint: 'Pega el cronograma', onPress: () => { closeAdd(); router.push('/importar'); } },
    { icon: 'people-outline', label: 'Proyecto en grupo', hint: 'Tablero y reparto', onPress: () => { closeAdd(); router.push({ pathname: '/proyectos', params: { nuevo: '1' } } as any); } },
    { icon: 'timer-outline', label: 'Sesión de enfoque', hint: 'Pomodoro de 25 min', onPress: () => { closeAdd(); startFocus(); router.push('/enfoque'); } },
  ];

  return (
    <Panel visible={visible} onClose={closeAdd}>
      <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 10 }} accessibilityRole="header">Agregar</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: text ? C.brand : C.line, borderRadius: 12, paddingLeft: 12, paddingRight: 4, overflow: 'hidden' }}>
        <Ionicons name="add" size={20} color={C.muted} />
        <TextInput value={text} onChangeText={setText} autoFocus placeholder='Ej: "parcial cálculo viernes 10am"' placeholderTextColor={C.muted}
          onSubmitEditing={quickCreate} returnKeyType="done" accessibilityLabel="Escribe una tarea"
          style={[{ flex: 1, minWidth: 0, color: C.text, fontSize: 15, paddingVertical: 12, minHeight: 46 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
        {!!text.trim() && <Button label="Agregar" size="sm" onPress={quickCreate} busy={busy} style={{ marginRight: 6 }} />}
      </View>
      {parsed ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>Se entiende como:</Text>
          <Chip text={parsed.title} strong />
          {tmeta && <Chip text={tmeta.label} color={tmeta.color} />}
          {subj && <Chip text={subj.name} color={subj.color} dot />}
          {parsed.dueDate && <Chip text={fmtDay(fromISODate(parsed.dueDate)) + (parsed.dueTime ? ', ' + fmtHHMM(parsed.dueTime) : '')} icon="calendar-outline" />}
          {!parsed.dueDate && <Chip text="Sin fecha" icon="calendar-outline" />}
        </View>
      ) : (
        <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 8 }}>Escribe la tarea con su materia, día y hora; Kaderno entiende el resto. Enter para agregar.</Text>
      )}
      <ScrollView style={{ marginTop: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {actions.map((a) => (
            <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.label}
              style={({ pressed, hovered }: any) => ({ flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: pressed || hovered ? C.surface2 : C.bg })}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.brand + '1f', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={a.icon} size={18} color={C.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 13.5 }}>{a.label}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={2}>{a.hint}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Panel>
  );
}

function Chip({ text, color, dot, icon, strong }: { text: string; color?: string; dot?: boolean; icon?: any; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 99, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line }}>
      {dot && color ? <Dot color={color} /> : null}
      {icon ? <Ionicons name={icon} size={12} color={C.muted} /> : null}
      {color && !dot ? <Dot color={color} size={7} /> : null}
      <Text style={{ color: C.text, fontSize: 12.5, fontWeight: strong ? '700' : '600' }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// ---------- Paleta de comandos ----------
type Cmd = { id: string; icon: any; label: string; hint?: string; run: () => void; color?: string };
type Hits = { notes: Note[]; tasks: Task[]; subjects: Subject[]; flashcards: Flashcard[]; projectTasks: ProjectTaskHit[] };

function CommandPalette({ visible }: { visible: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hits | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  useEffect(() => { if (visible) { setQ(''); setHits(null); setSel(0); } }, [visible]);

  useEffect(() => {
    if (!q.trim()) { setHits(null); return; }
    const id = setTimeout(async () => {
      setBusy(true);
      try { setHits(await search(q.trim())); } catch { setHits(null); } finally { setBusy(false); }
    }, 220);
    return () => clearTimeout(id);
  }, [q]);

  const go = useCallback((href: string | object) => { closeCommand(); router.push(href as any); }, [router]);
  const base: Cmd[] = useMemo(() => [
    { id: 'new', icon: 'add-circle-outline', label: 'Agregar tarea', hint: 'N', run: () => { closeCommand(); openAdd(); } },
    { id: 'hoy', icon: 'today-outline', label: 'Ir a Hoy', run: () => go('/') },
    { id: 'mat', icon: 'book-outline', label: 'Ir a Materias', run: () => go('/materias') },
    { id: 'hor', icon: 'grid-outline', label: 'Ir a Horario', run: () => go('/horario') },
    { id: 'pro', icon: 'people-outline', label: 'Ir a Proyectos', run: () => go('/proyectos') },
    { id: 'est', icon: 'school-outline', label: 'Ir a Estudiar', run: () => go('/estudiar') },
    { id: 'enf', icon: 'timer-outline', label: 'Empezar enfoque (25 min)', run: () => { startFocus(); go('/enfoque'); } },
    { id: 'rep', icon: 'albums-outline', label: 'Repasar flashcards', run: () => go('/repaso') },
    { id: 'ora', icon: 'sparkles-outline', label: 'Preguntar al Oráculo', run: () => go('/oraculo') },
    { id: 'cap', icon: 'camera-outline', label: 'Digitalizar apunte', run: () => go('/capturar') },
    { id: 'imp', icon: 'download-outline', label: 'Importar entregas del sílabo', run: () => go('/importar') },
    { id: 'aju', icon: 'settings-outline', label: 'Ajustes y cuenta', run: () => go('/ajustes') },
    { id: 'per', icon: 'color-palette-outline', label: 'Cambiar tema y apariencia', run: () => go('/personalizar') },
    { id: 'pap', icon: 'trash-outline', label: 'Papelera', run: () => go('/papelera') },
  ], [go]);

  const items: { section: string; cmds: Cmd[] }[] = useMemo(() => {
    const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qq = n(q.trim());
    const acts = qq ? base.filter((c) => n(c.label).includes(qq)) : base;
    const out: { section: string; cmds: Cmd[] }[] = [];
    if (hits) {
      if (hits.subjects.length) out.push({ section: 'Materias', cmds: hits.subjects.map((s) => ({ id: 's' + s.id, icon: 'book-outline', color: s.color, label: s.name, run: () => go(`/materia/${s.id}`) })) });
      if (hits.tasks.length) out.push({ section: 'Tareas', cmds: hits.tasks.map((t) => ({ id: 't' + t.id, icon: t.status === 'done' ? 'checkmark-circle' : 'ellipse-outline', label: t.title, hint: fmtDue(t), run: () => { closeCommand(); openTask(t); } })) });
      if (hits.projectTasks.length) out.push({ section: 'Tareas de proyectos', cmds: hits.projectTasks.map((t) => ({ id: 'p' + t.id, icon: 'people-outline', label: t.title, hint: fmtDue(t), run: () => go(`/proyectos/${t.project_id}`) })) });
      if (hits.notes.length) out.push({ section: 'Notas', cmds: hits.notes.map((x) => ({ id: 'n' + x.id, icon: 'document-text-outline', label: x.title || 'Nota', hint: (x.content ?? '').slice(0, 60), run: () => go(`/nota/${x.id}`) })) });
      if (hits.flashcards.length) out.push({ section: 'Flashcards', cmds: hits.flashcards.map((c) => ({ id: 'f' + c.id, icon: 'albums-outline', label: c.front, hint: c.back.slice(0, 60), run: () => go('/repaso') })) });
    }
    if (acts.length) out.push({ section: qq ? 'Acciones' : 'Ir a…', cmds: acts });
    return out;
  }, [hits, q, base, go]);
  const flat = items.flatMap((s) => s.cmds);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(flat.length - 1, x + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); flat[sel]?.run(); }
    };
    // En captura: el campo de texto de react-native-web no deja subir el Enter.
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [visible, flat, sel]);
  useEffect(() => { setSel(0); }, [q, hits]);

  let idx = -1;
  return (
    <Panel visible={visible} onClose={closeCommand} top maxWidth={620}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12 }}>
        <Ionicons name="search" size={18} color={C.muted} />
        <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Busca notas, tareas, materias… o escribe una acción" placeholderTextColor={C.muted}
          accessibilityLabel="Buscar"
          style={[{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 12, minHeight: 46 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
        {busy && <ActivityIndicator size="small" color={C.brand} />}
        {Platform.OS === 'web' && <Kbd text="Esc" />}
      </View>
      <ScrollView style={{ marginTop: 10 }} keyboardShouldPersistTaps="handled">
        {q.trim() && hits && !items.some((s) => s.section !== 'Acciones') && !busy && (
          <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 16 }}>Sin resultados para “{q.trim()}”.</Text>
        )}
        {items.map((s) => (
          <View key={s.section} style={{ marginBottom: 6 }}>
            <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 8, paddingVertical: 6 }}>{s.section}</Text>
            {s.cmds.map((c) => {
              idx += 1; const on = idx === sel; const myIdx = idx;
              return (
                <Pressable key={c.id} onPress={c.run} onHoverIn={() => setSel(myIdx)} accessibilityRole="button" accessibilityLabel={c.label}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, minHeight: 44, backgroundColor: on ? C.brand + '22' : 'transparent' }}>
                  {c.color ? <Dot color={c.color} size={10} /> : <Ionicons name={c.icon} size={18} color={on ? C.brand : C.muted} />}
                  <Text style={{ color: C.text, fontSize: 14.5, flex: 1 }} numberOfLines={1}>{c.label}</Text>
                  {!!c.hint && <Text style={{ color: C.muted, fontSize: 12, maxWidth: 200 }} numberOfLines={1}>{c.hint}</Text>}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </Panel>
  );
}

// ---------- Bandeja de avisos ----------
function InboxPanel({ visible }: { visible: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    setItems(null);
    getNotifications().then((xs) => {
      setItems(xs);
      if (xs.some((x) => !x.read_at)) setTimeout(() => { markNotificationsRead().then(() => setNavCounts({ unread: 0 })).catch(() => {}); }, 800);
    }).catch(() => setItems([]));
  }, [visible]);
  const icon = (k: string): any => k === 'reminder' ? 'alarm-outline' : k === 'daily' ? 'sunny-outline' : k === 'weekly' ? 'stats-chart-outline' : k === 'assigned' ? 'person-add-outline' : 'people-outline';
  return (
    <Panel visible={visible} onClose={closeInbox} top maxWidth={480}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', flex: 1 }} accessibilityRole="header">Avisos</Text>
        <IconButton icon="settings-outline" label="Configurar avisos" onPress={() => { closeInbox(); router.push({ pathname: '/ajustes', params: { s: 'avisos' } } as any); }} />
        <IconButton icon="close" label="Cerrar" onPress={closeInbox} />
      </View>
      {items === null ? <ActivityIndicator color={C.brand} style={{ marginVertical: 24 }} /> : items.length === 0 ? (
        <EmptyState compact icon="notifications-off-outline" title="Sin avisos por ahora"
          text="Aquí llegan los recordatorios de entregas, el resumen del día y las tareas que te asignen en proyectos."
          action={{ label: 'Activar notificaciones', onPress: () => { closeInbox(); router.push({ pathname: '/ajustes', params: { s: 'avisos' } } as any); } }} />
      ) : (
        <ScrollView>
          {items.map((n) => (
            <Pressable key={n.id} onPress={() => { closeInbox(); if (n.url) router.push(n.url as any); }} accessibilityRole="button"
              style={({ hovered }: any) => ({ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 12, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.brand + '1f', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={icon(n.kind)} size={17} color={C.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: n.read_at ? '600' : '800', fontSize: 14 }}>{n.title}</Text>
                {!!n.body && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{n.body}</Text>}
                <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 3 }}>{timeAgo(n.created_at)}</Text>
              </View>
              {!n.read_at && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand, marginTop: 6 }} />}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Panel>
  );
}

function timeAgo(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
