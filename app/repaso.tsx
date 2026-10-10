import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, S, shadow } from '../lib/theme';
import { Flashcard, getDueFlashcards, reviewFlashcard } from '../lib/db';

export default function Repaso() {
  const router = useRouter();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try { const c = await getDueFlashcards(); setCards(c); setI(0); setFlipped(false); setDone(0); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const card = cards[i];

  async function answer(remembered: boolean) {
    if (!card) return;
    try { await reviewFlashcard(card.id, remembered, card.box); } catch { /* noop */ }
    setDone((d) => d + 1);
    setFlipped(false);
    setI((x) => x + 1);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={C.text} /></Pressable>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', flex: 1 }}>Repaso</Text>
        {cards.length > 0 && i < cards.length && (
          <Text style={{ color: C.muted }}>{i + 1} / {cards.length}</Text>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={C.brand} /></View>
      ) : cards.length === 0 ? (
        <Empty title="Nada para repasar hoy" subtitle="Genera flashcards desde una nota (botón 🃏) y aquí aparecerán cuando toque repasarlas." />
      ) : i >= cards.length ? (
        <Empty title="¡Repaso completado! 🎉" subtitle={`Revisaste ${done} tarjeta${done === 1 ? '' : 's'}. Vuelve mañana para la siguiente ronda.`} />
      ) : (
        <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
          <Pressable onPress={() => setFlipped((f) => !f)}
            style={{ backgroundColor: C.surface, borderColor: flipped ? C.brand : C.line, borderWidth: 1.5, borderRadius: R.xl, padding: 28, minHeight: 260, justifyContent: 'center', alignItems: 'center', ...shadow }}>
            <Text style={{ color: flipped ? C.brand : C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
              {flipped ? 'Respuesta' : 'Pregunta'}
            </Text>
            <Text style={{ color: C.text, fontSize: 20, textAlign: 'center', lineHeight: 28 }}>
              {flipped ? card.back : card.front}
            </Text>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 22 }}>
              {flipped ? '' : 'Toca para ver la respuesta'}
            </Text>
          </Pressable>

          {flipped && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 22 }}>
              <Pressable onPress={() => answer(false)} style={{ flex: 1, backgroundColor: C.bad + '22', borderColor: C.bad + '66', borderWidth: 1, borderRadius: R.md, padding: 16, alignItems: 'center' }}>
                <Text style={{ color: C.bad, fontWeight: '700' }}>No la supe</Text>
              </Pressable>
              <Pressable onPress={() => answer(true)} style={{ flex: 1, backgroundColor: C.good + '22', borderColor: C.good + '66', borderWidth: 1, borderRadius: R.md, padding: 16, alignItems: 'center' }}>
                <Text style={{ color: C.good, fontWeight: '700' }}>¡La supe!</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Empty({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 32 }}>🃏</Text>
      </View>
      <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: C.muted, fontSize: 13.5, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>{subtitle}</Text>
    </View>
  );
}
