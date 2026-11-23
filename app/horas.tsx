import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { Screen, Button, Card, ChipRow, EmptyState, Field, FilterChip, SectionLabel, Segmented, Skeleton } from '../components/ds';
import { Sheet } from '../components/cards/CardForms';
import { SubjectPicker } from '../components/SubjectPicker';
import { getSubjects, type Subject } from '../lib/db';
import { getProjects, type Project } from '../lib/projects';
import { fmtHours, decHours, groupHours, hoursCsv, hoursReportHtml, isoDay, parseDuration, periodRange, totals, type GroupBy, type HourSession, type Named, type Rates } from '../lib/hours';
import { addManualHours, deleteHours, getHours, getRates, printReport, projectHours, setRate, NEEDS_V23_5, type TeamHours } from '../lib/hoursDb';
import { usePlan } from '../lib/billingDb';
import { cop } from '../lib/billing';
import { useMode } from '../lib/mode';
import { useResponsive } from '../lib/responsive';
import { useAuth } from '../lib/auth';
import { saveFile } from '../lib/fileIO';
import { confirm, friendlyError, notify, toast } from '../lib/feedback';

// ============================================================
//  Registro de horas (v24, fase 5): el enfoque y las horas a mano, por
//  proyecto, por área o cliente y por día; tarifa por hora; CSV (todos),
//  informe en PDF (Pro) y las horas del equipo en un proyecto (Equipo).
// ============================================================

