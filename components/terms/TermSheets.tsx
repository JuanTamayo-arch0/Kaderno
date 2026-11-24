import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button, Field } from '../ds';
import { DateField } from '../DateTime';
import { friendlyError, notify, toast } from '../../lib/feedback';
import {
  STATUS_LABEL, TERM_STATUS, bestSubject, fmtGrade, nextTermName, parseGrade, statusFor, termAverage, cleanScale,
  type GradeScale, type Term, type TermStatus, type TermSubject,
} from '../../lib/terms';
import { addPastTerm, closeTerm, saveGradeScale, termActivity } from '../../lib/termsDb';
import { fmtHours } from '../../lib/day';
import { t } from '../../lib/i18n';

// ============================================================
//  Semestres (v26, fase 3): cerrar el semestre, agregar uno pasado y la
//  escala de notas. Cada persona pone la escala de su institución.
// ============================================================

type Row = { key: string; subjectId?: string; name: string; credits: string; grade: string; status: TermStatus; color?: string; hours?: number };

// Se lee en el render: C cambia con el tema.
const inputStyle = () => ({ borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: C.text, backgroundColor: C.surface, fontSize: 14 } as const);

function StatusPicker({ value, onChange }: { value: TermStatus; onChange: (s: TermStatus) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }} accessibilityRole="radiogroup">
      {TERM_STATUS.map((k) => {
        const on = value === k;
        return (
          <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={{ paddingVertical: 5, paddingHorizontal: 9, borderRadius: 99, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand + '1f' : 'transparent' }}>
            <Text style={{ color: on ? C.text : C.muted, fontSize: 12, fontWeight: on ? '700' : '500' }}>{STATUS_LABEL[k]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RowsEditor({ rows, setRows, scale, editableNames }: { rows: Row[]; setRows: (r: Row[]) => void; scale: GradeScale; editableNames: boolean }) {
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r, i) => {
        const g = parseGrade(r.grade);
        const bad = r.grade.trim() !== '' && (g == null || g < 0 || g > scale.max);
        return (
          <View key={r.key} style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: bad ? C.bad : C.line, backgroundColor: C.surface, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {r.color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.color }} /> : null}
              {editableNames
                ? <TextInput value={r.name} onChangeText={(t) => set(i, { name: t.slice(0, 80) })} placeholder={t('Materia')} placeholderTextColor={C.muted} accessibilityLabel={t('Nombre de la materia')} style={[inputStyle(), { flex: 1 }]} />
                : <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700', flex: 1 }} numberOfLines={1}>{r.name}</Text>}
              {editableNames && <Pressable onPress={() => setRows(rows.filter((_, k) => k !== i))} accessibilityRole="button" accessibilityLabel={t('Quitar {v}', { v: r.name || 'materia' })} hitSlop={8}><Ionicons name="close" size={18} color={C.muted} /></Pressable>}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Créditos')}</Text>
              <TextInput value={r.credits} onChangeText={(t) => set(i, { credits: t.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" accessibilityLabel={t('Créditos de {name}', { name: r.name })} style={[inputStyle(), { width: 56, textAlign: 'center' }]} />
              <Text style={{ color: C.muted, fontSize: 12.5, marginLeft: 6 }}>{t('Nota final')}</Text>
              <TextInput value={r.grade} onChangeText={(t) => { const g2 = parseGrade(t); set(i, { grade: t.slice(0, 6), status: r.status === 'homologada' || r.status === 'retirada' ? r.status : statusFor(g2, scale) }); }}
                keyboardType="decimal-pad" placeholder="–" placeholderTextColor={C.muted} accessibilityLabel={t('Nota final de {name}', { name: r.name })} style={[inputStyle(), { width: 72, textAlign: 'center' }]} />
              <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('de {max}', { max: scale.max })}</Text>
              {r.hours ? <Text style={{ color: C.muted, fontSize: 12.5, marginLeft: 'auto' }}>{t('{fmtHours} de estudio', { fmtHours: fmtHours(r.hours * 60) })}</Text> : null}
            </View>
            {bad && <Text style={{ color: C.badText, fontSize: 12.5 }}>{t('La nota va entre 0 y {max}.', { max: scale.max })}</Text>}
            <StatusPicker value={r.status} onChange={(s) => set(i, { status: s })} />
          </View>
        );
      })}
    </View>
  );
}

const toSubjects = (rows: Row[]): TermSubject[] => rows.filter((r) => r.name.trim()).map((r) => ({
  name: r.name.trim(), credits: Number(r.credits) || 0, grade: parseGrade(r.grade), status: r.status, hours: r.hours, color: r.color,
}));
const rowsValid = (rows: Row[], scale: GradeScale) => rows.every((r) => { const g = parseGrade(r.grade); return r.grade.trim() === '' || (g != null && g >= 0 && g <= scale.max); });

// ---------- Cerrar el semestre ----------
export function CloseTermSheet({ visible, term, subjects, scale, onClose, onClosed }: {
  visible: boolean; term: Term | null; scale: GradeScale;
  subjects: { id: string; name: string; credits: number | null; color: string; avg: number | null }[];
  onClose: () => void; onClosed: (t: Term) => void;
}) {
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [act, setAct] = useState<{ focusMinutes: number; cards: number; bestStreak: number } | null>(null);
  const [reflection, setReflection] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !term) return;
    setStep(0); setReflection(''); setNext(nextTermName(term.name)); setAct(null);
    setRows(subjects.map((s) => {
      const g = s.avg == null ? null : Math.round(s.avg * Math.pow(10, scale.decimals)) / Math.pow(10, scale.decimals);
      return { key: s.id, subjectId: s.id, name: s.name, credits: String(s.credits ?? 0), grade: g == null ? '' : String(g).replace('.', ','), status: statusFor(g, scale), color: s.color };
    }));
    termActivity(subjects.map((s) => s.id), term.starts_on).then((a) => {
      setAct({ focusMinutes: a.focusMinutes, cards: a.cards, bestStreak: a.bestStreak });
      setRows((rs) => rs.map((r) => ({ ...r, hours: r.subjectId ? Math.round(((a.minutesBySubject[r.subjectId] ?? 0) / 60) * 10) / 10 : 0 })));
    }).catch(() => setAct({ focusMinutes: 0, cards: 0, bestStreak: 0 }));
  }, [visible, term?.id]);

  const list = useMemo(() => toSubjects(rows), [rows]);
  const avg = termAverage(list);
  const best = bestSubject(list);

  async function finish() {
    if (!term) return;
    setBusy(true);
    try {
      const t = await closeTerm({ termId: term.id, subjects: list, scale, reflection: reflection.trim(), next: next.trim(), focusMinutes: act?.focusMinutes ?? 0, cards: act?.cards ?? 0, bestStreak: act?.bestStreak ?? 0 });
      toast(`Semestre ${term.name} cerrado${next.trim() ? `. Empieza ${next.trim()}` : ''}`, { tone: 'good' });
      onClosed(t);
    } catch (e) { notify(t('No se pudo cerrar'), friendlyError(e)); }
    finally { setBusy(false); }
  }

  const steps = [t('Notas finales'), t('Resumen'), t('Lo que te llevas')];
  let body: React.ReactNode = null;
  if (step === 0) {
    body = (
      <>
        <Text style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>{t('Vienen del promedio de tus calificaciones. Corrige la que no coincida con la nota oficial.')}</Text>
        {rows.length ? <RowsEditor rows={rows} setRows={setRows} scale={scale} editableNames={false} /> : <Text style={{ color: C.text, fontSize: 14 }}>{t('Este semestre no tiene materias. Igual puedes cerrarlo.')}</Text>}
      </>
    );
  } else if (step === 1) {
    const tile = (label: string, value: string) => (
      <View style={{ flexGrow: 1, flexBasis: 130, padding: 12, borderRadius: 12, backgroundColor: C.surface2 }}>
        <Text style={{ color: C.muted, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', marginTop: 2 }}>{value}</Text>
      </View>
    );
    body = (
      <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tile(t('Promedio'), fmtGrade(avg.avg, scale))}
          {tile(t('Créditos aprobados'), String(avg.credits))}
          {tile(t('Horas de estudio'), act ? fmtHours(act.focusMinutes) : '…')}
          {tile(t('Tarjetas repasadas'), act ? act.cards.toLocaleString(t('es-CO')) : '…')}
          {tile(t('Racha más larga'), act ? `${act.bestStreak} ${act.bestStreak === 1 ? t('día') : t('días')}` : '…')}
        </View>
        {best && <Text style={{ color: C.text, fontSize: 14 }}>{t('Tu mejor materia: ')}<Text style={{ fontWeight: '800' }}>{best.name}</Text> ({fmtGrade(best.grade, scale)}).</Text>}
        <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 18 }}>{t('Este resumen se guarda tal cual: no cambia aunque después borres materias o notas. Las materias del semestre se archivan; sus apuntes y archivos siguen en el historial.')}</Text>
      </>
    );
  } else {
    body = (
      <>
        <Text style={{ color: C.text, fontSize: 14 }}>{t('¿Qué te llevas de este semestre? (opcional)')}</Text>
        <TextInput value={reflection} onChangeText={setReflection} multiline maxLength={1000} placeholder={t('Ej: empezar los talleres el mismo día que los dejan funcionó.')} placeholderTextColor={C.muted}
          accessibilityLabel={t('Lo que te llevas del semestre')} style={[inputStyle(), { minHeight: 90, textAlignVertical: 'top' }]} />
        <Field label={t('Siguiente semestre')} value={next} onChangeText={setNext} placeholder={t('Ej: 2027-1')} maxLength={40} hint={t('Se abre vacío para que agregues sus materias. Déjalo en blanco si terminaste.')} />
      </>
    );
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Cerrar el semestre {v}', { v: term?.name ?? '' })} subtitle={t('Paso {v} de 3 · {v2}', { v: step + 1, v2: steps[step] })} maxWidth={620}
      footer={<>
        <Button label={step === 0 ? t('Cancelar') : t('Atrás')} kind="secondary" onPress={() => (step === 0 ? onClose() : setStep(step - 1))} style={{ flex: 1 }} />
        {step < 2
          ? <Button label={t('Siguiente')} icon="arrow-forward" disabled={!rowsValid(rows, scale)} onPress={() => setStep(step + 1)} style={{ flex: 2 }} />
          : <Button label={t('Cerrar el semestre')} icon="checkmark" busy={busy} onPress={finish} style={{ flex: 2 }} />}
      </>}>
      <View style={{ gap: 12 }}>{body}</View>
    </Sheet>
  );
}

