// ============================================================
//  Notificaciones push en el navegador (y app instalada).
//  - El service worker (public/sw.js) recibe el aviso y lo muestra.
//  - La suscripción se guarda en push_subscriptions (schema_v14).
//  - La función "notify" del servidor envía lo que haya en la bandeja.
//  En iPhone solo funciona con Kaderno instalada en la pantalla de inicio.
// ============================================================
import { Platform } from 'react-native';
import { VAPID_PUBLIC_KEY } from './supabase';
import { savePushSubscription, deletePushSubscription } from './db';

export type PushStatus = 'unsupported' | 'needs-install' | 'no-key' | 'denied' | 'off' | 'on';

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';

export function registerServiceWorker(): void {
  if (!isWeb() || !('serviceWorker' in navigator)) return;
  // Solo en HTTPS o localhost (el navegador lo exige).
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); }, { once: true });
  if (document.readyState === 'complete') navigator.serviceWorker.register('/sw.js').catch(() => {});
}

export function isStandalone(): boolean {
  if (!isWeb()) return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}
function isIOS(): boolean {
  return isWeb() && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isWeb()) return 'unsupported';
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'no-key';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch { return 'off'; }
}

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function b64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Pide permiso, se suscribe y guarda la suscripción. Devuelve el nuevo estado. */
export async function enablePush(): Promise<PushStatus> {
  const st = await getPushStatus();
  if (st === 'unsupported' || st === 'needs-install' || st === 'no-key' || st === 'denied') return st;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource });
  }
  await savePushSubscription({
    endpoint: sub.endpoint, p256dh: b64(sub.getKey('p256dh')), auth: b64(sub.getKey('auth')),
    user_agent: navigator.userAgent.slice(0, 200),
  });
  return 'on';
}

export async function disablePush(): Promise<PushStatus> {
  if (!isWeb() || !('serviceWorker' in navigator)) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await deletePushSubscription(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return 'off';
}

/** Aviso de prueba local (no pasa por el servidor). */
export async function testLocalNotification(): Promise<boolean> {
  if (!isWeb() || !('serviceWorker' in navigator) || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  await reg.showNotification('Kaderno', { body: 'Así se verán tus recordatorios.', icon: '/icon-192.png', badge: '/badge-72.png', tag: 'prueba' });
  return true;
}
