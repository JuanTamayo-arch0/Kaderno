import React from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { C, uiScheme } from '../../lib/theme';
import { getSpace } from '../../lib/mode';
import { BRAND_FONT, LOGO, logoColors, logoToneFor, pencilShapes, type LogoSpace, type LogoTone, type Shape } from '../../lib/brand';

// ============================================================
//  Logo de Kaderno: la margen del cuaderno como un lápiz (v28) junto a la K.
//  El color del logo no sigue al tema ni al acento: es siempre el mismo, para
//  que se reconozca. Sin `tone`, escoge solo: tinta sobre fondos claros, papel
//  sobre oscuros. Las piezas salen de lib/brand.ts, igual que los íconos.
// ============================================================

/** Una pieza del lápiz con react-native-svg. */
export function ShapeEl({ s }: { s: Shape }) {
  if (s.t === 'rect') return <Rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} fill={s.fill} opacity={s.op} />;
  return <Path d={s.d} fill={s.fill ?? 'none'} stroke={s.stroke} strokeWidth={s.sw} strokeLinejoin="round" opacity={s.op} />;
}

export function KadernoMark({ size = 28, tone, space }: { size?: number; tone?: LogoTone; space?: LogoSpace }) {
  // En Trabajo, el lápiz es cobre o terracota (v26, fase 2).
  const c = logoColors(tone ?? logoToneFor(uiScheme()), space ?? getSpace());
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${LOGO.size} ${LOGO.size}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {c.tile ? <Rect width={LOGO.size} height={LOGO.size} rx={LOGO.radius} fill={c.tile} /> : null}
      <G>{pencilShapes(c).map((s, i) => <ShapeEl key={i} s={s} />)}</G>
      <Path d={LOGO.k} stroke={c.k} strokeWidth={LOGO.kWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** "kaderno" en minúscula, con la letra de la marca. */
export function KadernoWordmark({ size = 20, color, style }: { size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text dataSet={{ head: '1' }} style={[{ color: color ?? C.text, fontSize: size, fontWeight: '800', letterSpacing: -0.03 * size, fontFamily: BRAND_FONT }, style]}>kaderno</Text>
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
