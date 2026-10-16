import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Button } from '../ds';
import { confirm, friendlyError, notify } from '../../lib/feedback';
import { bulkUpdateProjectTasks, getProjectTasksForBulk } from '../../lib/projectsBulk';
import { findRepeated, type ExistingTask, type RepeatGroup } from '../../lib/import';

// ============================================================
//  Ordenar el tablero.
//
//  · Quitar repetidas: agrupa tarjetas con el mismo código ("H-009") o el
//    mismo título y deja una por grupo, la más trabajada (terminada, con
//    responsable, con checklist avanzado). Se ve la lista antes de borrar.
//  · Vaciar el tablero: borra todas las tarjetas para empezar de cero (por
//    ejemplo antes de importar el plan completo).
//
//  Las dos se hacen en un solo lote y se pueden deshacer desde el aviso.
// ============================================================

export function BoardCleanup({ visible, projectId, cols, onClose, onDone }: {
  visible: boolean; projectId: string; cols: { key: string; label: string }[]; onClose: () => void;
  onDone: (r: { batchId: string; text: string }) => void;
}) {
  const [tasks, setTasks] = useState<ExistingTask[] | null>(null);
  const [busy, setBusy] = useState<'dups' | 'all' | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) { setTasks(null); setOpen(null); return; }
    getProjectTasksForBulk(projectId).then(setTasks).catch((e) => { notify('No se pudo leer el tablero', friendlyError(e)); onClose(); });
  }, [visible, projectId]);

  const groups: RepeatGroup[] = useMemo(() => (tasks ? findRepeated(tasks) : []), [tasks]);
  const toRemove = groups.reduce((n, g) => n + g.remove.length, 0);

  async function removeDups() {
    const ids = groups.flatMap((g) => g.remove.map((t) => t.id));
    if (!ids.length) return;
    setBusy('dups');
    try {
      const r = await bulkUpdateProjectTasks(projectId, ids, { delete: true });
      onDone({ batchId: r.batch_id, text: `Quité ${r.deleted} ${r.deleted === 1 ? 'tarjeta repetida' : 'tarjetas repetidas'}` });
    } catch (e) { notify('No se pudieron quitar', friendlyError(e)); }
    finally { setBusy(null); }
  }

  async function emptyBoard() {
    if (!tasks?.length) return;
    const ok = await confirm(`¿Borrar las ${tasks.length} tarjetas del tablero?`,
      'Se borran para todo el equipo, con su checklist. Las columnas, los archivos y los integrantes se quedan. Puedes deshacerlo desde el aviso que aparece al terminar.',
      'Borrar todo');
    if (!ok) return;
    setBusy('all');
    try {
      // El servidor acepta lotes de hasta 500; un tablero normal cabe en uno.
      const ids = tasks.map((t) => t.id);
      const r = await bulkUpdateProjectTasks(projectId, ids.slice(0, 500), { delete: true });
      onDone({ batchId: r.batch_id, text: `Tablero vacío: ${r.deleted} ${r.deleted === 1 ? 'tarjeta borrada' : 'tarjetas borradas'}` });
    } catch (e) { notify('No se pudo vaciar', friendlyError(e)); }
    finally { setBusy(null); }
  }

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }}
          style={{ backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 560, maxHeight: '90%', overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Ionicons name="sparkles-outline" size={20} color={C.brand} />
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '800', flex: 1 }}>Ordenar el tablero</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar"><Ionicons name="close" size={20} color={C.muted} /></Pressable>
          </View>

          {tasks === null ? (
            <ActivityIndicator color={C.brand} style={{ margin: 30 }} />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
              {/* repetidas */}
              <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Quitar repetidas</Text>
                {groups.length === 0 ? (
                  <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>No encontré tarjetas repetidas. Todo en orden.</Text>
                ) : (
                  <>
                    <Text style={{ color: C.muted, fontSize: 13, marginTop: 4, lineHeight: 19 }}>
                      {groups.length} {groups.length === 1 ? 'tarea aparece' : 'tareas aparecen'} más de una vez (mismo código o mismo título).
                      De cada una se queda la más trabajada y se {toRemove === 1 ? 'borra 1 copia' : `borran ${toRemove} copias`}.
                    </Text>
                    <View style={{ marginTop: 10 }}>
                      {groups.slice(0, 40).map((g) => (
                        <Pressable key={g.key} onPress={() => setOpen(open === g.key ? null : g.key)}
                          style={{ paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text numberOfLines={1} style={{ color: C.text, fontSize: 13, flex: 1 }}>{g.keep.title}</Text>
                            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>×{g.remove.length + 1}</Text>
                            <Ionicons name={open === g.key ? 'chevron-up' : 'chevron-down'} size={14} color={C.muted} />
                          </View>
                          {open === g.key && (
                            <Text style={{ color: C.muted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                              Se queda: {describe(g.keep, cols)}.{'\n'}Se borra{g.remove.length === 1 ? '' : 'n'}: {g.remove.map((t) => describe(t, cols)).join(' · ')}
                            </Text>
                          )}
                        </Pressable>
                      ))}
                      {groups.length > 40 && <Text style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>Y {groups.length - 40} más.</Text>}
                    </View>
                    <Button label={`Quitar ${toRemove} ${toRemove === 1 ? 'repetida' : 'repetidas'}`} icon="git-merge-outline" busy={busy === 'dups'}
                      onPress={removeDups} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
                  </>
                )}
              </View>

              {/* vaciar */}
              <View style={{ borderWidth: 1, borderColor: C.bad + '55', borderRadius: 14, padding: 14 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Vaciar el tablero</Text>
                <Text style={{ color: C.muted, fontSize: 13, marginTop: 4, lineHeight: 19 }}>
                  Borra las {tasks.length} tarjetas para empezar de cero, por ejemplo antes de importar el plan completo. Columnas, archivos e integrantes se quedan.
                  Otra opción es importar con "Reemplazar el tablero con este archivo": deja solo lo que viene en el archivo y conserva el avance de lo que coincide.
                </Text>
                <Button label="Vaciar el tablero" kind="danger" icon="trash-outline" busy={busy === 'all'} disabled={!tasks.length}
                  onPress={emptyBoard} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function describe(t: ExistingTask, cols: { key: string; label: string }[]): string {
  const done = t.checklist.filter((c) => c.done).length;
  const parts = [cols.find((c) => c.key === t.status)?.label ?? t.status];
  if (t.assignee_id) parts.push('con responsable');
  if (t.checklist.length) parts.push(`checklist ${done}/${t.checklist.length}`);
  return parts.join(', ');
}
