import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, RAD } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { useSheetDrag } from '../../lib/sheetDrag';
import type { Subject } from '../../lib/db';
import { cardError, convertKind, type CardKind, type Draft } from '../../lib/cards';
import { Button, focusRingStyle } from '../ds';
import { SubjectPicker } from '../SubjectPicker';
import { CardText } from './CardText';
import { t } from '../../lib/i18n';

// ============================================================
//  Formularios de tarjetas: el editor de una tarjeta (nueva o
//  existente) y la hoja "Revisa tus tarjetas" que se abre antes de
//  guardar lo que propone la IA.
// ============================================================

/** Marco: hoja abajo en el celular, diálogo en el computador. */
export function Sheet({ visible, onClose, title, subtitle, children, footer, maxWidth = 620 }: {
  visible: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; maxWidth?: number;
}) {
  const { isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [visible, onClose]);
  // v26, fase 4 (compartido desde v29): en el celular, la hoja se cierra arrastrándola hacia abajo desde el encabezado.
  const drag = useSheetDrag(visible, onClose);
  return (
    <Modal visible={visible} transparent animationType={isWide || Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: isWide ? 'center' : 'flex-end', alignItems: isWide ? 'center' : 'stretch', padding: isWide ? 24 : 0 }}>
        <Animated.View ref={drag.ref} onLayout={drag.onLayout} {...(isWide ? {} : drag.handlers)} style={isWide ? { width: '100%', maxWidth, maxHeight: '90%' } : [{ maxHeight: '94%' }, drag.style]}>
        <Pressable onPress={() => {}} accessibilityViewIsModal accessibilityLabel={title} dataSet={{ anim: 'sheet' }}
          style={isWide
            ? { width: '100%', flexShrink: 1, backgroundColor: C.surface, borderRadius: RAD.sheet, borderWidth: 1, borderColor: C.line }
            : { flexShrink: 1, backgroundColor: C.surface, borderTopLeftRadius: RAD.sheetTop, borderTopRightRadius: RAD.sheetTop, borderTopWidth: 1, borderColor: C.line, paddingBottom: insets.bottom }}>
          <View>
            {!isWide && <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: C.line, marginTop: 8 }} accessibilityElementsHidden importantForAccessibility="no" />}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 18, paddingTop: isWide ? 18 : 10, paddingBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text dataSet={{ head: '1' }} style={{ color: C.text, fontSize: 18, fontWeight: '800' }} accessibilityRole="header">{title}</Text>
                {!!subtitle && <Text style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>{subtitle}</Text>}
              </View>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Cerrar')} hitSlop={8}><Ionicons name="close" size={22} color={C.muted} /></Pressable>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12, gap: 12 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: C.line }}>{footer}</View> : null}
        </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function KindSwitch({ value, onChange }: { value: CardKind; onChange: (k: CardKind) => void }) {
  const item = (k: CardKind, label: string) => {
    const on = value === k;
    return (
      <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}
        style={({ focused }: any) => [{ paddingHorizontal: 12, height: 30, borderRadius: 8, justifyContent: 'center', backgroundColor: on ? C.surface : 'transparent', borderWidth: on ? 1 : 0, borderColor: C.line }, focused ? focusRingStyle() : null]}>
        <Text style={{ color: on ? C.text : C.muted, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('Tipo de tarjeta')} style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 10, backgroundColor: C.surface2, alignSelf: 'flex-start' }}>
      {item('basic', t('Pregunta'))}{item('cloze', t('Completar'))}
    </View>
  );
}

function Input({ label, value, onChange, placeholder, autoFocus, minHeight = 56 }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; autoFocus?: boolean; minHeight?: number }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} multiline placeholder={placeholder} placeholderTextColor={C.muted} autoFocus={autoFocus} accessibilityLabel={label}
        style={{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, paddingHorizontal: 12, paddingVertical: 10, minHeight, fontSize: 14.5, textAlignVertical: 'top' }} />
    </View>
  );
}

