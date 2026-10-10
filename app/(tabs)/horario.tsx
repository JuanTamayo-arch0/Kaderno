import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, uiScheme } from '../../lib/theme';
import { useResponsive, SIDEBAR_W } from '../../lib/responsive';
import { confirm, notify } from '../../lib/confirm';
import { Subject, Slot, getSubjects, getSchedule, setSlot, clearSlot, remapSlots } from '../../lib/db';
import {
  DAY_NAMES, DEFAULT_SCHEDULE, SCHEDULE, ScheduleCfg, TimeBlock,
  blockLabel, blockLabelLong, clampHHMM, currentBlocks, currentDays, generateBlocks,
  loadScheduleNative, newBlockId, overlappingIds, planRemap, saveSchedule, sortBlocks, toMinutes,
} from '../../lib/schedule';
import { SubjectIcon } from '../../components/SubjectIcon';
import { Header } from '../../components/ui';

// ============================================================
//  Horario.
//  Los bloques de hora ya no están escritos a mano: cada quien arma los suyos
//  (generador por rango + duración, o uno por uno), elige de 1 a 7 días y si
//  quiere ver las horas en 12 o 24 h. Al cambiar los bloques las clases ya
//  guardadas se mueven con ellos (se comparan por id, no por posición); sólo se
//  borran las de los bloques que el usuario quitó, y se avisa antes.
// ============================================================

