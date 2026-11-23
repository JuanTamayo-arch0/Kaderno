import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { Screen, Button, Card, Badge, ChipRow, EmptyState, Field, FilterChip, SectionLabel, Segmented, Skeleton } from '../components/ds';
import { Sheet } from '../components/cards/CardForms';
import { SubjectPicker } from '../components/SubjectPicker';
import { getSubjects, type Subject } from '../lib/db';
import { getProjects, type Project } from '../lib/projects';
import { weekGrid, weekTotals, planCellEdit, fmtHours, decHours, groupHours, hoursCsv, hoursReportHtml, isoDay, parseDuration, periodRange, totals, type GroupBy, type HourSession, type Named, type Rates } from '../lib/hours';
import { addManualHours, decideWeek, deleteHours, getHours, getRates, getTimesheets, printReport, projectHours, setRate, submitWeek, updateHours, NEEDS_V23_5, type TeamHours, type Timesheet } from '../lib/hoursDb';
import { startStopwatch, useStopwatch } from '../lib/stopwatch';
import { TextInput } from 'react-native';
import { usePlan } from '../lib/billingDb';
import { cop } from '../lib/billing';
import { useMode } from '../lib/mode';
import { useSpaceFilter } from '../lib/useSpace';
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
  const [allList, setList] = useState<HourSession[] | null>(null);
  const [v5, setV5] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rates, setRates] = useState<Rates>({});
  const [adding, setAdding] = useState(false);
  const [rateFor, setRateFor] = useState<{ id: string; name: string } | null>(null);
  const [team, setTeam] = useState<Project | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<'resumen' | 'hoja'>('resumen');
  const [timerOpen, setTimerOpen] = useState(false);
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const { sw } = useStopwatch();
  const myId = session?.user?.id ?? null;
  const range = useMemo(() => periodRange(kind, offset), [kind, offset]);
  // v26: con "Los dos", en Trabajo no se cuentan las horas de las materias de Estudio.
  const sp = useSpaceFilter();
  const list = useMemo(() => allList ? sp.items(allList, subjects) : null, [allList, subjects, sp.space, sp.both]);
  // v25: "Anotar horas" desde el cierre del día abre el formulario.
  const params = useLocalSearchParams<{ anotar?: string }>();
  useEffect(() => { if (params.anotar === '1') { setAdding(true); router.setParams({ anotar: undefined } as any); } }, [params.anotar]);

  const load = useCallback(() => {
    setList(null);
    getHours(range.from, range.to).then((r) => { setList(r.list); setV5(r.v5); }).catch((e) => { notify('No se pudo cargar', friendlyError(e)); setList([]); });
  }, [range.from.getTime(), range.to.getTime()]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (kind === 'week') getTimesheets(isoDay(range.from)).then(setSheets).catch(() => setSheets([])); else setSheets([]); }, [kind, range.from.getTime()]);
  useEffect(() => { if (!sw) load(); }, [sw]);
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
      right={<View style={{ flexDirection: 'row', gap: 8 }}>
        {!sw && <Button label={isWide ? 'Cronómetro' : ''} icon="play-circle-outline" size="sm" kind="secondary" onPress={() => setTimerOpen(true)} accessibilityLabel="Iniciar cronómetro" />}
        <Button label={isWide ? 'Anotar horas' : 'Anotar'} icon="add" size="sm" onPress={() => setAdding(true)} />
      </View>}>
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
        {kind === 'week' && <FilterChip label="Hoja semanal" icon={<Ionicons name="grid-outline" size={14} color={view === 'hoja' ? C.onBrand : C.muted} />} active={view === 'hoja'} onPress={() => setView(view === 'hoja' ? 'resumen' : 'hoja')} />}
      </ChipRow>

      {kind === 'week' && view === 'hoja' && list !== null && (
        <WeekSheet list={list} from={range.from} names={names} projects={projects} subjects={subjects} sheets={sheets.filter((t) => t.user_id === myId)} isTeam={plan?.plan === 'team'}
          onChanged={load} onSubmitted={(t) => setSheets((l) => [...l.filter((x) => !(x.project_id === t.project_id && x.user_id === t.user_id)), t])} />
      )}

      {kind === 'week' && view === 'hoja' ? null : list === null ? <><Skeleton height={56} /><Skeleton height={56} style={{ marginTop: 8 }} /></> : !list.length ? (
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
                  <Ionicons name={s.source === 'manual' ? 'create-outline' : s.source === 'timer' ? 'stopwatch-outline' : 'timer-outline'} size={17} color={C.muted} accessibilityLabel={s.source === 'manual' ? 'A mano' : s.source === 'timer' ? 'Cronómetro' : 'Enfoque'} />
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
      <TeamSheet project={team} range={range} week={kind === 'week' ? isoDay(range.from) : null} isTeam={plan?.plan === 'team'} onClose={() => setTeam(null)} />
      <TimerSheet visible={timerOpen} projects={projects} subjects={subjects} subjectWord={mv.subjectLower} onClose={() => setTimerOpen(false)} />
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

function TeamSheet({ project, range, week, isTeam, onClose }: { project: Project | null; range: { from: Date; to: Date; label: string }; week: string | null; isTeam: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<TeamHours[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  useEffect(() => {
    if (!project) return;
    setRows(null); setErr(null); setSheets([]);
    if (!isTeam) { setErr('Las horas de todo el equipo en un proyecto vienen con el plan Equipo de Kaderno Pro.'); return; }
    projectHours(project.id, range.from, range.to).then(setRows).catch((e) => setErr(friendlyError(e)));
    if (week) getTimesheets(week, project.id).then(setSheets).catch(() => {});
  }, [project?.id, range.from.getTime(), isTeam]);
  async function decide(t: Timesheet, status: 'aprobada' | 'devuelta') {
    try { const r = await decideWeek(t.project_id, t.user_id, t.week_start, status); setSheets((l) => l.map((x) => (x.user_id === r.user_id ? r : x))); toast(status === 'aprobada' ? 'Semana aprobada' : 'Semana devuelta para corregir'); }
    catch (e) { notify('No se pudo', friendlyError(e)); }
  }
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
      {sheets.length > 0 && (
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
          <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '800' }}>Semanas enviadas para aprobar</Text>
          {sheets.map((t) => {
            const who = rows?.find((r) => r.user_id === t.user_id)?.name ?? 'Integrante';
            return (
              <View key={t.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>{who} · {fmtHours(t.minutes)}{t.note ? ` · ${t.note}` : ''}</Text>
                <Badge text={t.status === 'enviada' ? 'Por aprobar' : t.status === 'aprobada' ? 'Aprobada' : 'Devuelta'} color={t.status === 'aprobada' ? C.good : t.status === 'devuelta' ? C.bad : C.warn} />
                {t.status === 'enviada' && <Button label="Aprobar" size="sm" onPress={() => decide(t, 'aprobada')} />}
                {t.status !== 'devuelta' && <Button label="Devolver" size="sm" kind="ghost" onPress={() => decide(t, 'devuelta')} />}
              </View>
            );
          })}
        </View>
      )}
      {!!rows?.length && <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', textAlign: 'right' }}>Total {fmtHours(total)}</Text>}
    </Sheet>
  );
}

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const cellText = (m: number) => (m ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : '');

/** Hoja semanal (v25, fase 2): proyecto o área por día; se edita como una hoja de cálculo. */
function WeekSheet({ list, from, names, projects, subjects, sheets, isTeam, onChanged, onSubmitted }: {
  list: HourSession[]; from: Date; names: Record<string, Named>; projects: Project[]; subjects: Subject[]; sheets: Timesheet[]; isTeam: boolean;
  onChanged: () => void; onSubmitted: (t: Timesheet) => void;
}) {
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const base = weekGrid(list, from, names);
  const rows = [...base, ...extra.filter((k) => !base.some((r) => r.key === k)).map((k) => ({ key: k, name: names[k.slice(2)]?.name ?? '…', color: names[k.slice(2)]?.color, days: [0, 0, 0, 0, 0, 0, 0], total: 0 }))];
  const totals = weekTotals(rows);
  const day = (i: number) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
  const today = isoDay(new Date());
  const statusOf = (pid: string) => sheets.find((t) => t.project_id === pid);

  async function commit(rowKey: string, i: number) {
    const id = `${rowKey}|${i}`;
    const txt = draft[id];
    if (txt === undefined) return;
    setDraft((d) => { const n = { ...d }; delete n[id]; return n; });
    const target = txt.trim() === '' ? 0 : parseDuration(txt);
    if (target == null || target > 720) { toast('Escribe la duración como 1:30, 1,5 o 90 (máximo 12 horas).', { tone: 'bad' }); return; }
    const d = day(i);
    if (isoDay(d) > today) { toast('No se pueden anotar horas en el futuro.', { tone: 'bad' }); return; }
    const kind = rowKey.slice(0, 1), rid = rowKey.slice(2);
    const cell = list.filter((s) => isoDay(new Date(s.created_at)) === isoDay(d) && (kind === 'p' ? s.project_id === rid : kind === 's' ? !s.project_id && s.subject_id === rid : !s.project_id && !s.subject_id));
    const plan = planCellEdit(cell, target);
    if (!plan.add && !plan.updates.length && !plan.deletes.length && !plan.blocked) return;
    setBusy(true);
    try {
      if (plan.add) await addManualHours({ date: d, minutes: plan.add, project_id: kind === 'p' ? rid : null, subject_id: kind === 's' ? rid : null, note: '' });
      for (const u of plan.updates) await updateHours(u.id, u.minutes);
      for (const x of plan.deletes) await deleteHours(x);
      if (plan.blocked) toast(`${fmtHours(plan.blocked)} son del enfoque o del cronómetro: bórralos en "Cada registro".`);
      onChanged();
    } catch (e) { notify('No se pudo cambiar', friendlyError(e)); onChanged(); }
    finally { setBusy(false); }
  }
  async function submit(pid: string) {
    try { onSubmitted(await submitWeek(pid, isoDay(from))); toast('Semana enviada al dueño del proyecto'); }
    catch (e) { notify('No se pudo mandar', friendlyError(e)); }
  }
  const cellW = 58;
  return (
    <Card padded={false} style={{ marginBottom: 16, overflow: 'hidden' }} accessibilityLabel="Hoja semanal">
      <View style={Platform.OS === 'web' ? ({ overflowX: 'auto' } as any) : undefined}>
        <View style={{ minWidth: 200 + cellW * 8 }}>
          <View style={{ flexDirection: 'row', backgroundColor: C.surface2, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={{ width: 200, padding: 10, color: C.muted, fontSize: 12, fontWeight: '700' }}>Proyecto o área</Text>
            {DAY_SHORT.map((d, i) => <Text key={d} style={{ width: cellW, paddingVertical: 10, textAlign: 'center', color: isoDay(day(i)) === today ? C.brand : C.muted, fontSize: 12, fontWeight: '700' }}>{d} {day(i).getDate()}</Text>)}
            <Text style={{ width: cellW, paddingVertical: 10, textAlign: 'center', color: C.muted, fontSize: 12, fontWeight: '700' }}>Total</Text>
          </View>
          {rows.map((r) => {
            const pid = r.key.startsWith('p:') ? r.key.slice(2) : null;
            const st = pid ? statusOf(pid) : undefined;
            const locked = st?.status === 'aprobada';
            return (
              <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line }}>
                <View style={{ width: 200, paddingHorizontal: 10, paddingVertical: 6, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {r.color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.color }} /> : null}
                    <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>{r.name}</Text>
                  </View>
                  {pid && isTeam && (
                    st ? <Text style={{ color: st.status === 'aprobada' ? C.good : st.status === 'devuelta' ? C.badText : C.warnText, fontSize: 11.5, fontWeight: '700' }}>
                      {st.status === 'aprobada' ? 'Aprobada' : st.status === 'devuelta' ? 'Devuelta: corrige y manda otra vez' : 'Enviada'}{st.status !== 'aprobada' ? '' : ''}
                    </Text> : null
                  )}
                  {pid && isTeam && (!st || st.status !== 'aprobada') && r.total > 0 && (
                    <Pressable onPress={() => submit(pid)} accessibilityRole="button" accessibilityLabel={`Mandar la semana de ${r.name}`} hitSlop={4}>
                      <Text style={{ color: C.brand, fontSize: 11.5, fontWeight: '700' }}>{st?.status === 'enviada' ? 'Mandar otra vez' : 'Mandar para aprobar'}</Text>
                    </Pressable>
                  )}
                </View>
                {r.days.map((m, i) => {
                  const id = `${r.key}|${i}`;
                  const future = isoDay(day(i)) > today;
                  return (
                    <TextInput key={i} value={draft[id] ?? cellText(m)} editable={!locked && !future && !busy} placeholder={future ? '' : '·'} placeholderTextColor={C.line}
                      onChangeText={(t) => setDraft((d) => ({ ...d, [id]: t }))} onBlur={() => commit(r.key, i)} onSubmitEditing={() => commit(r.key, i)}
                      accessibilityLabel={`${r.name}, ${DAY_SHORT[i]} ${day(i).getDate()}`} selectTextOnFocus
                      style={[{ width: cellW, paddingVertical: 10, textAlign: 'center', color: locked ? C.muted : C.text, fontSize: 13, fontVariant: ['tabular-nums'], backgroundColor: future ? C.surface2 : 'transparent' }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
                  );
                })}
                <Text style={{ width: cellW, textAlign: 'center', color: C.text, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{cellText(r.total)}</Text>
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2 }}>
            <Text style={{ width: 200, padding: 10, color: C.text, fontSize: 13, fontWeight: '800' }}>Total</Text>
            {totals.map((m, i) => <Text key={i} style={{ width: cellW, textAlign: 'center', color: C.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{cellText(m)}</Text>)}
            <Text style={{ width: cellW, textAlign: 'center', color: C.text, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{cellText(totals.reduce((a, b) => a + b, 0))}</Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10, alignItems: 'center' }}>
        <Text style={{ color: C.muted, fontSize: 12 }}>Agregar fila:</Text>
        {projects.filter((p) => !rows.some((r) => r.key === `p:${p.id}`)).slice(0, 6).map((p) => <FilterChip key={p.id} label={p.name} active={false} onPress={() => setExtra([...extra, `p:${p.id}`])} />)}
        {subjects.filter((x) => !rows.some((r) => r.key === `s:${x.id}`)).slice(0, 4).map((x) => <FilterChip key={x.id} label={x.name} active={false} onPress={() => setExtra([...extra, `s:${x.id}`])} />)}
      </View>
    </Card>
  );
}

function TimerSheet({ visible, projects, subjects, subjectWord, onClose }: { visible: boolean; projects: Project[]; subjects: Subject[]; subjectWord: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [project, setProject] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  useEffect(() => { if (visible) { setTitle(''); } }, [visible]);
  async function start() {
    const p = projects.find((x) => x.id === project);
    await startStopwatch({ title: title.trim() || p?.name || 'Trabajo', projectId: project, subjectId: subject });
    toast('Cronómetro corriendo'); onClose();
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Iniciar cronómetro" subtitle="Cuenta hasta que lo pares, desde cualquier pantalla." maxWidth={500}
      footer={<><View style={{ flex: 1 }} /><Button label="Cancelar" kind="ghost" onPress={onClose} /><Button label="Iniciar" icon="play" onPress={start} /></>}>
      <Field label="¿En qué vas a trabajar?" value={title} onChangeText={setTitle} placeholder="Ej: revisar la propuesta" maxLength={140} onSubmitEditing={start} autoFocus />
      {projects.length > 0 && (
        <ChipRow>
          <FilterChip label="Sin proyecto" active={!project} onPress={() => setProject(null)} />
          {projects.slice(0, 12).map((p) => <FilterChip key={p.id} label={`${p.icon ? p.icon + ' ' : ''}${p.name}`} active={project === p.id} onPress={() => setProject(p.id)} />)}
        </ChipRow>
      )}
      <SubjectPicker subjects={subjects} value={subject} onChange={setSubject} placeholder={`Sin ${subjectWord}`} />
    </Sheet>
  );
}

export default function HorasProtegida() { return <RequireAuth><Horas /></RequireAuth>; }