function Horas() {
  const { session } = useAuth();
  const router = useRouter();
  const { v: mv } = useMode();
  const { plan } = usePlan();
  const { isWide } = useResponsive();
  const [kind, setKind] = useState<'week' | 'month'>('week');
  const [offset, setOffset] = useState(0);
  const [by, setBy] = useState<GroupBy>('project');
  const [list, setList] = useState<HourSession[] | null>(null);
  const [v5, setV5] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rates, setRates] = useState<Rates>({});
  const [adding, setAdding] = useState(false);
  const [rateFor, setRateFor] = useState<{ id: string; name: string } | null>(null);
  const [team, setTeam] = useState<Project | null>(null);
  const [showAll, setShowAll] = useState(false);
  const range = useMemo(() => periodRange(kind, offset), [kind, offset]);

  const load = useCallback(() => {
    setList(null);
    getHours(range.from, range.to).then((r) => { setList(r.list); setV5(r.v5); }).catch((e) => { notify('No se pudo cargar', friendlyError(e)); setList([]); });
  }, [range.from.getTime(), range.to.getTime()]);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => {
    getSubjects().then(setSubjects).catch(() => {});
    getProjects().then(setProjects).catch(() => {});
    getRates().then(setRates).catch(() => {});
  }, []));

  const names = useMemo(() => {
    const n: Record<string, Named> = {};
    subjects.forEach((s) => { n[s.id] = { name: s.name, color: s.color }; });
    projects.forEach((p) => { n[p.id] = { name: `${p.icon ? p.icon + ' ' : ''}${p.name}`, color: p.color }; });
    return n;
  }, [subjects, projects]);
  const rows = useMemo(() => groupHours(list ?? [], by, names, rates), [list, by, names, rates]);
  const t = useMemo(() => totals(list ?? [], rates), [list, rates]);
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  const isPro = plan?.plan === 'pro' || plan?.plan === 'team';
  const who = (session?.user?.user_metadata?.full_name as string | undefined) || session?.user?.email || 'Kaderno';

  async function csv() {
    if (!list?.length) return;
    try { await saveFile(`horas ${isoDay(range.from)} a ${isoDay(new Date(range.to.getTime() - 1))}.csv`, hoursCsv(list, names, rates), 'text/csv'); }
    catch (e) { notify('No se pudo guardar', friendlyError(e)); }
  }
  async function pdf() {
    if (!list?.length) return;
    if (!isPro) { notify('Informe en PDF', 'El informe de horas en PDF viene con Kaderno Pro. El CSV es gratis y abre en Excel o Google Sheets.'); return; }
    // En el informe, los nombres van sin el emoji del proyecto (documento sobrio).
    const plain: Record<string, Named> = { ...names };
    projects.forEach((p) => { plain[p.id] = { name: p.name }; });
    try { await printReport(hoursReportHtml({ who, period: range.label, list, names: plain, rates, by: by === 'day' ? 'project' : by }), `Informe de horas ${range.label}`); }
    catch (e) { notify('No se pudo abrir el informe', friendlyError(e)); }
  }
  async function remove(s: HourSession) {
    if (!(await confirm('¿Borrar este registro?', `${fmtHours(s.minutes)} del ${new Date(s.created_at).toLocaleDateString('es-CO')}.`, 'Borrar'))) return;
    try { await deleteHours(s.id); setList((l) => l?.filter((x) => x.id !== s.id) ?? null); } catch (e) { notify('No se pudo borrar', friendlyError(e)); }
  }

  return (
    <Screen title={isWide ? 'Registro de horas' : 'Horas'} subtitle="Tu enfoque y lo que anotes a mano" back="/estudiar" maxWidth={920}
      right={<Button label={isWide ? 'Anotar horas' : 'Anotar'} icon="add" size="sm" onPress={() => setAdding(true)} />}>
      {!v5 && <Card style={{ marginBottom: 12 }}><Text style={{ color: C.warnText, fontSize: 13 }}>{NEEDS_V23_5}</Text></Card>}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: isWide ? 8 : 2, marginBottom: 10 }}>
        <Segmented<'week' | 'month'> items={[{ key: 'week', label: 'Semana' }, { key: 'month', label: 'Mes' }]} value={kind} onChange={(k) => { setKind(k); setOffset(0); }} style={{ borderBottomWidth: 0 }} />
        <View style={{ flex: 1, minWidth: 8 }} />
        <Pressable onPress={() => setOffset(offset - 1)} accessibilityRole="button" accessibilityLabel="Periodo anterior" hitSlop={6} style={{ padding: 6 }}><Ionicons name="chevron-back" size={20} color={C.text} /></Pressable>
        <Text style={{ color: C.text, fontSize: isWide ? 14.5 : 13.5, fontWeight: '700', minWidth: isWide ? 150 : 0, textAlign: 'center', flexShrink: 1 }} numberOfLines={1} accessibilityLiveRegion="polite">{range.label}</Text>
        <Pressable onPress={() => setOffset(Math.min(0, offset + 1))} disabled={offset >= 0} accessibilityRole="button" accessibilityLabel="Periodo siguiente" hitSlop={6} style={{ padding: 6, opacity: offset >= 0 ? 0.35 : 1 }}><Ionicons name="chevron-forward" size={20} color={C.text} /></Pressable>
      </View>

      <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'center', marginBottom: 14 }} accessibilityLabel="Total del periodo">
        <View style={{ flexGrow: 1 }}>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>Total</Text>
          <Text style={{ color: C.text, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{list ? fmtHours(t.minutes) : '…'}</Text>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>{decHours(t.minutes)} horas en {t.days} {t.days === 1 ? 'día' : 'días'}</Text>
        </View>
        {t.amount > 0 && (
          <View style={{ flexGrow: 1 }}>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>Valor con tus tarifas</Text>
            <Text style={{ color: C.text, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{cop(t.amount)}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="CSV" icon="download-outline" size="sm" kind="secondary" disabled={!list?.length} onPress={csv} accessibilityLabel="Descargar CSV" />
          <Button label="PDF" icon={isPro ? 'document-outline' : 'lock-closed-outline'} size="sm" kind="secondary" disabled={!list?.length} onPress={pdf} accessibilityLabel="Informe en PDF" />
          <Button label="Cobrar" icon="receipt-outline" size="sm" kind="secondary" accessibilityLabel="Hacer cuenta de cobro"
            onPress={() => router.push(`/cobros?nueva=1&desde=${isoDay(range.from)}&hasta=${isoDay(new Date(range.to.getTime() - 86_400_000))}` as any)} />
        </View>
      </Card>

      <ChipRow style={{ marginBottom: 10 }}>
        <FilterChip label="Por proyecto" active={by === 'project'} onPress={() => setBy('project')} />
        <FilterChip label={`Por ${mv.subjectLower}`} active={by === 'subject'} onPress={() => setBy('subject')} />
        <FilterChip label="Por día" active={by === 'day'} onPress={() => setBy('day')} />
      </ChipRow>

      {list === null ? <><Skeleton height={56} /><Skeleton height={56} style={{ marginTop: 8 }} /></> : !list.length ? (
        <EmptyState icon="time-outline" title="Sin horas en este periodo" text="El tiempo de Enfoque se anota solo (elige el proyecto antes de empezar). También puedes anotar horas a mano."
          action={{ label: 'Anotar horas', icon: 'add', onPress: () => setAdding(true) }} />
      ) : (
        <Card padded={false} style={{ marginBottom: 16 }}>
          {rows.map((r, i) => {
            const canRate = by !== 'day' && !!r.key;
            const project = by === 'project' ? projects.find((p) => p.id === r.key) : undefined;
            return (
              <View key={r.key || 'none'} style={{ paddingHorizontal: 14, paddingVertical: 11, gap: 6, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {r.color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.color }} /> : null}
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>{r.name}</Text>
                  {r.amount > 0 && <Text style={{ color: C.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{cop(r.amount)}</Text>}
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 78, textAlign: 'right' }}>{fmtHours(r.minutes)}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' }}>
                  <View style={{ width: `${(r.minutes / max) * 100}%`, height: 6, backgroundColor: r.color ?? C.brand }} />
                </View>
                {(canRate || project) && (
                  <View style={{ flexDirection: 'row', gap: 14 }}>
                    {canRate && (
                      <Pressable onPress={() => setRateFor({ id: r.key, name: r.name })} accessibilityRole="button" accessibilityLabel={`Tarifa por hora de ${r.name}`} hitSlop={4}>
                        <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>{rates[r.key] ? `${cop(rates[r.key])} la hora` : 'Poner tarifa por hora'}</Text>
                      </Pressable>
                    )}
                    {project && (
                      <Pressable onPress={() => setTeam(project)} accessibilityRole="button" accessibilityLabel={`Horas del equipo en ${project.name}`} hitSlop={4}>
                        <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>Horas del equipo</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}

      {!!list?.length && (
        <>
          <SectionLabel text="Cada registro" count={list.length} right={list.length > 8 ? <Button label={showAll ? 'Ver menos' : 'Ver todos'} size="sm" kind="ghost" onPress={() => setShowAll(!showAll)} /> : undefined} />
          <Card padded={false} style={{ marginBottom: 30 }}>
            {[...list].reverse().slice(0, showAll ? 500 : 8).map((s, i, arr) => {
              const d = new Date(s.created_at);
              const what = [s.project_id && names[s.project_id]?.name, s.subject_id && names[s.subject_id]?.name].filter(Boolean).join(' · ') || 'Sin proyecto ni área';
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.line }}>
                  <Ionicons name={s.source === 'manual' ? 'create-outline' : 'timer-outline'} size={17} color={C.muted} accessibilityLabel={s.source === 'manual' ? 'A mano' : 'Enfoque'} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: C.text, fontSize: 13.5 }} numberOfLines={1}>{what}</Text>
                    <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>{d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}{s.note ? ` · ${s.note}` : ''}</Text>
                  </View>
                  <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmtHours(s.minutes)}</Text>
                  <Pressable onPress={() => remove(s)} accessibilityRole="button" accessibilityLabel="Borrar registro" hitSlop={6}><Ionicons name="trash-outline" size={16} color={C.muted} /></Pressable>
                </View>
              );
            })}
          </Card>
        </>
      )}

      <ManualSheet visible={adding} subjects={subjects} projects={projects} subjectWord={mv.subjectLower} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
      <RateSheet target={rateFor} value={rateFor ? rates[rateFor.id] ?? null : null} onClose={() => setRateFor(null)} onSaved={(r) => { setRates(r); setRateFor(null); }} />
      <TeamSheet project={team} range={range} isTeam={plan?.plan === 'team'} onClose={() => setTeam(null)} />
    </Screen>
  );
}

function ManualSheet({ visible, subjects, projects, subjectWord, onClose, onSaved }: {
  visible: boolean; subjects: Subject[]; projects: Project[]; subjectWord: string; onClose: () => void; onSaved: () => void;
}) {
  const [date, setDate] = useState(isoDay(new Date()));
  const [dur, setDur] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (visible) { setDate(isoDay(new Date())); setDur(''); setNote(''); setErr(null); } }, [visible]);
  const min = parseDuration(dur);
  async function save() {
    if (!min || min < 1 || min > 720) { setErr('Escribe la duración: 1:30, 1,5 o 90 (minutos). Máximo 12 horas.'); return; }
    const d = new Date(date + 'T12:00:00');
    if (isNaN(d.getTime())) { setErr('La fecha va como AAAA-MM-DD.'); return; }
    if (d.getTime() > Date.now() + 86_400_000) { setErr('No se pueden anotar horas en el futuro.'); return; }
    setBusy(true); setErr(null);
    try { await addManualHours({ date: d, minutes: min, subject_id: subject, project_id: project, note }); toast(`${fmtHours(min)} anotadas`, { tone: 'good' }); onSaved(); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }
  const yesterday = isoDay(new Date(Date.now() - 86_400_000));
  return (
    <Sheet visible={visible} onClose={onClose} title="Anotar horas" subtitle="Para lo que no hiciste con Enfoque: reuniones, llamadas, trabajo fuera de Kaderno."
      footer={<><View style={{ flex: 1 }} /><Button label="Cancelar" kind="ghost" onPress={onClose} /><Button label={min ? `Anotar ${fmtHours(min)}` : 'Anotar'} icon="checkmark" busy={busy} onPress={save} /></>}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          {Platform.OS === 'web'
            ? <View style={{ marginBottom: 12 }}><Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>Fecha</Text>
                {React.createElement('input', { type: 'date', value: date, max: isoDay(new Date()), 'aria-label': 'Fecha', onChange: (e: any) => setDate(e.target.value),
                  style: { background: C.surface2, color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box', colorScheme: 'dark' } })}</View>
            : <Field label="Fecha (AAAA-MM-DD)" value={date} onChangeText={setDate} />}
        </View>
        <View style={{ flex: 1 }}><Field label="Duración" value={dur} onChangeText={setDur} placeholder="1:30" accessibilityLabel="Duración" hint={min ? fmtHours(min) : undefined} /></View>
      </View>
      <ChipRow>
        <FilterChip label="Hoy" active={date === isoDay(new Date())} onPress={() => setDate(isoDay(new Date()))} />
        <FilterChip label="Ayer" active={date === yesterday} onPress={() => setDate(yesterday)} />
        {[30, 60, 90, 120].map((m) => <FilterChip key={m} label={fmtHours(m)} active={min === m} onPress={() => setDur(String(m))} />)}
      </ChipRow>
      <SubjectPicker subjects={subjects} value={subject} onChange={setSubject} placeholder={`Sin ${subjectWord}`} />
      {projects.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>Proyecto</Text>
          <ChipRow>
            <FilterChip label="Ninguno" active={!project} onPress={() => setProject(null)} />
            {projects.slice(0, 12).map((p) => <FilterChip key={p.id} label={`${p.icon ? p.icon + ' ' : ''}${p.name}`} active={project === p.id} onPress={() => setProject(p.id)} />)}
          </ChipRow>
        </View>
      )}
      <Field label="Nota (opcional)" value={note} onChangeText={setNote} placeholder="Ej: llamada con el cliente" maxLength={300} />
      {err && <Text style={{ color: C.badText, fontSize: 13 }}>{err}</Text>}
    </Sheet>
  );
}

function RateSheet({ target, value, onClose, onSaved }: { target: { id: string; name: string } | null; value: number | null; onClose: () => void; onSaved: (r: Rates) => void }) {
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTxt(value ? String(value) : ''); }, [target?.id]);
  const n = Number(txt.replace(/\D/g, ''));
  async function save(v: number | null) {
    if (!target) return;
    setBusy(true);
    try { onSaved(await setRate(target.id, v)); } catch (e) { notify('No se pudo guardar', friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet visible={!!target} onClose={onClose} title="Tarifa por hora" subtitle={target ? `Para ${target.name}. Solo la ves tú; sirve para el valor del informe.` : undefined} maxWidth={440}
      footer={<>{value ? <Button label="Quitar" kind="ghost" onPress={() => save(null)} /> : null}<View style={{ flex: 1 }} /><Button label="Guardar" busy={busy} disabled={!n} onPress={() => save(n)} /></>}>
      <Field label="Pesos por hora" value={txt ? cop(n).replace('$', '') : ''} onChangeText={(v) => setTxt(v.replace(/\D/g, '').slice(0, 9))} keyboardType="number-pad" placeholder="50.000" accessibilityLabel="Pesos por hora" />
    </Sheet>
  );
}

function TeamSheet({ project, range, isTeam, onClose }: { project: Project | null; range: { from: Date; to: Date; label: string }; isTeam: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<TeamHours[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!project) return;
    setRows(null); setErr(null);
    if (!isTeam) { setErr('Las horas de todo el equipo en un proyecto vienen con el plan Equipo de Kaderno Pro.'); return; }
    projectHours(project.id, range.from, range.to).then(setRows).catch((e) => setErr(friendlyError(e)));
  }, [project?.id, range.from.getTime(), isTeam]);
  const total = (rows ?? []).reduce((a, r) => a + r.minutes, 0);
  return (
    <Sheet visible={!!project} onClose={onClose} title={project ? `Horas del equipo en ${project.name}` : ''} subtitle={range.label} maxWidth={520}>
      {err && <Text style={{ color: C.muted, fontSize: 13.5 }}>{err}</Text>}
      {err && !isTeam && <Button label="Ver planes" onPress={() => { onClose(); import('expo-router').then((m) => m.router.push('/plan' as any)); }} />}
      {!err && rows === null && <ActivityIndicator color={C.brand} />}
      {rows?.length === 0 && <Text style={{ color: C.muted, fontSize: 13.5 }}>Nadie ha anotado horas en este proyecto en el periodo.</Text>}
      {rows?.map((r) => (
        <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
          <Ionicons name="person-circle-outline" size={20} color={C.muted} />
          <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{r.name}</Text>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>{r.sessions} {r.sessions === 1 ? 'registro' : 'registros'}</Text>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 78, textAlign: 'right' }}>{fmtHours(r.minutes)}</Text>
        </View>
      ))}
      {!!rows?.length && <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', textAlign: 'right' }}>Total {fmtHours(total)}</Text>}
    </Sheet>
  );
}

export default function HorasProtegida() { return <RequireAuth><Horas /></RequireAuth>; }
