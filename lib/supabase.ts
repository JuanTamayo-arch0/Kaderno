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
