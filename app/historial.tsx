import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { Screen, Button, Card, EmptyState, Skeleton } from '../components/ds';
import { useResponsive } from '../lib/responsive';
import { useAuth } from '../lib/auth';
import { getSubjects, getAllGrades, type Subject, type Grade } from '../lib/db';
import { subjectAverage } from '../lib/grades';
import { cumulative, fmtGrade, historyHtml, shouldOfferClose, STATUS_LABEL, type Term, type TermSummary } from '../lib/terms';
import { deleteTerm, ensureOpenTerm, getTerms, renameTerm, useGradeScale, NEEDS_V25_3 } from '../lib/termsDb';
import { printReport } from '../lib/hoursDb';
import { fmtHours } from '../lib/day';
import { CloseTermSheet, PastTermSheet, ScaleSheet } from '../components/terms/TermSheets';
import { confirm, friendlyError, notify, toast } from '../lib/feedback';
import { Field } from '../components/ds';
import { Sheet } from '../components/cards/CardForms';
import { DateField } from '../components/DateTime';

// ============================================================
//  Historial académico (v26, fase 3): los semestres, el promedio acumulado,
//  cerrar el semestre y agregar los que ya terminaron.
// ============================================================

function Historial() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const { session } = useAuth();
  const scale = useGradeScale();
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [ready, setReady] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [editing, setEditing] = useState<Term | null>(null);

  const load = useCallback(async () => {
    try {
      await ensureOpenTerm().catch(() => null);
      const [{ terms: t, ready: r }, s, g] = await Promise.all([getTerms(), getSubjects(), getAllGrades()]);
      setTerms(t); setReady(r); setSubjects(s); setGrades(g);
      setSel((cur) => cur ?? (t.find((x) => x.status === 'open')?.id ?? t[t.length - 1]?.id ?? null));
    } catch (e) { notify('No se pudo cargar', friendlyError(e)); setTerms([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = terms?.find((t) => t.status === 'open') ?? null;
  const openSubjects = useMemo(() => !open ? [] : subjects.filter((s) => s.term_id === open.id).map((s) => ({
    id: s.id, name: s.name, credits: s.credits, color: s.color,
    avg: subjectAverage(grades.filter((g) => g.subject_id === s.id) as any, scale.max).avg,
  })), [open?.id, subjects, grades, scale.max]);
  const closed = (terms ?? []).filter((t) => t.status === 'closed').sort((a, b) => b.name.localeCompare(a.name));
  const cum = cumulative(closed, scale);
  const current = (terms ?? []).find((t) => t.id === sel) ?? open ?? closed[0] ?? null;
  const who = (session?.user?.user_metadata?.full_name as string | undefined) || session?.user?.email || 'Kaderno';

  async function pdf() {
    try { await printReport(historyHtml({ who, terms: terms ?? [], scale }), 'Historial académico'); }
    catch (e) { notify('No se pudo abrir el historial', friendlyError(e)); }
  }
  async function remove(t: Term) {
    if (!(await confirm(`¿Borrar el semestre ${t.name}?`, 'Se borra su resumen del historial. Las materias archivadas y sus apuntes no se borran.', 'Borrar'))) return;
    try { await deleteTerm(t.id); setSel(null); toast(`Semestre ${t.name} borrado`); load(); } catch (e) { notify('No se pudo borrar', friendlyError(e)); }
  }

  const stat = (label: string, value: string, sub?: string) => (
    <Card style={{ flexGrow: 1, flexBasis: isWide ? 0 : 150, padding: 14 }}>
      <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: 24, fontWeight: '800', marginTop: 2 }}>{value}</Text>
      {sub ? <Text style={{ color: C.muted, fontSize: 12 }}>{sub}</Text> : null}
    </Card>
  );

  const termCard = (t: Term) => {
    const on = current?.id === t.id;
    const s = t.summary;
    const isOpen = t.status === 'open';
    return (
      <Pressable key={t.id} onPress={() => setSel(t.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Semestre ${t.name}`}
        style={({ hovered }: any) => ({ padding: 14, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? C.brand : C.line, backgroundColor: hovered ? C.surface2 : C.surface, gap: 4 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text dataSet={{ head: '1' }} style={{ color: C.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{t.name}</Text>
          <Text style={{ fontSize: 11.5, fontWeight: '700', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 99, overflow: 'hidden', color: isOpen ? C.onBrand : C.muted, backgroundColor: isOpen ? C.brand : C.surface2 }}>{isOpen ? 'En curso' : 'Cerrado'}</Text>
        </View>
        <Text style={{ color: C.muted, fontSize: 12.5 }}>
          {isOpen ? `${openSubjects.length} ${openSubjects.length === 1 ? 'materia' : 'materias'}` : `${s?.subjects.length ?? 0} materias · ${fmtGrade(s?.avg ?? null, scale)} · ${s?.credits ?? 0} créditos`}
        </Text>
      </Pressable>
    );
  };

  const chart = closed.length > 1 ? (
    <Card style={{ gap: 10 }}>
      <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>Promedio por semestre</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 120 }} accessibilityLabel={`Promedios: ${[...closed].reverse().map((t) => `${t.name} ${fmtGrade(t.summary?.avg ?? null, scale)}`).join(', ')}`}>
        {[...closed].reverse().slice(-8).map((t) => {
          const v = t.summary?.avg != null ? (t.summary.avg / (t.summary.max || scale.max)) : 0;
          return (
            <View key={t.id} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Text style={{ color: C.text, fontSize: 11.5, fontWeight: '700' }}>{fmtGrade(t.summary?.avg ?? null, { decimals: 1 })}</Text>
              <View style={{ width: '100%', height: Math.max(6, Math.round(v * 80)), borderRadius: 6, backgroundColor: t.id === current?.id ? C.brand : C.surface2 }} />
              <Text style={{ color: C.muted, fontSize: 11 }} numberOfLines={1}>{t.name}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  ) : null;

  const left = (
    <View style={{ gap: 10, width: isWide ? 300 : '100%' }}>
      {(terms ?? []).filter((t) => t.status === 'open').map(termCard)}
      {closed.map(termCard)}
      <Button label="Agregar un semestre que ya terminó" icon="add" kind="secondary" size="sm" onPress={() => setAdding(true)} />
      {chart}
    </View>
  );

  const detail = current ? (current.status === 'open' ? (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text dataSet={{ head: '1' }} style={{ color: C.text, fontSize: 22, fontWeight: '800', flex: 1 }}>Semestre {current.name}</Text>
        <Button label="Nombre y fechas" kind="ghost" size="sm" onPress={() => setEditing(current)} />
        <Button label="Cerrar el semestre" icon="flag-outline" size="sm" onPress={() => setClosing(true)} />
      </View>
      {shouldOfferClose(current) && <Text style={{ color: C.warnText, fontSize: 13 }}>Ya terminó la época de clases. Cuando tengas las notas finales, ciérralo para guardar el resumen.</Text>}
      {openSubjects.length === 0 ? (
        <Text style={{ color: C.muted, fontSize: 13.5 }}>Este semestre todavía no tiene materias. Las que crees en Materias quedan en él.</Text>
      ) : (
        <Card padded={false}>
          {openSubjects.map((s, i) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
              <Pressable onPress={() => router.push(`/materia/${s.id}`)} style={{ flex: 1 }} accessibilityRole="link"><Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600' }}>{s.name}</Text></Pressable>
              <Text style={{ color: C.muted, fontSize: 12.5 }}>{s.credits ?? 0} créditos</Text>
              <Text style={{ color: s.avg != null && s.avg < scale.pass ? C.badText : C.text, fontSize: 15, fontWeight: '800', width: 56, textAlign: 'right' }}>{fmtGrade(s.avg, scale)}</Text>
            </View>
          ))}
        </Card>
      )}
      <Text style={{ color: C.muted, fontSize: 12.5 }}>Las notas en curso salen de tus calificaciones. Al cerrar, confirmas la nota final de cada una.</Text>
    </View>
  ) : (
    <ClosedDetail t={current} scale={scale} onEdit={() => setEditing(current)} onDelete={() => remove(current)} />
  )) : null;

  return (
    <Screen title="Historial académico" subtitle="Tus semestres, sus notas y el promedio acumulado" back="/materias" maxWidth={1180}
      right={<Button label={isWide ? 'Descargar (PDF)' : 'PDF'} icon="download-outline" size="sm" kind="secondary" disabled={!closed.length} onPress={pdf} />}>
      {!ready && <Card style={{ marginBottom: 12 }}><Text style={{ color: C.warnText, fontSize: 13 }}>{NEEDS_V25_3}</Text></Card>}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        {stat('Promedio acumulado', fmtGrade(cum.avg, scale), cum.terms ? `${cum.terms} ${cum.terms === 1 ? 'semestre cerrado' : 'semestres cerrados'}` : 'Aún sin semestres cerrados')}
        {stat('Créditos aprobados', String(cum.credits))}
        <Card onPress={() => setScaleOpen(true)} accessibilityLabel="Cambiar la escala de notas" style={{ flexGrow: 1, flexBasis: isWide ? 0 : 150, padding: 14 }}>
          <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>Escala de notas</Text>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', marginTop: 4 }}>0 a {String(scale.max).replace('.', ',')}</Text>
          <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>Aprueba con {String(scale.pass).replace('.', ',')} · Cambiar</Text>
        </Card>
      </View>
      {terms === null ? <Skeleton height={220} /> : !terms.length ? (
        <EmptyState icon="school-outline" title="Tu historial empieza aquí" text="Crea tus materias del semestre y, al terminarlo, ciérralo para guardar las notas. También puedes agregar los semestres que ya pasaste."
          action={{ label: 'Agregar un semestre pasado', icon: 'add', onPress: () => setAdding(true) }} />
      ) : isWide ? (
        <View style={{ flexDirection: 'row', gap: 22, alignItems: 'flex-start' }}>
          {left}
          <View style={{ flex: 1, minWidth: 0 }}>{detail}</View>
        </View>
      ) : (
        <View style={{ gap: 18 }}>{left}{detail}</View>
      )}
      <CloseTermSheet visible={closing} term={open} subjects={openSubjects} scale={scale} onClose={() => setClosing(false)} onClosed={(t) => { setClosing(false); setSel(t.id); load(); }} />
      <PastTermSheet visible={adding} scale={scale} onClose={() => setAdding(false)} onAdded={(t) => { setAdding(false); setSel(t.id); load(); }} />
      <ScaleSheet visible={scaleOpen} scale={scale} onClose={() => setScaleOpen(false)} />
      <TermEdit term={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </Screen>
  );
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDay = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

function ClosedDetail({ t, scale, onEdit, onDelete }: { t: Term; scale: ReturnType<typeof useGradeScale>; onEdit: () => void; onDelete: () => void }) {
  const s = t.summary as TermSummary;
  const { isWide } = useResponsive();
  const sameScale = !s.max || s.max === scale.max;
  const f = (v: number | null) => fmtGrade(v, scale);
  const tile = (label: string, value: string) => (
    <Card style={{ flexGrow: 1, flexBasis: isWide ? 0 : 130, padding: 12 }}>
      <Text style={{ color: C.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', marginTop: 2 }}>{value}</Text>
    </Card>
  );
  const range = t.starts_on && t.ends_on ? `del ${shortDay(t.starts_on)} al ${shortDay(t.ends_on)}` : '';
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <Text dataSet={{ head: '1' }} style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>Semestre {t.name}</Text>
        <Text style={{ color: C.muted, fontSize: 13, flex: 1 }}>{[range, s.manual ? 'agregado a mano' : '', !sameScale ? `escala de 0 a ${s.max}` : ''].filter(Boolean).join(' · ')}</Text>
        <Button label="Editar" kind="ghost" size="sm" onPress={onEdit} />
        <Button label="Borrar" kind="ghost" size="sm" onPress={onDelete} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {tile('Promedio', sameScale ? f(s.avg) : fmtGrade(s.avg, { decimals: scale.decimals }))}
        {tile('Créditos', String(s.credits ?? 0))}
        {!s.manual && tile('Horas de estudio', fmtHours(s.focus_minutes ?? 0))}
        {!s.manual && tile('Tarjetas', (s.cards ?? 0).toLocaleString('es-CO'))}
        {!s.manual && tile('Racha más larga', `${s.best_streak ?? 0} días`)}
      </View>
      <Card padded={false}>
        <View style={{ flexDirection: 'row', padding: 12, paddingHorizontal: 14, backgroundColor: C.surface2, gap: 10 }}>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', flex: 1 }}>Materia</Text>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', width: 60, textAlign: 'right' }}>Créditos</Text>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', width: 64, textAlign: 'right' }}>Nota</Text>
          {isWide && <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', width: 92 }}>Estado</Text>}
        </View>
        {s.subjects.map((x, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 14, gap: 10, borderTopWidth: 1, borderTopColor: C.line }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{x.name}</Text>
              {!isWide && <Text style={{ color: x.status === 'reprobada' ? C.badText : C.muted, fontSize: 12 }}>{STATUS_LABEL[x.status]}</Text>}
            </View>
            <Text style={{ color: C.muted, fontSize: 13.5, width: 60, textAlign: 'right' }}>{x.credits}</Text>
            <Text style={{ color: x.status === 'reprobada' ? C.badText : C.text, fontSize: 14.5, fontWeight: '800', width: 64, textAlign: 'right' }}>{fmtGrade(x.grade, scale)}</Text>
            {isWide && <Text style={{ color: x.status === 'reprobada' ? C.badText : x.status === 'aprobada' ? C.goodText : C.muted, fontSize: 12.5, fontWeight: '700', width: 92 }}>{STATUS_LABEL[x.status]}</Text>}
          </View>
        ))}
      </Card>
      {t.reflection ? (
        <Card>
          <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '700' }}>Lo que escribiste al cerrar</Text>
          <Text style={{ color: C.text, fontSize: 14, lineHeight: 21, marginTop: 6 }}>{t.reflection}</Text>
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="archive-outline" size={16} color={C.muted} />
        <Text style={{ color: C.muted, fontSize: 12.5, flex: 1 }}>Las materias de este semestre quedaron archivadas con sus apuntes y archivos: búscalos con Ctrl K o restáuralas desde la Papelera.</Text>
      </View>
    </View>
  );
}

function TermEdit({ term, onClose, onSaved }: { term: Term | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (term) { setName(term.name); setFrom(term.starts_on); setTo(term.ends_on); } }, [term?.id]);
  async function save() {
    if (!term || !name.trim()) return;
    setBusy(true);
    try { await renameTerm(term.id, { name, starts_on: from, ends_on: to }); onSaved(); }
    catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }
  return (
    <Sheet visible={!!term} onClose={onClose} title="Nombre y fechas del semestre" subtitle="Con la fecha de fin, Kaderno te recuerda cerrarlo cuando termine." maxWidth={460}
      footer={<Button label="Guardar" busy={busy} disabled={!name.trim()} onPress={save} />}>
      <Field label="Nombre" value={name} onChangeText={setName} maxLength={40} placeholder="Ej: 2026-2" />
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 160 }}><DateField label="Empieza" value={from} onChange={setFrom} /></View>
        <View style={{ flex: 1, minWidth: 160 }}><DateField label="Termina" value={to} onChange={setTo} /></View>
      </View>
    </Sheet>
  );
}

export default function HistorialProtegido() {
  return (
    <RequireAuth>
      <Historial />
    </RequireAuth>
  );
}
