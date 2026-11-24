import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { C } from '../lib/theme';
import { LANGS, lang, t, type Lang } from '../lib/i18n';
import { setLang } from '../lib/i18nApp';

// ============================================================
//  v30: selector de idioma. Cada idioma se muestra con su propio nombre
//  ("Español", "English"), así lo reconoce quien no entiende el otro.
// ============================================================

export function LangPicker({ compact, onDark }: { compact?: boolean; onDark?: boolean }) {
  const cur = lang();
  const pick = (l: Lang) => { if (l !== cur) setLang(l).catch(() => {}); };
  const fg = onDark ? '#fff' : C.text;
  const line = onDark ? 'rgba(255,255,255,0.25)' : C.line;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('Idioma')} style={{ flexDirection: 'row', gap: compact ? 4 : 8, flexWrap: 'wrap' }}>
      {LANGS.map((l) => {
        const on = l.id === cur;
        return (
          <Pressable key={l.id} onPress={() => pick(l.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={l.native}
            style={{ paddingVertical: compact ? 6 : 8, paddingHorizontal: compact ? 10 : 14, borderRadius: 99, borderWidth: 1,
              borderColor: on ? C.brand : line, backgroundColor: on ? C.brand : 'transparent' }}>
            <Text style={{ color: on ? C.onBrand : fg, fontSize: compact ? 12.5 : 13.5, fontWeight: '700' }}>{compact ? l.id.toUpperCase() : l.native}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
