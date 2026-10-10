import React from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { PERSONALIZE, backgroundOf, hasWallpaper } from '../lib/theme';

// Capa de fondo de pantalla que se dibuja detrás de toda la app.
// - Foto propia (bgCustom): se usa <Image> (funciona en web y nativo).
// - Degradado por defecto: CSS en web, color sólido en nativo.
export function AppBackground() {
  const s = PERSONALIZE;
  if (!hasWallpaper(s)) return null;

  if (s.bgId === 'custom' && s.bgCustom) {
    return <Image source={{ uri: s.bgCustom }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  }
  const bg = backgroundOf(s.bgId);
  if (!bg) return null;
  if (Platform.OS === 'web') {
    return React.createElement('div', {
      style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: bg.css },
    });
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: bg.solid }]} />;
}
