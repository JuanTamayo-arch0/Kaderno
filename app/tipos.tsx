import React, { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '../components/RequireAuth';
import { useFocusEffect, useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, SUBJECT_COLORS } from '../lib/theme';
import { useResponsive } from '../lib/responsive';
import { confirm, notify } from '../lib/confirm';
import { countTasksByType, deleteTaskType, retypeTasks, upsertTaskType } from '../lib/db';
import { TypeMeta, loadTaskTypes, taskTypeList, uniqueTypeKey } from '../lib/taskTypes';
import { sheet, input, lbl, btnPrimary } from '../components/ui';

// ============================================================
//  Tipos de tarea.
//  Los cuatro de siempre (Tarea, Examen, Quiz, Proyecto) no se pueden borrar,
//  pero sí renombrar y cambiarles ícono y color: al guardarlos se crea una fila
//  en task_types con la misma clave, así que la clave que ya tienen las tareas
//  guardadas nunca cambia.
//  Los tipos propios sí se borran; al borrarlos sus tareas pasan a "Tarea".
// ============================================================

const TYPE_ICONS = [
  '📝', '📕', '✍️', '📦', '📚', '🧪', '🔬', '🧮', '💻', '🎤', '🎨', '🎵',
  '🏃', '🗂️', '📖', '🔖', '⏰', '🎯', '🧩', '🗒️', '📊', '🎓', '🛠️', '🎬',
];
const TYPE_COLORS = [...SUBJECT_COLORS, '#e05fa0', '#7ed957', '#ffa94d', '#9aa7b8'];

type Draft = { key: string | null; label: string; icon: string; color: string; position: number; builtin: boolean };

function Tipos() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const [types, setTypes] = useState<TypeMeta[]>(taskTypeList());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    try { setTypes(await loadTaskTypes()); } catch { setTypes(taskTypeList()); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  function openNew() {
    setDraft({ key: null, label: '', icon: TYPE_ICONS[4], color: TYPE_COLORS[0], position: types.length, builtin: false });
  }
  function openEdit(t: TypeMeta) {
    setDraft({ key: t.key, label: t.label, icon: t.icon, color: t.color, position: t.position, builtin: t.builtin });
  }

  async function save() {
    if (!draft) return;
    const label = draft.label.trim();
    if (!label) { notify('Ponle un nombre al tipo'); return; }
    setBusy(true);
    try {
      const key = draft.key ?? uniqueTypeKey(label);
      await upsertTaskType({ key, label, icon: draft.icon, color: draft.color, position: draft.position });
      await refresh();
      setDraft(null);
    } catch (e: any) { notify('No se pudo guardar', e?.message ?? 'Intenta de nuevo'); }
    finally { setBusy(false); }
  }

  async function remove(t: TypeMeta) {
    if (t.builtin) return;
    let n = 0;
    try { n = await countTasksByType(t.key); } catch { /* si falla el conteo, seguimos */ }
    const msg = n > 0
      ? `${n} ${n === 1 ? 'tarea usa' : 'tareas usan'} este tipo. ${n === 1 ? 'Pasará' : 'Pasarán'} a "Tarea".`
      : 'No hay tareas con este tipo.';
    if (!(await confirm(`¿Borrar "${t.label}"?`, msg, 'Borrar'))) return;
    setBusy(true);
    try {
      if (n > 0) await retypeTasks(t.key, 'tarea');
      await deleteTaskType(t.key);
      await refresh();
    } catch (e: any) { notify('No se pudo borrar', e?.message ?? 'Intenta de nuevo'); }
    finally { setBusy(false); }
  }

  // Devuelve un builtin a su apariencia original borrando su fila.
  async function reset(t: TypeMeta) {
    if (!t.builtin) return;
    if (!(await confirm(`¿Restablecer "${t.label}"?`, 'Volverá al nombre, ícono y color originales.', 'Restablecer'))) return;
    setBusy(true);
    try { await deleteTaskType(t.key); await refresh(); }
    catch (e: any) { notify('No se pudo restablecer', e?.message ?? 'Intenta de nuevo'); }
    finally { setBusy(false); }
  }

  // Mover un tipo cambia sólo su posición; se guardan los dos que se cruzan.
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= types.length) return;
    const a = types[i]; const b = types[j];
    const next = [...types];
    next[i] = b; next[j] = a;
    setTypes(next.map((t, idx) => ({ ...t, position: idx })));
    try {
      await upsertTaskType({ key: a.key, label: a.label, icon: a.icon, color: a.color, position: j });
      await upsertTaskType({ key: b.key, label: b.label, icon: b.icon, color: b.color, position: i });
      await refresh();
    } catch (e: any) { notify('No se pudo reordenar', e?.message ?? 'Intenta de nuevo'); void refresh(); }
  }

  useEffect(() => {
    // Conteo en segundo plano para mostrar "3 tareas" en cada fila.
    let alive = true;
    (async () => {
      const out: Record<string, number> = {};
      for (const t of types) {
        try { out[t.key] = await countTasksByType(t.key); } catch { /* noop */ }
      }
      if (alive) setCounts(out);
    })();
    return () => { alive = false; };
  }, [types.map((t) => t.key).join(',')]);

  const customCount = types.filter((t) => !t.builtin).length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Alineada con la columna de contenido (máx. 760) para que en escritorio
          el título quede sobre las tarjetas y no en la esquina. */}
      <View style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 792, width: '100%', alignSelf: 'center' }}>
        <Pressable onPress={goBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </Pressable>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', flex: 1 }}>Tipos de tarea</Text>
        <Pressable onPress={openNew} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="add-circle" size={20} color={C.brand} />
          <Text style={{ color: C.brand, fontSize: 13.5, fontWeight: '700' }}>Nuevo</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <Text style={{ color: C.muted, fontSize: 13, marginBottom: 14, lineHeight: 19 }}>
          Además de los cuatro de siempre puedes crear los tuyos: laboratorio, exposición, lectura…
          Los cuatro originales no se borran, pero puedes cambiarles nombre, ícono y color.
        </Text>

        <View style={{ gap: 10 }}>
          {types.map((t, i) => (
            <View key={t.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.lg, padding: 12, borderLeftWidth: 4, borderLeftColor: t.color }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.color + '22' }}>
                <Text style={{ fontSize: 19 }}>{t.icon}</Text>
              </View>
              <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => openEdit(t)}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{t.label}</Text>
                <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>
                  {t.builtin ? 'Original' : 'Propio'}
                  {counts[t.key] !== undefined ? ` · ${counts[t.key]} ${counts[t.key] === 1 ? 'tarea' : 'tareas'}` : ''}
                </Text>
              </Pressable>

              <View style={{ gap: 2 }}>
                <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={4} accessibilityLabel="Subir">
                  <Ionicons name="chevron-up" size={16} color={i === 0 ? C.line : C.muted} />
                </Pressable>
                <Pressable onPress={() => move(i, 1)} disabled={i === types.length - 1} hitSlop={4} accessibilityLabel="Bajar">
                  <Ionicons name="chevron-down" size={16} color={i === types.length - 1 ? C.line : C.muted} />
                </Pressable>
              </View>

              <Pressable onPress={() => openEdit(t)} hitSlop={8} accessibilityLabel={`Editar ${t.label}`}>
                <Ionicons name="create-outline" size={18} color={C.muted} />
              </Pressable>
              {t.builtin ? (
                <Pressable onPress={() => reset(t)} hitSlop={8} accessibilityLabel={`Restablecer ${t.label}`}>
                  <Ionicons name="refresh-outline" size={18} color={C.muted} />
                </Pressable>
              ) : (
                <Pressable onPress={() => remove(t)} hitSlop={8} accessibilityLabel={`Borrar ${t.label}`}>
                  <Ionicons name="trash-outline" size={18} color={C.muted} />
                </Pressable>
              )}
            </View>
          ))}
        </View>

        {customCount === 0 && (
          <Pressable onPress={openNew} style={{ marginTop: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, borderRadius: R.lg, padding: 18, alignItems: 'center' }}>
            <Ionicons name="pricetags-outline" size={22} color={C.muted} />
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', marginTop: 8 }}>Crear mi primer tipo</Text>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 3, textAlign: 'center' }}>Laboratorio, exposición, lectura, entrega parcial…</Text>
          </Pressable>
        )}
      </ScrollView>

      <TypeEditor
        draft={draft} busy={busy} isWide={isWide}
        onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
        onClose={() => setDraft(null)}
        onSave={save}
      />
    </View>
  );
}

