// La casa de la mascota: el cuarto en pixel art con la mascota adentro.
import React, { useEffect, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { Mood } from '../../lib/pets/art';
import { PET_SPOT, ROOM_H, ROOM_W, roomOffset, roomSvg, type Home } from '../../lib/pets/home';
import type { Pet } from '../../lib/pets/store';
import { PetSprite } from './PetArt';

/**
 * Llena el ancho disponible con `height` de alto. La altura manda la escala;
 * si sobra ancho, el cuarto se alarga (más pared y piso) en vez de recortarse.
 */
export function PetRoom({ pet, home, height, mood, style, children }: {
  pet: Pet; home?: Home; height: number; mood?: Mood; style?: StyleProp<ViewStyle>; children?: React.ReactNode;
}) {
  const [w, setW] = useState(0);
  // La ventana cambia con la hora: se revisa cada 5 minutos.
  const [hour, setHour] = useState(new Date().getHours());
  useEffect(() => { const id = setInterval(() => setHour(new Date().getHours()), 5 * 60_000); return () => clearInterval(id); }, []);
  const h = home ?? pet.home ?? {};
  const fits = w ? w / height >= ROOM_W / ROOM_H : true;
  const cols = w && fits ? Math.min(400, Math.ceil(w / (height / ROOM_H))) : ROOM_W;
  // Igual que preserveAspectRatio "slice": cubre todo sin deformar.
  const scale = w ? Math.max(w / cols, height / ROOM_H) : 0;
  const xml = useMemo(() => roomSvg(h, { hour, slice: true, cols }), [JSON.stringify(h), hour, cols]);
  const ox = (w - cols * scale) / 2 + roomOffset(cols) * scale, oy = height - ROOM_H * scale;
  const petSize = Math.round(32 * scale);
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}
      style={[{ height, overflow: 'hidden', borderRadius: 16, backgroundColor: '#2b2433' }, style]}
      accessibilityRole="image" accessibilityLabel={`La casa de ${pet.name}`}>
      {w > 0 && (
        <>
          <SvgXml xml={xml} width={w} height={height} />
          <View style={{ position: 'absolute', left: Math.round(ox + (PET_SPOT.x - 16) * scale), top: Math.round(oy + (PET_SPOT.y - 31) * scale) }}>
            <PetSprite species={pet.species} outfit={pet.outfit} mood={mood} size={petSize} />
          </View>
        </>
      )}
      {children}
    </View>
  );
}

/** Miniatura del cuarto (para la tienda). */
export function RoomThumb({ home, width = 132 }: { home: Home; width?: number }) {
  const xml = useMemo(() => roomSvg(home, { hour: 11, width, height: Math.round((width * ROOM_H) / ROOM_W) }), [JSON.stringify(home), width]);
  return (
    <View style={{ width, height: Math.round((width * ROOM_H) / ROOM_W), borderRadius: 8, overflow: 'hidden' }}>
      <SvgXml xml={xml} width={width} height={Math.round((width * ROOM_H) / ROOM_W)} />
    </View>
  );
}
