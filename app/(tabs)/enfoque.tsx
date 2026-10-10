import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { C, S, R as Rt, shadow } from '../../lib/theme';
import { useResponsive, SIDEBAR_W } from '../../lib/responsive';
import { Subject, FocusSession, getSubjects, addFocusSession, getFocusStats, getFocusDetail } from '../../lib/db';
import { Header, Chip } from '../../components/ui';
import { SubjectPicker } from '../../components/SubjectPicker';

const RAD = 100;
const CIRC = 2 * Math.PI * RAD;

export default function Enfoque() {
  const { isWide } = useResponsive();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [workMin, setWorkMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [stats, setStats] = useState<{ todayMin: number; weekMin: number; bySubject: { subject_id: string | null; minutes: number }[] }>({ todayMin: 0, weekMin: 0, bySubject: [] });
  const [detail, setDetail] = useState<{ todayMin: number; weekMin: number; streak: number; byDay: { label: string; min: number }[]; recent: FocusSession[] }>({ todayMin: 0, weekMin: 0, streak: 0, byDay: [], recent: [] });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStats = useCallback(() => {
    getFocusStats().then(setStats).catch(() => {});
    getFocusDetail().then(setDetail).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => {
    getSubjects().then(setSubjects).catch(() => {});
    loadStats();
  }, [loadStats]));

  // El temporizador solo decrementa; las transiciones las maneja el efecto de abajo.
  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setRemaining((r) => (r <= 0 ? 0 : r - 1)), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running]);

  useEffect(() => {
    if (!running || remaining !== 0) return;
    if (mode === 'work') {
      setCycle((c) => (c + 1) % 4);
      addFocusSession(Math.max(1, workMin), subjectId).then(loadStats).catch(() => {});
      setMode('break');
      setRemaining(Math.max(1, breakMin) * 60);
    } else {
      setMode('work');
      setRemaining(Math.max(1, workMin) * 60);
    }
  }, [remaining, running]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() { setRunning(false); setMode('work'); setRemaining(Math.max(1, workMin) * 60); }

  const total = (mode === 'work' ? Math.max(1, workMin) : Math.max(1, breakMin)) * 60;
  const frac = Math.max(0, remaining) / total;
  const mm = String(Math.floor(Math.max(0, remaining) / 60)).padStart(2, '0');
  const ss = String(Math.max(0, remaining) % 60).padStart(2, '0');
  const subjName = (sid: string | null) => subjects.find((s) => s.id === sid)?.name ?? 'Sin materia';
  const subjColor = (sid: string | null) => subjects.find((s) => s.id === sid)?.color ?? C.muted;

  const ring = (
    <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={220} height={220} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Defs><LinearGradient id="g" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={C.brand} /><Stop offset="1" stopColor={C.brand2} /></LinearGradient></Defs>
        <Circle cx={110} cy={110} r={RAD} stroke={C.surface2} strokeWidth={14} fill="none" />
        <Circle cx={110} cy={110} r={RAD} stroke="url(#g)" strokeWidth={14} fill="none" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)} />
      </Svg>
      <Text style={{ color: C.text, fontSize: 40, fontWeight: '800' }}>{mm}:{ss}</Text>
      <Text style={{ color: C.muted, marginTop: 2, fontSize: 13 }}>{mode === 'work' ? 'Enfoque' : 'Descanso'}</Text>
    </View>
  );

  // ===================== ESCRITORIO =====================
  if (isWide) {
    const maxMin = Math.max(60, ...detail.byDay.map((d) => d.min));
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: SIDEBAR_W }}>
        <ScrollView contentContainerStyle={{ paddingVertical: 36, paddingHorizontal: 44, paddingBottom: 60 }}>
          <View style={{ maxWidth: 1560, width: '100%' }}>
            <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>Enfoque</Text>
            <Text style={{ color: C.muted, fontSize: 14, marginTop: 4, marginBottom: 20 }}>Técnica Pomodoro</Text>

            <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
              {/* Temporizador */}
              <View style={{ width: 400, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 28, alignItems: 'center', gap: 20 }}>
                {ring}
                <View style={{ width: '100%' }}>
                  <Text style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>¿Qué estás estudiando?</Text>
                  <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} placeholder="Sin materia" />
                </View>
                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <Pressable onPress={() => setRunning((v) => !v)} style={{ flex: 1, backgroundColor: C.brand, borderRadius: 10, padding: 12, alignItems: 'center' }}><Text style={{ color: '#0f1115', fontWeight: '700' }}>{running ? 'Pausar' : 'Iniciar'}</Text></Pressable>
                  <Pressable onPress={reset} style={{ flex: 1, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, alignItems: 'center' }}><Text style={{ color: C.text, fontWeight: '700' }}>Reiniciar</Text></Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <View style={{ flex: 1 }}><Text style={lbl}>Enfoque (min)</Text><TextInput keyboardType="number-pad" value={String(workMin)} onChangeText={(v) => { const n = parseInt(v || '0', 10); setWorkMin(n); if (mode === 'work' && !running) setRemaining(Math.max(1, n) * 60); }} style={input} /></View>
                  <View style={{ flex: 1 }}><Text style={lbl}>Descanso (min)</Text><TextInput keyboardType="number-pad" value={String(breakMin)} onChangeText={(v) => setBreakMin(parseInt(v || '0', 10))} style={input} /></View>
                </View>
              </View>

              {/* Estadísticas */}
              <View style={{ flex: 1, minWidth: 0, gap: 16 }}>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <StatCard label="Hoy" value={`${detail.todayMin} min`} />
                  <StatCard label="Últimos 7 días" value={`${detail.weekMin} min`} />
                  <StatCard label="Racha" value={`${detail.streak} día${detail.streak === 1 ? '' : 's'}`} color={C.good} />
                </View>

                <View style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 20 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 14 }}>Últimos 7 días</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 110 }}>
                    {detail.byDay.map((d, i) => (
                      <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                        <View style={{ width: '60%', height: `${Math.max(3, (d.min / maxMin) * 100)}%`, backgroundColor: d.label === 'Hoy' ? C.brand : C.line, borderRadius: 6 }} />
                        <Text style={{ fontSize: 11, color: C.muted }}>{d.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 20 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Historial reciente</Text>
                  {detail.recent.length === 0 ? <Text style={{ color: C.muted, fontSize: 13 }}>Aún no hay sesiones.</Text> : detail.recent.map((sess) => (
                    <View key={sess.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.surface2 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subjColor(sess.subject_id) }} />
                      <Text style={{ flex: 1, color: C.text, fontSize: 13 }}>{subjName(sess.subject_id)}</Text>
                      <Text style={{ color: C.muted, fontSize: 12 }}>{sess.minutes} min · {new Date(sess.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ===================== MÓVIL =====================
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: isWide ? SIDEBAR_W : 0 }}>
      <Header title="Enfoque" subtitle="Técnica Pomodoro" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={cardBox}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={220} height={220} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
                <Defs>
                  <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={C.brand} />
                    <Stop offset="1" stopColor={C.brand2} />
                  </LinearGradient>
                </Defs>
                <Circle cx={110} cy={110} r={RAD} stroke={C.surface2} strokeWidth={14} fill="none" />
                <Circle cx={110} cy={110} r={RAD} stroke="url(#g)" strokeWidth={14} fill="none"
                  strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)} />
              </Svg>
              <Text style={{ color: C.text, fontSize: 44, fontWeight: '700' }}>{mm}:{ss}</Text>
              <Text style={{ color: C.muted, marginTop: 2 }}>{mode === 'work' ? 'Enfoque' : 'Descanso'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: i < cycle ? C.brand : C.line, backgroundColor: i < cycle ? C.brand : C.surface2 }} />
              ))}
            </View>
          </View>

          <Text style={lbl}>¿Qué estás estudiando?</Text>
          <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} placeholder="Sin materia" />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable onPress={() => setRunning((v) => !v)} style={[btn, { flex: 1 }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{running ? 'Pausar' : 'Iniciar'}</Text>
            </Pressable>
            <Pressable onPress={reset} style={[btnGhost, { flex: 1 }]}>
              <Text style={{ color: C.text }}>Reiniciar</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={lbl}>Enfoque (min)</Text>
              <TextInput keyboardType="number-pad" value={String(workMin)}
                onChangeText={(v) => { const n = parseInt(v || '0', 10); setWorkMin(n); if (mode === 'work' && !running) setRemaining(Math.max(1, n) * 60); }}
                style={input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={lbl}>Descanso (min)</Text>
              <TextInput keyboardType="number-pad" value={String(breakMin)}
                onChangeText={(v) => setBreakMin(parseInt(v || '0', 10))} style={input} />
            </View>
          </View>
        </View>

        {/* Estadísticas */}
        <View style={[cardBox, { marginTop: 12 }]}>
          <Text style={{ color: C.text, fontWeight: '700', marginBottom: 10 }}>Tu enfoque</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Hoy" value={fmtMin(detail.todayMin)} />
            <Stat label="7 días" value={fmtMin(detail.weekMin)} />
            <Stat label="Racha" value={`${detail.streak}d`} />
          </View>
          {detail.byDay.length > 0 && (() => {
            const maxMin = Math.max(60, ...detail.byDay.map((d) => d.min));
            return (
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>Últimos 7 días</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 80 }}>
                  {detail.byDay.map((d, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' }}>
                      <View style={{ width: '55%', height: `${Math.max(3, (d.min / maxMin) * 100)}%`, backgroundColor: d.label === 'Hoy' ? C.brand : C.line, borderRadius: 5 }} />
                      <Text style={{ fontSize: 10, color: C.muted }}>{d.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}
          {stats.bySubject.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>Por materia (7 días)</Text>
              {stats.bySubject.sort((a, b) => b.minutes - a.minutes).slice(0, 5).map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ color: C.text, fontSize: 13 }}>{subjName(r.subject_id)}</Text>
                  <Text style={{ color: C.muted, fontSize: 13 }}>{fmtMin(r.minutes)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 18 }}>
      <Text style={{ color: C.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: color ?? C.text, fontSize: 26, fontWeight: '800', marginTop: 4 }}>{value}</Text>
    </View>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.surface2, borderRadius: Rt.md, padding: 12 }}>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
function fmtMin(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

const cardBox = { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: Rt.lg, padding: 14, ...shadow } as const;
const btn = { backgroundColor: C.brand, borderRadius: 12, padding: 14, alignItems: 'center' } as const;
const btnGhost = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' } as const;
const input = { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 11, color: C.text, padding: 12, fontSize: 14 } as const;
const lbl = { color: C.muted, fontSize: 12, marginTop: 14, marginBottom: 6 } as const;
