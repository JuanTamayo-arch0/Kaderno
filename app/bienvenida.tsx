import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, SUBJECT_COLORS, SUBJECT_ICONS } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { Subject, getSubjects, addSubject, addTask } from '../lib/db';
import { parseQuickAdd } from '../lib/quickAdd';
import { taskTypeList } from '../lib/taskTypes';
import { combine, fmtDue } from '../lib/time';
import { remindAt, remindDays } from '../lib/reminders';
import { getPushStatus, enablePush, type PushStatus } from '../lib/push';
import { notify, toast, friendlyError } from '../lib/feedback';
import { dataChanged } from '../lib/uiBus';
import { Button, Card, Dot } from '../components/ds';
import { KadernoMark } from '../components/SideNav';

// ============================================================
//  Bienvenida en tres pasos: materias, primeras entregas y avisos.
//  Pide lo mínimo para que "Hoy" no aparezca vacío la primera vez.
// ============================================================

const SUGGEST = ['Cálculo', 'Física', 'Química', 'Programación', 'Inglés', 'Estadística', 'Álgebra lineal', 'Ética'];

function Bienvenida() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [name, setName] = useState('');
  const [task, setTask] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [push, setPush] = useState<PushStatus>('unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getSubjects().then(setSubjects).catch(() => {}); getPushStatus().then(setPush).catch(() => {}); }, []);

  async function addSub(n: string) {
    const nm = n.trim(); if (!nm || subjects.some((s) => s.name.toLowerCase() === nm.toLowerCase())) return;
    setBusy(true);
    try {
      const i = subjects.length;
      await addSubject(nm, SUBJECT_COLORS[i % SUBJECT_COLORS.length], SUBJECT_ICONS[i % SUBJECT_ICONS.length], 0);
      setSubjects(await getSubjects()); setName('');
    } catch (e) { notify('No se pudo crear', friendlyError(e)); } finally { setBusy(false); }
  }
  const parsed = useMemo(() => task.trim() ? parseQuickAdd(task, subjects, taskTypeList()) : null, [task, subjects]);
  async function addT() {
    if (!parsed) return;
    setBusy(true);
    try {
      const choice = parsed.dueTime ? '1h' : 'evening';
      const at = remindAt(choice, parsed.dueDate, parsed.dueTime);
      const row = { title: parsed.title, subject_id: parsed.subjectId, type: parsed.typeKey ?? 'tarea', due_date: parsed.dueDate,
        due_at: parsed.dueDate && parsed.dueTime ? combine(parsed.dueDate, parsed.dueTime) : null, remind_days: remindDays(choice), remind_at: at?.toISOString() ?? null };
      await addTask(row);
      setAdded((a) => [...a, `${parsed.title}${fmtDue(row) ? ' · ' + fmtDue(row) : ''}`]); setTask('');
    } catch (e) { notify('No se pudo agregar', friendlyError(e)); } finally { setBusy(false); }
  }
  async function finish(to: string = '/') {
    await AsyncStorage.setItem('onboarded', '1').catch(() => {});
    dataChanged();
    router.replace(to as any);
  }

  const steps = ['Materias', 'Entregas', 'Avisos'];
  const input = (value: string, set: (v: string) => void, ph: string, onSubmit: () => void, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingLeft: 12 }}>
      <Ionicons name="add" size={20} color={C.muted} />
      <TextInput value={value} onChangeText={set} placeholder={ph} placeholderTextColor={C.muted} onSubmitEditing={onSubmit} autoFocus={Platform.OS === 'web'} accessibilityLabel={label}
        style={[{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 12, minHeight: 46 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
      {!!value.trim() && <Button label="Agregar" size="sm" onPress={onSubmit} busy={busy} style={{ marginRight: 6 }} />}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: insets.top + 24, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 560, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 }}>
            <KadernoMark size={32} />
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Kaderno</Text>
            <Pressable onPress={() => finish()} accessibilityRole="button" style={{ padding: 8 }}><Text style={{ color: C.muted, fontWeight: '600' }}>Saltar</Text></Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 22 }} accessibilityLabel={`Paso ${step + 1} de 3`}>
            {steps.map((s, i) => (
              <View key={s} style={{ flex: 1 }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= step ? C.brand : C.line }} />
                <Text style={{ color: i === step ? C.text : C.muted, fontSize: 12, fontWeight: '700', marginTop: 6 }}>{i + 1}. {s}</Text>
              </View>
            ))}
          </View>

          {step === 0 && (
            <>
              <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>¿Qué materias ves este semestre?</Text>
              <Text style={{ color: C.muted, fontSize: 14.5, marginTop: 6, marginBottom: 18, lineHeight: 21 }}>Con ellas se organizan tus tareas, notas, horario y calificaciones. Luego puedes cambiarles color, ícono y créditos.</Text>
              {input(name, setName, 'Nombre de la materia', () => addSub(name), 'Nombre de la materia')}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {SUGGEST.filter((s) => !subjects.some((x) => x.name.toLowerCase() === s.toLowerCase())).map((s) => (
                  <Pressable key={s} onPress={() => addSub(s)} accessibilityRole="button" accessibilityLabel={`Agregar ${s}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: C.line }}>
                    <Ionicons name="add" size={14} color={C.muted} /><Text style={{ color: C.text, fontSize: 13 }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
              {subjects.length > 0 && (
                <Card style={{ marginTop: 18, gap: 10 }}>
                  {subjects.map((s) => <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Dot color={s.color} size={10} /><Text style={{ color: C.text, fontSize: 15 }}>{s.name}</Text></View>)}
                </Card>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>Anota tus próximas entregas</Text>
              <Text style={{ color: C.muted, fontSize: 14.5, marginTop: 6, marginBottom: 18, lineHeight: 21 }}>Escríbelas como hablas: "parcial cálculo viernes 10am" o "informe física el 20/10". Kaderno entiende la materia, el día y la hora.</Text>
              {input(task, setTask, 'Ej: taller de química mañana', addT, 'Entrega')}
              {parsed && <Text style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>Se guarda como: <Text style={{ color: C.text, fontWeight: '700' }}>{parsed.title}</Text>{parsed.subjectId ? ` · ${subjects.find((s) => s.id === parsed.subjectId)?.name}` : ''}{parsed.dueDate ? ` · ${fmtDue({ due_date: parsed.dueDate, due_at: parsed.dueTime ? combine(parsed.dueDate, parsed.dueTime) : null })}` : ' · sin fecha'}</Text>}
              {added.length > 0 && <Card style={{ marginTop: 16, gap: 8 }}>{added.map((a, i) => <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Ionicons name="checkmark-circle" size={17} color={C.goodText} /><Text style={{ color: C.text }}>{a}</Text></View>)}</Card>}
              <Pressable onPress={() => finish('/importar')} style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityRole="link">
                <Ionicons name="download-outline" size={16} color={C.brand} />
                <Text style={{ color: C.brand, fontWeight: '700' }}>¿Tienes el cronograma del sílabo? Impórtalo completo</Text>
              </Pressable>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>Que no se te pase nada</Text>
              <Text style={{ color: C.muted, fontSize: 14.5, marginTop: 6, marginBottom: 18, lineHeight: 21 }}>Kaderno te avisa antes de cada entrega y cada mañana te dice qué tienes. También puedes cargar tu horario para ver la clase de ahora en Hoy.</Text>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="notifications-outline" size={22} color={C.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: '700' }}>Notificaciones</Text>
                  <Text style={{ color: C.muted, fontSize: 13 }}>{push === 'on' ? 'Activadas.' : push === 'needs-install' ? 'En iPhone, primero instala Kaderno en la pantalla de inicio.' : push === 'off' ? 'Recordatorios aunque la app esté cerrada.' : 'Las puedes activar después en Ajustes.'}</Text>
                </View>
                {push === 'off' && <Button label="Activar" size="sm" onPress={async () => { try { setPush(await enablePush()); } catch (e) { notify('No se pudieron activar', friendlyError(e)); } }} />}
                {push === 'on' && <Ionicons name="checkmark-circle" size={22} color={C.goodText} />}
              </Card>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }} onPress={() => finish('/horario')} accessibilityLabel="Cargar mi horario">
                <Ionicons name="grid-outline" size={22} color={C.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: '700' }}>Cargar mi horario</Text>
                  <Text style={{ color: C.muted, fontSize: 13 }}>Toca cada franja y elige la materia.</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={C.muted} />
              </Card>
            </>
          )}

          <View style={{ flex: 1, minHeight: 24 }} />
          <View style={{ flexDirection: 'row', gap: 10, paddingBottom: insets.bottom + 8 }}>
            {step > 0 && <Button label="Atrás" kind="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />}
            {step < 2
              ? <Button label={step === 0 && !subjects.length ? 'Lo hago después' : 'Siguiente'} onPress={() => setStep(step + 1)} style={{ flex: 2 }} kind={step === 0 && !subjects.length ? 'secondary' : 'primary'} />
              : <Button label="Ir a Hoy" icon="arrow-forward" onPress={() => { toast('Todo listo. ¡Buen semestre!', { tone: 'good' }); finish(); }} style={{ flex: 2 }} />}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export default function BienvenidaProtegida() {
  return <RequireAuth><Bienvenida /></RequireAuth>;
}
