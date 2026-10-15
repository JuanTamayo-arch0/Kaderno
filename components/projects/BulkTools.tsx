import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, R, uiScheme } from '../../lib/theme';
import { SIDEBAR_W } from '../../lib/responsive';
import { confirm, notify } from '../../lib/confirm';
import { saveFile } from '../../lib/fileIO';
import { BoardColumn, Member, PTask, Project, colorOf, initialsOf, nameOf } from '../../lib/projects';
import {
  bulkUpdateProjectTasks, getProjectTasksForBulk, importColumns, importMembers, type BatchResult,
} from '../../lib/projectsBulk';
import {
  encodeUtf8, exportFileName, formatHuman, previewShift, tasksToCsv, tasksToJson,
  type ExistingTask, type ShiftTarget,
} from '../../lib/import';

// ============================================================
//  Edición en masa: barra de selección, sus ventanas, y exportar.
// ============================================================

const isWeb = Platform.OS === 'web';

export type BulkAction = 'columna' | 'responsable' | 'fecha' | 'correr' | 'borrar';

// ---------- Barra que aparece al seleccionar tarjetas ----------

export function BulkBar({ count, total, isWide, onSelectAll, onClear, onAction }: {
  count: number; total: number; isWide: boolean;
  onSelectAll: () => void; onClear: () => void; onAction: (a: BulkAction) => void;
}) {
  const acciones: { key: BulkAction; icon: string; label: string; danger?: boolean }[] = [
    { key: 'columna', icon: 'albums-outline', label: 'Columna' },
    { key: 'responsable', icon: 'person-outline', label: 'Responsable' },
    { key: 'fecha', icon: 'calendar-outline', label: 'Entrega' },
    { key: 'correr', icon: 'play-forward-outline', label: 'Correr fechas' },
    { key: 'borrar', icon: 'trash-outline', label: 'Borrar', danger: true },
  ];
  return (
    <View style={{ position: 'absolute', left: isWide ? SIDEBAR_W + 24 : 10, right: isWide ? 24 : 10, bottom: isWide ? 20 : 14, alignItems: 'center' }} pointerEvents="box-none">
      <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.brand + '88', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, maxWidth: 900, width: '100%', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>
          {count} {count === 1 ? 'seleccionada' : 'seleccionadas'}
        </Text>
        <Pressable onPress={count === total ? onClear : onSelectAll} hitSlop={6}>
          <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '600' }}>{count === total ? 'Quitar todas' : `Todas (${total})`}</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 8 }} />
        {acciones.map((a) => (
          <Pressable key={a.key} onPress={() => count > 0 && onAction(a.key)} disabled={count === 0}
            accessibilityLabel={a.label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: isWide ? 11 : 9, borderRadius: R.pill, borderWidth: 1, borderColor: a.danger ? C.bad + '66' : C.line, opacity: count === 0 ? 0.4 : 1 }}>
            <Ionicons name={a.icon as any} size={15} color={a.danger ? C.bad : C.text} />
            {isWide && <Text style={{ color: a.danger ? C.bad : C.text, fontSize: 12.5, fontWeight: '600' }}>{a.label}</Text>}
          </Pressable>
        ))}
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Terminar selección" style={{ padding: 4 }}>
          <Ionicons name="close" size={19} color={C.muted} />
        </Pressable>
      </View>
    </View>
  );
}

// ---------- Borrar en masa ----------

export async function confirmBulkDelete(projectId: string, tasks: PTask[]): Promise<{ r: BatchResult; text: string } | null> {
  const n = tasks.length;
  const nTxt = `${n} ${n === 1 ? 'tarea' : 'tareas'}`;
  const ok = await confirm(`¿Borrar ${nTxt}?`, 'Se borran para todo el equipo. Podrás deshacerlo justo después.', 'Borrar');
  if (!ok) return null;
  const r = await bulkUpdateProjectTasks(projectId, tasks.map((t) => t.id), { delete: true });
  return { r, text: `${nTxt} ${n === 1 ? 'borrada' : 'borradas'}` };
}

// ---------- Ventanas de cada acción ----------

