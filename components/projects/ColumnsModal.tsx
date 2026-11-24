import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R, SUBJECT_COLORS } from '../../lib/theme';
import { confirm, notify } from '../../lib/confirm';
import { BoardColumn, PTask, DEFAULT_COLUMNS } from '../../lib/projects';
import { btnPrimary } from './projectUi';
import { t } from '../../lib/i18n';

// ============================================================
//  Editar las columnas del tablero.
//  (Separado de app/proyectos/[id].tsx en la versión 23.)
// ============================================================

export function ColumnsModal({ visible, cols, counts, onClose, onSave }: {
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
    if (draft.length <= 1) return notify(t('Tiene que quedar al menos una columna'));
    if (n > 0) {
      const ok = await confirm(t('¿Quitar "{label}"?', { label: col.label }),
        t('Sus {n} {v} a la primera columna. No se borra nada.', { n, v: n === 1 ? 'tarjeta pasa' : 'tarjetas pasan' }), t('Quitar'));
      if (!ok) return;
    }
    setDraft((d) => d.filter((_, j) => j !== i));
  }
  function agregar() {
    if (draft.length >= 8) return notify(t('Ocho columnas es el tope'), t('Más que eso ya no cabe en pantalla y deja de ayudar.'));
    const key2 = `col${Math.random().toString(36).slice(2, 8)}`;
    setDraft((d) => [...d, { key: key2, label: t('Nueva columna'), color: SUBJECT_COLORS[d.length % SUBJECT_COLORS.length] }]);
  }
  function guardar() {
    const limpio = draft
      .map((c) => ({ ...c, label: c.label.trim() || t('Sin nombre') }))
      .filter((c) => !!c.key);
    if (!limpio.length) return notify(t('Tiene que quedar al menos una columna'));
    onSave(limpio);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }} style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 560, maxHeight: '90%' }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>{t('Columnas del tablero')}</Text>
            <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 4, marginBottom: 14, lineHeight: 19 }}>
              {t('Cada equipo trabaja distinto. Marca con la bandera la columna donde una tarea ya se considera terminada: de ahí sale el porcentaje de avance del proyecto.')}</Text>

            {draft.map((c, i) => (
              <View key={c.key} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 11, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />
                  <TextInput value={c.label} onChangeText={(t) => set(i, { label: t.slice(0, 24) })}
                    placeholder={t('Nombre')} placeholderTextColor={C.muted}
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
                    <Text style={{ color: c.done ? C.good : C.muted, fontSize: 11.5, fontWeight: c.done ? '700' : '500' }}>{t('Termina aquí')}</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <Pressable onPress={agregar}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' }}>
                <Ionicons name="add" size={15} color={C.muted} />
                <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>{t('Agregar columna')}</Text>
              </Pressable>
              <Pressable onPress={() => setDraft(DEFAULT_COLUMNS.map((c) => ({ ...c })))}
                style={{ paddingVertical: 11, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>{t('Volver a las de siempre')}</Text>
              </Pressable>
            </View>

            <Pressable onPress={guardar} style={btnPrimary}>
              <Text style={{ color: C.onBrand, fontWeight: '700' }}>{t('Guardar columnas')}</Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: C.muted }}>{t('Cancelar')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
