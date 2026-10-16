import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, SUBJECT_COLORS, SUBJECT_ICONS } from '../lib/theme';
import { Subject, addSubject, updateSubject, archiveSubject, restoreSubject, addGrade } from '../lib/db';
import { confirm, notify, toast, friendlyError } from '../lib/feedback';
import { Button, Field, IconButton } from './ds';
import { SubjectIcon, isPhotoIcon } from './SubjectIcon';

// Se carga al usarlo: así expo-image-picker no se descarga al abrir la app.
const loadPicker = () => import('expo-image-picker');
// Se precarga en segundo plano poco después de abrir, para que al tocar "subir foto" ya esté listo.
if (typeof window !== 'undefined') setTimeout(() => { Promise.resolve().then(loadPicker).catch(() => {}); }, 4000);

// Crear, editar o archivar una materia.
export function SubjectModal({ visible, editSubject, onClose, onSaved, onArchived }: {
  visible: boolean; editSubject?: Subject | null; onClose: () => void; onSaved: () => void; onArchived?: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [hexText, setHexText] = useState(SUBJECT_COLORS[0]);
  const [icon, setIcon] = useState(SUBJECT_ICONS[0]);
  const [credits, setCredits] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const s = editSubject;
    setName(s?.name ?? ''); setColor(s?.color ?? SUBJECT_COLORS[0]); setHexText(s?.color ?? SUBJECT_COLORS[0]);
    setIcon(s?.icon ?? SUBJECT_ICONS[0]); setCredits(s?.credits ? String(s.credits) : ''); setErr(null);
  }, [visible, editSubject]);

  function onHex(t: string) {
    let v = t.trim(); if (v && !v.startsWith('#')) v = '#' + v; v = v.slice(0, 7);
    setHexText(v); if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v);
  }
  async function pickIcon() {
    try {
      const res = await (await loadPicker()).launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const uri = a.uri?.startsWith('data:') ? a.uri : (a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
      if (uri) setIcon(uri);
    } catch (e) { notify('No se pudo cargar la imagen', friendlyError(e)); }
  }
  async function save() {
    if (!name.trim()) { setErr('Escribe el nombre de la materia.'); return; }
    setBusy(true);
    try {
      const cr = parseInt(credits || '0', 10) || 0;
      if (editSubject) await updateSubject(editSubject.id, { name: name.trim(), color, icon, credits: cr });
      else await addSubject(name.trim(), color, icon, cr);
      toast(editSubject ? 'Materia guardada' : `Materia creada: ${name.trim()}`, { tone: 'good' });
      onSaved();
    } catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!editSubject) return;
    const ok = await confirm(`¿Archivar ${editSubject.name}?`, 'Desaparece de tus listas, pero sus tareas, notas y calificaciones se conservan. Puedes restaurarla desde la Papelera.', 'Archivar');
    if (!ok) return;
    try {
      await archiveSubject(editSubject.id);
      const id = editSubject.id;
      toast(`${editSubject.name} archivada`, { actionLabel: 'Deshacer', onAction: () => { restoreSubject(id).then(onSaved).catch(() => {}); } });
      onArchived?.();
    } catch (e) { notify('No se pudo archivar', friendlyError(e)); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }} accessibilityViewIsModal style={{ backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 440, maxHeight: '90%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', flex: 1 }} accessibilityRole="header">{editSubject ? 'Editar materia' : 'Nueva materia'}</Text>
            <IconButton icon="close" label="Cerrar" onPress={onClose} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Field label="Nombre" value={name} onChangeText={(v) => { setName(v); setErr(null); }} placeholder="Ej: Física" error={err} autoFocus={!editSubject} />
            <Field label="Créditos" value={credits} onChangeText={(v) => setCredits(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="Ej: 3" hint="Se usan para el promedio del semestre." />
            <Text style={lbl()}>Color</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {SUBJECT_COLORS.map((c) => {
                const on = color.toLowerCase() === c.toLowerCase();
                return <Pressable key={c} onPress={() => { setColor(c); setHexText(c); }} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Color ${c}`}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: 3, borderColor: on ? C.text : 'transparent' }} />;
              })}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color, borderWidth: 1, borderColor: C.line }} />
              <TextInput value={hexText} onChangeText={onHex} autoCapitalize="none" autoCorrect={false} placeholder="#4F8CFF" placeholderTextColor={C.muted} maxLength={7} accessibilityLabel="Color en hexadecimal"
                style={{ flex: 1, backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, padding: 11, fontSize: 14 }} />
            </View>
            <Text style={lbl()}>Ícono</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {SUBJECT_ICONS.map((i) => (
                <Pressable key={i} onPress={() => setIcon(i)} accessibilityRole="radio" accessibilityState={{ checked: icon === i }} accessibilityLabel={`Ícono ${i}`}
                  style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: icon === i ? C.brand : 'transparent' }}>
                  <Text style={{ fontSize: 18 }}>{i}</Text>
                </Pressable>
              ))}
              <Pressable onPress={pickIcon} accessibilityRole="button" accessibilityLabel="Usar una foto como ícono"
                style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: isPhotoIcon(icon) ? C.brand : C.line, borderStyle: isPhotoIcon(icon) ? 'solid' : 'dashed', overflow: 'hidden' }}>
                {isPhotoIcon(icon) ? <SubjectIcon icon={icon} box={42} emoji={18} /> : <Ionicons name="image-outline" size={18} color={C.muted} />}
              </Pressable>
            </View>
            {editSubject && (
              <Pressable onPress={archive} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingVertical: 8 }}>
                <Ionicons name="archive-outline" size={18} color={C.badText} />
                <Text style={{ color: C.badText, fontWeight: '700' }}>Archivar materia</Text>
              </Pressable>
            )}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Button label="Cancelar" kind="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button label={editSubject ? 'Guardar' : 'Crear materia'} onPress={save} busy={busy} style={{ flex: 2 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function GradeModal({ visible, subjectId, defaultScale = 5, onClose, onSaved }: { visible: boolean; subjectId: string; defaultScale?: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState(String(defaultScale));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (visible) { setName(''); setWeight(''); setScore(''); setMaxScore(String(defaultScale)); setErr(null); } }, [visible, defaultScale]);
  const num = (v: string) => parseFloat(v.replace(',', '.'));
  async function save() {
    if (!name.trim()) { setErr('Escribe el nombre de la evaluación.'); return; }
    const w = num(weight), mx = num(maxScore || '5'), sc = score ? num(score) : null;
    if (!(w > 0 && w <= 100)) { setErr('El peso va de 1 a 100 %.'); return; }
    if (sc != null && (isNaN(sc) || sc < 0 || sc > mx)) { setErr(`La nota va de 0 a ${mx}.`); return; }
    setBusy(true);
    try { await addGrade({ subject_id: subjectId, name: name.trim(), weight: w, score: sc, max_score: mx }); toast('Evaluación agregada', { tone: 'good' }); onSaved(); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} dataSet={{ anim: 'sheet' }} style={{ backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 460 }}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Nueva evaluación</Text>
          <Field label="Nombre" value={name} onChangeText={setName} placeholder="Ej: Parcial 1" autoFocus />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Peso (%)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="30" style={{ flex: 1 }} />
            <Field label="Nota" value={score} onChangeText={setScore} keyboardType="decimal-pad" placeholder="Pendiente" style={{ flex: 1 }} />
            <Field label="Sobre" value={maxScore} onChangeText={setMaxScore} keyboardType="decimal-pad" placeholder="5" style={{ flex: 1 }} />
          </View>
          {!!err && <Text style={{ color: C.badText, fontSize: 13, marginBottom: 6 }}>{err}</Text>}
          <Text style={{ color: C.muted, fontSize: 12 }}>Deja la nota vacía si aún no te la han dado: sirve para calcular cuánto necesitas.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Button label="Cancelar" kind="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button label="Guardar" onPress={save} busy={busy} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function lbl() { return { color: C.muted, fontSize: 12.5, fontWeight: '600' as const, marginTop: 4, marginBottom: 8 }; }
