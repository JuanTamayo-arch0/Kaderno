import React from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { C, uiScheme } from '../../lib/theme';
import { BRAND_FONT, LOGO, logoColors, logoToneFor, type LogoSpace, type LogoTone } from '../../lib/brand';

// ============================================================
//  Logo de Kaderno (v26): la raya del margen junto a la K. El color del logo
//  no sigue al tema ni al acento: es siempre el mismo, para que se reconozca.
//  Sin `tone`, escoge solo: tinta sobre fondos claros, papel sobre oscuros.
// ============================================================

export function KadernoMark({ size = 28, tone, space = 'estudio' }: { size?: number; tone?: LogoTone; space?: LogoSpace }) {
  const c = logoColors(tone ?? logoToneFor(uiScheme()), space);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${LOGO.size} ${LOGO.size}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {c.tile ? <Rect width={LOGO.size} height={LOGO.size} rx={LOGO.radius} fill={c.tile} /> : null}
      <Path d={LOGO.margin} stroke={c.margin} strokeWidth={LOGO.marginWidth} strokeLinecap="round" fill="none" />
      <Path d={LOGO.k} stroke={c.k} strokeWidth={LOGO.kWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** "kaderno" en minúscula, con la letra de la marca. */
export function KadernoWordmark({ size = 20, color, style }: { size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[{ color: color ?? C.text, fontSize: size, fontWeight: '800', letterSpacing: -0.03 * size, fontFamily: BRAND_FONT }, style]}>kaderno</Text>
  );
}

/** Logo y nombre juntos. Lectores de pantalla oyen "Kaderno". */
export function KadernoLockup({ size = 28, tone, color, gap = 10, flex }: { size?: number; tone?: LogoTone; color?: string; gap?: number; flex?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap, ...(flex ? { flex: 1 } : null) }} accessible accessibilityRole="image" accessibilityLabel="Kaderno">
      <KadernoMark size={size} tone={tone} />
      <KadernoWordmark size={Math.round(size * 0.78)} color={color} />
    </View>
  );
}
