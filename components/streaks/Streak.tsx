import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { C } from '../../lib/theme';
import { Button, Card } from '../ds';
import { getStreakSummary, buyShield } from '../../lib/studyDb';
import { onStreakChanged, onDataChanged } from '../../lib/uiBus';
import { usePets, activePet, loadPets } from '../../lib/pets/store';
import {
  type StreakSummary, type DotState, MAX_SHIELDS, SHIELD_PRICE, REPAIR_RULE,
  todayHint, brokeMessage, repairProgress, weeksLabel, daysLabel,
} from '../../lib/streaks';
import { toast, friendlyError } from '../../lib/feedback';
import { t, daysLong, trn } from '../../lib/i18n';

// ============================================================
//  Rachas amables (v20, sección D): meta semanal con siete puntos, racha
//  diaria más pequeña, escudos y "Reparar racha".
// ============================================================

/** Resumen de la racha; se recarga al volver a la pantalla y cuando algo la cambia. */
export function useStudyStreak(): { s: StreakSummary | null; reload: () => void } {
  const [s, setS] = useState<StreakSummary | null>(null);
  const reload = useCallback(() => { getStreakSummary().then(setS).catch(() => {}); }, []);
  useFocusEffect(reload);
  useEffect(() => onStreakChanged(reload), [reload]);
  useEffect(() => onDataChanged(reload), [reload]);
  return { s, reload };
}

const DOT: Record<DotState, { bg: string; border: string; fg: string }> = {
  done: { bg: C.good, border: C.good, fg: '#0b1a12' },
  protected: { bg: C.brand + '33', border: C.brand, fg: C.brand },
  missed: { bg: 'transparent', border: C.line, fg: C.muted },
  today: { bg: 'transparent', border: C.good, fg: C.text },
  future: { bg: 'transparent', border: C.line + '88', fg: C.muted },
};
const STATE_TXT: Record<DotState, string> = { done: t('estudiaste'), protected: t('protegido con escudo'), missed: t('sin estudio'), today: t('hoy, aún no cuenta'), future: t('por venir') };
const DAY_NAMES = [...daysLong().slice(1), daysLong()[0]];

/** L M M J V S D con el estado de cada día. */
export function WeekDots({ s, size = 26 }: { s: StreakSummary; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: size > 22 ? 8 : 5 }} accessibilityRole="summary"
      accessibilityLabel={t('Esta semana: {weekDone} de {goal} días', { weekDone: s.weekDone, goal: s.goal })}>
      {s.week.map((w, i) => {
        const st = DOT[w.state];
        return (
          <View key={w.day} accessibilityLabel={`${DAY_NAMES[i]}: ${STATE_TXT[w.state]}`}
            style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: st.bg, borderWidth: w.state === 'today' ? 2 : 1, borderColor: st.border, borderStyle: w.state === 'future' ? 'dashed' : 'solid', alignItems: 'center', justifyContent: 'center' }}>
            {w.state === 'protected'
              ? <Ionicons name="shield" size={size * 0.5} color={C.brand} />
              : <Text style={{ color: st.fg, fontSize: Math.max(10.5, size * 0.42), fontWeight: '800' }}>{w.letter}</Text>}
          </View>
        );
      })}
    </View>
  );
}

function Shields({ n }: { n: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={t('{n} de {MAX_SHIELDS} escudos', { n, MAX_SHIELDS })}>
      {Array.from({ length: MAX_SHIELDS }, (_, i) => (
        <Ionicons key={i} name={i < n ? 'shield' : 'shield-outline'} size={15} color={i < n ? C.brand : C.muted} />
      ))}
    </View>
  );
}