/** Los campos de una tarjeta (tipo, anverso, reverso y vista previa si hay fórmulas). */
export function CardFields({ value, onChange, autoFocus }: { value: { kind: CardKind; front: string; back: string }; onChange: (v: { kind: CardKind; front: string; back: string }) => void; autoFocus?: boolean }) {
  const hasMath = /\$/.test(value.front + value.back);
  return (
    <View style={{ gap: 10 }}>
      <KindSwitch value={value.kind} onChange={(k) => onChange(convertKind(value, k))} />
      {value.kind === 'cloze' ? (
        <Input label={t('Frase (marca con {{ }} lo que se oculta)')} value={value.front} onChange={(front) => onChange({ ...value, front })}
          placeholder={t('La unidad {{FRL}} filtra, regula y lubrica el aire')} autoFocus={autoFocus} minHeight={64} />
      ) : (
        <>
          <Input label={t('Pregunta')} value={value.front} onChange={(front) => onChange({ ...value, front })} placeholder={t('¿Qué hace la unidad FRL?')} autoFocus={autoFocus} />
          <Input label={t('Respuesta')} value={value.back} onChange={(back) => onChange({ ...value, back })} placeholder={t('Filtra, regula y lubrica el aire')} minHeight={64} />
        </>
      )}
      {hasMath && (
        <View style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.line, gap: 6 }}>
          <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '700' }}>{t('VISTA PREVIA')}</Text>
          <CardText text={value.front} kind={value.kind} reveal size={15} align="left" />
          {value.kind === 'basic' && !!value.back && <CardText text={value.back} size={14} align="left" color={C.muted} />}
        </View>
      )}
      <Text style={{ color: C.muted, fontSize: 11.5 }}>{t('Fórmulas con $...$, por ejemplo $F = P \\cdot A$.')}</Text>
    </View>
  );
}

/** Nueva tarjeta o editar una existente. */
export function CardEditor({ visible, initial, subjects, subjectId, onClose, onSave, title }: {
  visible: boolean; initial: { kind: CardKind; front: string; back: string } | null; subjects: Subject[]; subjectId: string | null;
  onClose: () => void; onSave: (v: { kind: CardKind; front: string; back: string; subject_id: string | null }, more: boolean) => Promise<void>; title?: string;
}) {
  const [v, setV] = useState({ kind: 'basic' as CardKind, front: '', back: '' });
  const [sid, setSid] = useState<string | null>(subjectId);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setV(initial ?? { kind: 'basic', front: '', back: '' }); setSid(subjectId); setErr(null); } }, [visible]);
  const save = async (more: boolean) => {
    const e = cardError(v);
    if (e) { setErr(e); return; }
    setBusy(true);
    try { await onSave({ ...v, subject_id: sid }, more); if (more) setV({ kind: v.kind, front: '', back: '' }); }
    catch (x: any) { setErr(String(x?.message ?? x)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? (initial ? t('Editar tarjeta') : t('Nueva tarjeta'))}
      footer={<>
        <Button label={t('Cancelar')} kind="secondary" onPress={onClose} style={{ flex: 1 }} />
        {!initial && <Button label={t('Guardar y otra')} kind="secondary" onPress={() => save(true)} style={{ flex: 1 }} />}
        <Button label={t('Guardar')} onPress={() => save(false)} busy={busy} style={{ flex: 1 }} />
      </>}>
      <CardFields value={v} onChange={(x) => { setV(x); setErr(null); }} autoFocus />
      <View style={{ gap: 6 }}>
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{t('Materia')}</Text>
        <SubjectPicker subjects={subjects} value={sid} onChange={setSid} />
      </View>
      {!!err && <Text style={{ color: C.badText, fontSize: 13 }} accessibilityLiveRegion="polite">{err}</Text>}
    </Sheet>
  );
}

/**
 * "Revisa tus tarjetas": lo que propone la IA, antes de guardar nada.
 * Cada una se puede corregir, cambiar de tipo, rehacer o quitar.
 */