function toExisting(t: PTask): ExistingTask {
  return {
    id: t.id, title: t.title, description: t.description, status: t.status, done: t.done,
    assignee_id: t.assignee_id, start_at: t.start_at ?? null,
    due_at: t.due_at ?? (t.due_date ? new Date(`${t.due_date}T23:59:00`).toISOString() : null),
    checklist: [],
  };
}

export function BulkDialog({ action, projectId, tasks, cols, members, onClose, onDone }: {
  action: BulkAction | null; projectId: string; tasks: PTask[]; cols: BoardColumn[]; members: Member[];
  onClose: () => void; onDone: (r: BatchResult, text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const ids = tasks.map((t) => t.id);
  const n = tasks.length;
  const nTxt = `${n} ${n === 1 ? 'tarea' : 'tareas'}`;

  async function run(patch: Parameters<typeof bulkUpdateProjectTasks>[2], text: string) {
    setBusy(true);
    try {
      const r = await bulkUpdateProjectTasks(projectId, ids, patch);
      onDone(r, text);
    } catch (e: any) { notify('No se pudo aplicar', e.message); }
    finally { setBusy(false); }
  }

  // Borrar no abre ventana: lo resuelve confirmBulkDelete desde la pantalla.
  if (action === 'borrar') return null;

  return (
    <Modal visible={!!action} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 480, maxHeight: '90%' }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {action === 'columna' && (
              <>
                <Title text={`Mover ${nTxt} a…`} onClose={onClose} />
                {cols.map((c) => (
                  <Option key={c.key} busy={busy} onPress={() => run({ status: c.key }, `${nTxt} movidas a ${c.label}`)}
                    left={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />}
                    text={c.label} hint={c.done ? 'termina aquí' : undefined} />
                ))}
              </>
            )}
            {action === 'responsable' && (
              <>
                <Title text={`¿Quién hace estas ${n}?`} onClose={onClose} />
                <Option busy={busy} onPress={() => run({ assignee_id: null }, `${nTxt} sin asignar`)}
                  left={<Ionicons name="person-remove-outline" size={16} color={C.muted} />} text="Nadie (sin asignar)" />
                {members.filter((m) => m.role !== 'viewer').map((m) => (
                  <Option key={m.id} busy={busy} onPress={() => run({ assignee_id: m.user_id }, `${nTxt} asignadas a ${nameOf(m.profile)}`)}
                    left={<View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colorOf(m.user_id), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#0f1115', fontSize: 9, fontWeight: '800' }}>{initialsOf(m.profile)}</Text>
                    </View>}
                    text={nameOf(m.profile)} hint={m.profile?.email ?? undefined} />
                ))}
              </>
            )}
            {action === 'fecha' && <DueForm n={n} busy={busy} onClose={onClose} onApply={(iso) => run({ due_at: iso }, iso ? `Entrega de ${nTxt}: ${formatHuman(iso)}` : `${nTxt} sin fecha`)} />}
            {action === 'correr' && <ShiftForm tasks={tasks.map(toExisting)} busy={busy} onClose={onClose}
              onApply={(days, target) => run({ shift_days: days, shift_target: target }, `Fechas de ${nTxt} corridas ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'} ${days >= 0 ? 'hacia adelante' : 'hacia atrás'}`)} />}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Title({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
      <Text style={{ color: C.text, fontSize: 16.5, fontWeight: '700', flex: 1 }}>{text}</Text>
      <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar"><Ionicons name="close" size={20} color={C.muted} /></Pressable>
    </View>
  );
}

function Option({ left, text, hint, busy, onPress }: { left: React.ReactNode; text: string; hint?: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={busy}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: pressed ? C.surface2 : 'transparent', opacity: busy ? 0.5 : 1 })}>
      {left}
      <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{text}</Text>
      {hint ? <Text style={{ color: C.muted, fontSize: 11.5 }}>{hint}</Text> : null}
    </Pressable>
  );
}

function pad(n: number) { return String(n).padStart(2, '0'); }

