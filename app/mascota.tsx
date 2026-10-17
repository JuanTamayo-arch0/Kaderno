import React, { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { RequireAuth } from '../components/RequireAuth';
import { Screen, Button, Card, Segmented, SectionLabel, Skeleton, IconButton } from '../components/ds';
import { useResponsive } from '../lib/responsive';
import { ITEMS, SPECIES, type ItemId, type Species } from '../lib/pets/art';
import { ITEM_RULES, ITEM_SHORT, SHOP_ORDER, adoptPrice, coinLabel, itemState, levelProgress, DEFAULT_NAMES, type ItemState } from '../lib/pets/economy';
import { activePet, activatePet, adoptPet, buyItem, loadPets, renamePet, usePets, wearItem, type Pet } from '../lib/pets/store';
import { confirm, friendlyError, notify, toast } from '../lib/feedback';
import { PetChooser, PERSONALITY } from '../components/pets/PetChooser';
import { PetSettings } from '../components/pets/PetSettings';
import { CoinIcon, PetImage, PetSprite } from '../components/pets/PetArt';

// ============================================================
//  Mascota: verla en grande, su nivel y monedas, la tienda de ropa,
//  adoptar y cambiar de mascota, cómo se gana y sus ajustes.
// ============================================================

type Tab = 'ropa' | 'mascotas' | 'ganar' | 'ajustes';
const STATE_TEXT: Record<ItemState, string> = { puesta: 'Puesta', tuya: 'Tuya', comprable: '', cara: '', bloqueada: '' };

function Mascota() {
  const s = usePets();
  const pet = activePet(s);
  const [tab, setTab] = useState<Tab>('ropa');
  useFocusEffect(useCallback(() => { loadPets(true).catch(() => {}); }, []));

  if (!s.loaded) {
    return <Screen title="Mascota" back="/" nav="mascota" maxWidth={860}><Skeleton height={200} /><Skeleton height={300} style={{ marginTop: 12 }} /></Screen>;
  }
  if (s.available === false) {
    return (
      <Screen title="Mascota" back="/" nav="mascota" maxWidth={720}>
        <Card style={{ gap: 8 }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Falta activar las mascotas</Text>
          <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>Hay que correr supabase/schema_v16.sql en Supabase (SQL Editor). Después recarga la página.</Text>
        </Card>
      </Screen>
    );
  }
  if (!pet) {
    return (
      <Screen title="Elige tu compañero de estudio" back="/" nav="mascota" maxWidth={920}
        subtitle="Te acompaña en todas las pantallas, celebra lo que terminas y te da un empujón cuando lo necesitas.">
        <PetChooser onDone={() => toast('¡Bienvenida a tu nueva mascota!', { tone: 'good' })} />
      </Screen>
    );
  }
  return (
    <Screen title="Mascota" back="/" nav="mascota" maxWidth={860}>
      <Hero pet={pet} earnedToday={s.earnedToday} />
      <Segmented<Tab> value={tab} onChange={setTab} style={{ marginTop: 18, marginBottom: 14 }} items={[
        { key: 'ropa', label: 'Ropa', icon: 'shirt-outline' },
        { key: 'mascotas', label: 'Mascotas', icon: 'paw-outline', count: s.pets.length },
        { key: 'ganar', label: 'Cómo se gana', icon: 'trophy-outline' },
        { key: 'ajustes', label: 'Ajustes', icon: 'options-outline' },
      ]} />
      {tab === 'ropa' && <Shop pet={pet} owned={new Set(s.items[pet.id] ?? [])} />}
      {tab === 'mascotas' && <Pets pets={s.pets} active={pet} />}
      {tab === 'ganar' && <HowToEarn pet={pet} />}
      {tab === 'ajustes' && <Card padded={false}><PetSettings /></Card>}
    </Screen>
  );
}

function Hero({ pet, earnedToday }: { pet: Pet; earnedToday: number }) {
  const { isWide } = useResponsive();
  const lv = levelProgress(pet.xp);
  const coin = SPECIES[pet.species].coin;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pet.name);
  async function save() {
    try { await renamePet(pet.id, name); setEditing(false); toast('Nombre guardado', { tone: 'good' }); }
    catch (e) { notify('No se pudo guardar', friendlyError(e)); }
  }
  return (
    <Card style={{ flexDirection: isWide ? 'row' : 'column', alignItems: 'center', gap: isWide ? 24 : 12, paddingVertical: 20 }}>
      <PetSprite species={pet.species} outfit={pet.outfit} size={160} label={`${pet.name}, ${SPECIES[pet.species].name.toLowerCase()}`} />
      <View style={{ flex: 1, alignSelf: 'stretch', gap: 10 }}>
        {editing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput value={name} onChangeText={(v) => setName(v.slice(0, 24))} autoFocus maxLength={24} onSubmitEditing={save} accessibilityLabel="Nombre de la mascota"
              style={[{ flex: 1, color: C.text, fontSize: 22, fontWeight: '800', borderBottomWidth: 2, borderBottomColor: C.brand, paddingVertical: 4 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
            <Button label="Guardar" size="sm" onPress={save} />
            <IconButton icon="close" label="Cancelar" onPress={() => { setEditing(false); setName(pet.name); }} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: isWide ? 'flex-start' : 'center' }}>
            <Text style={{ color: C.text, fontSize: 26, fontWeight: '900' }} numberOfLines={1}>{pet.name}</Text>
            <IconButton icon="pencil" label="Cambiar nombre" onPress={() => { setName(pet.name); setEditing(true); }} size={18} />
          </View>
        )}
        <Text style={{ color: C.muted, fontSize: 13.5, textAlign: isWide ? 'left' : 'center' }}>{SPECIES[pet.species].name} · {PERSONALITY[pet.species].trait}</Text>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: C.text, fontWeight: '800' }}>Nivel {lv.level}</Text>
            <Text style={{ color: C.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{lv.into} de {lv.span} para el nivel {lv.level + 1}</Text>
          </View>
          <View style={{ height: 10, borderRadius: 99, backgroundColor: C.surface2, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: lv.span, now: lv.into }}>
            <View style={{ width: `${Math.round(lv.pct * 100)}%`, height: '100%', backgroundColor: C.brand, borderRadius: 99 }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface2, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12 }}>
            <CoinIcon species={pet.species} size={20} />
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 15, fontVariant: ['tabular-nums'] }}>{coinLabel(pet.coins, coin)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: C.line }}>
            <Ionicons name="sunny-outline" size={16} color={C.muted} />
            <Text style={{ color: C.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>Hoy: {earnedToday} de 300</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

function Shop({ pet, owned }: { pet: Pet; owned: Set<string> }) {
  const { isWide } = useResponsive();
  const coin = SPECIES[pet.species].coin;
  const [busy, setBusy] = useState<string | null>(null);
  async function press(id: ItemId, st: ItemState) {
    const r = ITEM_RULES[id];
    if (st === 'bloqueada') { toast(`${ITEMS[id].name}: se desbloquea en el nivel ${r.level}.`); return; }
    if (st === 'cara') { toast(`Te faltan ${coinLabel(r.price - pet.coins, coin)} para ${ITEMS[id].name.toLowerCase()}.`); return; }
    setBusy(id);
    try {
      if (st === 'puesta') await wearItem(pet.id, r.slot, null);
      else if (st === 'tuya') await wearItem(pet.id, r.slot, id);
      else if (await confirm(`¿Comprar ${ITEMS[id].name.toLowerCase()}?`, `Cuesta ${coinLabel(r.price, coin)}. Es solo para ${pet.name}.`, 'Comprar')) {
        await buyItem(id);
        toast(`${pet.name} estrena ${ITEMS[id].name.toLowerCase()}`, { tone: 'good' });
      }
    } catch (e) { notify('No se pudo', friendlyError(e)); }
    finally { setBusy(null); }
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: C.muted, fontSize: 13 }}>Toca una prenda para comprarla, ponerla o quitarla. Se paga con {coin.many} y es solo para {pet.name}.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {SHOP_ORDER.map((id) => {
          const st = itemState(id, pet, owned);
          const r = ITEM_RULES[id];
          const dim = st === 'bloqueada';
          return (
            <Pressable key={id} onPress={() => press(id, st)} disabled={busy === id} dataSet={{ press: '1' }}
              accessibilityRole="button" accessibilityLabel={`${ITEMS[id].name}. ${st === 'puesta' ? 'Puesta, toca para quitarla' : st === 'tuya' ? 'Tuya, toca para ponerla' : st === 'bloqueada' ? `Nivel ${r.level}` : coinLabel(r.price, coin)}`}
              style={({ focused }: any) => [{
                flexBasis: isWide ? '18%' : '30%', flexGrow: 1, alignItems: 'center', gap: 2, paddingTop: 8, paddingBottom: 10, paddingHorizontal: 4,
                borderRadius: 16, borderWidth: st === 'puesta' ? 2 : 1, borderColor: st === 'puesta' ? C.good : C.line, backgroundColor: C.surface, opacity: dim ? 0.55 : 1,
              }, focused ? ({ outlineColor: C.focus, outlineWidth: 2, outlineStyle: 'solid' } as any) : null]}>
              <PetImage species={pet.species} outfit={{ ...pet.outfit, [r.slot]: id }} size={64} />
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>{ITEM_SHORT[id]}</Text>
              {st === 'puesta' || st === 'tuya'
                ? <Text style={{ color: st === 'puesta' ? C.goodText : C.muted, fontSize: 12, fontWeight: '800' }}>{STATE_TEXT[st]}</Text>
                : st === 'bloqueada'
                  ? <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>Nivel {r.level}</Text>
                  : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><CoinIcon species={pet.species} size={14} /><Text style={{ color: st === 'cara' ? C.muted : C.warnText, fontSize: 12.5, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{r.price.toLocaleString('es-CO')}</Text></View>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Pets({ pets, active }: { pets: Pet[]; active: Pet }) {
  const coin = SPECIES[active.species].coin;
  const price = adoptPrice(pets.length);
  const [adopting, setAdopting] = useState<Species | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function use(p: Pet) {
    try { await activatePet(p.id); toast(`Ahora te acompaña ${p.name}`, { tone: 'good' }); }
    catch (e) { notify('No se pudo', friendlyError(e)); }
  }
  async function adopt(sp: Species) {
    setBusy(true);
    try {
      const p = await adoptPet(sp, name.trim() || DEFAULT_NAMES[sp]);
      setAdopting(null); toast(`¡Adoptaste a ${p.name}!`, { tone: 'good' });
    } catch (e) { notify('No se pudo adoptar', friendlyError(e)); }
    finally { setBusy(false); }
  }
  return (
    <View style={{ gap: 10 }}>
      {pets.length < 4 && (
        <Text style={{ color: C.muted, fontSize: 13 }}>
          Adoptar la siguiente cuesta {coinLabel(price, coin)} de {active.name}. Cada mascota guarda su nivel, su ropa y sus monedas; gana la que tengas activa.
        </Text>
      )}
      {(Object.keys(SPECIES) as Species[]).map((sp) => {
        const p = pets.find((x) => x.species === sp);
        if (p) {
          const lv = levelProgress(p.xp).level;
          return (
            <Card key={sp} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: p.active ? C.brand : C.line }}>
              <PetImage species={sp} outfit={p.outfit} size={64} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{p.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={{ color: C.muted, fontSize: 13 }}>Nivel {lv} ·</Text>
                  <CoinIcon species={sp} size={14} />
                  <Text style={{ color: C.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>{coinLabel(p.coins, SPECIES[sp].coin)}</Text>
                </View>
              </View>
              {p.active ? <Text style={{ color: C.brand, fontWeight: '800', fontSize: 13 }}>Te acompaña</Text> : <Button label="Usar" size="sm" kind="secondary" onPress={() => use(p)} />}
            </Card>
          );
        }
        const can = active.coins >= price;
        return (
          <Card key={sp} style={{ gap: 10, borderStyle: 'dashed' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ opacity: 0.6 }}><PetImage species={sp} size={64} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>{SPECIES[sp].name}</Text>
                <Text style={{ color: C.muted, fontSize: 13 }}>{PERSONALITY[sp].trait} · gana {SPECIES[sp].coin.many}</Text>
              </View>
              {adopting !== sp && (
                <Button label={can ? 'Adoptar' : `Faltan ${(price - active.coins).toLocaleString('es-CO')}`} size="sm" kind={can ? 'primary' : 'secondary'} disabled={!can}
                  onPress={() => { setAdopting(sp); setName(DEFAULT_NAMES[sp]); }} />
              )}
            </View>
            {adopting === sp && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput value={name} onChangeText={(v) => setName(v.slice(0, 24))} autoFocus maxLength={24} accessibilityLabel={`Nombre para el ${SPECIES[sp].name.toLowerCase()}`}
                  onSubmitEditing={() => adopt(sp)}
                  style={[{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
                <Button label={`Pagar ${price.toLocaleString('es-CO')}`} size="sm" busy={busy} onPress={() => adopt(sp)} />
                <IconButton icon="close" label="Cancelar" onPress={() => setAdopting(null)} />
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
}

function HowToEarn({ pet }: { pet: Pet }) {
  const coin = SPECIES[pet.species].coin;
  const rows: [string, string][] = [
    ['Minuto de enfoque completado', '+1'],
    ['Tarea terminada a tiempo', '+5'],
    ['Tarea terminada tarde', '+2'],
    ['10 tarjetas de repaso', '+3'],
    ['Todo lo de hoy listo', '+10'],
    ['Racha: primer logro del día', '+5 por día seguido, hasta +35'],
  ];
  return (
    <View style={{ gap: 12 }}>
      <Card padded={false}>
        {rows.map(([a, b], i) => (
          <View key={a} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
            <Text style={{ color: C.text, fontSize: 14.5, flex: 1 }}>{a}</Text>
            <Text style={{ color: C.warnText, fontSize: 14.5, fontWeight: '800' }}>{b}</Text>
          </View>
        ))}
      </Card>
      <SectionLabel text="Reglas" />
      <Card style={{ gap: 8 }}>
        <Text style={{ color: C.muted, fontSize: 13.5, lineHeight: 20 }}>Gana la mascota activa, en {coin.many}. Lo cuenta el servidor a partir de lo que ya haces en Kaderno.</Text>
        <Text style={{ color: C.muted, fontSize: 13.5, lineHeight: 20 }}>Tope de 300 por día. Cada tarea paga una sola vez, aunque la desmarques y la vuelvas a marcar. Una tarea creada y marcada en menos de un minuto no paga.</Text>
        <Text style={{ color: C.muted, fontSize: 13.5, lineHeight: 20 }}>El nivel sube con todo lo ganado (gastar no lo baja) y desbloquea ropa: bufanda y boina en el 2, audífonos en el 3, gafas de sol en el 4, birrete en el 6 y corona en el 10.</Text>
      </Card>
    </View>
  );
}

export default function MascotaProtegida() {
  return <RequireAuth><Mascota /></RequireAuth>;
}
