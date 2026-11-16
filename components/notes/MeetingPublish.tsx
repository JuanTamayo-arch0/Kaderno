import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button } from '../ds';
import { useAuth } from '../../lib/auth';
import { addProjectTask, canEdit, colorOf, columnsOf, getMembers, getProjects, initialsOf, logActivity, myRole, nameOf, type Member, type Project } from '../../lib/projects';
import { uploadNewFile } from '../../lib/projectFiles';
import { matchOwner, minutesFileName, minutesMarkdown, type MeetingMinutes } from '../../lib/meeting';
import { toast, friendlyError } from '../../lib/feedback';

// ============================================================
//  Publicar el acta en un proyecto (v24, fase 4): las tareas quedan
//  asignadas a su responsable con su fecha, y el acta queda en Archivos
//  para todo el equipo.
// ============================================================

type Row = { include: boolean; title: string; assignee: string | null; due: string | null; owner: string | null };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dayLabel = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };

export function MeetingPublish({ visible, minutes, date, onClose }: { visible: boolean; minutes: MeetingMinutes; date: Date; onClose: () => void }) {
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user?.id ?? null;
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [file, setFile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setProject(null); setMembers(null); setPicking(null); setFile(true);
    getProjects().then(setProjects).catch(() => setProjects([]));
  }, [visible]);

  async function choose(p: Project) {
    setProject(p); setMembers(null);
    try {
      const ms = await getMembers(p.id);
      setMembers(ms);
      const people = ms.map((m) => ({ user_id: m.user_id, name: nameOf(m.profile) }));
      setRows(minutes.tasks.map((t) => ({ include: true, title: t.title, owner: t.owner, due: t.due, assignee: matchOwner(t.owner, people) })));
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); setProject(null); }
  }

  const editable = !!members && canEdit(myRole(members, myId));
  const n = rows.filter((r) => r.include).length;

  async function publish() {
    if (!project || !members) return;
    setBusy(true);
    try {
      const status = columnsOf(project).find((c) => !c.done)?.key ?? columnsOf(project)[0].key;
      const when = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
      let made = 0;
      for (const r of rows) {
        if (!r.include) continue;
        await addProjectTask({ project_id: project.id, title: r.title, status, assignee_id: r.assignee, due_date: r.due, description: `De la reunión del ${when}${minutes.title ? ` (${minutes.title})` : ''}.` });
        made++;
      }
      if (file) {
        const md = `# Acta${minutes.title ? `: ${minutes.title}` : ''} · ${when}\n\n` + minutesMarkdown(minutes, when, false);
        const bytes = new TextEncoder().encode(md);
        await uploadNewFile(project.id, { name: minutesFileName(minutes, date), bytes, mime: 'text/markdown', size: bytes.length }, { description: 'Acta de reunión hecha con Kaderno' })
          .catch(() => { toast('Las tareas quedaron, pero el acta no se pudo guardar en Archivos.', { tone: 'bad' }); });
      }
      logActivity(project.id, 'meeting', `publicó el acta de la reunión del ${when}${made ? ` con ${made} ${made === 1 ? 'tarea' : 'tareas'}` : ''}`, {});
      toast(`Publicada en ${project.name}`, { tone: 'good', actionLabel: 'Ver proyecto', onAction: () => router.push(`/proyectos/${project.id}` as any) });
      onClose();
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setBusy(false); }
  }

  if (!project) return (
    <Sheet visible={visible} onClose={onClose} title="Publicar el acta" subtitle="Elige el proyecto. Las tareas quedan asignadas y el acta en Archivos.">
      {projects === null && <ActivityIndicator color={C.brand} />}
      {projects?.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>No tienes proyectos. Crea uno en Proyectos e invita a tu equipo.</Text>}
      {projects?.map((p) => (
        <Pressable key={p.id} onPress={() => choose(p)} accessibilityRole="button" accessibilityLabel={`Publicar en ${p.name}`}
          style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
          <Text style={{ fontSize: 18 }}>{p.icon || '📦'}</Text>
          <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600', flex: 1 }} numberOfLines={1}>{p.name}</Text>
          <Ionicons name="arrow-forward" size={16} color={C.muted} />
        </Pressable>
      ))}
    </Sheet>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={`Publicar en ${project.name}`} subtitle={minutes.tasks.length ? 'Revisa quién queda a cargo de cada tarea.' : 'El acta no trae tareas: solo se guarda en Archivos.'}
      footer={<>
        <Button label="Otro proyecto" kind="ghost" onPress={() => setProject(null)} />
        <View style={{ flex: 1 }} />
        <Button label={n ? `Crear ${n} ${n === 1 ? 'tarea' : 'tareas'}${file ? ' y guardar el acta' : ''}` : 'Guardar el acta'} icon="checkmark" busy={busy} disabled={!editable || (!n && !file)} onPress={publish} />
      </>}>
      {members === null && <ActivityIndicator color={C.brand} />}
      {members && !editable && <Text style={{ color: C.warnText, fontSize: 13 }}>En este proyecto solo puedes ver. Pídele al dueño que te haga editor.</Text>}
      {members && rows.map((r, i) => {
        const m = members.find((x) => x.user_id === r.assignee);
        return (
          <View key={i} style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, opacity: r.include ? 1 : 0.55 }}>
            <Pressable onPress={() => setRows(rows.map((x, k) => (k === i ? { ...x, include: !x.include } : x)))} accessibilityRole="checkbox" accessibilityState={{ checked: r.include }} accessibilityLabel={r.title}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons name={r.include ? 'checkbox' : 'square-outline'} size={19} color={r.include ? C.brand : C.muted} />
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{r.title}</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 27 }}>
              <Pressable onPress={() => setPicking(picking === i ? null : i)} accessibilityRole="button" accessibilityLabel={`Responsable: ${m ? nameOf(m.profile) : 'sin asignar'}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 99, borderWidth: 1, borderColor: m ? C.line : C.warn }}>
                {m ? <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colorOf(m.user_id), alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>{initialsOf(m.profile)}</Text></View>
                  : <Ionicons name="person-outline" size={14} color={C.warnText} />}
                <Text style={{ color: m ? C.text : C.warnText, fontSize: 12.5 }}>{m ? nameOf(m.profile) : r.owner ? `¿${r.owner}?` : 'Sin asignar'}</Text>
                <Ionicons name="chevron-down" size={12} color={C.muted} />
              </Pressable>
              {r.due && (
                <Pressable onPress={() => setRows(rows.map((x, k) => (k === i ? { ...x, due: null } : x)))} accessibilityRole="button" accessibilityLabel={`Quitar la fecha ${dayLabel(r.due)}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 99, borderWidth: 1, borderColor: C.line }}>
                  <Ionicons name="calendar-outline" size={13} color={C.muted} />
                  <Text style={{ color: C.text, fontSize: 12.5 }}>{dayLabel(r.due)}</Text>
                  <Ionicons name="close" size={12} color={C.muted} />
                </Pressable>
              )}
            </View>
            {picking === i && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 27 }} accessibilityRole="menu">
                {[null, ...members.map((x) => x.user_id)].map((uid) => {
                  const mm = members.find((x) => x.user_id === uid);
                  return (
                    <Pressable key={uid ?? 'none'} onPress={() => { setRows(rows.map((x, k) => (k === i ? { ...x, assignee: uid } : x))); setPicking(null); }} accessibilityRole="menuitem"
                      style={({ hovered }: any) => ({ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99, borderWidth: 1, borderColor: r.assignee === uid ? C.brand : C.line, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
                      <Text style={{ color: C.text, fontSize: 12.5 }}>{mm ? nameOf(mm.profile) : 'Sin asignar'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      <Pressable onPress={() => setFile(!file)} accessibilityRole="checkbox" accessibilityState={{ checked: file }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
        <Ionicons name={file ? 'checkbox' : 'square-outline'} size={19} color={file ? C.brand : C.muted} />
        <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }}>Guardar el acta en Archivos ({minutesFileName(minutes, date)})</Text>
      </Pressable>
    </Sheet>
  );
}