export function ReviewSheet({ visible, drafts, onChange, onClose, onSave, onRedo, busyKey, saving, source }: {
  visible: boolean; drafts: Draft[]; onChange: (d: Draft[]) => void; onClose: () => void;
  onSave: (keep: Draft[]) => void; onRedo: (key: string) => void; busyKey: string | null; saving: boolean; source?: string;
}) {
  const keep = drafts.filter((d) => d.keep && !cardError(d));
  const set = (key: string, patch: Partial<Draft>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Revisa tus tarjetas')} maxWidth={680}
      subtitle={t('{v}Corrige lo que quieras: no se guarda nada hasta que toques Guardar.', { v: source ? t('De "{source}". ', { source }) : '' })}
      footer={<>
        <Button label={t('Agregar una a mano')} kind="secondary" icon="add" onPress={() => onChange([...drafts, { key: `m${Date.now()}`, kind: 'basic', front: '', back: '', keep: true }])} />
        <View style={{ flex: 1 }} />
        <Button label={keep.length ? t('Guardar {length} {v}', { length: keep.length, v: keep.length === 1 ? t('tarjeta') : t('tarjetas') }) : t('Elige alguna para guardar')} onPress={() => onSave(keep)} disabled={!keep.length} busy={saving} />
      </>}>
      {drafts.map((d, i) => {
        const err = d.front || d.back ? cardError(d) : null;
        return (
          <View key={d.key} style={{ padding: 14, borderRadius: 14, borderWidth: 1, borderColor: d.keep ? C.line : C.surface2, backgroundColor: d.keep ? C.surface : C.bg, gap: 10, opacity: d.keep ? 1 : 0.75 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable onPress={() => set(d.key, { keep: !d.keep })} accessibilityRole="checkbox" accessibilityState={{ checked: d.keep }} accessibilityLabel={t('Guardar la tarjeta {v}', { v: i + 1 })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
                <Ionicons name={d.keep ? 'checkbox' : 'square-outline'} size={22} color={d.keep ? C.brand : C.muted} />
                <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>{t('Tarjeta {v}', { v: i + 1 })}</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => onRedo(d.key)} disabled={!!busyKey} accessibilityRole="button" accessibilityLabel={t('Rehacer la tarjeta {v}', { v: i + 1 })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, minHeight: 32, opacity: busyKey && busyKey !== d.key ? 0.4 : 1 }}>
                <Ionicons name={busyKey === d.key ? 'hourglass-outline' : 'refresh'} size={15} color={C.muted} />
                <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>{busyKey === d.key ? t('Rehaciendo…') : t('Rehacer esta')}</Text>
              </Pressable>
              <Pressable onPress={() => onChange(drafts.filter((x) => x.key !== d.key))} accessibilityRole="button" accessibilityLabel={t('Quitar la tarjeta {v}', { v: i + 1 })} hitSlop={6}
                style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash-outline" size={16} color={C.muted} />
              </Pressable>
            </View>
            {d.similarTo && (
              <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#2a2416', borderWidth: 1, borderColor: '#4a3d1f' }}>
                <Ionicons name="copy-outline" size={15} color={C.warnText} style={{ marginTop: 1 }} />
                <Text style={{ color: '#e2d2a8', fontSize: 12.5, flex: 1 }}>{t('Ya tienes una parecida: "{slice}"', { slice: d.similarTo.front.slice(0, 120) })}</Text>
              </View>
            )}
            <CardFields value={d} onChange={(v) => set(d.key, { ...v, keep: d.keep || !!(v.front && (v.kind === 'cloze' || v.back)) })} />
            {!!err && <Text style={{ color: C.badText, fontSize: 12.5 }}>{err}</Text>}
          </View>
        );
      })}
      {!drafts.length && <Text style={{ color: C.muted, fontSize: 13.5 }}>{t('No quedó ninguna. Agrega una a mano o cierra.')}</Text>}
    </Sheet>
  );
}
