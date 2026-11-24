import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, R } from '../../lib/theme';
import { BoardColumn, Member, PTask, colorOf, initialsOf, nameOf } from '../../lib/projects';
import {
  monthGrid, byDueDay, timelineRange, barOf, clashes, roadToFinal, isoDay, addDays, dueDayOf, monthLabel, shortDay, spanOf,
} from '../../lib/projectCalendar';
import { t, trn } from '../../lib/i18n';

// ============================================================
//  Calendario del proyecto (v23, fase 3): el mes con las entregas, la
//  línea de tiempo con inicio y entrega de cada tarea, los cruces por
//  persona y el camino a la entrega final.
// ============================================================

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
type Mode = 'mes' | 'linea';

export function ProjectCalendar({ projectId, tasks, cols, members, editable, isWide, myId, onOpen, onAddOn }: {
  projectId: string; tasks: PTask[]; cols: BoardColumn[]; members: Member[]; editable: boolean; isWide: boolean; myId: string | null;
  onOpen: (t: PTask) => void; onAddOn: (day: Date) => void;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [mode, setMode] = useState<Mode>('mes');
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [mine, setMine] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [pickDay, setPickDay] = useState<string | null>(null);
  const [finalId, setFinalId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const FINAL_KEY = `kd-final-${projectId}`;
  useEffect(() => { AsyncStorage.getItem(FINAL_KEY).then((v) => setFinalId(v)).catch(() => {}); }, [projectId]);
  const saveFinal = (id: string | null) => { setFinalId(id); setChoosing(false); (id ? AsyncStorage.setItem(FINAL_KEY, id) : AsyncStorage.removeItem(FINAL_KEY)).catch(() => {}); };

  const shown = useMemo(() => tasks.filter((t) => (!mine || t.assignee_id === myId) && (!hideDone || !t.done)), [tasks, mine, hideDone, myId]);
  const colOf = (t: PTask) => cols.find((c) => c.key === t.status) ?? cols[0];
  const memberOf = (id: string | null) => members.find((m) => m.user_id === id) ?? null;
  const road = useMemo(() => roadToFinal(tasks, today, finalId), [tasks, today, finalId]);
  const clash = useMemo(() => clashes(tasks, 3, today), [tasks, today]);

  // ---------- Camino a la entrega final ----------
  const finalDay = road.final ? dueDayOf(road.final) : null;
  const paceText = road.pace === 'late' ? (road.late ? t('{late} {v}: pónganse al día', { late: road.late, v: road.late === 1 ? 'tarea vencida' : 'tareas vencidas' }) : t('La entrega final ya pasó'))
    : road.pace === 'tight' ? t('Apretado: quedan {v} tareas para {max} días', { v: road.total - road.done, max: Math.max(0, road.daysLeft ?? 0) })
    : road.pace === 'ok' ? t('Van a buen ritmo') : t('Pongan fecha a las tareas para ver el camino');
  const paceColor = road.pace === 'late' ? C.bad : road.pace === 'tight' ? C.warn : road.pace === 'ok' ? C.good : C.muted;
  const roadCard = (
    <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 14, gap: 10, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Ionicons name="flag" size={18} color={paceColor} />
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '700' }}>{t('ENTREGA FINAL')}</Text>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>
            {road.final ? `${road.final.title}${finalDay ? ` · ${shortDay(finalDay)}` : ''}` : t('Sin fecha todavía')}
          </Text>
        </View>
        {road.daysLeft != null && (
          <View style={{ alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: paceColor + '1f' }}>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{Math.abs(road.daysLeft)}</Text>
            <Text style={{ color: C.muted, fontSize: 11 }}>{road.daysLeft >= 0 ? (road.daysLeft === 1 ? t('día') : t('días')) : t('días tarde')}</Text>
          </View>
        )}
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' }} accessibilityLabel={t('{done} de {total} tareas hechas', { done: road.done, total: road.total })}>
        <View style={{ width: `${road.total ? (road.done / road.total) * 100 : 0}%`, height: '100%', backgroundColor: C.good }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Text style={{ color: paceColor, fontSize: 13, fontWeight: '700' }}>{paceText}</Text>
        <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('· {done} de {total} hechas', { done: road.done, total: road.total })}</Text>
        {road.thisWeek > 0 && <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('· {thisWeek} esta semana', { thisWeek: road.thisWeek })}</Text>}
        {road.undated > 0 && <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('· {undated} sin fecha', { undated: road.undated })}</Text>}
        <View style={{ flex: 1 }} />
        {tasks.some((t) => dueDayOf(t)) && (
          <Pressable onPress={() => setChoosing(!choosing)} accessibilityRole="button" hitSlop={6}>
            <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>{choosing ? t('Cerrar') : t('Cambiar la entrega final')}</Text>
          </Pressable>
        )}
      </View>
      {choosing && (
        <View style={{ gap: 4 }} accessibilityRole="radiogroup" accessibilityLabel={t('Entrega final')}>
          <Pressable onPress={() => saveFinal(null)} accessibilityRole="radio" accessibilityState={{ checked: !finalId }} style={{ padding: 8, borderRadius: 8, backgroundColor: !finalId ? C.brand + '1f' : 'transparent' }}>
            <Text style={{ color: C.text, fontSize: 13 }}>{t('La que vence de última (automático)')}</Text>
          </Pressable>
          {tasks.filter((t) => dueDayOf(t)).sort((a, b) => dueDayOf(b)!.getTime() - dueDayOf(a)!.getTime()).slice(0, 8).map((t) => (
            <Pressable key={t.id} onPress={() => saveFinal(t.id)} accessibilityRole="radio" accessibilityState={{ checked: finalId === t.id }}
              style={{ padding: 8, borderRadius: 8, backgroundColor: finalId === t.id ? C.brand + '1f' : 'transparent' }}>
              <Text style={{ color: C.text, fontSize: 13 }}>{t.title} · {shortDay(dueDayOf(t)!)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {clash.slice(0, 3).map((c, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 10, backgroundColor: C.warn + '14' }}>
          <Ionicons name="git-merge-outline" size={16} color={C.warnText} style={{ marginTop: 1 }} />
          <Text style={{ color: C.text, fontSize: 12.5, flex: 1, lineHeight: 18 }}>
            <Text style={{ fontWeight: '800' }}>{nameOf(memberOf(c.user_id)?.profile)}</Text> {t(' tiene ')}{c.count} {t(' tareas a la vez ')}{c.from.getTime() === c.to.getTime() ? `el ${shortDay(c.from)}` : t('del {from} al {to}', { from: shortDay(c.from), to: shortDay(c.to) })}: {c.titles.slice(0, 4).join(', ')}.
          </Text>
        </View>
      ))}
    </View>
  );

  // ---------- Controles ----------
  const chip = (on: boolean, label: string, icon: any, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand + '1f' : 'transparent' }}>
      <Ionicons name={icon} size={13} color={on ? C.brand : C.muted} />
      <Text style={{ color: on ? C.brand : C.muted, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
  const controls = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line }} accessibilityRole="radiogroup">
        {(['mes', 'linea'] as Mode[]).map((k) => (
          <Pressable key={k} onPress={() => setMode(k)} accessibilityRole="radio" accessibilityState={{ checked: mode === k }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: mode === k ? C.surface : 'transparent' }}>
            <Text style={{ color: mode === k ? C.text : C.muted, fontSize: 12.5, fontWeight: '700' }}>{k === 'mes' ? t('Mes') : t('Línea de tiempo')}</Text>
          </Pressable>
        ))}
      </View>
      {chip(mine, t('Solo lo mío'), mine ? 'person' : 'person-outline', () => setMine(!mine))}
      {chip(hideDone, t('Ocultar hechas'), 'eye-off-outline', () => setHideDone(!hideDone))}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isWide ? 24 : 14, paddingBottom: 120, maxWidth: 1200, width: '100%' }}>
      {roadCard}
      {controls}
      {mode === 'mes'
        ? <MonthView ym={ym} setYm={setYm} today={today} tasks={shown} isWide={isWide} editable={editable} colOf={colOf} memberOf={memberOf}
            pickDay={pickDay} setPickDay={setPickDay} onOpen={onOpen} onAddOn={onAddOn} finalId={road.final?.id ?? null} />
        : <TimelineView today={today} tasks={shown} isWide={isWide} colOf={colOf} memberOf={memberOf} onOpen={onOpen} finalDay={finalDay} />}
    </ScrollView>
  );
}

