// react-native-web convierte `dataSet` en atributos data-* del HTML.
// Se usa para enganchar las animaciones CSS (lib/motion.ts) y para marcar
// zonas que no inician un arrastre (data-nodrag). En nativo se ignora.
import 'react-native';

declare module 'react-native' {
  interface ViewProps { dataSet?: Record<string, string | undefined> }
  interface PressableProps { dataSet?: Record<string, string | undefined> }
  interface TextProps { dataSet?: Record<string, string | undefined> }
}