function TypeEditor({ draft, busy, isWide, onChange, onClose, onSave }: {
  draft: Draft | null; busy: boolean; isWide: boolean;
  onChange: (patch: Partial<Draft>) => void; onClose: () => void; onSave: () => void;
}) {
  const d = draft;
  const body = d && (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>
        {d.key ? 'Editar tipo' : 'Nuevo tipo'}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface2, borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: d.color + '22' }}>
          <Text style={{ fontSize: 20 }}>{d.icon}</Text>
        </View>
        <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: d.color + '22', borderWidth: 1, borderColor: d.color + '55' }}>
          <Text style={{ color: d.color, fontSize: 13, fontWeight: '700' }}>{d.icon} {d.label.trim() || 'Sin nombre'}</Text>
        </View>
      </View>

      <TextInput
        value={d.label} onChangeText={(v) => onChange({ label: v })}
        placeholder="Ej: Laboratorio" placeholderTextColor={C.muted}
        style={input} maxLength={28}
      />
      {d.builtin && (
        <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 6 }}>
          Es uno de los originales: puedes cambiar cómo se ve, pero las tareas que ya lo usan no se tocan.
        </Text>
      )}

      <Text style={lbl}>Ícono</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TYPE_ICONS.map((ic) => {
          const active = d.icon === ic;
          return (
            <Pressable key={ic} onPress={() => onChange({ icon: ic })}
              style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: active ? 2 : 1, borderColor: active ? d.color : C.line, backgroundColor: active ? d.color + '1a' : C.surface2 }}>
              <Text style={{ fontSize: 19 }}>{ic}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={lbl}>Color</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {TYPE_COLORS.map((col) => {
          const active = d.color.toLowerCase() === col.toLowerCase();
          return (
            <Pressable key={col} onPress={() => onChange({ color: col })}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: col, alignItems: 'center', justifyContent: 'center', borderWidth: active ? 3 : 0, borderColor: C.text }}>
              {active && <Ionicons name="checkmark" size={16} color="#fff" />}
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={onSave} disabled={busy} style={[btnPrimary, busy && { opacity: 0.7 }]}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '…' : d.key ? 'Guardar cambios' : 'Crear tipo'}</Text>
      </Pressable>
      <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}>
        <Text style={{ color: C.muted }}>Cancelar</Text>
      </Pressable>
    </ScrollView>
  );

  return (
    <Modal visible={!!d} transparent animationType={isWide ? 'fade' : 'slide'} onRequestClose={onClose}>
      {isWide ? (
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 520, maxHeight: '86%', backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, padding: 22 }}>
            {body}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={[sheet, { maxHeight: '92%' }]}>{body}</View>
        </View>
      )}
    </Modal>
  );
}

// Esta pantalla no es una pestaña, así que el candado de sesión va aquí.
export default function TiposProtegida() {
  return (
    <RequireAuth>
      <Tipos />
    </RequireAuth>
  );
}