function MonthView({ ym, setYm, today, tasks, isWide, editable, colOf, memberOf, pickDay, setPickDay, onOpen, onAddOn, finalId }: {
  ym: { y: number; m: number }; setYm: (v: { y: number; m: number }) => void; today: Date; tasks: PTask[]; isWide: boolean; editable: boolean;
  colOf: (t: PTask) => BoardColumn | undefined; memberOf: (id: string | null) => Member | null;
  pickDay: string | null; setPickDay: (d: string | null) => void; onOpen: (t: PTask) => void; onAddOn: (d: Date) => void; finalId: string | null;
}) {
  const grid = monthGrid(ym.y, ym.m);
  const by = byDueDay(tasks as any) as Record<string, PTask[]>;
  const todayIso = isoDay(today);
  const go = (n: number) => { const d = new Date(ym.y, ym.m + n, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); setPickDay(null); };
  const dayList = pickDay ? by[pickDay] ?? [] : [];
  return (
    <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: isWide ? 12 : 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Pressable onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel={t('Mes anterior')} style={navBtn}><Ionicons name="chevron-back" size={17} color={C.text} /></Pressable>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', minWidth: 140, textAlign: 'center' }}>{monthLabel(ym.y, ym.m)}</Text>
        <Pressable onPress={() => go(1)} accessibilityRole="button" accessibilityLabel={t('Mes siguiente')} style={navBtn}><Ionicons name="chevron-forward" size={17} color={C.text} /></Pressable>
        {(ym.y !== today.getFullYear() || ym.m !== today.getMonth()) && (
          <Pressable onPress={() => setYm({ y: today.getFullYear(), m: today.getMonth() })} accessibilityRole="button" style={{ paddingHorizontal: 10 }}>
            <Text style={{ color: C.brand, fontSize: 13, fontWeight: '700' }}>{t('Hoy')}</Text>
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {DOW.map((d, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: C.muted, fontSize: 11.5, fontWeight: '700', paddingBottom: 6 }}>{d}</Text>)}
      </View>
      <View style={{ borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.line }}>
      {grid.map((week, w) => (
        <View key={w} style={{ flexDirection: 'row' }}>
          {week.map((d) => {
            const iso = isoDay(d), list = by[iso] ?? [], other = d.getMonth() !== ym.m, isToday = iso === todayIso;
            const late = list.some((t) => !t.done && d < today);
            return (
              <Pressable key={iso} accessibilityRole="button" accessibilityLabel={`${d.getDate()} ${list.length ? `, ${list.length} ${list.length === 1 ? 'entrega' : 'entregas'}` : ''}`}
                onPress={() => (isWide ? (editable ? onAddOn(d) : null) : setPickDay(pickDay === iso ? null : iso))}
                style={({ hovered }: any) => ({
                  flex: 1, minHeight: isWide ? 104 : 54, borderTopWidth: 1, borderLeftWidth: 1, borderColor: C.line, padding: isWide ? 5 : 3,
                  backgroundColor: pickDay === iso ? C.brand + '1a' : hovered && isWide && editable ? C.surface2 : other ? C.bg + '66' : 'transparent',
                })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: isWide ? 'space-between' : 'center' }}>
                  <View style={{ minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? C.brand : 'transparent' }}>
                    <Text style={{ color: isToday ? C.onBrand : other ? C.muted : C.text, fontSize: 12, fontWeight: isToday ? '800' : '600' }}>{d.getDate()}</Text>
                  </View>
                  {isWide && editable && <Ionicons name="add" size={13} color="transparent" />}
                </View>
                {isWide ? (
                  <View style={{ gap: 3, marginTop: 3 }}>
                    {list.slice(0, 3).map((t) => (
                      <Pressable key={t.id} onPress={(e: any) => { e?.stopPropagation?.(); onOpen(t); }} accessibilityRole="button" accessibilityLabel={trn('Abrir {title}', { title: t.title })}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, backgroundColor: (colOf(t)?.color ?? C.muted) + '26', borderLeftWidth: 3, borderLeftColor: colOf(t)?.color ?? C.muted }}>
                        {t.id === finalId && <Ionicons name="flag" size={10} color={C.bad} />}
                        <Text numberOfLines={1} style={{ color: t.done ? C.muted : C.text, fontSize: 11, fontWeight: '600', flex: 1, textDecorationLine: t.done ? 'line-through' : 'none' }}>{t.title}</Text>
                      </Pressable>
                    ))}
                    {list.length > 3 && <Text style={{ color: C.muted, fontSize: 10.5, paddingLeft: 4 }}>{t('+{v} más', { v: list.length - 3 })}</Text>}
                  </View>
                ) : list.length > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 2, marginTop: 4, flexWrap: 'wrap' }}>
                    {list.slice(0, 4).map((t) => <View key={t.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.done ? C.muted : late ? C.bad : colOf(t)?.color ?? C.brand }} />)}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      </View>
      {!isWide && pickDay && (
        <View style={{ marginTop: 10, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '800', flex: 1 }}>{shortDay(new Date(pickDay + 'T00:00:00'))}</Text>
            {editable && <Pressable onPress={() => onAddOn(new Date(pickDay + 'T00:00:00'))} accessibilityRole="button" hitSlop={6}><Text style={{ color: C.brand, fontSize: 13, fontWeight: '700' }}>{t('+ Tarea este día')}</Text></Pressable>}
          </View>
          {dayList.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>{t('Nada vence este día.')}</Text>}
          {dayList.map((t) => <TaskRow key={t.id} t={t} col={colOf(t)} who={memberOf(t.assignee_id)} onPress={() => onOpen(t)} />)}
        </View>
      )}
      {isWide && editable && <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 8 }}>{t('Toca un día vacío para crear una tarea con esa fecha.')}</Text>}
    </View>
  );
}

function TaskRow({ t, col, who, onPress }: { t: PTask; col?: BoardColumn; who: Member | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: col?.color ?? C.muted }}>
      <Text numberOfLines={1} style={{ color: t.done ? C.muted : C.text, fontSize: 13.5, fontWeight: '600', flex: 1, textDecorationLine: t.done ? 'line-through' : 'none' }}>{t.title}</Text>
      <Text style={{ color: C.muted, fontSize: 11.5 }}>{col?.label}</Text>
      {who && <Avatar m={who} />}
    </Pressable>
  );
}

