import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R } from '../../lib/theme';
import { confirm, notify } from '../../lib/confirm';
import { Member, colorOf, initialsOf, logActivity, nameOf } from '../../lib/projects';
import { mentionQuery, mentionMatches, insertMention, mentionsIn, commentParts, type MentionPerson } from '../../lib/comments';
import { getComments, addComment, editComment, deleteComment, commentsAvailable, type TaskComment } from '../../lib/commentsDb';
import { COARSE_POINTER, hace } from './projectUi';

// ============================================================
//  Comentarios de una tarea de proyecto (v23, fase 2): con @menciones,
//  editar y borrar lo tuyo. Quien es mencionado o tiene la tarea recibe un
//  aviso (en la campana y como notificación push).
// ============================================================

export function TaskComments({ projectId, taskId, taskTitle, members, myId, isOwner, onCountChange }: {
  projectId: string; taskId: string; taskTitle: string; members: Member[]; myId: string | null; isOwner: boolean;
  onCountChange?: (taskId: string, n: number) => void;
}) {
  const [list, setList] = useState<TaskComment[] | null>(null);
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [pick, setPick] = useState(0);
  const input = useRef<TextInput>(null);

  const people: MentionPerson[] = useMemo(() => members.map((m) => ({ user_id: m.user_id, name: nameOf(m.profile).replace(/[@\n]/g, '').slice(0, 40) })), [members]);
  const byId = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members]);

  const load = useCallback(() => getComments(taskId).then((l) => { setList(l); onCountChange?.(taskId, l.length); }), [taskId]);
  useEffect(() => { setList(null); setText(''); setEditing(null); load(); }, [load]);
  // Mientras la ventana está abierta se refresca cada 20 s (por si alguien más comenta).
  useEffect(() => { const t = setInterval(load, 20_000); return () => clearInterval(t); }, [load]);

  const q = mentionQuery(text, caret);
  const sugg = q ? mentionMatches(people, q.query, myId) : [];
  useEffect(() => { setPick(0); }, [q?.query]);

  function choose(p: MentionPerson) {
    if (!q) return;
    const r = insertMention(text, q.start, caret, p.name);
    setText(r.text); setCaret(r.caret);
    setTimeout(() => { const el: any = input.current; el?.focus?.(); el?.setNativeProps?.({ selection: { start: r.caret, end: r.caret } }); if (el?.setSelectionRange) el.setSelectionRange(r.caret, r.caret); }, 0);
  }

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const c = await addComment(projectId, taskId, body, mentionsIn(body, people));
      setText(''); setCaret(0);
      setList((l) => { const n = [...(l ?? []), c]; onCountChange?.(taskId, n.length); return n; });
      logActivity(projectId, 'comment', `comentó en "${taskTitle}"`, { task_id: taskId });
    } catch (e: any) { notify('No se pudo comentar', e?.message ?? String(e)); }
    finally { setBusy(false); }
  }
  async function saveEdit() {
    if (!editing) return;
    const body = editing.text.trim();
    if (!body) return;
    try {
      await editComment(editing.id, body, mentionsIn(body, people));
      setList((l) => l?.map((c) => (c.id === editing.id ? { ...c, body, edited_at: new Date().toISOString() } : c)) ?? null);
      setEditing(null);
    } catch (e: any) { notify('No se pudo editar', e?.message ?? String(e)); }
  }
  async function remove(c: TaskComment) {
    if (!(await confirm('¿Borrar el comentario?', undefined, 'Borrar'))) return;
    try { await deleteComment(c.id); setList((l) => { const n = l?.filter((x) => x.id !== c.id) ?? []; onCountChange?.(taskId, n.length); return n; }); }
    catch (e: any) { notify('No se pudo borrar', e?.message ?? String(e)); }
  }

  const onKey = (e: any) => {
    const k = e?.nativeEvent?.key;
    if (sugg.length && (k === 'ArrowDown' || k === 'ArrowUp')) { e.preventDefault?.(); setPick((p) => (p + (k === 'ArrowDown' ? 1 : sugg.length - 1)) % sugg.length); return; }
    if (sugg.length && (k === 'Enter' || k === 'Tab')) { e.preventDefault?.(); choose(sugg[Math.min(pick, sugg.length - 1)]); return; }
    if (k === 'Enter' && (e?.nativeEvent?.metaKey || e?.nativeEvent?.ctrlKey)) { e.preventDefault?.(); send(); }
  };

  if (!commentsAvailable() && list?.length === 0) return null;
  return (
    <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16 }} accessibilityLabel="Comentarios">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ionicons name="chatbubbles-outline" size={16} color={C.muted} />
        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700', flex: 1 }}>Comentarios{list?.length ? ` · ${list.length}` : ''}</Text>
      </View>
      {list === null && <ActivityIndicator color={C.brand} />}
      {list?.length === 0 && <Text style={{ color: C.muted, fontSize: 13, marginBottom: 8 }}>Todavía nadie comenta. Escribe @ para mencionar a alguien del equipo.</Text>}
      {list?.map((c) => {
        const m = byId[c.author_id];
        const mine = c.author_id === myId;
        const isEditing = editing?.id === c.id;
        return (
          <View key={c.id} style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colorOf(c.author_id), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{initialsOf(m?.profile)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{m ? nameOf(m.profile) : 'Ex integrante'}</Text>
                <Text style={{ color: C.muted, fontSize: 11.5 }}>{hace(c.created_at)}{c.edited_at ? ' · editado' : ''}</Text>
                <View style={{ flex: 1 }} />
                {mine && !isEditing && (
                  <Pressable onPress={() => setEditing({ id: c.id, text: c.body })} accessibilityRole="button" accessibilityLabel="Editar comentario" hitSlop={6}>
                    <Text style={{ color: C.muted, fontSize: 12 }}>Editar</Text>
                  </Pressable>
                )}
                {(mine || isOwner) && !isEditing && (
                  <Pressable onPress={() => remove(c)} accessibilityRole="button" accessibilityLabel="Borrar comentario" hitSlop={6}>
                    <Text style={{ color: C.muted, fontSize: 12 }}>Borrar</Text>
                  </Pressable>
                )}
              </View>
              {isEditing ? (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <TextInput value={editing!.text} onChangeText={(t) => setEditing({ id: c.id, text: t })} multiline autoFocus accessibilityLabel="Editar comentario"
                    style={[box, { minHeight: 60 }]} />
                  <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
                    <Pressable onPress={() => setEditing(null)}><Text style={{ color: C.muted, fontSize: 13 }}>Cancelar</Text></Pressable>
                    <Pressable onPress={saveEdit}><Text style={{ color: C.brand, fontSize: 13, fontWeight: '700' }}>Guardar</Text></Pressable>
                  </View>
                </View>
              ) : (
                <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 20, marginTop: 2 }} selectable>
                  {commentParts(c.body, people, myId).map((p, i) => p.mention
                    ? <Text key={i} style={{ color: C.brand, fontWeight: '700', backgroundColor: p.me ? C.brand + '22' : 'transparent' }}>{p.text}</Text>
                    : <Text key={i}>{p.text}</Text>)}
                </Text>
              )}
            </View>
          </View>
        );
      })}
      <View style={{ position: 'relative' }}>
        {sugg.length > 0 && (
          <View style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 4, zIndex: 10 }} accessibilityRole="menu">
            {sugg.map((p, i) => (
              <Pressable key={p.user_id} onPress={() => choose(p)} accessibilityRole="menuitem" accessibilityLabel={`Mencionar a ${p.name}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, backgroundColor: i === pick ? C.surface2 : 'transparent' }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colorOf(p.user_id), alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{initialsOf(byId[p.user_id]?.profile)}</Text>
                </View>
                <Text style={{ color: C.text, fontSize: 13.5 }}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <TextInput ref={input} value={text} onChangeText={setText} multiline placeholder="Escribe un comentario… (@ para mencionar)" placeholderTextColor={C.muted}
            onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)} onKeyPress={onKey} accessibilityLabel="Nuevo comentario" maxLength={4000}
            style={[box, { flex: 1, minHeight: 44, maxHeight: 140 }]} />
          <Pressable onPress={send} disabled={busy || !text.trim()} accessibilityRole="button" accessibilityLabel="Enviar comentario"
            style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: text.trim() ? C.brand : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            {busy ? <ActivityIndicator color={C.onBrand} /> : <Ionicons name="send" size={17} color={text.trim() ? C.onBrand : C.muted} />}
          </Pressable>
        </View>
        {Platform.OS === 'web' && !COARSE_POINTER && <Text style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>Ctrl + Enter para enviar</Text>}
      </View>
    </View>
  );
}

const box = [{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: R.md ?? 11, color: C.text, padding: 10, fontSize: 14 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null];
