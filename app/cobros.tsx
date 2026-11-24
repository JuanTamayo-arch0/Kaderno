import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { Screen, Button, Card, Badge, ChipRow, EmptyState, Field, FilterChip, SectionLabel, Segmented, Skeleton } from '../components/ds';
import { Sheet } from '../components/cards/CardForms';
import { getSubjects, type Subject } from '../lib/db';
import { getProjects, type Project } from '../lib/projects';
import { getHours, getRates, printReport } from '../lib/hoursDb';
import { isoDay, periodRange, type Named, type Rates } from '../lib/hours';
import { draftItems, invoiceHtml, invoiceShareText, itemAmount, itemsTotal, numberLabel, pesos, pesosEnLetras, profileMissing, type BillingProfile, type Client, type Invoice, type InvoiceItem } from '../lib/invoice';
import { createInvoice, deleteClient, getClients, getInvoices, getProfile, saveClient, saveProfile, setInvoiceStatus } from '../lib/invoiceDb';
import { copyText } from '../lib/fileIO';
import { confirm, friendlyError, notify, toast } from '../lib/feedback';
import { useMode } from '../lib/mode';
import { t } from '../lib/i18n';

// ============================================================
//  Cobrar (v25, fase 1): cuentas de cobro desde el registro de horas, tus
//  clientes y tus datos para cobrar.
// ============================================================

type Tab = 'cuentas' | 'clientes' | 'datos';
const STATUS: Record<Invoice['status'], { text: string; color: string }> = {
  emitida: { text: t('Por cobrar'), color: C.warn }, pagada: { text: t('Pagada'), color: C.good }, anulada: { text: t('Anulada'), color: C.muted },
};

