import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { C } from '../../lib/theme';
import { Button } from '../ds';
import { Sheet } from '../cards/CardForms';
import { deleteTask, setSomeday, type Task } from '../../lib/db';
import { toast, friendlyError } from '../../lib/feedback';
import { dataChanged } from '../../lib/uiBus';
import { refreshNavCounts } from '../../lib/navCounts';
import { t, trn } from '../../lib/i18n';
export { sampleSomeday } from '../../lib/someday';

// ============================================================
//  "Algún día" (v27, fase 4, de GTD): ideas sin compromiso. No aparecen en
//  Hoy ni cuentan como bandeja por ordenar. "Rescatar" la devuelve a la
//  bandeja para darle día; "Borrar" la suelta del todo.
// ============================================================

/** Una fila con Rescatar y Borrar (la usan la hoja y el ritual del lunes). */
export function SomedayRow({ t, onDone }: { t: Task; onDone: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try { await fn(); onDone(t.id); toast(msg, { tone: 'good' }); dataChanged(); refreshNavCounts(true); }
    catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setBusy(false); }
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.line }}>
      <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={2}>{t.title}</Text>
      <Button label={trn('Rescatar')} size="sm" kind="secondary" disabled={busy} onPress={() => run(() => setSomeday(t.id, false), trn('De vuelta en la bandeja para darle día'))} />
      <Button label={trn('Borrar')} size="sm" kind="ghost" disabled={busy} onPress={() => run(() => deleteTask(t.id), trn('Borrada'))} />
    </View>
  );
}

export function SomedaySheet({ visible, items, onClose }: { visible: boolean; items: Task[]; onClose: () => void }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  useEffect(() => { if (visible) setGone(new Set()); }, [visible]);
  const list = items.filter((t) => !gone.has(t.id));
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Algún día')} subtitle={t('Ideas sin compromiso: no aparecen en Hoy')}
      footer={<Button label={t('Listo')} onPress={onClose} style={{ flex: 1 }} />}>
      {list.length === 0
        ? <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center', paddingVertical: 16 }}>{t('Nada guardado para algún día.')}</Text>
        : list.map((t) => <SomedayRow key={t.id} t={t} onDone={(id) => setGone((g) => new Set(g).add(id))} />)}
    </Sheet>
  );
}
