import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../lib/theme';
import { useResponsive, SIDEBAR_W } from '../lib/responsive';
import { subscribeFeedback, dismissToast, flushPendingDeletes, type DialogReq, type ToastReq } from '../lib/feedback';
import { Button } from './ds';

// Dibuja los avisos, confirmaciones y toasts de lib/feedback.ts.
export function FeedbackHost() {
  const [dialogs, setDialogs] = useState<DialogReq[]>([]);
  const [toasts, setToasts] = useState<ToastReq[]>([]);
  useEffect(() => subscribeFeedback((s) => { setDialogs(s.dialogs); setToasts(s.toasts); }), []);

  // Si se cierra la pestaña con un borrado pendiente, se confirma.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = () => flushPendingDeletes();
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, []);

  const d = dialogs[0];
  return (
    <>
      {d && <DialogView key={d.id} req={d} />}
      <ToastStack toasts={toasts} />
    </>
  );
}

function DialogView({ req }: { req: DialogReq }) {
  const cancelValue = req.buttons.find((b) => b.tone === 'plain')?.value ?? true;
  // Escape cancela y Enter acepta (web).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); req.resolve(cancelValue); }
      if (e.key === 'Enter') { e.preventDefault(); req.resolve(req.buttons[req.buttons.length - 1].value); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [req, cancelValue]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => req.resolve(cancelValue)}>
      <Pressable onPress={() => req.resolve(cancelValue)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={() => {}} accessibilityRole="alert" accessibilityViewIsModal
          style={{ width: '100%', maxWidth: 420, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 20 }}>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>{req.title}</Text>
          {!!req.message && <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 8 }}>{req.message}</Text>}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            {req.buttons.map((b, i) => (
              <Button key={i} label={b.label} onPress={() => req.resolve(b.value)}
                kind={b.tone === 'danger' ? 'danger' : b.tone === 'plain' ? 'secondary' : 'primary'} />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ToastStack({ toasts }: { toasts: ToastReq[] }) {
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: isWide ? SIDEBAR_W : 0, right: 0, bottom: (isWide ? 24 : 84) + insets.bottom, alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
      {toasts.map((t) => <ToastView key={t.id} t={t} />)}
    </View>
  );
}

function ToastView({ t }: { t: ToastReq }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timer.current = setTimeout(() => dismissToast(t.id, 'timeout'), t.duration);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [t]);
  const accent = t.tone === 'bad' ? C.bad : t.tone === 'good' ? C.good : C.brand;
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 520, width: '100%', backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderLeftWidth: 4, borderLeftColor: accent, borderRadius: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
      <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{t.message}</Text>
      {t.actionLabel ? (
        <Pressable onPress={() => dismissToast(t.id, 'action')} accessibilityRole="button" style={{ paddingVertical: 8, paddingHorizontal: 10, minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ color: C.brand, fontWeight: '800', fontSize: 14 }}>{t.actionLabel}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => dismissToast(t.id, 'close')} accessibilityLabel="Cerrar aviso" style={{ padding: 8 }}>
          <Text style={{ color: C.muted, fontSize: 16 }}>×</Text>
        </Pressable>
      )}
    </View>
  );
}