// ---------- Agregar un semestre que ya terminó ----------
let seq = 0;
const emptyRow = (): Row => ({ key: `n${++seq}`, name: '', credits: '3', grade: '', status: 'aprobada' });

export function PastTermSheet({ visible, scale, onClose, onAdded }: { visible: boolean; scale: GradeScale; onClose: () => void; onAdded: (t: Term) => void }) {
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setName(''); setRows([emptyRow(), emptyRow(), emptyRow()]); setFrom(null); setTo(null); } }, [visible]);
  const list = toSubjects(rows);
  const avg = termAverage(list);
  async function save() {
    if (!name.trim()) { notify(t('Falta el nombre'), t('Escribe cuál semestre es, por ejemplo 2025-2.')); return; }
    setBusy(true);
    try { const t = await addPastTerm({ name: name.trim(), subjects: list, scale, startsOn: from, endsOn: to }); toast(`Semestre ${t.name} agregado`, { tone: 'good' }); onAdded(t); }
    catch (e) { notify(t('No se pudo guardar'), friendlyError(e)); }
    finally { setBusy(false); }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Agregar un semestre que ya terminó')} subtitle={t('Para que el promedio acumulado esté completo. Copia las notas finales de tu certificado o del portal.')} maxWidth={620}
      footer={<>
        <Text style={{ color: C.muted, fontSize: 13, flex: 1 }}>{t('Promedio: ')}<Text style={{ color: C.text, fontWeight: '800' }}>{fmtGrade(avg.avg, scale)}</Text> · {avg.credits} {t(' créditos')}</Text>
        <Button label={t('Guardar')} icon="checkmark" busy={busy} disabled={!list.length || !rowsValid(rows, scale)} onPress={save} />
      </>}>
      <Field label={t('Semestre')} value={name} onChangeText={setName} placeholder={t('Ej: 2025-2')} maxLength={40} autoFocus />
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <View style={{ flex: 1, minWidth: 160 }}><DateField label={t('Empezó (opcional)')} value={from} onChange={setFrom} /></View>
        <View style={{ flex: 1, minWidth: 160 }}><DateField label={t('Terminó (opcional)')} value={to} onChange={setTo} /></View>
      </View>
      <RowsEditor rows={rows} setRows={setRows} scale={scale} editableNames />
      <Button label={t('Otra materia')} icon="add" kind="secondary" size="sm" onPress={() => setRows([...rows, emptyRow()])} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
    </Sheet>
  );
}

