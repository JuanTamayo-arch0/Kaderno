import { Alert, Platform } from 'react-native';

// ============================================================
//  Confirmar / avisar en las dos plataformas.
//  Alert.alert en web sólo muestra el mensaje y se come los botones, así que
//  ahí usamos window.confirm. Devuelve una promesa para poder hacer
//  `if (!(await confirm(...))) return;`
// ============================================================

export function confirm(title: string, message?: string, okLabel = 'Sí, continuar', cancelLabel = 'Cancelar'): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return Promise.resolve(true);
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}
