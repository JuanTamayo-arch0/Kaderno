import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ProgressRing } from '../../components/Ring';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { Subject, Grade, getSubjects, getAllGrades, countDueFlashcards, getFocusDetail, getFocusStats } from '../../lib/db';
import { semesterAverage } from '../../lib/grades';
import { useFocusTimer, startFocus, pauseFocus, resetFocus } from '../../lib/focusTimer';
import { Screen, Button, Card, SectionLabel, Dot } from '../../components/ds';
import { fmtMin } from '../../components/TaskRow';

// ============================================================
//  Estudiar: Enfoque, Repaso y Oráculo en un solo lugar, más el avance
//  de la semana y el promedio del semestre ponderado por créditos.
// ============================================================

export default function Estudiar() {
  const router = useRouter();
  const { isWide } = useResponsive();
  const focus = useFocusTimer();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [due, setDue] = useState(0);
  const [detail, setDetail] = useState<{ todayMin: number; weekMin: number; streak: number; byDay: { label: string; min: number }[] }>({ todayMin: 0, weekMin: 0, streak: 0, byDay: [] });
  const [bySubject, setBySubject] = useState<{ subject_id: string | null; minutes: number }[]>([]);
  const [q, setQ] = useState('');

  useFocusEffect(useCallback(() => {
    getSubjects().then(setSubjects).catch(() => {});
    getAllGrades().then(setGrades).catch(() => {});
    countDueFlashcards().then(setDue).catch(() => {});
    getFocusDetail().then(setDetail).catch(() => {});
    getFocusStats().then((s) => setBySubject(s.bySubject)).catch(() => {});
  }, []));

  const sem = semesterAverage(subjects, grades);
  const maxMin = Math.max(30, ...detail.byDay.map((d) => d.min));
  const ask = () => { if (q.trim()) { router.push({ pathname: '/oraculo', params: { q: q.trim() } } as any); setQ(''); } };
  const col = isWide ? { flexBasis: '48%', flexGrow: 1 } as const : { width: '100%' } as const;
  const R = 40, CIRC = 2 * Math.PI * R;

  return (
    <Screen title="Estudiar" subtitle="Enfoque, repaso y tu avance" maxWidth={1100}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {/* Enfoque */}
        <Card style={col}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Pressable onPress={() => router.push('/enfoque')} accessibilityRole="button" accessibilityLabel="Abrir enfoque">
              <View style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
                <ProgressRing size={100} stroke={8} inset={6} frac={focus.frac} color={focus.state.mode === 'work' ? C.brand : C.good} track={C.surface2} />
                <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{focus.label}</Text>
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Enfoque</Text>
              <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                {focus.state.taskTitle ? `En: ${focus.state.taskTitle}` : focus.state.mode === 'work' ? `Pomodoro de ${focus.state.workMin} min` : 'Descanso'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Button label={focus.state.running ? 'Pausar' : focus.remaining < focus.total ? 'Seguir' : 'Empezar'} icon={focus.state.running ? 'pause' : 'play'} size="sm"
                  onPress={() => focus.state.running ? pauseFocus() : startFocus()} />
                {focus.remaining < focus.total && <Button label="Reiniciar" kind="secondary" size="sm" onPress={resetFocus} />}
                <Button label="Opciones" kind="ghost" size="sm" onPress={() => router.push('/enfoque')} />
              </View>
            </View>
          </View>
        </Card>

        {/* Repaso */}
        <Card style={col} onPress={() => router.push('/repaso')} accessibilityLabel="Abrir repaso">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: C.brand2 + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="albums-outline" size={26} color={C.brand2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Repaso</Text>
              <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
                {due ? `${due} ${due === 1 ? 'tarjeta toca' : 'tarjetas tocan'} hoy` : 'Nada para hoy. Crea tarjetas desde tus notas.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.muted} />
          </View>
        </Card>

        {/* Oráculo */}
        <Card style={col}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Ionicons name="sparkles-outline" size={20} color={C.brand} />
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Oráculo</Text>
            <Pressable onPress={() => router.push('/oraculo')} accessibilityRole="link"><Text style={{ color: C.brand, fontWeight: '700', fontSize: 13 }}>Abrir</Text></Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingLeft: 12 }}>
            <TextInput value={q} onChangeText={setQ} onSubmitEditing={ask} placeholder="Pregunta algo sobre tus apuntes…" placeholderTextColor={C.muted} accessibilityLabel="Pregunta para el Oráculo"
              style={[{ flex: 1, color: C.text, fontSize: 14.5, paddingVertical: 11, minHeight: 44 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
            <Pressable onPress={ask} accessibilityLabel="Preguntar" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-up-circle" size={26} color={q.trim() ? C.brand : C.muted} />
            </Pressable>
          </View>
        </Card>

        {/* Capturar */}
        <Card style={col} onPress={() => router.push('/capturar')} accessibilityLabel="Digitalizar apunte">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: C.brand + '1f', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera-outline" size={26} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Digitalizar apunte</Text>
              <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>Foto o imagen a texto editable</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.muted} />
          </View>
        </Card>
      </View>

      <SectionLabel text="Tu semana" style={{ marginTop: 24 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <Card style={col}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Hoy" value={short(detail.todayMin)} />
            <Stat label="7 días" value={short(detail.weekMin)} />
            <Stat label="Racha" value={`${detail.streak} ${detail.streak === 1 ? 'día' : 'días'}`} tone={detail.streak ? C.goodText : undefined} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 90, marginTop: 16 }} accessibilityLabel="Minutos de enfoque por día">
            {detail.byDay.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' }}>
                <View style={{ width: '60%', height: `${Math.max(4, (d.min / maxMin) * 100)}%`, backgroundColor: d.label === 'Hoy' ? C.brand : C.line, borderRadius: 5 }} />
                <Text style={{ fontSize: 11, color: C.muted }}>{d.label}</Text>
              </View>
            ))}
          </View>
          {bySubject.length > 0 && (
            <View style={{ marginTop: 14, gap: 6 }}>
              {[...bySubject].sort((a, b) => b.minutes - a.minutes).slice(0, 4).map((r, i) => {
                const s = subjects.find((x) => x.id === r.subject_id);
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Dot color={s?.color ?? C.muted} />
                    <Text style={{ color: C.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{s?.name ?? 'Sin materia'}</Text>
                    <Text style={{ color: C.muted, fontSize: 13 }}>{fmtMin(r.minutes)}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        <Card style={col}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: C.muted, fontSize: 12.5 }}>Promedio del semestre</Text>
              <Text style={{ color: C.text, fontSize: 30, fontWeight: '800' }}>{sem.avg == null ? 'Sin notas' : sem.avg.toFixed(2)}<Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}>{sem.avg == null ? '' : ' / 5'}</Text></Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 12 }}>Ponderado por créditos</Text>
          </View>
          <View style={{ marginTop: 12, gap: 8 }}>
            {sem.rows.map((r) => {
              const s = subjects.find((x) => x.id === r.id);
              return (
                <Pressable key={r.id} onPress={() => router.push({ pathname: '/materia/[id]', params: { id: r.id, tab: 'cal' } } as any)} accessibilityRole="link"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
                  <Dot color={s?.color ?? C.muted} />
                  <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>{r.name}</Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>{r.credits} cr.</Text>
                  <Text style={{ color: r.avg == null ? C.muted : r.avg < 3 ? C.badText : C.text, fontSize: 13.5, fontWeight: '700', width: 64, textAlign: 'right' }}>{r.avg == null ? 'Sin notas' : r.avg.toFixed(1)}</Text>
                </Pressable>
              );
            })}
            {sem.rows.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>Crea materias y agrega calificaciones para ver tu promedio.</Text>}
          </View>
        </Card>
      </View>
    </Screen>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.surface2, borderRadius: 12, padding: 12 }}>
      <Text style={{ color: tone ?? C.text, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function short(m: number): string { return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; }
