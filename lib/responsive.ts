import { useWindowDimensions } from 'react-native';

export const SIDEBAR_W = 232;   // ancho de la barra lateral en escritorio
export const CONTENT_MAX = 920; // ancho máximo del contenido en pantallas anchas
export const WIDE_BREAKPOINT = 900;

// Detecta si estamos en una pantalla ancha (escritorio / tablet horizontal).
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  return { width, height, isWide };
}
