import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { Button, Field } from '../ds';
import { getBudget, setBudget, type Budget } from '../../lib/invoiceDb';
import { fmtHours } from '../../lib/hours';
import { friendlyError, notify, toast } from '../../lib/feedback';

// ============================================================
//  Presupuesto de horas del proyecto (v25, fase 1): cuánto va, y aviso al
//  80 % y al 100 % para el dueño y para quien anota.
// ============================================================

export function BudgetSheet({ visible, projectId, projectName, editable, onClose }: { visible: boolean; projectId: string; projectName: string; editable: boolean; onClose: () => void }) {
  const [b, setB] = useState<Budget | null>(null);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setB(null); setErr(null);
    getBudget(projectId).then((x) => { setB(x ?? { budget_minutes: null, used_minutes: 0 }); setTxt(x?.budget_minutes ? String(Math.round(x.budget_minutes / 60)) : ''); }).catch((e) => setErr(friendlyError(e)));
  }, [visible, projectId]);
  const pct = b?.budget_minutes ? b.used_minutes / b.budget_minutes : 0;
  async function save(hours: number | null) {
    setBusy(true);
    try { await setBudget(projectId, hours ? Math.round(hours * 60) : null); toast(hours ? `Presupuesto: ${hours} h` : 'Presupuesto quitado'); onClose(); }
    catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }
  const n = Number(txt.replace(',', '.'));
  return (
    <Sheet visible={visible} onClose={onClose} title="Presupuesto de horas" subtitle={`${projectName}. Suma las horas de todo el equipo (enfoque y a mano).`} maxWidth={460}
      footer={editable ? <>{b?.budget_minutes ? <Button label="Quitar" kind="ghost" onPress={() => save(null)} /> : null}<View style={{ flex: 1 }} />
        <Button label="Guardar" busy={busy} disabled={!(n >= 1 && n <= 10000)} onPress={() => save(n)} /></> : undefined}>
      {err && <Text style={{ color: C.badText, fontSize: 13 }}>{err}</Text>}
      {!b && !err && <ActivityIndicator color={C.brand} />}
      {b && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
            {b.budget_minutes ? `Van ${fmtHours(b.used_minutes)} de ${fmtHours(b.budget_minutes)} (${Math.round(pct * 100)} %)` : `Van ${fmtHours(b.used_minutes)}. Sin presupuesto.`}
          </Text>
          {b.budget_minutes ? (
            <View style={{ height: 8, borderRadius: 4, backgroundColor: C.surface2, overflow: 'hidden' }} accessibilityLabel={`${Math.round(pct * 100)} % del presupuesto`}>
              <View style={{ width: `${Math.min(1, pct) * 100}%`, height: 8, backgroundColor: pct >= 1 ? C.bad : pct >= 0.8 ? C.warn : C.good }} />
            </View>
          ) : null}
        </View>
      )}
      {editable ? (
        <Field label="Horas presupuestadas" value={txt} onChangeText={(t) => setTxt(t.replace(/[^\d,.]/g, '').slice(0, 6))} keyboardType="decimal-pad" placeholder="40"
          hint="Te avisamos al 80 % y al 100 %, a ti y al dueño del proyecto." />
      ) : <Text style={{ color: C.muted, fontSize: 13 }}>Solo quien edita el proyecto cambia el presupuesto.</Text>}
    </Sheet>
  );
}
