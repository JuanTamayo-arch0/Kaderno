import React from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Subject } from '../../lib/db';
import { cleanLink } from '../../lib/linkCheck';
import { fmtHour } from '../../lib/schedule';
import { countdown, minutesLabel, dayWord, type NextClass, type NextEval } from '../../lib/subjectInfo';
import { MONTH_SHORT } from '../../lib/time';
import { focusRingStyle, IconButton, type IconName } from '../ds';
import { SubjectIcon } from '../SubjectIcon';

// ============================================================
//  Piezas de la página de la materia: barra de arriba, ficha (grande o
//  compacta), indicadores y pestañas. La ficha y los indicadores se ven igual
//  en todas las pestañas para no perder lo importante al cambiar.
// ============================================================

const web = (s: any) => (Platform.OS === 'web' ? s : null);
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export function classWhen(n: NextClass, now = new Date()): string {
  if (n.now) return `Ahora, hasta ${fmtHour(hhmm(n.end))}`;
  return `${dayWord(n.start, now)}, ${fmtHour(hhmm(n.start))}`;
}
export function shortDate(d: Date): string { return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`; }

export function SubjectAvatar({ subject, size }: { subject: Subject; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.26), backgroundColor: subject.color + '26', borderWidth: 1, borderColor: subject.color + '55', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <SubjectIcon icon={subject.icon} box={size} emoji={Math.round(size * 0.48)} />
    </View>
  );
}

function MetaChip({ icon, text, onPress, dashed, label }: { icon?: IconName; text: string; onPress?: () => void; dashed?: boolean; label?: string }) {
  const body = (
    <>
      {icon && <Ionicons name={icon} size={14} color={dashed ? C.muted : C.text} />}
      <Text style={{ color: dashed ? C.muted : C.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{text}</Text>
    </>
  );
  const style: ViewStyle = {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 99,
    backgroundColor: dashed ? 'transparent' : C.surface2, borderWidth: 1, borderColor: C.line, borderStyle: dashed ? 'dashed' : 'solid', maxWidth: 280,
  };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? text} dataSet={{ press: '1' }}
      style={({ pressed, focused }: any) => [style, { opacity: pressed ? 0.75 : 1 }, focused ? focusRingStyle() : null]}>
      {body}
    </Pressable>
  );
}

/** Barra superior: volver y acciones. */
export function SubjectTopBar({ onBack, onFocus, onOracle, onNew, onMenu, compact }: {
  onBack: () => void; onFocus: () => void; onOracle: () => void; onNew: () => void; onMenu: () => void; compact?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Volver a Materias" dataSet={{ press: '1' }}
        style={({ focused }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingRight: 8, marginLeft: -6 }, focused ? focusRingStyle() : null]}>
        <Ionicons name="chevron-back" size={22} color={C.muted} />
        {!compact && <Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}>Materias</Text>}
      </Pressable>
      <View style={{ flex: 1 }} />
      {compact ? (
        <>
          <IconButton icon="timer-outline" label="Enfocar en esta materia" onPress={onFocus} color={C.text} />
          <IconButton icon="sparkles-outline" label="Preguntar al Oráculo" onPress={onOracle} color={C.text} />
        </>
      ) : (
        <>
          <TopAction icon="timer-outline" label="Enfocar" onPress={onFocus} />
          <TopAction icon="sparkles-outline" label="Oráculo" onPress={onOracle} />
          <TopAction icon="add" label="Nueva tarea" onPress={onNew} primary />
        </>
      )}
      <IconButton icon="ellipsis-horizontal" label="Más opciones" onPress={onMenu} color={C.text} />
    </View>
  );
}
function TopAction({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} dataSet={{ press: '1' }}
      style={({ pressed, focused }: any) => [{
        flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, paddingHorizontal: 14, borderRadius: 11,
        backgroundColor: primary ? C.brand : C.surface, borderWidth: primary ? 0 : 1, borderColor: C.line, opacity: pressed ? 0.85 : 1,
      }, focused ? focusRingStyle() : null]}>
      <Ionicons name={icon} size={17} color={primary ? C.onBrand : C.text} />
      <Text style={{ color: primary ? C.onBrand : C.text, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/** Ficha grande: icono, nombre y datos (profesor, salón, días, créditos, aula virtual). */
export function SubjectHero({ subject, days, isWide, onEdit, onSchedule }: {
  subject: Subject; days: string | null; isWide: boolean;
  onEdit: (field?: 'teacher' | 'room' | 'link') => void; onSchedule: () => void;
}) {
  const link = cleanLink(subject.link);
  const missing = !subject.teacher && !subject.room && !link;
  const chips = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {subject.teacher ? <MetaChip icon="person-outline" text={subject.teacher} onPress={() => onEdit('teacher')} label={`Profesor: ${subject.teacher}. Editar`} /> : null}
      {subject.room ? <MetaChip icon="location-outline" text={subject.room} onPress={() => onEdit('room')} label={`Salón: ${subject.room}. Editar`} /> : null}
      {days === null ? null : days ? <MetaChip icon="time-outline" text={days} onPress={onSchedule} label={`Clases: ${days}. Abrir horario`} />
        : <MetaChip icon="time-outline" text="Agregar al horario" onPress={onSchedule} dashed />}
      {subject.credits ? <MetaChip text={`${subject.credits} ${subject.credits === 1 ? 'crédito' : 'créditos'}`} /> : null}
      {link ? <MetaChip icon="link-outline" text="Aula virtual" onPress={() => Linking.openURL(link).catch(() => {})} label="Abrir el aula virtual" /> : null}
      {missing ? <MetaChip icon="add" text="Profesor, salón y aula virtual" onPress={() => onEdit('teacher')} dashed />
        : !subject.teacher ? <MetaChip icon="add" text="Profesor" onPress={() => onEdit('teacher')} dashed />
        : null}
    </View>
  );
  const name = <Text accessibilityRole="header" style={{ color: C.text, fontSize: isWide ? 34 : 25, fontWeight: '800', letterSpacing: -0.2, flexShrink: 1 }} numberOfLines={2}>{subject.name}</Text>;
  if (!isWide) {
    return (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SubjectAvatar subject={subject} size={52} />
          {name}
        </View>
        {chips}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
      <SubjectAvatar subject={subject} size={72} />
      <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
        {name}
        {chips}
      </View>
    </View>
  );
}

/** Ficha compacta para las notas en pantalla ancha (deja espacio al texto). */
export function SubjectCompactBar({ subject, summary, onBack, tabs }: { subject: Subject; summary: string; onBack: () => void; tabs: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <IconButton icon="chevron-back" label="Volver a Materias" onPress={onBack} color={C.muted} style={{ marginLeft: -12 }} />
      <SubjectAvatar subject={subject} size={36} />
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>{subject.name}</Text>
      {!!summary && <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{summary}</Text>}
      <View style={{ flex: 1 }} />
      {tabs}
    </View>
  );
}

export type TabKey = 'tareas' | 'notas' | 'cal' | 'files';
export const TAB_LABEL: Record<TabKey, string> = { tareas: 'Tareas', notas: 'Notas', cal: 'Calificaciones', files: 'Archivos' };

/** Pestañas: subrayadas en la ficha grande, en píldoras en la compacta y en el celular. */
export function SubjectTabs({ value, onChange, counts, accent, pills, short }: {
  value: TabKey; onChange: (k: TabKey) => void; counts: Partial<Record<TabKey, number>>; accent: string; pills?: boolean; short?: boolean;
}) {
  const keys: TabKey[] = ['tareas', 'notas', 'cal', 'files'];
  const label = (k: TabKey) => (short && k === 'cal' ? 'Calif.' : TAB_LABEL[k]);
  if (pills) {
    return (
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignSelf: short ? 'stretch' : 'auto' }}>
        {keys.map((k) => {
          const on = k === value;
          return (
            <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={({ focused }: any) => [{ flex: short ? 1 : undefined, alignItems: 'center', paddingVertical: 8, paddingHorizontal: short ? 4 : 12, borderRadius: 9, backgroundColor: on ? C.surface2 : 'transparent' }, focused ? focusRingStyle() : null]}>
              <Text style={{ color: on ? C.text : C.muted, fontSize: 13.5, fontWeight: on ? '800' : '600' }} numberOfLines={1}>{label(k)}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: C.line, flexWrap: 'wrap' }}>
      {keys.map((k) => {
        const on = k === value;
        const n = counts[k];
        return (
          <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={({ focused }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: on ? accent : 'transparent', marginBottom: -1 }, focused ? focusRingStyle() : null]}>
            <Text style={{ color: on ? C.text : C.muted, fontSize: 14.5, fontWeight: on ? '800' : '600' }}>{label(k)}</Text>
            {n != null && n > 0 && <Text style={{ color: C.muted, fontSize: 12.5 }}>{n}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Indicadores ----------
function Tile({ label, children, onPress, a11y, style }: { label: string; children: React.ReactNode; onPress?: () => void; a11y: string; style?: StyleProp<ViewStyle> }) {
  const base: ViewStyle = { padding: 16, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, gap: 6 };
  const inner = (
    <>
      <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
      {children}
    </>
  );
  if (!onPress) return <View dataSet={{ petPerch: '1' }} style={[base, style]}>{inner}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} dataSet={{ press: '1', lift: '1', petPerch: '1' }}
      style={({ pressed, focused }: any) => [base, { opacity: pressed ? 0.85 : 1 }, focused ? focusRingStyle() : null, style]}>
      {inner}
    </Pressable>
  );
}
const big = { fontSize: 27, fontWeight: '800' as const };
// Se lee en el render: C cambia con el tema.
const subStyle = () => ({ color: C.muted, fontSize: 12.5, lineHeight: 17 });

export type StatsData = {
  avg: number | null; scale: number; passMark: number; neededText: string;
  next: NextEval | null; pending: number; overdue: number; done: number;
  weekMin: number | null; dueCards: number | null;
};

export function SubjectStats({ d, accent, isWide, onGrades, onNext, onTasks, onStudy }: {
  d: StatsData; accent: string; isWide: boolean;
  onGrades: () => void; onNext: () => void; onTasks: () => void; onStudy: () => void;
}) {
  const sub = subStyle();
  const now = new Date();
  const soon = d.next?.due ? Math.round((d.next.due.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000) <= 3 : false;
  const fmt = (n: number) => n.toFixed(2);
  const w = isWide ? undefined : 156;
  const tiles = [
    <Tile key="avg" label="Promedio" onPress={onGrades} a11y="Ver calificaciones" style={isWide ? { flex: 1 } : { width: w }}>
      <Text style={{ color: C.text, ...big }}>{d.avg == null ? '–' : fmt(d.avg)}<Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}> / {d.scale}</Text></Text>
      <View style={{ height: 6, borderRadius: 6, backgroundColor: C.surface2 }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, ((d.avg ?? 0) / d.scale) * 100)}%`, borderRadius: 6, backgroundColor: accent }} />
        <View style={{ position: 'absolute', left: `${(d.passMark / d.scale) * 100}%`, top: -3, width: 2, height: 12, backgroundColor: C.muted }} />
      </View>
      <Text style={sub} numberOfLines={2}>{d.neededText}</Text>
    </Tile>,
    <Tile key="next" label="Próxima evaluación" onPress={d.next ? onNext : undefined} a11y={d.next ? `Abrir ${d.next.title}` : 'Sin evaluaciones'} style={isWide ? { flex: 1 } : { width: w }}>
      {d.next ? (
        <>
          <Text style={{ color: C.text, fontSize: 19, fontWeight: '800' }} numberOfLines={1}>{d.next.title}</Text>
          {d.next.due
            ? <Text style={{ color: soon ? C.warnText : C.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{countdown(d.next.due, now)} · {shortDate(d.next.due)}</Text>
            : <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>Sin fecha todavía</Text>}
          {d.next.weight != null && <Text style={sub}>Vale {d.next.weight}% de la nota</Text>}
        </>
      ) : <Text style={[sub, { marginTop: 4 }]}>Nada programado. Agrega parciales con su fecha o impórtalos del cronograma.</Text>}
    </Tile>,
    <Tile key="pend" label="Pendientes" onPress={onTasks} a11y="Ver tareas" style={isWide ? { flex: 1 } : { width: w }}>
      <Text style={{ color: C.text, ...big }}>{d.pending}</Text>
      <Text style={[sub, d.overdue ? { color: C.badText, fontWeight: '700' } : null]}>
        {d.overdue ? `${d.overdue} ${d.overdue === 1 ? 'vencida' : 'vencidas'}` : 'Ninguna vencida'}{d.done ? ` · ${d.done} ${d.done === 1 ? 'hecha' : 'hechas'}` : ''}
      </Text>
    </Tile>,
    <Tile key="study" label="Estudio" onPress={onStudy} a11y={d.dueCards ? 'Repasar tarjetas' : 'Enfocar en esta materia'} style={isWide ? { flex: 1 } : { width: w }}>
      <Text style={{ color: C.text, ...big }}>{d.weekMin == null ? '–' : minutesLabel(d.weekMin)}</Text>
      <Text style={sub} numberOfLines={2}>
        de enfoque esta semana{d.dueCards ? ` · ${d.dueCards} ${d.dueCards === 1 ? 'tarjeta' : 'tarjetas'} para hoy` : ''}
      </Text>
    </Tile>,
  ];
  if (isWide) return <View accessibilityLabel="Resumen de la materia" style={{ flexDirection: 'row', gap: 12 }}>{tiles}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ marginHorizontal: -16, flexGrow: 0 }, web({ scrollbarWidth: 'none' })]}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
      {tiles}
    </ScrollView>
  );
}