function Cobros() {
  const params = useLocalSearchParams<{ nueva?: string; desde?: string; hasta?: string }>();
  const { v: mv } = useMode();
  const [tab, setTab] = useState<Tab>('cuentas');
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newOpen, setNewOpen] = useState<{ from?: string; to?: string } | null>(null);
  const [editClient, setEditClient] = useState<Partial<Client> | null>(null);

  const load = useCallback(() => {
    getInvoices().then(setInvoices).catch((e) => { notify(t('No se pudo cargar'), friendlyError(e)); setInvoices([]); });
    getClients().then(setClients).catch(() => {});
    getProfile().then(setProfile).catch(() => {});
    getProjects().then(setProjects).catch(() => {});
    getSubjects().then(setSubjects).catch(() => {});
  }, []);
  useFocusEffect(load);
  useEffect(() => { if (params.nueva) setNewOpen({ from: params.desde, to: params.hasta }); }, [params.nueva]);

  const due = (invoices ?? []).filter((i) => i.status === 'emitida').reduce((a, i) => a + i.total, 0);
  const month = isoDay(new Date()).slice(0, 7);
  const paid = (invoices ?? []).filter((i) => i.status === 'pagada' && (i.paid_on ?? '').startsWith(month)).reduce((a, i) => a + i.total, 0);
  const missing = profileMissing(profile);

  async function open(inv: Invoice) {
    try { await printReport(invoiceHtml(inv), t('Cuenta de cobro {prefix}', { prefix: numberLabel(inv.prefix, inv.number) })); }
    catch (e) { notify(t('No se pudo abrir'), friendlyError(e)); }
  }
  async function share(inv: Invoice) {
    const text = invoiceShareText(inv);
    if (Platform.OS === 'web') { await copyText(text); toast(t('Mensaje copiado. Abre WhatsApp y pégalo junto al PDF.'), { actionLabel: t('Abrir WhatsApp'), onAction: () => Linking.openURL('https://wa.me/?text=' + encodeURIComponent(text)) }); }
    else Linking.openURL('whatsapp://send?text=' + encodeURIComponent(text)).catch(() => copyText(text));
  }
  async function setStatus(inv: Invoice, s: Invoice['status']) {
    if (s === 'anulada' && !(await confirm(t('¿Anular la {prefix}?', { prefix: numberLabel(inv.prefix, inv.number) }), t('Queda en la lista marcada como anulada y su número no se vuelve a usar.'), t('Anular')))) return;
    try { const r = await setInvoiceStatus(inv.id, s); setInvoices((l) => l?.map((x) => (x.id === r.id ? r : x)) ?? null); }
    catch (e) { notify(t('No se pudo'), friendlyError(e)); }
  }

  return (
    <Screen title={t('Cobrar')} subtitle={t('Cuentas de cobro con tus horas')} back="/horas" maxWidth={920}
      right={tab === 'cuentas' ? <Button label={t('Nueva')} icon="add" size="sm" onPress={() => setNewOpen({})} /> : tab === 'clientes' ? <Button label={t('Cliente')} icon="add" size="sm" onPress={() => setEditClient({ project_ids: [], subject_ids: [] })} /> : undefined}>
      <Segmented<Tab> items={[{ key: 'cuentas', label: t('Cuentas') }, { key: 'clientes', label: t('Clientes') }, { key: 'datos', label: t('Tus datos') }]} value={tab} onChange={setTab} style={{ marginBottom: 14 }} />

      {tab === 'cuentas' && (
        <>
          {missing.length > 0 && (
            <Card onPress={() => setTab('datos')} accessibilityLabel={t('Completar tus datos para cobrar')} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12, borderColor: C.warn }}>
              <Ionicons name="alert-circle-outline" size={20} color={C.warnText} />
              <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }}>{t('Antes de cobrar, completa {join}.', { join: missing.join(', ') })}</Text>
              <Ionicons name="chevron-forward" size={16} color={C.muted} />
            </Card>
          )}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <Card style={{ flex: 1, minWidth: 150 }}><Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Por cobrar')}</Text><Text style={{ color: C.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{pesos(due)}</Text></Card>
            <Card style={{ flex: 1, minWidth: 150 }}><Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Cobrado este mes')}</Text><Text style={{ color: C.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{pesos(paid)}</Text></Card>
          </View>
          {invoices === null ? <Skeleton height={70} /> : !invoices.length ? (
            <EmptyState icon="receipt-outline" title={t('Aún no tienes cuentas de cobro')} text={t('Crea un cliente, asígnale sus proyectos o áreas, y Kaderno arma la cuenta con las horas que registraste.')}
              action={{ label: t('Nueva cuenta de cobro'), icon: 'add', onPress: () => setNewOpen({}) }} />
          ) : (
            <Card padded={false} style={{ marginBottom: 20 }}>
              {invoices.map((inv, i) => {
                const st = STATUS[inv.status];
                return (
                  <View key={inv.id} style={{ paddingHorizontal: 14, paddingVertical: 12, gap: 8, borderBottomWidth: i < invoices.length - 1 ? 1 : 0, borderBottomColor: C.line, opacity: inv.status === 'anulada' ? 0.6 : 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }} numberOfLines={2}>{numberLabel(inv.prefix, inv.number)} · {inv.client.name}</Text>
                        {/* v29: el estado va junto a la fecha; en el celular apretaba el nombre del cliente. */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 3 }}>
                          <Text style={{ color: C.muted, fontSize: 12.5 }}>{inv.issued_on}{inv.paid_on ? t(' · pagada el {paid_on}', { paid_on: inv.paid_on }) : ''}</Text>
                          <Badge text={st.text} color={st.color} />
                        </View>
                      </View>
                      <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{pesos(inv.total)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', columnGap: 18, rowGap: 0, flexWrap: 'wrap', marginVertical: -6 }}>
                      <Link label={t('Ver o imprimir')} onPress={() => open(inv)} />
                      {inv.status !== 'anulada' && <Link label={t('Mandar por WhatsApp')} onPress={() => share(inv)} />}
                      {inv.status === 'emitida' && <Link label={t('Marcar pagada')} onPress={() => setStatus(inv, 'pagada')} />}
                      {inv.status === 'pagada' && <Link label={t('Volver a por cobrar')} onPress={() => setStatus(inv, 'emitida')} />}
                      {inv.status !== 'anulada' && <Link label={t('Anular')} muted onPress={() => setStatus(inv, 'anulada')} />}
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
          <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 30 }}>
            {t('La cuenta de cobro sirve si no estás obligado a facturar (persona natural no responsable de IVA). Si eres responsable de IVA o tu cliente te pide factura electrónica, usa un proveedor de facturación de la DIAN.')}</Text>
        </>
      )}

      {tab === 'clientes' && (
        clients.length === 0 ? (
          <EmptyState icon="business-outline" title={t('Sin clientes')} text={t('Un cliente agrupa los proyectos y {subjectsLower} que le cobras, con su tarifa por hora.', { subjectsLower: mv.subjectsLower })}
            action={{ label: t('Nuevo cliente'), icon: 'add', onPress: () => setEditClient({ project_ids: [], subject_ids: [] }) }} />
        ) : (
          <Card padded={false} style={{ marginBottom: 30 }}>
            {clients.map((c, i) => (
              <Pressable key={c.id} onPress={() => setEditClient(c)} accessibilityRole="button" accessibilityLabel={t('Editar {name}', { name: c.name })}
                style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < clients.length - 1 ? 1 : 0, borderBottomColor: C.line, backgroundColor: hovered ? C.surface2 : 'transparent', opacity: c.archived ? 0.55 : 1 })}>
                <Ionicons name="business-outline" size={18} color={C.muted} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{c.name}{c.archived ? ' (archivado)' : ''}</Text>
                  <Text style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={1}>
                    {[c.tax_id, c.rate ? t('{rate} la hora', { rate: pesos(c.rate) }) : null, `${c.project_ids.length + c.subject_ids.length} ${c.project_ids.length + c.subject_ids.length === 1 ? t('proyecto o área') : t('proyectos o áreas')}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.muted} />
              </Pressable>
            ))}
          </Card>
        )
      )}

      {tab === 'datos' && <ProfileForm profile={profile} onSaved={(p) => { setProfile(p); toast(t('Datos guardados'), { tone: 'good' }); }} />}

      <NewInvoice visible={!!newOpen} initial={newOpen} clients={clients.filter((c) => !c.archived)} projects={projects} subjects={subjects} missing={missing}
        onNeedProfile={() => { setNewOpen(null); setTab('datos'); }} onNeedClient={() => { setNewOpen(null); setTab('clientes'); setEditClient({ project_ids: [], subject_ids: [] }); }}
        onClose={() => setNewOpen(null)} onCreated={(inv) => { setNewOpen(null); setInvoices((l) => [inv, ...(l ?? [])]); open(inv); }} />
      <ClientSheet client={editClient} projects={projects} subjects={subjects} subjectWord={mv.subjectsLower}
        onClose={() => setEditClient(null)} onSaved={(c) => { setEditClient(null); setClients((l) => [...l.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name))); }}
        onDeleted={(id) => { setEditClient(null); setClients((l) => l.filter((x) => x.id !== id)); }} />
    </Screen>
  );
}

function Link({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="button" hitSlop={4} style={{ paddingVertical: 10 }}><Text style={{ color: muted ? C.muted : C.brand, fontSize: 13, fontWeight: '700' }}>{label}</Text></Pressable>;
}

function NewInvoice({ visible, initial, clients, projects, subjects, missing, onNeedProfile, onNeedClient, onClose, onCreated }: {
  visible: boolean; initial: { from?: string; to?: string } | null; clients: Client[]; projects: Project[]; subjects: Subject[]; missing: string[];
  onNeedProfile: () => void; onNeedClient: () => void; onClose: () => void; onCreated: (inv: Invoice) => void;
}) {
  const [client, setClient] = useState<Client | null>(null);
  const [period, setPeriod] = useState<'month' | 'last' | 'custom'>('month');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rates, setRates] = useState<Rates>({});

  useEffect(() => {
    if (!visible) return;
    setErr(null); setNote(''); setClient(clients.length === 1 ? clients[0] : null); getRates().then(setRates).catch(() => {});
    if (initial?.from && initial?.to) { setPeriod('custom'); setFrom(initial.from); setTo(initial.to); }
    else { setPeriod('month'); const r = periodRange('month', 0); setFrom(isoDay(r.from)); setTo(isoDay(new Date(r.to.getTime() - 86_400_000))); }
  }, [visible]);
  useEffect(() => {
    if (period === 'custom') return;
    const r = periodRange('month', period === 'last' ? -1 : 0);
    setFrom(isoDay(r.from)); setTo(isoDay(new Date(r.to.getTime() - 86_400_000)));
  }, [period]);
  const names = useMemo(() => {
    const n: Record<string, Named> = {};
    subjects.forEach((s) => { n[s.id] = { name: s.name }; });
    projects.forEach((p) => { n[p.id] = { name: p.name }; });
    return n;
  }, [subjects, projects]);
  useEffect(() => {
    if (!visible || !client || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) { setItems([]); return; }
    setLoading(true);
    const a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00'); b.setDate(b.getDate() + 1);
    getHours(a, b).then((r) => setItems(draftItems(r.list, client, names, rates))).catch(() => setItems([])).finally(() => setLoading(false));
  }, [visible, client?.id, from, to, names, rates]);

  const total = itemsTotal(items);
  const upd = (i: number, patch: Partial<InvoiceItem>) => setItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  async function create() {
    if (!client) { setErr(t('Escoge el cliente.')); return; }
    if (items.some((i) => !i.concept.trim())) { setErr(t('Cada línea necesita un concepto.')); return; }
    if (total <= 0) { setErr(t('El total debe ser mayor que cero.')); return; }
    setBusy(true); setErr(null);
    try { onCreated(await createInvoice({ client_id: client.id, items: items.map((i) => ({ ...i, amount: itemAmount(i) })), period_from: from, period_to: to, note: note.trim() || undefined })); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }

  const num = (v: string) => { const n = Number(v.replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Nueva cuenta de cobro')} subtitle={t('Con las horas del cliente en el periodo. Puedes cambiar cualquier línea.')} maxWidth={640}
      footer={<><Text style={{ color: C.text, fontSize: 15, fontWeight: '800', flex: 1, fontVariant: ['tabular-nums'] }}>{t('Total {total}', { total: pesos(total) })}</Text>
        <Button label={t('Crear y abrir')} icon="checkmark" busy={busy} disabled={!!missing.length || !client || total <= 0} onPress={create} /></>}>
      {missing.length > 0 && (
        <Card onPress={onNeedProfile} style={{ borderColor: C.warn, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{t('Falta {join} en tus datos.', { join: missing.join(', ') })}</Text><Text style={{ color: C.brand, fontWeight: '700', fontSize: 13 }}>{t('Completar')}</Text>
        </Card>
      )}
      {clients.length === 0 ? (
        <Button label={t('Crear el primer cliente')} icon="add" onPress={onNeedClient} />
      ) : (
        <ChipRow>{clients.map((c) => <FilterChip key={c.id} label={c.name} active={client?.id === c.id} onPress={() => setClient(c)} />)}</ChipRow>
      )}
      <ChipRow>
        <FilterChip label={t('Este mes')} active={period === 'month'} onPress={() => setPeriod('month')} />
        <FilterChip label={t('Mes pasado')} active={period === 'last'} onPress={() => setPeriod('last')} />
        <FilterChip label={t('Otras fechas')} active={period === 'custom'} onPress={() => setPeriod('custom')} />
      </ChipRow>
      {period === 'custom' && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label={t('Desde (AAAA-MM-DD)')} value={from} onChangeText={setFrom} /></View>
          <View style={{ flex: 1 }}><Field label={t('Hasta')} value={to} onChangeText={setTo} /></View>
        </View>
      )}
      {client && !loading && items.length === 0 && (
        <Text style={{ color: C.muted, fontSize: 13 }}>{client.project_ids.length + client.subject_ids.length === 0 ? t('Este cliente no tiene proyectos ni áreas asignados: agrégalos en Clientes, o escribe las líneas a mano.') : t('No hay horas de este cliente en esas fechas. Puedes escribir las líneas a mano.')}</Text>
      )}
      {items.map((it, i) => (
        <View key={i} style={{ gap: 6, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.line }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput value={it.concept} onChangeText={(t) => upd(i, { concept: t })} placeholder={t('Concepto')} placeholderTextColor={C.muted} accessibilityLabel={t('Concepto de la línea {v}', { v: i + 1 })}
              style={[inp, { flex: 1 }]} />
            <Pressable onPress={() => setItems(items.filter((_, k) => k !== i))} accessibilityRole="button" accessibilityLabel={t('Quitar línea')} hitSlop={6}><Ionicons name="close" size={18} color={C.muted} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {it.hours != null ? (
              <>
                <TextInput value={String(it.hours).replace('.', ',')} onChangeText={(t) => upd(i, { hours: num(t) })} keyboardType="decimal-pad" accessibilityLabel={t('Horas')} style={[inp, { width: 80 }]} />
                <Text style={{ color: C.muted }}>{t('h ×')}</Text>
                <TextInput value={it.rate ? String(it.rate) : ''} onChangeText={(t) => upd(i, { rate: num(t) })} keyboardType="number-pad" placeholder={t('Tarifa')} placeholderTextColor={C.muted} accessibilityLabel={t('Tarifa por hora')} style={[inp, { width: 110 }]} />
              </>
            ) : (
              <TextInput value={it.amount ? String(it.amount) : ''} onChangeText={(t) => upd(i, { amount: num(t) })} keyboardType="number-pad" placeholder={t('Valor')} placeholderTextColor={C.muted} accessibilityLabel={t('Valor')} style={[inp, { width: 140 }]} />
            )}
            <View style={{ flex: 1 }} />
            <Text style={{ color: C.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{pesos(itemAmount(it))}</Text>
          </View>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button label={t('Línea con valor')} icon="add" size="sm" kind="secondary" onPress={() => setItems([...items, { concept: '', amount: 0 }])} />
        <Button label={t('Línea por horas')} icon="time-outline" size="sm" kind="ghost" onPress={() => setItems([...items, { concept: '', hours: 1, rate: client?.rate ?? 0, amount: 0 }])} />
      </View>
      {total > 0 && <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Son {total}.', { total: pesosEnLetras(total) })}</Text>}
      <Field label={t('Nota (opcional)')} value={note} onChangeText={setNote} placeholder={t('Ej: corresponde al contrato 12 de 2026')} maxLength={500} />
      {err && <Text style={{ color: C.badText, fontSize: 13 }}>{err}</Text>}
    </Sheet>
  );
}

const inp = [{ backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.text, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null];

function ClientSheet({ client, projects, subjects, subjectWord, onClose, onSaved, onDeleted }: {
  client: Partial<Client> | null; projects: Project[]; subjects: Subject[]; subjectWord: string; onClose: () => void; onSaved: (c: Client) => void; onDeleted: (id: string) => void;
}) {
  const [c, setC] = useState<Partial<Client>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (client) { setC({ ...client }); setErr(null); } }, [client]);
  const toggle = (key: 'project_ids' | 'subject_ids', id: string) => setC({ ...c, [key]: (c[key] ?? []).includes(id) ? (c[key] ?? []).filter((x) => x !== id) : [...(c[key] ?? []), id] });
  async function save() {
    if (!c.name?.trim()) { setErr(t('Escribe el nombre del cliente.')); return; }
    setBusy(true); setErr(null);
    try { onSaved(await saveClient(c as Client)); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!c.id || !(await confirm(t('¿Borrar a {name}?', { name: c.name }), t('Las cuentas de cobro que ya hiciste se conservan con sus datos.'), t('Borrar')))) return;
    try { await deleteClient(c.id); onDeleted(c.id); } catch (e) { setErr(friendlyError(e)); }
  }
  return (
    <Sheet visible={!!client} onClose={onClose} title={c.id ? t('Editar cliente') : t('Nuevo cliente')} maxWidth={560}
      footer={<>{c.id ? <Button label={c.archived ? t('Desarchivar') : t('Archivar')} kind="ghost" onPress={() => setC({ ...c, archived: !c.archived })} /> : null}
        {c.id ? <Button label={t('Borrar')} kind="ghost" onPress={remove} /> : null}<View style={{ flex: 1 }} /><Button label={t('Guardar')} busy={busy} onPress={save} /></>}>
      <Field label={t('Nombre o razón social')} value={c.name ?? ''} onChangeText={(t) => setC({ ...c, name: t })} maxLength={120} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field label={t('NIT o cédula')} value={c.tax_id ?? ''} onChangeText={(t) => setC({ ...c, tax_id: t })} maxLength={30} /></View>
        <View style={{ flex: 1 }}><Field label={t('Tarifa por hora (opcional)')} value={c.rate ? String(c.rate) : ''} onChangeText={(t) => setC({ ...c, rate: Number(t.replace(/\D/g, '')) || null })} keyboardType="number-pad" /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field label={t('Correo')} value={c.email ?? ''} onChangeText={(t) => setC({ ...c, email: t })} keyboardType="email-address" autoCapitalize="none" maxLength={200} /></View>
        <View style={{ flex: 1 }}><Field label={t('Teléfono')} value={c.phone ?? ''} onChangeText={(t) => setC({ ...c, phone: t })} keyboardType="phone-pad" maxLength={40} /></View>
      </View>
      <Field label={t('Dirección (opcional)')} value={c.address ?? ''} onChangeText={(t) => setC({ ...c, address: t })} maxLength={200} />
      {projects.length > 0 && <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>{t('Proyectos que le cobras')}</Text>}
      {projects.length > 0 && <ChipRow>{projects.map((p) => <FilterChip key={p.id} label={p.name} active={(c.project_ids ?? []).includes(p.id)} onPress={() => toggle('project_ids', p.id)} />)}</ChipRow>}
      {subjects.length > 0 && <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }}>{t('{v} (para las horas sin proyecto)', { v: subjectWord[0].toUpperCase() + subjectWord.slice(1) })}</Text>}
      {subjects.length > 0 && <ChipRow>{subjects.map((s) => <FilterChip key={s.id} label={s.name} active={(c.subject_ids ?? []).includes(s.id)} onPress={() => toggle('subject_ids', s.id)} />)}</ChipRow>}
      {err && <Text style={{ color: C.badText, fontSize: 13 }}>{err}</Text>}
    </Sheet>
  );
}

function ProfileForm({ profile, onSaved }: { profile: BillingProfile | null; onSaved: (p: BillingProfile) => void }) {
  const [p, setP] = useState<Partial<BillingProfile>>({ doc_type: 'CC', account_type: 'ahorros', prefix: 'CC', next_number: 1 });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (profile) setP(profile); }, [profile]);
  const set = (k: keyof BillingProfile) => (t: string) => setP({ ...p, [k]: t });
  async function save() {
    setBusy(true);
    try { await saveProfile({ ...p, prefix: (p.prefix ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10), next_number: Math.max(1, Math.min(999999, Math.round(Number(p.next_number) || 1))) }); onSaved({ ...(profile ?? {}), ...p } as BillingProfile); }
    catch (e) { notify(t('No se pudo guardar'), friendlyError(e)); }
    finally { setBusy(false); }
  }
  return (
    <View style={{ gap: 4, marginBottom: 30 }}>
      <Text style={{ color: C.muted, fontSize: 13, marginBottom: 8 }}>{t('Salen en cada cuenta de cobro. Solo los ves tú; Kaderno no los comparte con nadie.')}</Text>
      <Field label={t('Nombre completo')} value={p.full_name ?? ''} onChangeText={set('full_name')} maxLength={120} />
      <ChipRow style={{ marginBottom: 8 }}>{(['CC', 'CE', 'NIT', 'PP'] as const).map((d) => <FilterChip key={d} label={d === 'PP' ? t('Pasaporte') : d} active={p.doc_type === d} onPress={() => setP({ ...p, doc_type: d })} />)}</ChipRow>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field label={t('Número de documento')} value={p.doc_number ?? ''} onChangeText={set('doc_number')} maxLength={30} /></View>
        <View style={{ flex: 1 }}><Field label={t('Ciudad')} value={p.city ?? ''} onChangeText={set('city')} maxLength={60} placeholder={t('Medellín')} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field label={t('Teléfono')} value={p.phone ?? ''} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={40} /></View>
        <View style={{ flex: 1 }}><Field label={t('Correo')} value={p.email ?? ''} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" maxLength={200} /></View>
      </View>
      <Field label={t('Dirección (opcional)')} value={p.address ?? ''} onChangeText={set('address')} maxLength={200} />
      <SectionLabel text={t('Dónde te pagan')} />
      <ChipRow style={{ marginBottom: 8 }}>{(['ahorros', 'corriente', 'nequi', 'daviplata'] as const).map((a) => <FilterChip key={a} label={a === 'ahorros' ? t('Ahorros') : a === 'corriente' ? t('Corriente') : a === 'nequi' ? 'Nequi' : 'Daviplata'} active={p.account_type === a} onPress={() => setP({ ...p, account_type: a })} />)}</ChipRow>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {p.account_type !== 'nequi' && p.account_type !== 'daviplata' && <View style={{ flex: 1 }}><Field label={t('Banco')} value={p.bank_name ?? ''} onChangeText={set('bank_name')} maxLength={60} placeholder={t('Bancolombia')} /></View>}
        <View style={{ flex: 1 }}><Field label={p.account_type === 'nequi' || p.account_type === 'daviplata' ? t('Celular') : t('Número de cuenta')} value={p.account_number ?? ''} onChangeText={set('account_number')} maxLength={40} /></View>
      </View>
      <SectionLabel text={t('Numeración')} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field label={t('Prefijo')} value={p.prefix ?? ''} onChangeText={(t) => setP({ ...p, prefix: t.toUpperCase() })} maxLength={10} hint={t('Ej: CC → CC-0001')} /></View>
        <View style={{ flex: 1 }}><Field label={t('Siguiente número')} value={String(p.next_number ?? 1)} onChangeText={(t) => setP({ ...p, next_number: Number(t.replace(/\D/g, '')) || 1 })} keyboardType="number-pad" hint={t('Si ya hacías cuentas de cobro, sigue tu numeración')} /></View>
      </View>
      <Field label={t('Nota fija (opcional)')} value={p.note ?? ''} onChangeText={set('note')} maxLength={300} multiline placeholder={t('Ej: Declaro que no soy responsable de IVA.')} />
      <ChipRow style={{ marginBottom: 10 }}>
        <FilterChip label={t('No responsable de IVA')} active={false} onPress={() => setP({ ...p, note: t('Declaro que no soy responsable de IVA ni estoy obligado a expedir factura electrónica.') })} />
      </ChipRow>
      <Button label={t('Guardar mis datos')} icon="checkmark" busy={busy} onPress={save} />
    </View>
  );
}

export default function CobrosProtegido() { return <RequireAuth><Cobros /></RequireAuth>; }
