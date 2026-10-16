import { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { Step, addStep, deleteStep, renameStep, reorderSteps, toggleStep } from '../lib/db';
import { ProgressBar } from './ProgressBar';
import { play } from '../lib/sound';

// ============================================================
//  Microtareas (checklist dentro de una tarea)
//
//  Funciona en dos modos:
//   · assignmentId = string  -> escribe directo en la base (tarea ya existente)
//   · assignmentId = null    -> sólo memoria, con ids temporales 'tmp-*'.
//     Lo usa el modal al CREAR una tarea: primero se guarda la tarea y después
//     el padre recorre los pasos temporales y los inserta.
//
//  Siempre es optimista: primero se pinta el cambio, después se guarda; si la
//  base falla se revierte al valor anterior.
// ============================================================

export function isTempStep(s: Step): boolean { return s.id.startsWith('tmp-'); }

let tmpSeq = 0;
function tmpId(): string { tmpSeq += 1; return `tmp-${tmpSeq}`; }

export function SubtaskList({
  assignmentId, steps, onChange, editable = true, compact = false, autoFocusInput = false,
}: {
  assignmentId: string | null;
  steps: Step[];
  onChange: (next: Step[]) => void;
  editable?: boolean;
  compact?: boolean;
  autoFocusInput?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const sorted = [...steps].sort((a, b) => a.position - b.position);
  const done = sorted.filter((s) => s.done).length;

  async function guard(next: Step[], op: () => Promise<void>) {
    const prev = steps;
    onChange(next);
    if (!assignmentId) return;
    try { await op(); } catch { onChange(prev); }
  }

  async function onToggle(s: Step) {
    play(s.done ? 'uncheck' : 'step');
    const next = steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x));
    await guard(next, () => toggleStep(s.id, !s.done));
  }

  async function onDelete(s: Step) {
    const next = steps.filter((x) => x.id !== s.id).map((x, i) => ({ ...x, position: i }));
    await guard(next, () => deleteStep(s.id));
  }

  async function onMove(s: Step, dir: -1 | 1) {
    const i = sorted.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const arr = [...sorted];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const next = arr.map((x, k) => ({ ...x, position: k }));
    await guard(next, () => reorderSteps(next.map((x) => ({ id: x.id, position: x.position }))));
  }

  async function commitRename(s: Step) {
    const title = editText.trim();
    setEditingId(null);
    if (!title || title === s.title) return;
    const next = steps.map((x) => (x.id === s.id ? { ...x, title } : x));
    await guard(next, () => renameStep(s.id, title));
  }

  async function onAdd() {
    const title = draft.trim();
    if (!title || busy) return;
    setDraft('');
    const position = sorted.length;
    if (!assignmentId) {
      onChange([...steps, { id: tmpId(), assignment_id: '', title, done: false, position }]);
      return;
    }
    setBusy(true);
    try {
      const row = await addStep(assignmentId, title, position);
      onChange([...steps, row]);
    } catch {
      setDraft(title); // se devuelve el texto para no perderlo
    } finally { setBusy(false); }
  }

  const box = compact ? 18 : 20;

  return (
    <View>
      {sorted.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <ProgressBar done={done} total={sorted.length} compact={compact} />
        </View>
      )}

      {sorted.map((s, i) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: compact ? 3 : 5 }}>
          <Pressable
            key={s.done ? 'si' : 'no'}
            dataSet={s.done ? { anim: 'pop' } : undefined}
            onPress={() => onToggle(s)}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: s.done }}
            accessibilityLabel={s.title}
            style={{
              width: box, height: box, borderRadius: 6, borderWidth: 2,
              borderColor: s.done ? C.good : C.line, backgroundColor: s.done ? C.good : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {s.done && <Ionicons name="checkmark" size={compact ? 12 : 14} color={C.bg} />}
          </Pressable>

          {editingId === s.id ? (
            <TextInput
              value={editText}
              onChangeText={setEditText}
              onBlur={() => commitRename(s)}
              onSubmitEditing={() => commitRename(s)}
              autoFocus
              style={{
                flex: 1, color: C.text, fontSize: compact ? 13 : 14, backgroundColor: C.surface2,
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: Platform.OS === 'web' ? 6 : 4,
              }}
            />
          ) : (
            <Pressable
              style={{ flex: 1 }}
              onPress={() => { if (editable) { setEditingId(s.id); setEditText(s.title); } else { onToggle(s); } }}
            >
              <Text style={{
                color: s.done ? C.muted : C.text, fontSize: compact ? 13 : 14,
                textDecorationLine: s.done ? 'line-through' : 'none',
              }}>{s.title}</Text>
            </Pressable>
          )}

          {editable && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              {sorted.length > 1 && (<>
                <Pressable onPress={() => onMove(s, -1)} hitSlop={6} disabled={i === 0} accessibilityLabel="Subir">
                  <Ionicons name="chevron-up" size={16} color={i === 0 ? C.line : C.muted} />
                </Pressable>
                <Pressable onPress={() => onMove(s, 1)} hitSlop={6} disabled={i === sorted.length - 1} accessibilityLabel="Bajar">
                  <Ionicons name="chevron-down" size={16} color={i === sorted.length - 1 ? C.line : C.muted} />
                </Pressable>
              </>)}
              <Pressable onPress={() => onDelete(s)} hitSlop={6} accessibilityLabel="Borrar microtarea" style={{ paddingLeft: 4 }}>
                <Ionicons name="close" size={16} color={C.muted} />
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {editable && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Ionicons name="add" size={box} color={C.muted} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={onAdd}
            placeholder="Agregar paso…"
            placeholderTextColor={C.muted}
            autoFocus={autoFocusInput}
            returnKeyType="done"
            blurOnSubmit={false}
            style={{
              flex: 1, color: C.text, fontSize: compact ? 13 : 14, backgroundColor: C.surface2,
              borderRadius: 8, paddingHorizontal: 10, paddingVertical: Platform.OS === 'web' ? 8 : 6,
            }}
          />
          {!!draft.trim() && (
            <Pressable onPress={onAdd} hitSlop={8} accessibilityLabel="Agregar">
              <Ionicons name="arrow-forward-circle" size={24} color={C.brand} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
