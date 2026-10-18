import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// La configuración puede venir de dos sitios:
//  1) window.KADERNO_CONFIG  → archivo kaderno-config.js servido junto al build
//     web. Permite cambiar las credenciales EN EL SERVIDOR sin recompilar.
//  2) process.env.EXPO_PUBLIC_* → tu archivo .env en tiempo de compilación.
const runtime: any = (typeof globalThis !== 'undefined' && (globalThis as any).KADERNO_CONFIG) || {};

const supabaseUrl: string = runtime.SUPABASE_URL || (process.env.EXPO_PUBLIC_SUPABASE_URL as string) || '';
const supabaseAnonKey: string = runtime.SUPABASE_ANON_KEY || (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string) || '';

// Detecta valores de ejemplo para avisar en pantalla en vez de fallar con un
// error de CORS incomprensible al intentar iniciar sesión.
const isPlaceholder = (v: string) =>
  !v || v.includes('placeholder') || v.includes('TU-PROYECTO') || v.includes('tu-anon-key');

// Llave pública VAPID para las notificaciones push (ver RUNBOOK, sección v12).
export const VAPID_PUBLIC_KEY: string = runtime.VAPID_PUBLIC_KEY || (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY as string) || '';
export const SUPABASE_URL: string = supabaseUrl;
export const SUPABASE_ANON_KEY: string = supabaseAnonKey;
// Base opcional del enlace de calendario por el dominio de Kaderno (proxy de Nginx).
export const CALENDAR_URL: string = runtime.CALENDAR_URL || (process.env.EXPO_PUBLIC_CALENDAR_URL as string) || '';

export const SUPABASE_READY: boolean = !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseAnonKey);

if (!SUPABASE_READY) {
  console.warn('⚠️ Kaderno: Supabase no está configurado. Edita kaderno-config.js (web) o tu .env y vuelve a compilar.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

/**
 * Id de quien tiene la sesión abierta, SIN ir a la red: la sesión ya está
 * guardada en el dispositivo (getUser() pregunta al servidor cada vez y
 * sumaba una ida y vuelta antes de cada consulta). La seguridad no depende de
 * esto: la pone RLS en el servidor con el token.
 */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Comparte una misma lectura entre quienes la piden a la vez. Al abrir Hoy,
 * varias partes piden lo mismo (materias, preferencias, contadores); así sale
 * una sola petición. No guarda nada: cuando termina, la siguiente vuelve a ir
 * a la red, así que nunca devuelve datos viejos.
 */
const inflight = new Map<string, Promise<any>>();
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key);
  if (hit) return hit as Promise<T>;
  const p = fn().finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return p;
}
