// Instalar Kaderno como app (PWA). Chrome/Edge/Android avisan con el evento
// "beforeinstallprompt"; en iPhone se instala desde Compartir > Agregar a inicio.
import { Platform } from 'react-native';

let deferred: any = null;
const ls = new Set<() => void>();
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); deferred = e; ls.forEach((l) => l()); });
  window.addEventListener('appinstalled', () => { deferred = null; ls.forEach((l) => l()); });
}
export function canPromptInstall(): boolean { return !!deferred; }
export function onInstallChange(fn: () => void) { ls.add(fn); return () => { ls.delete(fn); }; }
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  deferred.prompt();
  const r = await deferred.userChoice.catch(() => null);
  deferred = null; ls.forEach((l) => l());
  return r?.outcome === 'accepted';
}
export function isIOSWeb(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}