function Avatar({ m, size = 20 }: { m: Member; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colorOf(m.user_id), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#0f1115', fontSize: size * 0.42, fontWeight: '800' }}>{initialsOf(m.profile)}</Text>
    </View>
  );
}

function TimelineView({ today, tasks, isWide, colOf, memberOf, onOpen, finalDay }: {
  today: Date; tasks: PTask[]; isWide: boolean; colOf: (t: PTask) => BoardColumn | undefined; memberOf: (id: string | null) => Member | null;
  onOpen: (t: PTask) => void; finalDay: Date | null;
}) {
  const dayW = isWide ? 30 : 24, nameW = isWide ? 220 : 130, rowH = 34;
  const { from, days } = timelineRange(tasks as any, today);
  const rows = tasks.filter((t) => spanOf(t as any)).sort((a, b) => spanOf(a as any)!.start.getTime() - spanOf(b as any)!.start.getTime() || spanOf(a as any)!.end.getTime() - spanOf(b as any)!.end.getTime());
  const undated = tasks.filter((t) => !spanOf(t as any));
  const scroller = useRef<ScrollView>(null);
  const todayX = Math.round((today.getTime() - from.getTime()) / 86_400_000) * dayW;
  const finalX = finalDay ? Math.round((finalDay.getTime() - from.getTime()) / 86_400_000) * dayW : null;
  useEffect(() => { setTimeout(() => scroller.current?.scrollTo({ x: Math.max(0, todayX - dayW * 4), animated: false }), 50); }, [todayX]);
  const width = days * dayW;
  return (
    <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row' }}>
        {/* Nombres */}
        <View style={{ width: nameW, borderRightWidth: 1, borderRightColor: C.line }}>
          <View style={{ height: 52, borderBottomWidth: 1, borderBottomColor: C.line, justifyContent: 'flex-end', padding: 8 }}>
            <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '700' }}>{t('TAREA')}</Text>
          </View>
          {rows.map((t) => {
            const who = memberOf(t.assignee_id);
            return (
              <Pressable key={t.id} onPress={() => onOpen(t)} accessibilityRole="button" accessibilityLabel={trn('Abrir {title}', { title: t.title })}
                style={({ hovered }: any) => ({ height: rowH, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
                {who ? <Avatar m={who} size={18} /> : <View style={{ width: 18 }} />}
                <Text numberOfLines={1} style={{ color: t.done ? C.muted : C.text, fontSize: 12.5, fontWeight: '600', flex: 1, textDecorationLine: t.done ? 'line-through' : 'none' }}>{t.title}</Text>
              </Pressable>
            );
          })}
        </View>
        {/* Días y barras */}
        <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
          <View style={{ width }}>
            <View style={{ height: 52, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line }}>
              {Array.from({ length: days }, (_, i) => {
                const d = addDays(from, i);
                if (d.getDate() !== 1 && i !== 0) return null;
                return <Text key={'m' + i} style={{ position: 'absolute', top: 6, left: i * dayW + 4, color: C.text, fontSize: 11, fontWeight: '800', zIndex: 1 }}>{monthLabel(d.getFullYear(), d.getMonth()).split(' ')[0]}</Text>;
              })}
              {Array.from({ length: days }, (_, i) => {
                const d = addDays(from, i), weekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <View key={i} style={{ width: dayW, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 4, backgroundColor: weekend ? C.surface2 + '88' : 'transparent' }}>
                    <Text style={{ color: C.muted, fontSize: 9.5 }}>{DOW[(d.getDay() + 6) % 7]}</Text>
                    <Text style={{ color: isoDay(d) === isoDay(today) ? C.brand : C.muted, fontSize: 10.5, fontWeight: isoDay(d) === isoDay(today) ? '800' : '500' }}>{d.getDate()}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ height: Math.max(rowH, rows.length * rowH) }}>
              {/* fines de semana */}
              {Array.from({ length: days }, (_, i) => { const d = addDays(from, i); return d.getDay() === 0 || d.getDay() === 6 ? <View key={i} style={{ position: 'absolute', left: i * dayW, top: 0, bottom: 0, width: dayW, backgroundColor: C.surface2 + '55' }} /> : null; })}
              {/* hoy y entrega final */}
              <View style={{ position: 'absolute', left: todayX + dayW / 2, top: 0, bottom: 0, width: 2, backgroundColor: C.brand }} accessibilityLabel={t('Hoy')} />
              {finalX != null && finalX >= 0 && finalX < width && <View style={{ position: 'absolute', left: finalX + dayW / 2, top: 0, bottom: 0, width: 2, backgroundColor: C.bad, opacity: 0.8 }} accessibilityLabel={t('Entrega final')} />}
              {rows.map((t, r) => {
                const b = barOf(t as any, from, days); if (!b) return null;
                const col = colOf(t), late = !t.done && (dueDayOf(t as any)?.getTime() ?? Infinity) < today.getTime();
                return (
                  <Pressable key={t.id} onPress={() => onOpen(t)} accessibilityRole="button" accessibilityLabel={`${t.title}: ${b.width} ${b.width === 1 ? trn('día') : trn('días')}`}
                    style={{ position: 'absolute', left: b.left * dayW + 2, top: r * rowH + 7, width: b.width * dayW - 4, height: rowH - 14, borderRadius: 6,
                      backgroundColor: (late ? C.bad : col?.color ?? C.brand) + (t.done ? '55' : 'cc'), borderWidth: late ? 1.5 : 0, borderColor: C.bad, justifyContent: 'center', paddingHorizontal: 6 }}>
                    {b.width * dayW > 70 && <Text numberOfLines={1} style={{ color: '#0f1115', fontSize: 10.5, fontWeight: '800' }}>{t.title}</Text>}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
      {undated.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: C.line, padding: 10, gap: 6 }}>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>{t('SIN FECHAS · {length}', { length: undated.length })}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {undated.map((t) => (
              <Pressable key={t.id} onPress={() => onOpen(t)} accessibilityRole="button" style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ color: C.text, fontSize: 12 }}>{t.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 14, padding: 10, borderTopWidth: 1, borderTopColor: C.line, flexWrap: 'wrap' }}>
        <Legend color={C.brand} text={t('Hoy')} /><Legend color={C.bad} text={t('Entrega final / vencida')} />
        <Text style={{ color: C.muted, fontSize: 11.5 }}>{t('La barra va del inicio a la entrega; sin inicio, solo el día de entrega.')}</Text>
      </View>
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} /><Text style={{ color: C.muted, fontSize: 11.5 }}>{text}</Text></View>;
}

const navBtn = { width: 32, height: 32, borderRadius: 9, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: C.line };
