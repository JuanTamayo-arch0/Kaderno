import { useCallback, useState } from 'react';
import { RequireAuth } from '../../components/RequireAuth';
import { useFocusEffect, useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, shadow, SUBJECT_COLORS } from '../../lib/theme';
import { useResponsive, SIDEBAR_W } from '../../lib/responsive';
import { confirm, notify } from '../../lib/confirm';
import { ProgressBar } from '../../components/ProgressBar';
import { SideNav } from '../../components/SideNav';
import { Subject, getSubjects } from '../../lib/db';
import {
  Overview, Member, TEMPLATES,
  getProjectsOverview, createProject, joinProject, peekProject,
  nameOf, initialsOf, colorOf,
} from '../../lib/projects';

const PROJECT_ICONS = ['📦', '👥', '🧪', '🎤', '🔎', '📊', '🎬', '🏗️', '🎨', '💡', '📚', '⚙️'];

function Proyectos() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const [rows, setRows] = useState<Overview[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([getProjectsOverview(), getSubjects()]);
      setRows(o); setSubjects(s);
    } catch (e: any) { notify('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  // Sin websockets todavía: se recarga al volver a la pantalla.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Si se entró por enlace directo no hay historial que deshacer, así que se
  // cae a Hoy en vez de dejar la flecha muerta.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.push('/');
  }

  const body = (
    <>
      <JoinCard onJoined={(id) => { load(); router.push(`/proyectos/${id}`); }} />

      {loading ? (
        <Text style={{ color: C.muted, paddingVertical: 24 }}>Cargando…</Text>
      ) : rows.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 42 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Text style={{ fontSize: 32 }}>👥</Text>
          </View>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Todavía no tienes proyectos</Text>
          <Text style={{ color: C.muted, marginTop: 6, fontSize: 13, textAlign: 'center', maxWidth: 380, lineHeight: 20 }}>
            Un proyecto es un tablero compartido: cada quien ve qué le toca, en qué va el grupo y qué falta para entregar.
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {rows.map((r) => (
            <ProjectCard key={r.project.id} row={r} subjects={subjects} wide={isWide}
              onPress={() => router.push(`/proyectos/${r.project.id}`)} />
          ))}
        </View>
      )}

      <Pressable onPress={() => setModal(true)}
        style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand, borderRadius: 12, padding: 13, marginTop: 16, alignSelf: isWide ? 'flex-start' : 'stretch', paddingHorizontal: 20 }}>
        <Ionicons name="add" size={18} color="#0f1115" />
        <Text style={{ color: '#0f1115', fontWeight: '700' }}>Nuevo proyecto</Text>
      </Pressable>
    </>
  );

  if (isWide) {
    // Proyectos no es una pestaña, así que la barra lateral hay que montarla
    // aquí a mano: si sólo se dejara el hueco de SIDEBAR_W, en escritorio
    // quedaba una franja vacía y sin manera de volver a Hoy.
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: SIDEBAR_W }}>
        <SideNav active="proyectos" />
        <ScrollView contentContainerStyle={{ paddingVertical: 36, paddingHorizontal: 44, paddingBottom: 60 }}>
          <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>Proyectos</Text>
          <Text style={{ color: C.muted, fontSize: 14, marginTop: 4, marginBottom: 20 }}>Trabajo en grupo, con tablero y reparto</Text>
          <View style={{ maxWidth: 1100 }}>{body}</View>
        </ScrollView>
        <NewProjectModal visible={modal} subjects={subjects}
          onClose={() => setModal(false)}
          onCreated={(id) => { setModal(false); load(); router.push(`/proyectos/${id}`); }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* En móvil esta pantalla tampoco tiene la barra de pestañas abajo (vive
          fuera del grupo (tabs)), así que la flecha es la única salida. */}
      <View style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={goBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>Proyectos</Text>
          <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>Trabajo en grupo</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>{body}</ScrollView>
      <NewProjectModal visible={modal} subjects={subjects}
        onClose={() => setModal(false)}
        onCreated={(id) => { setModal(false); load(); router.push(`/proyectos/${id}`); }} />
    </View>
  );
}

// ---------- Tarjeta de proyecto ----------

function ProjectCard({ row, subjects, wide, onPress }: {
  row: Overview; subjects: Subject[]; wide: boolean; onPress: () => void;
}) {
  const p = row.project;
  const subj = subjects.find((s) => s.id === p.subject_id) ?? null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      width: wide ? 340 : '100%',
      backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.lg,
      padding: 16, opacity: pressed ? 0.75 : 1, borderTopWidth: 3, borderTopColor: p.color, ...shadow,
    })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: p.color + '26', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 19 }}>{p.icon}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{p.name}</Text>
          <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
            {row.members.length} {row.members.length === 1 ? 'integrante' : 'integrantes'}
            {subj ? ` · ${subj.name}` : ''}
          </Text>
        </View>
      </View>

      <ProgressBar done={row.done} total={row.total} height={6} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <Avatars members={row.members} />
        {row.mine > 0 ? (
          <View style={{ paddingVertical: 3, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: C.brand + '1f', borderWidth: 1, borderColor: C.brand + '55' }}>
            <Text style={{ color: C.brand, fontSize: 11.5, fontWeight: '700' }}>{row.mine} para ti</Text>
          </View>
        ) : (
          <Text style={{ color: C.muted, fontSize: 11.5 }}>{row.total - row.done} pendientes</Text>
        )}
      </View>
    </Pressable>
  );
}

