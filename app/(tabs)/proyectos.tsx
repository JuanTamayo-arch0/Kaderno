import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R, SUBJECT_COLORS } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { confirm, notify, friendlyError, toast } from '../../lib/feedback';
import { ProgressBar } from '../../components/ProgressBar';
import { Screen, Button, Card, EmptyState, Field, IconButton, Skeleton, ErrorState, Badge } from '../../components/ds';
import { Subject, getSubjects } from '../../lib/db';
import { Overview, Member, TEMPLATES, getProjectsOverview, createProject, joinProject, peekProject, initialsOf, colorOf } from '../../lib/projects';
import { onDataChanged } from '../../lib/uiBus';
import { useAuth } from '../../lib/auth';
import { snapshotFor } from '../../lib/snapshot';

const PROJECT_ICONS = ['📦', '👥', '🧪', '🎤', '🔎', '📊', '🎬', '🏗️', '🎨', '💡', '📚', '⚙️'];

export default function Proyectos() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const params = useLocalSearchParams<{ nuevo?: string }>();
  const { session } = useAuth();
  const [snap] = useState(() => snapshotFor<{ o: Overview[]; s: Subject[] }>(session ? `proyectos:${session.user.id}` : null));
  const [rows, setRows] = useState<Overview[]>(snap.initial?.o ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(snap.initial?.s ?? []);
  const [loading, setLoading] = useState(!snap.initial);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [join, setJoin] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([getProjectsOverview(), getSubjects()]);
      setRows(o); setSubjects(s); setError(null);
      snap.save({ o, s });
    } catch (e) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onDataChanged(load), [load]);
  useEffect(() => { if (params.nuevo === '1') { setModal(true); router.setParams({ nuevo: undefined } as any); } }, [params.nuevo]);

  const actions = (
    <>
      <Button label="Unirme con código" kind="secondary" icon="enter-outline" size="sm" onPress={() => setJoin(true)} />
      {isWide && <Button label="Nuevo proyecto" icon="add" size="sm" onPress={() => setModal(true)} />}
    </>
  );

  return (
    <Screen title="Proyectos" subtitle="Trabajo en grupo con tablero y reparto" right={actions} maxWidth={1100}>
      {loading ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{[0, 1].map((i) => <Skeleton key={i} height={150} style={{ width: isWide ? 340 : '100%' }} />)}</View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon="people-outline" title="Todavía no tienes proyectos"
          text="Un proyecto es un tablero compartido: cada quien ve qué le toca, en qué va el grupo y qué falta para entregar."
          action={{ label: 'Crear proyecto', icon: 'add', onPress: () => setModal(true) }} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {rows.map((r) => (
            <ProjectCard key={r.project.id} row={r} subjects={subjects} wide={isWide} onPress={() => router.push(`/proyectos/${r.project.id}`)} />
          ))}
        </View>
      )}
      {!isWide && rows.length > 0 && <Button label="Nuevo proyecto" icon="add" onPress={() => setModal(true)} style={{ marginTop: 16 }} full />}

      <NewProjectModal visible={modal} subjects={subjects} onClose={() => setModal(false)}
        onCreated={(id) => { setModal(false); load(); router.push(`/proyectos/${id}`); }} />
      <JoinModal visible={join} onClose={() => setJoin(false)} onJoined={(id) => { setJoin(false); load(); router.push(`/proyectos/${id}`); }} />
    </Screen>
  );
}

function ProjectCard({ row, subjects, wide, onPress }: { row: Overview; subjects: Subject[]; wide: boolean; onPress: () => void }) {
  const p = row.project;
  const subj = subjects.find((s) => s.id === p.subject_id) ?? null;
  return (
    <Card onPress={onPress} accessibilityLabel={`Abrir proyecto ${p.name}`} style={{ width: wide ? 340 : '100%', borderTopWidth: 3, borderTopColor: p.color }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: p.color + '26', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 19 }}>{p.icon}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{p.name}</Text>
          <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>
            {row.members.length} {row.members.length === 1 ? 'integrante' : 'integrantes'}{subj ? ` · ${subj.name}` : ''}
          </Text>
        </View>
      </View>
      <ProgressBar done={row.done} total={row.total} height={6} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <Avatars members={row.members} />
        {row.mine > 0 ? <Badge text={`${row.mine} para ti`} color={C.brand} /> : <Text style={{ color: C.muted, fontSize: 12 }}>{row.total - row.done} pendientes</Text>}
      </View>
    </Card>
  );
}

function Avatars({ members, size = 26 }: { members: Member[]; size?: number }) {
  const shown = members.slice(0, 4);
  const rest = members.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <View key={m.id} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colorOf(m.user_id), alignItems: 'center', justifyContent: 'center', marginLeft: i === 0 ? 0 : -8, borderWidth: 2, borderColor: C.surface }}>
          <Text style={{ color: '#0f1115', fontSize: size * 0.38, fontWeight: '800' }}>{initialsOf(m.profile)}</Text>
        </View>
      ))}
      {rest > 0 && (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginLeft: -8, borderWidth: 2, borderColor: C.surface }}>
          <Text style={{ color: C.muted, fontSize: size * 0.36, fontWeight: '700' }}>+{rest}</Text>
        </View>
      )}
    </View>
  );
}

