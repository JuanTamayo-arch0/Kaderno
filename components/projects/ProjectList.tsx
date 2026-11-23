import { useMemo, useState } from 'react';
import { WorkBadges } from './ProjectBoard';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { BoardColumn, Member, PStep, PTask, colorOf, initialsOf, nameOf } from '../../lib/projects';
import { SelectBox, dueInfo } from './projectUi';

// ============================================================
//  Vista Lista del proyecto.
//  (Separado de app/proyectos/[id].tsx en la versión 23.)
// ============================================================

export function Lista({ tasks, cols, steps, members, editable, isWide, selecting, selected, onToggleSelect, onOpen, onAdd, onToggle, comments, byId = {} }: {
  comments?: Record<string, number>; byId?: Record<string, PTask>;
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
              <WorkBadges task={t} byId={byId} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: col?.color ?? C.muted }} />
                  <Text style={{ color: C.muted, fontSize: 11.5 }}>{col?.label ?? t.status}</Text>
                </View>
                <Text style={{ color: C.muted, fontSize: 11.5 }}>· {who ? nameOf(who.profile) : 'sin asignar'}</Text>
                {due && <Text style={{ color: due.color, fontSize: 11.5, fontWeight: '700' }}>· {due.label}</Text>}
                {st.length > 0 && <Text style={{ color: C.muted, fontSize: 11.5 }}>· {st.filter((s) => s.done).length}/{st.length}</Text>}
                {!!comments?.[t.id] && <Text style={{ color: C.muted, fontSize: 11.5 }} accessibilityLabel={`${comments[t.id]} comentarios`}>· 💬 {comments[t.id]}</Text>}
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
          <Text style={{ color: C.onBrand, fontWeight: '700' }}>Nueva tarea</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// ============================================================
//  Vista EQUIPO
// ============================================================