// Caritas apiladas. Muestra 4 y luego "+n" para no desbordar la tarjeta.
export function Avatars({ members, size = 26 }: { members: Member[]; size?: number }) {
  const shown = members.slice(0, 4);
  const rest = members.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <View key={m.id} style={{
          width: size, height: size, borderRadius: size / 2, backgroundColor: colorOf(m.user_id),
          alignItems: 'center', justifyContent: 'center', marginLeft: i === 0 ? 0 : -8,
          borderWidth: 2, borderColor: C.surface,
        }}>
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

// ---------- Entrar con código ----------

function JoinCard({ onJoined }: { onJoined: (projectId: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return notify('Escribe el código', 'Son 6 caracteres, te los pasa quien creó el proyecto.');
    setBusy(true);
    try {
      // Primero se mira sin entrar, para poder confirmar que es el proyecto correcto.
      const peek = await peekProject(c);
      if (!peek) { notify('Ese código no existe', 'Revisa que esté bien escrito.'); return; }
      const ok = await confirm(`${peek.icon}  ${peek.name}`,
        `${peek.members} ${peek.members === 1 ? 'integrante' : 'integrantes'}. ¿Entrar a este proyecto?`, 'Entrar');
      if (!ok) return;
      const id = await joinProject(c);
      setCode('');
      onJoined(id);
    } catch (e: any) { notify('No se pudo entrar', e.message); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 16 }}>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        placeholder="Código de 6 letras"
        placeholderTextColor={C.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        onSubmitEditing={go}
        style={{
          flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11,
          color: C.text, padding: 12, fontSize: 15, letterSpacing: 3, fontWeight: '700',
        }}
      />
      <Pressable onPress={go} disabled={busy}
        style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, paddingVertical: 13, paddingHorizontal: 18 }}>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>{busy ? '…' : 'Entrar'}</Text>
      </Pressable>
    </View>
  );
}

// ---------- Modal de nuevo proyecto ----------

function NewProjectModal({ visible, subjects, onClose, onCreated }: {
  visible: boolean; subjects: Subject[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [icon, setIcon] = useState(PROJECT_ICONS[0]);
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [template, setTemplate] = useState('blank');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return notify('Ponle nombre al proyecto');
    setBusy(true);
    try {
      const id = await createProject({
        name: name.trim(),
        description: desc.trim() || null,
        subject_id: subjectId,
        color, icon, template,
      });
      setName(''); setDesc(''); setSubjectId(null); setTemplate('blank');
      onCreated(id);
    } catch (e: any) { notify('Error', e.message); }
    finally { setBusy(false); }
  }

  const tpl = TEMPLATES.find((t) => t.key === template) ?? TEMPLATES[0];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 520, maxHeight: '88%' }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Nuevo proyecto</Text>

            <TextInput value={name} onChangeText={setName} placeholder="Ej: Informe de laboratorio" placeholderTextColor={C.muted} style={input} />
            <Text style={lbl}>Descripción (opcional)</Text>
            <TextInput value={desc} onChangeText={setDesc} placeholder="De qué se trata" placeholderTextColor={C.muted} multiline style={[input, { minHeight: 64, textAlignVertical: 'top' }]} />

            <Text style={lbl}>Plantilla</Text>
            <View style={{ gap: 8 }}>
              {TEMPLATES.map((t) => {
                const on = t.key === template;
                return (
                  <Pressable key={t.key} onPress={() => setTemplate(t.key)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: on ? C.surface2 : 'transparent', borderWidth: 1, borderColor: on ? C.brand : C.line }}>
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
            <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 8, lineHeight: 17 }}>
              Columnas: {tpl.columns.map((c) => c.label).join(' · ')}
              {tpl.tasks.length ? `\nY ${tpl.tasks.length} tarjetas de arranque, que puedes borrar.` : ''}
            </Text>
            <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>Las columnas se pueden cambiar después dentro del proyecto.</Text>

            <Text style={lbl}>Materia (opcional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 2 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setSubjectId(null)}
                  style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, backgroundColor: subjectId === null ? C.brand : C.surface2, borderColor: subjectId === null ? C.brand : C.line }}>
                  <Text style={{ color: subjectId === null ? '#0b0d11' : C.text, fontSize: 12.5, fontWeight: subjectId === null ? '700' : '500' }}>Ninguna</Text>
                </Pressable>
                {subjects.map((s) => {
                  const on = s.id === subjectId;
                  return (
                    <Pressable key={s.id} onPress={() => { setSubjectId(s.id); setColor(s.color); }}
                      style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, backgroundColor: on ? s.color : C.surface2, borderColor: on ? s.color : C.line }}>
                      <Text style={{ color: on ? '#0b0d11' : C.text, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{s.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={lbl}>Ícono</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PROJECT_ICONS.map((i) => (
                <Pressable key={i} onPress={() => setIcon(i)}
                  style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: icon === i ? C.brand : 'transparent' }}>
                  <Text style={{ fontSize: 18 }}>{i}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={lbl}>Color</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {SUBJECT_COLORS.map((c) => (
                <Pressable key={c} onPress={() => setColor(c)}
                  style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: 3, borderColor: color.toLowerCase() === c.toLowerCase() ? '#fff' : 'transparent' }} />
              ))}
            </View>

            <Pressable onPress={save} disabled={busy} style={btnPrimary}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '…' : 'Crear proyecto'}</Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: C.muted }}>Cancelar</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const input = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 12, fontSize: 14 } as const;
const lbl = { color: C.muted, fontSize: 12, marginTop: 14, marginBottom: 8 } as const;
const btnPrimary = { backgroundColor: C.brand, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 } as const;

// Esta pantalla no es una pestaña, así que el candado de sesión va aquí.
export default function ProyectosProtegida() {
  return (
    <RequireAuth>
      <Proyectos />
    </RequireAuth>
  );
}