// ---------- Escala de notas ----------
const PRESETS: { label: string; s: GradeScale }[] = [
  { label: t('0 a 5, aprueba con 3,0'), s: { max: 5, pass: 3, decimals: 1 } },
  { label: t('0 a 10, aprueba con 6'), s: { max: 10, pass: 6, decimals: 1 } },
  { label: t('0 a 100, aprueba con 60'), s: { max: 100, pass: 60, decimals: 1 } },
  { label: t('0 a 20, aprueba con 11'), s: { max: 20, pass: 11, decimals: 1 } },
];
export function ScaleSheet({ visible, scale, onClose }: { visible: boolean; scale: GradeScale; onClose: () => void }) {
  const [max, setMax] = useState(String(scale.max));
  const [pass, setPass] = useState(String(scale.pass));
  const [dec, setDec] = useState<1 | 2>(scale.decimals);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setMax(String(scale.max).replace('.', ',')); setPass(String(scale.pass).replace('.', ',')); setDec(scale.decimals); } }, [visible]);
  const m = parseGrade(max), p = parseGrade(pass);
  const err = m == null || m <= 0 || m > 1000 ? t('La nota máxima va entre 1 y 1000.') : p == null || p <= 0 || p > m ? t('La nota para aprobar va entre 0 y la máxima.') : null;
  async function save() {
    if (err) return;
    setBusy(true);
    try { await saveGradeScale(cleanScale({ max: m, pass: p, decimals: dec })); toast(t('Escala guardada'), { tone: 'good' }); onClose(); }
    catch (e) { notify(t('No se pudo guardar'), friendlyError(e)); }
    finally { setBusy(false); }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Escala de notas')} subtitle={t('La de tu institución. Se usa en los promedios, el historial y lo que falta para aprobar.')} maxWidth={500}
      footer={<Button label={t('Guardar')} busy={busy} disabled={!!err} onPress={save} />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {PRESETS.map((x) => (
          <Pressable key={x.label} onPress={() => { setMax(String(x.s.max)); setPass(String(x.s.pass)); setDec(x.s.decimals); }} accessibilityRole="button"
            style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: 99, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}>
            <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field label={t('Nota máxima')} value={max} onChangeText={setMax} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label={t('Nota para aprobar')} value={pass} onChangeText={setPass} keyboardType="decimal-pad" /></View>
      </View>
      <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>{t('Decimales')}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
        {([1, 2] as const).map((d) => (
          <Pressable key={d} onPress={() => setDec(d)} accessibilityRole="radio" accessibilityState={{ checked: dec === d }}
            style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: dec === d ? C.brand : C.line, backgroundColor: dec === d ? C.brand + '1f' : 'transparent' }}>
            <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{d === 1 ? 'Uno (4,3)' : 'Dos (4,35)'}</Text>
          </Pressable>
        ))}
      </View>
      {err && <Text style={{ color: C.badText, fontSize: 12.5, marginTop: 10 }}>{err}</Text>}
    </Sheet>
  );
}
