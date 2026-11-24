import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R } from '../../lib/theme';
import { confirm, notify } from '../../lib/confirm';
import { ProgressBar } from '../ProgressBar';
import { Activity, Load, Member, PTask, Profile, Project, ProjectRole, colorOf, deleteProject, initialsOf, leaveProject, nameOf, regenJoinCode, removeMember, setMemberRole, workload } from '../../lib/projects';
import { Pill, hace, isWeb, secTitle } from './projectUi';
import { t, trn } from '../../lib/i18n';

// ============================================================
//  Vista Equipo del proyecto: integrantes, papeles, código para unirse y carga de trabajo.
//  (Separado de app/proyectos/[id].tsx en la versión 23.)
// ============================================================

export function Equipo({ project, members, tasks, activity, myId, role, isWide, onChanged, onLeft }: {
  project: Project | null; members: Member[]; tasks: PTask[];
  activity: (Activity & { profile?: Profile | null })[];
  myId: string | null; role: ProjectRole | null; isWide: boolean;
  onChanged: () => void; onLeft: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isOwner = role === 'owner';
  const { loads, unassigned, balanced } = useMemo(() => workload(tasks, members), [tasks, members]);

  async function copyCode() {
    const code = project?.join_code ?? '';
    if (!code) return;
    if (isWeb && typeof navigator !== 'undefined' && navigator.clipboard) {
      try { await navigator.clipboard.writeText(code); notify(t('Código copiado'), t('Pásaselo a quien quieras invitar.')); return; } catch { /* sigue abajo */ }
    }
    notify(t('Código del proyecto'), code);
  }

  async function regen() {
    if (!project) return;
    const ok = await confirm(t('¿Cambiar el código?'),
      t('El código de ahora deja de servir. Quien ya está adentro se queda; quien tenga el código viejo no podrá entrar.'), t('Cambiar'));
    if (!ok) return;
    setBusy(true);
    try { await regenJoinCode(project.id); onChanged(); }
    catch (e: any) { notify(t('No se pudo cambiar'), e.message); }
    finally { setBusy(false); }
  }

  async function salir() {
    if (!project) return;
    if (isOwner) return notify(t('Eres quien creó el proyecto'), t('No puedes salirte de tu propio proyecto: bórralo o pásalo a otra persona sacándote después.'));
    const ok = await confirm(t('¿Salir del proyecto?'), t('Dejarás de ver el tablero. Puedes volver a entrar con el código.'), t('Salir'));
    if (!ok) return;
    try { await leaveProject(project.id); onLeft(); }
    catch (e: any) { notify(t('No se pudo salir'), e.message); }
  }

  async function borrar() {
    if (!project) return;
    const ok = await confirm(t('¿Borrar el proyecto?'),
      t('Se borra "{name}" con sus {length} tarjetas para todo el equipo. Esto no se puede deshacer.', { name: project.name, length: tasks.length }), t('Borrar'));
    if (!ok) return;
    try { await deleteProject(project.id); onLeft(); }
    catch (e: any) { notify(t('No se pudo borrar'), e.message); }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isWide ? 24 : 14, paddingBottom: 70, maxWidth: 900, width: '100%' }}>
      {/* ---------- Invitar ---------- */}
      <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 16, marginBottom: 14 }}>
        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }}>{t('Invitar al proyecto')}</Text>
        <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 4, lineHeight: 19 }}>
          {t('Quien tenga este código puede entrar desde la pantalla de Proyectos. Entra como editor.')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18 }}>
            <Text style={{ color: C.text, fontSize: 21, fontWeight: '800', letterSpacing: 5 }}>{project?.join_code ?? '······'}</Text>
          </View>
          <Pressable onPress={copyCode}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Ionicons name="copy-outline" size={15} color="#0f1115" />
            <Text style={{ color: C.onBrand, fontWeight: '700', fontSize: 13 }}>{t('Copiar')}</Text>
          </Pressable>
          {isOwner && (
            <Pressable onPress={regen} disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16 }}>
              <Ionicons name="refresh" size={15} color={C.muted} />
              <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>{t('Cambiar código')}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ---------- Reparto del trabajo ---------- */}
      <WorkloadPanel loads={loads} unassigned={unassigned} balanced={balanced} myId={myId} />

      {/* ---------- Integrantes ---------- */}
      <Text style={secTitle}>{t('Integrantes')}</Text>
      <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, overflow: 'hidden', marginBottom: 14 }}>
        {members.map((m, i) => (
          <MemberRow key={m.id} member={m} first={i === 0} isMe={m.user_id === myId} canManage={isOwner}
            onChanged={onChanged} />
        ))}
      </View>

      {/* ---------- Bitácora ---------- */}
      <Text style={secTitle}>{t('Movimientos recientes')}</Text>
      <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 14, marginBottom: 18 }}>
        {activity.length === 0 ? (
          <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Todavía no hay movimientos.')}</Text>
        ) : activity.map((a) => (
          <View key={a.id} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colorOf(a.actor_id), alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Text style={{ color: '#0f1115', fontSize: 8.5, fontWeight: '800' }}>{initialsOf(a.profile)}</Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 12.5, flex: 1, lineHeight: 18 }}>
              <Text style={{ color: C.text, fontWeight: '700' }}>{nameOf(a.profile)}</Text> {a.summary}
              <Text style={{ color: C.muted }}>  ·  {hace(a.created_at)}</Text>
            </Text>
          </View>
        ))}
      </View>

      {/* ---------- Cosas peligrosas ---------- */}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {!isOwner && (
          <Pressable onPress={salir} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>{t('Salir del proyecto')}</Text>
          </Pressable>
        )}
        {isOwner && (
          <Pressable onPress={borrar} style={{ borderWidth: 1, borderColor: C.bad + '66', borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ color: C.bad, fontWeight: '700', fontSize: 13 }}>{t('Borrar proyecto')}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

export function MemberRow({ member, first, isMe, canManage, onChanged }: {
  member: Member; first: boolean; isMe: boolean; canManage: boolean; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const esOwner = member.role === 'owner';

  async function cambiarPapel() {
    if (esOwner) return;
    const next = member.role === 'editor' ? 'viewer' : 'editor';
    setBusy(true);
    try { await setMemberRole(member.id, next); onChanged(); }
    catch (e: any) { notify(t('No se pudo cambiar'), e.message); }
    finally { setBusy(false); }
  }

  async function sacar() {
    const ok = await confirm(t('¿Sacar a {profile}?', { profile: nameOf(member.profile) }),
      t('Deja de ver el proyecto. Sus tarjetas se quedan, pero sin responsable.'), t('Sacar'));
    if (!ok) return;
    setBusy(true);
    try { await removeMember(member.id); onChanged(); }
    catch (e: any) { notify(t('No se pudo sacar'), e.message); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colorOf(member.user_id), alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#0f1115', fontSize: 11.5, fontWeight: '800' }}>{initialsOf(member.profile)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>
          {nameOf(member.profile)}{isMe ? t('  (tú)') : ''}
        </Text>
        <Text numberOfLines={1} style={{ color: C.muted, fontSize: 11.5, marginTop: 1 }}>
          {esOwner ? t('Creó el proyecto') : member.role === 'editor' ? t('Puede editar') : t('Solo mira')}
        </Text>
      </View>

      {canManage && !esOwner && (
        <>
          <Pressable onPress={cambiarPapel} disabled={busy}
            style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingVertical: 6, paddingHorizontal: 11 }}>
            <Text style={{ color: C.text, fontSize: 11.5, fontWeight: '600' }}>
              {member.role === 'editor' ? t('Pasar a solo mirar') : t('Dejar editar')}
            </Text>
          </Pressable>
          <Pressable onPress={sacar} disabled={busy} hitSlop={8}>
            <Ionicons name="close" size={17} color={C.muted} />
          </Pressable>
        </>
      )}
    </View>
  );
}

// ---------- Panel de carga ----------

export function WorkloadPanel({ loads, unassigned, balanced, myId }: {
  loads: Load[]; unassigned: number; balanced: boolean; myId: string | null;
}) {
  const conAlgo = loads.filter((l) => l.total > 0).length;
  // Cuántos están de brazos cruzados: es la causa más común de que el reparto
  // salga disparejo, y merece un aviso distinto al de "a fulano le tocó doble".
  const sinNada = loads.filter((l) => l.pending === 0).length;

  return (
    <>
      <Text style={secTitle}>{t('Cómo va repartido')}</Text>
      <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 14, marginBottom: 14 }}>
        {conAlgo === 0 ? (
          <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 19 }}>
            {t('Todavía nadie tiene tareas asignadas. Abre una tarjeta y elige quién la hace: aquí verás si el trabajo quedó parejo.')}</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <Ionicons name={balanced ? 'checkmark-circle' : 'alert-circle'} size={16} color={balanced ? C.good : C.warn} />
              <Text style={{ color: balanced ? C.good : C.warn, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
                {/* El aviso dice POR QUÉ está disparejo: no es lo mismo que a
                    alguien le toque el doble a que alguien no tenga nada. */}
                {balanced
                  ? t('El trabajo está bastante parejo')
                  : sinNada > 0
                    ? t('El reparto está disparejo: {v} sin nada pendiente', { v: sinNada === 1 ? t('hay 1 integrante') : t('hay {sinNada} integrantes', { sinNada }) })
                    : t('El reparto está disparejo: a alguien le tocó bastante más que al resto')}
              </Text>
            </View>

            {loads.map((l) => (
              <View key={l.user_id} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colorOf(l.user_id), alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#0f1115', fontSize: 8.5, fontWeight: '800' }}>{initialsOf(l.profile)}</Text>
                  </View>
                  <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', flex: 1 }}>
                    {nameOf(l.profile)}{l.user_id === myId ? t(' (tú)') : ''}
                  </Text>
                  {l.late > 0 && <Pill text={(l.late === 1 ? trn('1 atrasada') : trn('{n} atrasadas', { n: l.late }))} color={C.bad} />}
                  {l.late === 0 && l.soon > 0 && <Pill text={trn('{n} pronto', { n: l.soon })} color={C.warn} />}
                  <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '700' }}>{t('{pending} pend.', { pending: l.pending })}</Text>
                </View>
                <ProgressBar done={l.done} total={l.total} height={6} compact />
              </View>
            ))}

            {unassigned > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 11, marginTop: 2 }}>
                <Ionicons name="help-circle-outline" size={15} color={C.muted} />
                <Text style={{ color: C.muted, fontSize: 12.5, flex: 1 }}>
                  {unassigned === 1 ? t('1 tarjeta sin dueño: nadie la está mirando.') : t('{unassigned} tarjetas sin dueño: nadie las está mirando.', { unassigned })}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </>
  );
}