function Dialog({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }} accessibilityViewIsModal style={{ backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 520, maxHeight: '90%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', flex: 1 }} accessibilityRole="header">{title}</Text>
            <IconButton icon="close" label="Cerrar" onPress={onClose} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>{footer}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function JoinModal({ visible, onClose, onJoined }: { visible: boolean; onClose: () => void; onJoined: (id: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (visible) { setCode(''); setErr(null); } }, [visible]);
  async function go() {
    const c = code.trim().toUpperCase();
    if (c.length < 6) { setErr('El código tiene 6 caracteres. Te lo pasa quien creó el proyecto.'); return; }
    setBusy(true);
    try {
      const peek = await peekProject(c);
      if (!peek) { setErr('Ese código no existe. Revisa que esté bien escrito.'); return; }
      const ok = await confirm(`${peek.icon}  ${peek.name}`, `${peek.members} ${peek.members === 1 ? 'integrante' : 'integrantes'}. ¿Entrar a este proyecto?`, 'Entrar');
      if (!ok) return;
      const id = await joinProject(c);
      toast(`Entraste a ${peek.name}`, { tone: 'good' });
      onJoined(id);
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }
  return (
    <Dialog visible={visible} onClose={onClose} title="Unirme a un proyecto"
      footer={<><Button label="Cancelar" kind="secondary" onPress={onClose} style={{ flex: 1 }} /><Button label="Entrar" onPress={go} busy={busy} style={{ flex: 1 }} /></>}>
      <Field value={code} onChangeText={(t) => { setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setErr(null); }}
        placeholder="K7F2QX" autoCapitalize="characters" autoCorrect={false} maxLength={6} onSubmitEditing={go} autoFocus
        label="Código de 6 caracteres" error={err} inputStyle={{ letterSpacing: 4, fontWeight: '800', fontSize: 18 }}
        hint="Quien creó el proyecto lo encuentra en la pestaña Equipo." />
    </Dialog>
  );
}

function NewProjectModal({ visible, subjects, onClose, onCreated }: { visible: boolean; subjects: Subject[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [icon, setIcon] = useState(PROJECT_ICONS[0]);
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [template, setTemplate] = useState('blank');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setErr('Ponle nombre al proyecto.'); return; }
    setBusy(true);
    try {
      const id = await createProject({ name: name.trim(), description: desc.trim() || null, subject_id: subjectId, color, icon, template });
      setName(''); setDesc(''); setSubjectId(null); setTemplate('blank');
      onCreated(id);
    } catch (e) { notify('No se pudo crear', friendlyError(e)); }
    finally { setBusy(false); }
  }
  const tpl = TEMPLATES.find((t) => t.key === template) ?? TEMPLATES[0];
  const lbl = { color: C.muted, fontSize: 12.5, fontWeight: '600' as const, marginTop: 10, marginBottom: 8 };

  return (
    <Dialog visible={visible} onClose={onClose} title="Nuevo proyecto"
      footer={<><Button label="Cancelar" kind="secondary" onPress={onClose} style={{ flex: 1 }} /><Button label="Crear proyecto" onPress={save} busy={busy} style={{ flex: 2 }} /></>}>
      <Field label="Nombre" value={name} onChangeText={(v) => { setName(v); setErr(null); }} placeholder="Ej: Informe de laboratorio" error={err} />
      <Field label="Descripción (opcional)" value={desc} onChangeText={setDesc} placeholder="De qué se trata" multiline inputStyle={{ minHeight: 60, textAlignVertical: 'top' }} />
      <Text style={lbl}>Plantilla</Text>
      <View style={{ gap: 8 }}>
        {TEMPLATES.map((t) => {
          const on = t.key === template;
          return (
            <Pressable key={t.key} onPress={() => setTemplate(t.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: on ? C.brand + '14' : 'transparent', borderWidth: 1, borderColor: on ? C.brand : C.line }}>
              <Text style={{ fontSize: 19 }}>{t.icon}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{t.label}</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>{t.hint}</Text>
              </View>
              {on && <Ionicons name="checkmark-circle" size={18} color={C.brand} />}
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
        Columnas: {tpl.columns.map((c) => c.label).join(', ')}.{tpl.tasks.length ? ` Incluye ${tpl.tasks.length} tarjetas de arranque.` : ''}
      </Text>
      <Text style={lbl}>Materia (opcional)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[{ id: null as string | null, name: 'Ninguna', color: C.muted }, ...subjects].map((s) => {
            const on = s.id === subjectId;
            return (
              <Pressable key={s.id ?? 'none'} onPress={() => { setSubjectId(s.id); if (s.id) setColor(s.color); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, backgroundColor: on ? C.brand : C.surface2, borderColor: on ? C.brand : C.line }}>
                <Text style={{ color: on ? C.onBrand : C.text, fontSize: 13, fontWeight: on ? '700' : '500' }}>{s.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <Text style={lbl}>Ícono</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PROJECT_ICONS.map((i) => (
          <Pressable key={i} onPress={() => setIcon(i)} accessibilityRole="radio" accessibilityState={{ checked: icon === i }} accessibilityLabel={`Ícono ${i}`}
            style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: icon === i ? C.brand : 'transparent' }}>
            <Text style={{ fontSize: 18 }}>{i}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={lbl}>Color</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {SUBJECT_COLORS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} accessibilityRole="radio" accessibilityState={{ checked: color.toLowerCase() === c.toLowerCase() }} accessibilityLabel={`Color ${c}`}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: 3, borderColor: color.toLowerCase() === c.toLowerCase() ? C.text : 'transparent' }} />
        ))}
      </View>
    </Dialog>
  );
}