/** Fecha y hora locales → ISO. Sin hora, la entrega queda a las 11:59 p. m. */
function localIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T${/^\d{2}:\d{2}$/.test(time) ? time : '23:59'}:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function DueForm({ n, busy, onClose, onApply }: { n: number; busy: boolean; onClose: () => void; onApply: (iso: string | null) => void }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [picker, setPicker] = useState(false);
  const iso = localIso(date, time);
  const webInput = (type: 'date' | 'time', value: string, set: (v: string) => void) =>
    React.createElement('input', {
      type, value, onChange: (e: any) => set(e.target.value),
      style: { backgroundColor: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, color: C.text, padding: 12, fontSize: 14, colorScheme: uiScheme(), flex: 1, minWidth: 0, boxSizing: 'border-box' },
    });
  return (
    <>
      <Title text={`Entrega de ${n} ${n === 1 ? 'tarea' : 'tareas'}`} onClose={onClose} />
      <Text style={{ color: C.muted, fontSize: 12.5, marginBottom: 10 }}>Todas quedan con la misma fecha y hora. Sin hora, a las 11:59 p. m.</Text>
      {isWeb ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {webInput('date', date, setDate)}
          {webInput('time', time, setTime)}
        </View>
      ) : (
        <>
          <Pressable onPress={() => setPicker(true)} style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, padding: 12 }}>
            <Text style={{ color: date ? C.text : C.muted }}>{date || 'Elegir fecha'}</Text>
          </Pressable>
          {picker && (
            <DateTimePicker value={date ? new Date(`${date}T12:00:00`) : new Date()} mode="date"
              onChange={(_, d) => { setPicker(false); if (d) setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); }} />
          )}
        </>
      )}
      <Pressable onPress={() => iso && onApply(iso)} disabled={!iso || busy}
        style={{ backgroundColor: iso ? C.brand : C.surface2, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 16 }}>
        {busy ? <ActivityIndicator color={C.onBrand} /> : <Text style={{ color: iso ? C.onBrand : C.muted, fontWeight: '700' }}>Poner esta entrega</Text>}
      </Pressable>
      <Pressable onPress={() => onApply(null)} disabled={busy} style={{ alignItems: 'center', marginTop: 12 }}>
        <Text style={{ color: C.muted, fontSize: 13 }}>Quitarles la fecha</Text>
      </Pressable>
    </>
  );
}