export default function Horario() {
  const { isWide } = useResponsive();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [edit, setEdit] = useState<{ day: number; slot: number } | null>(null);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [rev, setRev] = useState(0);

  const load = useCallback(async () => {
    try {
      await loadScheduleNative();
      const [s, sc] = await Promise.all([getSubjects(), getSchedule()]);
      setSubjects(s); setSlots(sc); setRev((n) => n + 1);
    } catch (e: any) { notify('Error', e?.message ?? 'No se pudo cargar el horario'); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const blocks = useMemo(() => currentBlocks(), [rev, cfgOpen]);
  const days = useMemo(() => currentDays(), [rev, cfgOpen]);
  const fmt24 = useMemo(() => SCHEDULE.fmt24, [rev, cfgOpen]);

  const at = (d: number, s: number) => slots.find((x) => x.day === d && x.slot === s);
  const subjOf = (id: string) => subjects.find((s) => s.id === id);

  // Clases que quedaron fuera de la cuadrícula (bloque o día que ya no existe).
  const orphans = slots.filter((s) => s.slot >= blocks.length || s.day >= days.length);

  async function assign(subjectId: string) {
    if (!edit) return;
    try { await setSlot(edit.day, edit.slot, subjectId); setEdit(null); load(); }
    catch (e: any) { notify('No se pudo asignar', e?.message ?? ''); }
  }
  async function remove() {
    if (!edit) return;
    try { await clearSlot(edit.day, edit.slot); setEdit(null); load(); }
    catch (e: any) { notify('No se pudo quitar', e?.message ?? ''); }
  }

  async function cleanOrphans() {
    if (!orphans.length) return;
    if (!(await confirm(`¿Quitar ${orphans.length} ${orphans.length === 1 ? 'clase' : 'clases'} sueltas?`,
      'Están en bloques o días que ya no aparecen en tu horario.', 'Quitar'))) return;
    try { await remapSlots(orphans.map((o) => ({ id: o.id, newSlot: null }))); load(); }
    catch (e: any) { notify('No se pudo limpiar', e?.message ?? ''); }
  }

  // Guarda la nueva configuración y arrastra las clases al bloque que les toca.
  async function applyCfg(next: ScheduleCfg) {
    const old = currentBlocks();
    const cfg: ScheduleCfg = { ...next, blocks: sortBlocks(next.blocks) };
    const plan = planRemap(old, cfg.blocks);
    const removedSet = new Set(plan.removedSlots);
    const moveMap = new Map(plan.moves.map((m) => [m.fromSlot, m.toSlot]));

    const lost = slots.filter((s) => removedSet.has(s.slot) || s.day >= cfg.days);
    if (lost.length) {
      const ok = await confirm(
        `Se quitarán ${lost.length} ${lost.length === 1 ? 'clase' : 'clases'}`,
        'Los bloques o días que quitaste tenían clases asignadas. Las demás se conservan y se mueven contigo.',
        'Aplicar',
      );
      if (!ok) return;
    }

    const rows: { id: string; newSlot: number | null }[] = [];
    for (const s of slots) {
      if (removedSet.has(s.slot) || s.day >= cfg.days) { rows.push({ id: s.id, newSlot: null }); continue; }
      const to = moveMap.get(s.slot);
      if (to !== undefined) rows.push({ id: s.id, newSlot: to });
    }

    try {
      await saveSchedule(cfg);
      if (rows.length) await remapSlots(rows);
      setCfgOpen(false);
      setRev((n) => n + 1);
      load();
    } catch (e: any) { notify('No se pudo guardar el horario', e?.message ?? ''); }
  }

  const cfgButton = (
    <Pressable onPress={() => setCfgOpen(true)} hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}>
      <Ionicons name="options-outline" size={15} color={C.muted} />
      <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>Ajustar bloques</Text>
    </Pressable>
  );

  const orphanNotice = orphans.length > 0 ? (
    <Pressable onPress={cleanOrphans}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.warn + '1a', borderColor: C.warn + '55', borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12 }}>
      <Ionicons name="alert-circle-outline" size={16} color={C.warn} />
      <Text style={{ color: C.text, fontSize: 12.5, flex: 1 }}>
        {orphans.length} {orphans.length === 1 ? 'clase quedó' : 'clases quedaron'} fuera de la cuadrícula.
      </Text>
      <Text style={{ color: C.warn, fontSize: 12.5, fontWeight: '700' }}>Quitar</Text>
    </Pressable>
  ) : null;

  const picker = (
    <>
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>
        {edit ? `${DAY_NAMES[edit.day]} · ${blocks[edit.slot] ? blockLabelLong(blocks[edit.slot], fmt24) : `Bloque ${edit.slot + 1}`}` : ''}
      </Text>
      {subjects.length === 0 && <Text style={{ color: C.muted }}>Crea materias primero.</Text>}
      {subjects.map((s) => (
        <Pressable key={s.id} onPress={() => assign(s.id)} style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
          backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, marginBottom: 8,
        }}>
          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: s.color + '33', alignItems: 'center', justifyContent: 'center' }}>
            <SubjectIcon icon={s.icon} box={26} emoji={15} />
          </View>
          <Text style={{ color: C.text }}>{s.name}</Text>
        </Pressable>
      ))}
      <Pressable onPress={remove} style={{ alignItems: 'center', padding: 12, marginTop: 4 }}>
        <Text style={{ color: C.bad }}>Quitar clase</Text>
      </Pressable>
      <Pressable onPress={() => setEdit(null)} style={{ alignItems: 'center', marginTop: 4 }}>
        <Text style={{ color: C.muted }}>Cerrar</Text>
      </Pressable>
    </>
  );

  const configModal = (
    <ScheduleConfig
      visible={cfgOpen} isWide={isWide}
      onClose={() => setCfgOpen(false)}
      onApply={applyCfg}
    />
  );

  // ===================== ESCRITORIO =====================
  if (isWide) {
    const gd = new Date().getDay();
    const todayIdx = (gd + 6) % 7;                       // 0 = lunes
    const inWeek = todayIdx < days.length;
    const todayLabel = DAY_NAMES[todayIdx];
    const todayClasses = inWeek
      ? blocks.map((b, si) => ({ label: blockLabelLong(b, fmt24), cell: at(todayIdx, si) })).filter((x) => x.cell)
      : [];

    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: SIDEBAR_W }}>
        <ScrollView contentContainerStyle={{ paddingVertical: 36, paddingHorizontal: 44, paddingBottom: 60 }}>
          <View style={{ maxWidth: 1560, width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>Horario</Text>
                <Text style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>Tu semana de clases</Text>
              </View>
              {cfgButton}
            </View>
            <View style={{ height: 20 }} />

            {orphanNotice}

            <View style={{ flexDirection: 'row', gap: 22, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  <View style={{ width: 74 }} />
                  {days.map((d, di) => (
                    <Text key={d + di} style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: di === todayIdx ? C.brand : C.muted, paddingBottom: 8 }}>{d}</Text>
                  ))}
                </View>
                {blocks.map((b, si) => (
                  <View key={b.id} style={{ flexDirection: 'row', gap: 2, marginTop: 6 }}>
                    <Text style={{ width: 74, fontSize: 11.5, color: C.muted, paddingTop: 18, paddingRight: 6 }}>{blockLabel(b, fmt24)}</Text>
                    {days.map((_, di) => {
                      const cell = at(di, si); const s = cell ? subjOf(cell.subject_id) : null;
                      return (
                        <Pressable key={di} onPress={() => setEdit({ day: di, slot: si })}
                          style={{ flex: 1, minHeight: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 6, borderWidth: 1, borderStyle: s ? 'solid' : 'dashed', borderColor: s ? s.color + '55' : C.line, backgroundColor: s ? s.color + '2a' : C.surface }}>
                          <Text style={{ color: s ? s.color : C.line, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{s ? s.name : '+'}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>

              <View style={{ width: 320, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 18 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Hoy · {todayLabel}</Text>
                {!inWeek ? <Text style={{ color: C.muted, fontSize: 13 }}>Hoy no es día de clases en tu horario.</Text>
                  : todayClasses.length === 0 ? <Text style={{ color: C.muted, fontSize: 13 }}>Sin clases hoy.</Text> : (
                    <View style={{ gap: 8 }}>
                      {todayClasses.map((x, i) => {
                        const s = subjOf(x.cell!.subject_id);
                        return (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s?.color ?? C.muted }} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{s?.name ?? '—'}</Text>
                              <Text style={{ color: C.muted, fontSize: 12 }}>{x.label}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
              </View>
            </View>
          </View>
        </ScrollView>

        <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
          <Pressable onPress={() => setEdit(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, width: '100%', maxWidth: 420 }}>
              {picker}
            </Pressable>
          </Pressable>
        </Modal>
        {configModal}
      </View>
    );
  }

  // ===================== MÓVIL =====================
  const tight = days.length > 5;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Horario" subtitle="Tu semana de clases" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Text style={{ color: C.muted, fontSize: 12.5, flex: 1 }}>Toca una celda para asignar o quitar una clase.</Text>
          {cfgButton}
        </View>

        {orphanNotice}

        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: tight ? 52 : 58 }} />
          {days.map((d, di) => (
            <Text key={d + di} style={{ flex: 1, textAlign: 'center', color: C.muted, fontWeight: '600', fontSize: tight ? 11 : 12 }}>{d}</Text>
          ))}
        </View>

        {blocks.map((b, si) => (
          <View key={b.id} style={{ flexDirection: 'row', marginTop: 4 }}>
            <Text style={{ width: tight ? 52 : 58, textAlign: 'right', paddingRight: 6, color: C.muted, fontSize: 10.5, paddingTop: 14 }} numberOfLines={2}>{blockLabel(b, fmt24)}</Text>
            {days.map((_, di) => {
              const cell = at(di, si);
              const s = cell ? subjOf(cell.subject_id) : null;
              return (
                <Pressable key={di} onPress={() => setEdit({ day: di, slot: si })}
                  style={{
                    flex: 1, minHeight: 46, margin: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderStyle: s ? 'solid' : 'dashed',
                    borderColor: s ? s.color : C.line, backgroundColor: s ? s.color : 'transparent',
                  }}>
                  <Text style={{ color: s ? '#0b0d11' : C.muted, fontSize: tight ? 9 : 10, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
                    {s ? s.name : '+'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={sheet}>{picker}</View>
        </View>
      </Modal>
      {configModal}
    </View>
  );
}

// ============================================================
//  Modal de configuración de bloques
// ============================================================
function ScheduleConfig({ visible, isWide, onClose, onApply }: {
  visible: boolean; isWide: boolean; onClose: () => void; onApply: (cfg: ScheduleCfg) => Promise<void>;
}) {
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [dayCount, setDayCount] = useState(5);
  const [fmt24, setFmt24] = useState(false);
  const [genStart, setGenStart] = useState('07:00');
  const [genEnd, setGenEnd] = useState('19:00');
  const [genMin, setGenMin] = useState(60);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setBlocks(currentBlocks().map((b) => ({ ...b })));
    setDayCount(currentDays().length);
    setFmt24(SCHEDULE.fmt24);
    setBusy(false);
  }, [visible]);

  const bad = new Set(overlappingIds(blocks));
  const sorted = sortBlocks(blocks);

  function setBlock(id: string, patch: Partial<TimeBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function addBlock() {
    const last = sortBlocks(blocks)[blocks.length - 1];
    const startMin = last ? toMinutes(last.end) : 7 * 60;
    const dur = last ? Math.max(15, toMinutes(last.end) - toMinutes(last.start)) : 60;
    const s = `${String(Math.floor((startMin % 1440) / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
    const e = `${String(Math.floor(((startMin + dur) % 1440) / 60)).padStart(2, '0')}:${String((startMin + dur) % 60).padStart(2, '0')}`;
    setBlocks((prev) => [...prev, { id: newBlockId(), start: clampHHMM(s), end: clampHHMM(e) }]);
  }
  function delBlock(id: string) {
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((b) => b.id !== id)));
  }
  // El generador reusa los ids que ya existen en el mismo orden: así las clases
  // se quedan en su fila y sólo cambia la hora que muestra.
  function generate() {
    const gen = generateBlocks(genStart, genEnd, genMin);
    const prev = sortBlocks(blocks);
    setBlocks(gen.map((b, i) => (prev[i] ? { ...b, id: prev[i].id } : b)));
  }
  function resetDefault() {
    setBlocks(DEFAULT_SCHEDULE.blocks.map((b) => ({ ...b })));
    setDayCount(DEFAULT_SCHEDULE.days);
    setFmt24(DEFAULT_SCHEDULE.fmt24);
  }

  async function apply() {
    setBusy(true);
    try { await onApply({ blocks, days: dayCount, fmt24 }); }
    finally { setBusy(false); }
  }

  const body = (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>Ajustar bloques</Text>
      <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
        Arma los rangos de hora que uses tú. Las clases que ya tienes se mueven con su bloque;
        sólo se pierden las de los bloques que quites.
      </Text>

      {/* ---- Días ---- */}
      <Text style={lbl}>Días de la semana</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[5, 6, 7].map((n) => {
          const active = dayCount === n;
          return (
            <Pressable key={n} onPress={() => setDayCount(n)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center', borderWidth: 1, backgroundColor: active ? C.brand : C.surface2, borderColor: active ? C.brand : C.line }}>
              <Text style={{ color: active ? '#fff' : C.text, fontSize: 13, fontWeight: '700' }}>
                {n === 5 ? 'Lun–Vie' : n === 6 ? 'Lun–Sáb' : 'Toda'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ---- Formato ---- */}
      <Text style={lbl}>Ver las horas</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[false, true].map((v) => {
          const active = fmt24 === v;
          return (
            <Pressable key={String(v)} onPress={() => setFmt24(v)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center', borderWidth: 1, backgroundColor: active ? C.brand : C.surface2, borderColor: active ? C.brand : C.line }}>
              <Text style={{ color: active ? '#fff' : C.text, fontSize: 13, fontWeight: '700' }}>{v ? '24 h · 14:00' : '12 h · 2 pm'}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ---- Generador ---- */}
      <Text style={lbl}>Generar automáticamente</Text>
      <View style={{ backgroundColor: C.surface2 + '80', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>De</Text>
          <TimeField value={genStart} onChange={setGenStart} />
          <Text style={{ color: C.muted, fontSize: 12.5 }}>a</Text>
          <TimeField value={genEnd} onChange={setGenEnd} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[45, 50, 60, 90, 120].map((m) => {
            const active = genMin === m;
            return (
              <Pressable key={m} onPress={() => setGenMin(m)}
                style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, backgroundColor: active ? C.brand + '22' : C.surface, borderColor: active ? C.brand : C.line }}>
                <Text style={{ color: active ? C.brand : C.text, fontSize: 12.5, fontWeight: active ? '700' : '500' }}>{m} min</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={generate}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 11, borderWidth: 1, borderColor: C.brand, backgroundColor: C.brand + '18' }}>
          <Ionicons name="grid-outline" size={15} color={C.brand} />
          <Text style={{ color: C.brand, fontSize: 13, fontWeight: '700' }}>Rellenar bloques</Text>
        </Pressable>
      </View>

      {/* ---- Lista manual ---- */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>Bloques ({blocks.length})</Text>
        <Pressable onPress={resetDefault} hitSlop={6}><Text style={{ color: C.muted, fontSize: 12.5 }}>Restablecer</Text></Pressable>
      </View>

      <View style={{ gap: 8 }}>
        {sorted.map((b, i) => (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: bad.has(b.id) ? C.warn : C.line, borderRadius: 11, padding: 8 }}>
            <Text style={{ color: C.muted, fontSize: 12, width: 20, textAlign: 'center' }}>{i + 1}</Text>
            <TimeField value={b.start} onChange={(v) => setBlock(b.id, { start: v })} />
            <Text style={{ color: C.muted }}>–</Text>
            <TimeField value={b.end} onChange={(v) => setBlock(b.id, { end: v })} />
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => delBlock(b.id)} hitSlop={8} disabled={blocks.length <= 1} accessibilityLabel={`Quitar bloque ${i + 1}`}>
              <Ionicons name="trash-outline" size={17} color={blocks.length <= 1 ? C.line : C.muted} />
            </Pressable>
          </View>
        ))}
      </View>

      {bad.size > 0 && (
        <Text style={{ color: C.warn, fontSize: 12, marginTop: 8 }}>
          Hay bloques que se cruzan. Puedes dejarlos así, pero revisa las horas marcadas.
        </Text>
      )}

      <Pressable onPress={addBlock}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 11, borderRadius: 11, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line }}>
        <Ionicons name="add" size={16} color={C.muted} />
        <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>Agregar bloque</Text>
      </Pressable>

      <Text style={{ color: C.muted, fontSize: 12, marginTop: 14 }}>
        Vista previa: {sorted.slice(0, 3).map((b) => blockLabel(b, fmt24)).join(' · ')}{sorted.length > 3 ? ' …' : ''}
      </Text>

      <Pressable onPress={apply} disabled={busy}
        style={{ backgroundColor: C.brand, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 16, opacity: busy ? 0.7 : 1 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '…' : 'Guardar horario'}</Text>
      </Pressable>
      <Pressable onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}>
        <Text style={{ color: C.muted }}>Cancelar</Text>
      </Pressable>
    </ScrollView>
  );

  return (
    <Modal visible={visible} transparent animationType={isWide ? 'fade' : 'slide'} onRequestClose={onClose}>
      {isWide ? (
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 560, maxHeight: '88%', backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, padding: 22 }}>
            {body}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={[sheet, { maxHeight: '92%' }]}>{body}</View>
        </View>
      )}
    </Modal>
  );
}

// Campo de hora: en web el <input type="time"> del navegador, en móvil texto
// libre que se normaliza al salir del campo.
function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'time',
      value,
      onChange: (e: any) => onChange(clampHHMM(e.target.value || value)),
      style: {
        backgroundColor: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, color: C.text,
        padding: 7, fontSize: 13, colorScheme: uiScheme(), width: 112, boxSizing: 'border-box',
      },
    });
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      onBlur={() => onChange(clampHHMM(value))}
      placeholder="08:00" placeholderTextColor={C.muted}
      keyboardType="numbers-and-punctuation" maxLength={5}
      style={{ backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 9, color: C.text, paddingVertical: 7, paddingHorizontal: 10, fontSize: 13, width: 78, textAlign: 'center' }}
    />
  );
}

const sheet = { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30, borderTopColor: C.line, borderTopWidth: 1 } as const;
const lbl = { color: C.muted, fontSize: 12, marginTop: 16, marginBottom: 6 } as const;
