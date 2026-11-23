import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button } from '../ds';
import { nameOf, type BoardColumn, type Member, type PTask, type Project } from '../../lib/projects';
import { HEALTH, ruleError, ruleText, suggestHealth, type Health, type Rule } from '../../lib/projectWork';
import { addRule, addUpdate, deleteRule, deleteUpdate, draftUpdate, getRules, getUpdates, setRuleEnabled, NEEDS_V24_3, type ProjectUpdate } from '../../lib/projectWorkDb';
import { weeklyReport, weeklyReportMarkdown } from '../../lib/projectReport';
import { hace } from './projectUi';
import { confirm, friendlyError, notify, toast } from '../../lib/feedback';

// ============================================================
//  Proyectos de trabajo (v25, fase 3): el estado semanal del proyecto y
//  las reglas automáticas.
// ============================================================

const chip = (on: boolean, color = C.brand) => ({ paddingVertical: 7, paddingHorizontal: 11, borderRadius: R.pill, borderWidth: 1, borderColor: on ? color : C.line, backgroundColor: on ? color + '22' : 'transparent' });

export function StatusSheet({ visible, project, tasks, members, editable, myId, onClose, onChanged }: {
  visible: boolean; project: Project; tasks: PTask[]; members: Member[]; editable: boolean; myId: string | null; onClose: () => void; onChanged: (latest: ProjectUpdate | null) => void;
}) {
  const [list, setList] = useState<ProjectUpdate[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [health, setHealth] = useState<Health>('en_curso');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);
  const people = useMemo(() => members.map((m) => ({ user_id: m.user_id, name: nameOf(m.profile) })), [members]);
  const report = useMemo(() => weeklyReport(tasks, people), [tasks, people]);
  useEffect(() => {
    if (!visible) return;
    setList(null); setBody(''); setHealth(suggestHealth(report));
    getUpdates(project.id).then((l) => { setMissing(l === null); setList(l ?? []); }).catch((e) => { notify('No se pudo cargar', friendlyError(e)); setList([]); });
  }, [visible, project.id]);
  async function write() {
    setAi(true);
    try { const d = await draftUpdate(weeklyReportMarkdown(project.name, report, people)); setBody(d.body); if (d.health) setHealth(d.health); }
    catch (e) { notify('No se pudo redactar', friendlyError(e)); }
    finally { setAi(false); }
  }
  async function publish() {
    if (!body.trim()) return;
    setBusy(true);
    try { const u = await addUpdate(project.id, health, body); const next = [u, ...(list ?? [])]; setList(next); setBody(''); onChanged(u); toast('Estado publicado: le llega al equipo'); }
    catch (e) { notify('No se pudo publicar', friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function remove(u: ProjectUpdate) {
    if (!(await confirm('¿Borrar este estado?', undefined, 'Borrar'))) return;
    try { await deleteUpdate(u.id); const next = (list ?? []).filter((x) => x.id !== u.id); setList(next); onChanged(next[0] ?? null); } catch (e) { notify('No se pudo', friendlyError(e)); }
  }
  const who = (id: string) => people.find((p) => p.user_id === id)?.name ?? 'Ex integrante';
  return (
    <Sheet visible={visible} onClose={onClose} title="Estado del proyecto" subtitle="Una nota corta cada semana: cómo va, qué riesgo hay y qué sigue. Le llega a todo el equipo." maxWidth={620}>
      {missing && <Text style={{ color: C.warnText, fontSize: 13 }}>{NEEDS_V24_3}</Text>}
      {editable && !missing && (
        <View style={{ gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
            {(Object.keys(HEALTH) as Health[]).map((h) => (
              <Pressable key={h} onPress={() => setHealth(h)} accessibilityRole="radio" accessibilityState={{ checked: health === h }} style={[chip(health === h, HEALTH[h].color), { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                <Ionicons name={HEALTH[h].icon as any} size={14} color={HEALTH[h].color} />
                <Text style={{ color: C.text, fontSize: 12.5, fontWeight: health === h ? '700' : '500' }}>{HEALTH[h].label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ color: C.muted, fontSize: 12 }}>
            Esta semana: {report.done.length} hechas, {report.next.length} para los próximos 7 días{report.late.length ? `, ${report.late.length} atrasadas` : ''}.
          </Text>
          <TextInput value={body} onChangeText={setBody} multiline maxLength={2000} placeholder="Ej: Vamos bien con la maqueta; las pruebas se corren al viernes porque falta el acceso al servidor." placeholderTextColor={C.muted}
            accessibilityLabel="Estado del proyecto" style={[{ minHeight: 90, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 10, fontSize: 14, textAlignVertical: 'top' }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label="Redactar con IA" icon="sparkles-outline" size="sm" kind="secondary" busy={ai} onPress={write} />
            <View style={{ flex: 1 }} />
            <Button label="Publicar" icon="send" size="sm" busy={busy} disabled={!body.trim()} onPress={publish} />
          </View>
        </View>
      )}
      {list === null && <ActivityIndicator color={C.brand} />}
      {list?.length === 0 && !missing && <Text style={{ color: C.muted, fontSize: 13 }}>Todavía no hay estados. El primero ayuda a que todos sepan cómo va.</Text>}
      {list?.map((u) => (
        <View key={u.id} style={{ gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name={HEALTH[u.health].icon as any} size={15} color={HEALTH[u.health].color} />
            <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{HEALTH[u.health].label}</Text>
            <Text style={{ color: C.muted, fontSize: 12, flex: 1 }}>· {who(u.author_id)} · {hace(u.created_at)}</Text>
            {u.author_id === myId && <Pressable onPress={() => remove(u)} accessibilityLabel="Borrar estado" hitSlop={6}><Ionicons name="trash-outline" size={15} color={C.muted} /></Pressable>}
          </View>
          <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 20 }} selectable>{u.body}</Text>
        </View>
      ))}
    </Sheet>
  );
}

export function RulesSheet({ visible, project, cols, members, editable, onClose }: {
  visible: boolean; project: Project; cols: BoardColumn[]; members: Member[]; editable: boolean; onClose: () => void;
}) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState<Partial<Rule>>({ trigger: 'moved', action: 'notify' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setRules(null); setErr(null); setDraft({ trigger: 'moved', action: 'notify', column_key: cols.find((c) => !c.done && c !== cols[0])?.key ?? cols[0]?.key });
    getRules(project.id).then((l) => { setMissing(l === null); setRules(l ?? []); }).catch((e) => { setErr(friendlyError(e)); setRules([]); });
  }, [visible, project.id]);
  const name = (id: string) => nameOf(members.find((m) => m.user_id === id)?.profile);
  async function add() {
    const e = ruleError(draft);
    if (e) { setErr(e); return; }
    setBusy(true); setErr(null);
    try {
      const r = await addRule({ project_id: project.id, trigger: draft.trigger!, column_key: draft.trigger === 'moved' ? draft.column_key ?? null : null, action: draft.action!, user_id: draft.action === 'notify_assignee' ? null : draft.user_id ?? null });
      setRules([...(rules ?? []), r]); toast('Regla creada');
    } catch (e2) { setErr(friendlyError(e2)); }
    finally { setBusy(false); }
  }
  async function toggle(r: Rule) {
    try { await setRuleEnabled(r.id, !r.enabled); setRules((l) => l?.map((x) => (x.id === r.id ? { ...x, enabled: !r.enabled } : x)) ?? null); } catch (e) { notify('No se pudo', friendlyError(e)); }
  }
  async function remove(r: Rule) {
    try { await deleteRule(r.id); setRules((l) => l?.filter((x) => x.id !== r.id) ?? null); } catch (e) { notify('No se pudo', friendlyError(e)); }
  }
  const pick = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={chip(on)}>
      <Text style={{ color: on ? C.text : C.muted, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="Reglas automáticas" subtitle="Kaderno hace lo repetitivo por ti. Con Gratis, 2 por proyecto; con Pro, 20." maxWidth={600}>
      {missing && <Text style={{ color: C.warnText, fontSize: 13 }}>{NEEDS_V24_3}</Text>}
      {rules === null && <ActivityIndicator color={C.brand} />}
      {rules?.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: r.enabled ? 1 : 0.55 }}>
          <Ionicons name="flash-outline" size={16} color={C.brand} />
          <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }}>{ruleText(r, cols, name)}</Text>
          {editable && <Pressable onPress={() => toggle(r)} accessibilityRole="switch" accessibilityState={{ checked: r.enabled }} hitSlop={6}><Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>{r.enabled ? 'Pausar' : 'Activar'}</Text></Pressable>}
          {editable && <Pressable onPress={() => remove(r)} accessibilityLabel="Borrar regla" hitSlop={6}><Ionicons name="trash-outline" size={15} color={C.muted} /></Pressable>}
        </View>
      ))}
      {rules?.length === 0 && !missing && <Text style={{ color: C.muted, fontSize: 13 }}>Sin reglas todavía.</Text>}
      {editable && !missing && (
        <View style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ color: C.text, fontSize: 13, fontWeight: '800' }}>Nueva regla</Text>
          <Text style={{ color: C.muted, fontSize: 12 }}>Cuando…</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {pick('pase a una columna', draft.trigger === 'moved', () => setDraft({ ...draft, trigger: 'moved' }))}
            {pick('se cree una tarea', draft.trigger === 'created', () => setDraft({ ...draft, trigger: 'created' }))}
            {pick('se venza una tarea', draft.trigger === 'overdue', () => setDraft({ ...draft, trigger: 'overdue', action: draft.action === 'assign' ? 'notify' : draft.action }))}
          </View>
          {draft.trigger === 'moved' && <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{cols.map((c) => pick(c.label, draft.column_key === c.key, () => setDraft({ ...draft, column_key: c.key })))}</View>}
          <Text style={{ color: C.muted, fontSize: 12 }}>Entonces…</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {draft.trigger !== 'overdue' && pick('asignar a', draft.action === 'assign', () => setDraft({ ...draft, action: 'assign' }))}
            {pick('avisar a', draft.action === 'notify', () => setDraft({ ...draft, action: 'notify' }))}
            {pick('avisar a quien la tiene', draft.action === 'notify_assignee', () => setDraft({ ...draft, action: 'notify_assignee' }))}
          </View>
          {(draft.action === 'assign' || draft.action === 'notify') && (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {draft.action === 'notify' && pick('el dueño', !draft.user_id, () => setDraft({ ...draft, user_id: null }))}
              {members.map((m) => pick(nameOf(m.profile), draft.user_id === m.user_id, () => setDraft({ ...draft, user_id: m.user_id })))}
            </View>
          )}
          {!ruleError(draft) && <Text style={{ color: C.text, fontSize: 13 }}>{ruleText(draft as Rule, cols, name)}.</Text>}
          {err && <Text style={{ color: C.badText, fontSize: 13 }}>{err}</Text>}
          <Button label="Crear regla" icon="add" size="sm" busy={busy} onPress={add} style={{ alignSelf: 'flex-start' }} />
        </View>
      )}
    </Sheet>
  );
}