/** Tarjeta completa: Estudiar y Enfoque. */
export function StreakCard({ s, onChanged, style }: { s: StreakSummary; onChanged?: () => void; style?: any }) {
  const pets = usePets();
  const pet = activePet(pets);
  const [busy, setBusy] = useState(false);
  const goalMet = s.weekDone >= s.goal;
  async function buy() {
    setBusy(true);
    try {
      const n = await buyShield();
      toast(t('Escudo comprado. Tienes {n} de {MAX_SHIELDS}.', { n, MAX_SHIELDS }), { tone: 'good' });
      loadPets(true).catch(() => {});
      onChanged?.();
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setBusy(false); }
  }
  return (
    <Card style={style}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Racha semanal')}</Text>
          <Text style={{ color: s.weekly ? C.goodText : C.text, fontSize: 26, fontWeight: '800' }}>{weeksLabel(s.weekly)}</Text>
          <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{t('Meta: {goal} días por semana · {v}', { goal: s.goal, v: goalMet ? t('cumplida esta semana') : trn('llevas {v}', { v: s.weekDone }) })}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{s.daily} {s.daily === 1 ? t('día seguido') : t('días seguidos')}</Text>
          <Shields n={s.shields} />
        </View>
      </View>
      <View style={{ marginTop: 14 }}><WeekDots s={s} /></View>
      <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 10 }}>{todayHint(s)}</Text>
      {s.shieldWillCover > 0 && (
        <Text style={{ color: C.brand, fontSize: 12.5, marginTop: 4 }}>
          {s.shieldWillCover === 1 ? t('Ayer no estudiaste: tu escudo lo cubre cuando hoy cuente.') : t('Tus escudos cubren los dos días que faltaste cuando hoy cuente.')}
        </Text>
      )}
      <RepairBox s={s} />
      {!!pet && s.shields < MAX_SHIELDS && (
        <Pressable onPress={buy} disabled={busy} accessibilityRole="button" accessibilityLabel={t('Comprar escudo por {SHIELD_PRICE} monedas', { SHIELD_PRICE })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start', opacity: busy ? 0.5 : 1 }}>
          <Ionicons name="shield-half-outline" size={15} color={C.brand} />
          <Text style={{ color: C.brand, fontSize: 13, fontWeight: '700' }}>{t('Comprar escudo · {SHIELD_PRICE} monedas', { SHIELD_PRICE })}</Text>
          <Text style={{ color: C.muted, fontSize: 12 }}>{t('(tienes {coins})', { coins: pet.coins })}</Text>
        </Pressable>
      )}
      <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 10 }}>
        {t('Un día cuenta con 10 min de enfoque, 1 tarea o 10 tarjetas. Cada 7 días seguidos ganas un escudo que protege un día sin estudio.')}</Text>
    </Card>
  );
}

function RepairBox({ s }: { s: StreakSummary }) {
  const msg = brokeMessage(s);
  const pr = repairProgress(s);
  if (!msg || !pr) return null;
  return (
    <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.warn + '14', borderWidth: 1, borderColor: C.warn + '55' }}>
      <Text style={{ color: C.text, fontSize: 13.5 }}>{msg}</Text>
      <Text style={{ color: C.warnText, fontSize: 13, fontWeight: '700', marginTop: 6 }}>{t('Reparar racha: haz hoy el doble ({focus} min de enfoque o {cards} tarjetas)', { focus: REPAIR_RULE.focus, cards: REPAIR_RULE.cards })}</Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface2, marginTop: 8, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(pr.frac * 100)}%`, height: '100%', backgroundColor: C.warn }} />
      </View>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{pr.text}</Text>
    </View>
  );
}

/** Versión corta para Hoy: puntos y "2 de 4 esta semana". */
export function StreakMini({ s, onPress }: { s: StreakSummary; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t('Racha: {weekly}, {weekDone} de {goal} días esta semana', { weekly: weeksLabel(s.weekly), weekDone: s.weekDone, goal: s.goal })}
      style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="flame" size={16} color={s.weekly ? C.good : C.muted} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>{t('{weekly} cumpliendo tu meta', { weekly: weeksLabel(s.weekly) })}</Text>
        <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('{weekDone} de {goal}', { weekDone: s.weekDone, goal: s.goal })}</Text>
      </View>
      <WeekDots s={s} size={22} />
    </Pressable>
  );
}

/** Aviso en Hoy cuando la racha se rompió y se puede reparar. */
export function StreakNudge({ s, onFocus }: { s: StreakSummary; onFocus: () => void }) {
  const msg = brokeMessage(s);
  const pr = repairProgress(s);
  if (!msg || !pr || pr.frac >= 1) return null;
  return (
    <Card style={{ marginBottom: 12, borderLeftWidth: 4, borderLeftColor: C.warn }}>
      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{msg}</Text>
      <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 4 }}>{t('Reparar racha: haz hoy el doble ({focus} min de enfoque o {cards} tarjetas). {text}', { focus: REPAIR_RULE.focus, cards: REPAIR_RULE.cards, text: pr.text })}</Text>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: C.surface2, marginTop: 8, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(pr.frac * 100)}%`, height: '100%', backgroundColor: C.warn }} />
      </View>
      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        <Button label={t('Empezar enfoque')} icon="timer-outline" size="sm" kind="secondary" onPress={onFocus} />
      </View>
    </Card>
  );
}