function ShiftForm({ tasks, busy, onClose, onApply }: {
  tasks: ExistingTask[]; busy: boolean; onClose: () => void; onApply: (days: number, target: ShiftTarget) => void;
}) {
  const [days, setDays] = useState(7);
  const [target, setTarget] = useState<ShiftTarget>('ambas');
  const prev = useMemo(() => previewShift(tasks, days, target), [tasks, days, target]);
  const step = (d: number) => setDays((v) => Math.max(-365, Math.min(365, v + d)));

  return (
    <>
      <Title text="Correr fechas" onClose={onClose} />
      <Text style={{ color: C.muted, fontSize: 12.5, marginBottom: 12, lineHeight: 18 }}>
        Para cuando el profesor aplaza la entrega. La hora de cada tarea se conserva.
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
        <Pressable onPress={() => step(-1)} style={stepBtn} accessibilityLabel="Un día menos"><Ionicons name="remove" size={18} color={C.text} /></Pressable>
        <TextInput value={String(days)} keyboardType="numbers-and-punctuation"
          onChangeText={(t) => { const v = parseInt(t.replace(/[^\d-]/g, ''), 10); setDays(isNaN(v) ? 0 : Math.max(-365, Math.min(365, v))); }}
          style={{ width: 80, textAlign: 'center', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 10, fontSize: 18, fontWeight: '700' }} />
        <Pressable onPress={() => step(1)} style={stepBtn} accessibilityLabel="Un día más"><Ionicons name="add" size={18} color={C.text} /></Pressable>
        <Text style={{ color: C.muted, fontSize: 13 }}>{Math.abs(days) === 1 ? 'día' : 'días'} {days >= 0 ? 'después' : 'antes'}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        {[-7, -1, 1, 3, 7, 14].map((d) => (
          <Pressable key={d} onPress={() => setDays(d)} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: R.pill, borderWidth: 1, borderColor: days === d ? C.brand : C.line }}>
            <Text style={{ color: days === d ? C.brand : C.muted, fontSize: 12 }}>{d > 0 ? `+${d}` : d}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ color: C.muted, fontSize: 12, marginTop: 16, marginBottom: 8 }}>¿Qué fechas se mueven?</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([['ambas', 'Inicio y entrega'], ['entrega', 'Solo la entrega']] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTarget(k)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 11, borderWidth: 1, alignItems: 'center', borderColor: target === k ? C.brand : C.line, backgroundColor: target === k ? C.brand + '1c' : 'transparent' }}>
            <Text style={{ color: target === k ? C.brand : C.text, fontSize: 13, fontWeight: target === k ? '700' : '500' }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ backgroundColor: C.surface2 + '80', borderRadius: 12, padding: 12, marginTop: 14 }}>
        <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{days === 0 ? 'Sin cambios' : prev.summary}</Text>
        {prev.withoutDates > 0 && <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{prev.withoutDates} sin fecha: no se tocan.</Text>}
        {prev.invalidCount > 0 && <Text style={{ color: C.bad, fontSize: 12, marginTop: 4 }}>
          {prev.invalidCount} quedarían con el inicio después de la entrega. Usa «Inicio y entrega» o menos días.
        </Text>}
      </View>

      <Pressable onPress={() => onApply(days, target)} disabled={busy || days === 0 || prev.invalidCount > 0 || prev.items.length === 0}
        style={{ backgroundColor: days !== 0 && prev.invalidCount === 0 && prev.items.length > 0 ? C.brand : C.surface2, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 16 }}>
        {busy ? <ActivityIndicator color="#0f1115" /> : (
          <Text style={{ color: days !== 0 && prev.invalidCount === 0 && prev.items.length > 0 ? C.onBrand : C.muted, fontWeight: '700' }}>
            Correr {prev.items.length} {prev.items.length === 1 ? 'tarea' : 'tareas'}
          </Text>
        )}
      </Pressable>
    </>
  );
}

const stepBtn = { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' } as const;

// ---------- Exportar ----------

export function ExportSheet({ visible, project, members, onClose }: {
  visible: boolean; project: Project; members: Member[]; onClose: () => void;
}) {
  const [busy, setBusy] = useState<'csv' | 'json' | null>(null);

  async function exportar(kind: 'csv' | 'json') {
    setBusy(kind);
    try {
      const tasks = await getProjectTasksForBulk(project.id);
      const ms = importMembers(members);
      const cols = importColumns(project);
      if (kind === 'csv') {
        await saveFile(exportFileName(project.name, 'csv'), encodeUtf8(tasksToCsv(tasks, ms, cols), true), 'text/csv');
      } else {
        await saveFile(exportFileName(project.name, 'json'), tasksToJson(tasks, ms, cols), 'application/json');
      }
      onClose();
    } catch (e: any) { notify('No se pudo exportar', e.message); }
    finally { setBusy(null); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 460 }}>
          <Title text="Exportar tareas" onClose={onClose} />
          <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 19, marginBottom: 14 }}>
            El archivo trae una columna id. Edítalo (en Excel o con una IA) y súbelo con «Importar»: las tareas se actualizan en vez de duplicarse.
            Nada se borra por faltar en el archivo; para borrar una, escribe «sí» en la columna eliminar.
          </Text>
          {([['csv', 'Excel / CSV', 'document-text-outline', 'Se abre directo en Excel en español'], ['json', 'JSON', 'code-slash-outline', 'Para pasárselo a una IA']] as const).map(([k, l, icon, hint]) => (
            <Pressable key={k} onPress={() => exportar(k)} disabled={!!busy}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: C.line, marginBottom: 8, backgroundColor: pressed ? C.surface2 : 'transparent' })}>
              {busy === k ? <ActivityIndicator color={C.brand} /> : <Ionicons name={icon as any} size={20} color={C.brand} />}
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{l}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>{hint}</Text>
              </View>
              <Ionicons name="download-outline" size={17} color={C.muted} />
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
