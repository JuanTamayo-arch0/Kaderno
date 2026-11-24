import { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform } from 'react-native';
import { inDragZone, isDownDrag, shouldDismiss } from './mobileLayout';
export { inDragZone, isDownDrag, shouldDismiss };

// ============================================================
//  v29, fase 3: arrastrar una hoja hacia abajo para cerrarla, como en las
//  apps del celular. La comparten la hoja de editar tarea, el menú de una
//  tarea, Agregar y la hoja de tarjetas.
//
//  Los oyentes van en el contenedor de afuera de la hoja: en el sistema de
//  gestos de react-native(-web), al moverse el dedo solo un ANCESTRO de quien
//  recibió el toque puede quedarse con el gesto (por eso la versión de v26,
//  puesta en el encabezado dentro de la hoja, no respondía en la web). Para no
//  robarle el desplazamiento al contenido, solo cuenta si el gesto empieza en
//  la franja de arriba (`zone` px: la rayita y el título).
// ============================================================

export function useSheetDrag(visible: boolean, onClose: () => void, zone = 72) {
  const dy = useRef(new Animated.Value(0)).current;
  const ref = useRef<any>(null);
  const layoutTop = useRef<number | null>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const topOf = (): number | null => {
    const el = ref.current;
    if (Platform.OS === 'web' && el?.getBoundingClientRect) return el.getBoundingClientRect().top;
    return layoutTop.current;
  };
  const pan = useMemo(() => PanResponder.create({
    // Antes de quedarse con el gesto, y0 todavía vale 0: el punto de partida es moveY - dy.
    onMoveShouldSetPanResponderCapture: (_, g) => isDownDrag(g.dy, g.dx) && inDragZone(g.moveY - g.dy, topOf(), zone),
    onMoveShouldSetPanResponder: (_, g) => isDownDrag(g.dy, g.dx) && inDragZone(g.moveY - g.dy, topOf(), zone),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => dy.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (shouldDismiss(g.dy, g.vy)) Animated.timing(dy, { toValue: 700, duration: 180, useNativeDriver: false }).start(() => { closeRef.current(); dy.setValue(0); });
      else Animated.spring(dy, { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(dy, { toValue: 0, useNativeDriver: false }).start(),
  }), [zone]);
  useEffect(() => { if (visible) dy.setValue(0); }, [visible]);
  // La hoja ocupa el modal a pantalla completa: su `y` es su borde de arriba en la pantalla.
  const onLayout = (e: any) => { layoutTop.current = e?.nativeEvent?.layout?.y ?? null; };
  return { ref, onLayout, handlers: pan.panHandlers, style: { transform: [{ translateY: dy }] } };
}
