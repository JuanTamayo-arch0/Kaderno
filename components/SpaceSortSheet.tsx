import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { C } from '../lib/theme';
import { Sheet } from './cards/CardForms';
import { Button } from './ds';
import { SubjectIcon } from './SubjectIcon';
import { fetchPrefs, getSubjects, savePrefs, setSubjectsSpace, type Subject } from '../lib/db';
import { useMode, type Space } from '../lib/mode';
import { needsSorting, suggestSpace } from '../lib/spaces';
import { dataChanged } from '../lib/uiBus';
import { friendlyError, notify, toast } from '../lib/feedback';

// ============================================================
//  Ordenar en espacios (v26, fase 2), una sola vez: quien ya tenía "Los dos"
//  dice qué materia o área es de Estudio y cuál de Trabajo. Viene con una
//  sugerencia (créditos = Estudio; tarifa, cliente o plantilla de acta =
//  Trabajo). Después se cambia en cada una, con Editar.
// ============================================================

export function SpaceSortSheet() {
  const { mode } = useMode();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [pick, setPick] = useState<Record<string, Space>>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'ambos') { setOpen(false); return; }
    let cancel = false;
    (async () => {
      const prefs = await fetchPrefs().catch(() => null);
      if (cancel || prefs?.spacesSorted) return;
      const subs = await getSubjects().catch(() => [] as Subject[]);
      if (cancel || !needsSorting(subs, 'ambos')) return;
      const rates: Record<string, number> = prefs?.work?.rates ?? {};
      let clientSubjects = new Set<string>();
      try {
        const { getClients } = await import('../lib/invoiceDb');
        clientSubjects = new Set((await getClients()).flatMap((c) => c.subject_ids ?? []));
      } catch { /* sin clientes */ }
      if (cancel) return;
      const initial: Record<string, Space> = {};
      subs.forEach((s) => { initial[s.id] = s.space === 'estudio' || s.space === 'trabajo' ? s.space : suggestSpace(s, { rated: !!rates[s.id], client: clientSubjects.has(s.id) }); });
      setSubjects(subs); setPick(initial); setOpen(true);
    })();
    return () => { cancel = true; };
  }, [mode]);

  async function save() {
    if (!subjects) return;
    setBusy(true);
    try {
      const study = subjects.filter((s) => pick[s.id] !== 'trabajo').map((s) => s.id);
      const work = subjects.filter((s) => pick[s.id] === 'trabajo').map((s) => s.id);
      const ok = (await setSubjectsSpace(study, 'estudio')) && (await setSubjectsSpace(work, 'trabajo'));
      if (!ok) { notify('Falta un paso en el servidor', 'Para separar Estudio y Trabajo hay que correr schema_v25.sql en Supabase. Mientras tanto, todo se ve junto.'); }
      await savePrefs({ spacesSorted: true });
      setOpen(false);
      if (ok) toast(`Listo: ${study.length} en Estudio y ${work.length} en Trabajo`, { tone: 'good' });
      dataChanged();
    } catch (e) { notify('No se pudo guardar', friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function later() {
    setOpen(false);
    // Se vuelve a preguntar en la próxima sesión; mientras tanto, lo que no tiene espacio cuenta como Estudio.
  }

  if (!open || !subjects) return null;
  const nWork = subjects.filter((s) => pick[s.id] === 'trabajo').length;
  return (
    <Sheet visible={open} onClose={later} title="¿Qué es de Estudio y qué de Trabajo?" maxWidth={560}
      subtitle="Desde ahora cada espacio muestra solo lo suyo. Revisa la sugerencia; después lo cambias en cada una con Editar."
      footer={<>
        <Button label="Más tarde" kind="ghost" onPress={later} />
        <View style={{ flex: 1 }} />
        <Button label={`Guardar (${subjects.length - nWork} Estudio, ${nWork} Trabajo)`} icon="checkmark" busy={busy} onPress={save} />
      </>}>
      <View style={{ gap: 8 }}>
        {subjects.map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}>
            <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: s.color + '26', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <SubjectIcon icon={s.icon} box={32} emoji={16} />
            </View>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>{s.name}</Text>
            <View style={{ flexDirection: 'row', padding: 3, gap: 3, borderRadius: 10, backgroundColor: C.surface2 }} accessibilityRole="radiogroup" accessibilityLabel={`Espacio de ${s.name}`}>
              {(['estudio', 'trabajo'] as Space[]).map((k) => {
                const on = pick[s.id] === k;
                return (
                  <Pressable key={k} onPress={() => setPick((p) => ({ ...p, [s.id]: k }))} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, minHeight: 32, justifyContent: 'center', backgroundColor: on ? C.brand : 'transparent' }}>
                    <Text style={{ color: on ? C.onBrand : C.muted, fontSize: 12.5, fontWeight: '700' }}>{k === 'trabajo' ? 'Trabajo' : 'Estudio'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
