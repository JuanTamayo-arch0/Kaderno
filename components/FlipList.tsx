import React, { useLayoutEffect, useRef } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { flipChildren, type FlipPos } from '../lib/motion';

// ============================================================
//  Lista que se reacomoda suave (v26, fase 4). Envuelve filas marcadas con
//  dataSet={{ flip: id }}: al cambiar de lugar se deslizan (FLIP, solo web).
// ============================================================
export function FlipList({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<any>(null);
  const rects = useRef(new Map<string, FlipPos>());
  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    rects.current = flipChildren(ref.current as HTMLElement | null, rects.current);
  });
  return <View ref={ref} style={style}>{children}</View>;
}
