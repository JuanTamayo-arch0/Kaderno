import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { Button, Card, Field } from './ds';
import { getCalendars, addCalendar, removeCalendar, syncCalendar, CAL_COLORS, looksLikeCalendarUrl, type ExtCalendar } from '../lib/calendarsDb';
import { confirm, friendlyError, toast } from '../lib/feedback';
import { dataChanged } from '../lib/uiBus';

// ============================================================
//  Ajustes, "Tus otros calendarios" (v21, sección 9): conectar Google
//  Calendar u Outlook por su dirección iCal secreta. Solo lectura; los
//  eventos se ven en Hoy y se actualizan cada 15 minutos.
// ============================================================

function ago(iso: string | null): string {
  if (!iso) return 'aún sin leer';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'leído hace un momento';
  if (m < 60) return `leído hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `leído hace ${h} h` : `leído el ${new Date(iso).toLocaleDateString('es')}`;
}

export function ExternalCalendars() {
  const [list, setList] = useState<ExtCalendar[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState(CAL_COLORS[1]);
  const [busy, setBusy] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const load = () => getCalendars().then(setList);
  useEffect(() => { load(); }, []);

  async function add() {
    setBusy('add');
    try {
      const r = await addCalendar(name, url, color);
      if (r.error) toast(`Quedó guardado, pero: ${r.error}`, { tone: 'bad' });
      else toast(`Listo: ${r.events} eventos de los próximos días`);
      setAdding(false); setName(''); setUrl('');
      await load(); dataChanged();
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function refresh(c: ExtCalendar) {
    setBusy(c.id);
    try { const n = await syncCalendar(c.id); toast(`${c.name}: ${n} eventos`); dataChanged(); }
    catch (e) { toast((e as Error).message, { tone: 'bad' }); }
    finally { setBusy(null); load(); }
  }
  async function remove(c: ExtCalendar) {
    if (!(await confirm(`¿Quitar "${c.name}"?`, 'Sus eventos dejan de verse en Kaderno. Tu calendario no cambia.', 'Quitar'))) return;
    try { await removeCalendar(c.id); await load(); dataChanged(); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  }

  const urlBad = url.trim().length > 0 && !looksLikeCalendarUrl(url);
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="calendar-number-outline" size={20} color={C.brand} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Tus otros calendarios</Text>
          <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>Ve en Hoy los eventos de Google Calendar u Outlook. Kaderno solo los lee.</Text>
        </View>
      </View>
      {list?.map((c) => (
        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: c.last_error ? C.bad : C.line }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.color }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{c.name}</Text>
            <Text style={{ color: c.last_error ? C.bad : C.muted, fontSize: 12 }} numberOfLines={2}>{c.last_error ?? ago(c.last_sync)}</Text>
          </View>
          <Button label="Actualizar" size="sm" kind="ghost" busy={busy === c.id} onPress={() => refresh(c)} />
          <Pressable onPress={() => remove(c)} accessibilityRole="button" accessibilityLabel={`Quitar ${c.name}`} hitSlop={6} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={18} color={C.muted} />
          </Pressable>
        </View>
      ))}
      {!adding ? (
        (list?.length ?? 0) < 5 && <Button label="Conectar un calendario" kind="secondary" size="sm" onPress={() => setAdding(true)} />
      ) : (
        <View style={{ gap: 4 }}>
          <Field label="Nombre del calendario" placeholder="Trabajo, Familia, Universidad…" value={name} onChangeText={setName} maxLength={60} />
          <Field label="Dirección iCal secreta" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={url} onChangeText={setUrl}
            autoCapitalize="none" autoCorrect={false} error={urlBad ? 'Debe empezar con https:// o webcal://' : null} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Color">
            {CAL_COLORS.map((k) => (
              <Pressable key={k} onPress={() => setColor(k)} accessibilityRole="radio" accessibilityState={{ checked: color === k }} accessibilityLabel={`Color ${k}`}
                style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: k, borderWidth: 3, borderColor: color === k ? C.text : 'transparent' }} />
            ))}
          </View>
          <Pressable onPress={() => setHelp(!help)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
            <Ionicons name={help ? 'chevron-down' : 'chevron-forward'} size={14} color={C.brand} />
            <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>¿Dónde encuentro la dirección?</Text>
          </Pressable>
          {help && (
            <View style={{ gap: 4, padding: 10, borderRadius: 10, backgroundColor: C.surface2, marginBottom: 6 }}>
              <Text style={{ color: C.text, fontSize: 12.5 }}>Google Calendar (en el computador): Configuración → elige tu calendario en la izquierda → "Integrar el calendario" → copia "Dirección secreta en formato iCal".</Text>
              <Text style={{ color: C.text, fontSize: 12.5 }}>Outlook: Configuración → Calendario → Calendarios compartidos → "Publicar un calendario" → copia el enlace ICS.</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>Esa dirección es privada: quien la tenga ve tu calendario. Kaderno la guarda solo en tu cuenta.</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <Button label="Cancelar" kind="ghost" size="sm" onPress={() => setAdding(false)} />
            <Button label="Conectar" size="sm" busy={busy === 'add'} disabled={!url.trim() || urlBad} onPress={add} />
          </View>
        </View>
      )}
    </Card>
  );
}
