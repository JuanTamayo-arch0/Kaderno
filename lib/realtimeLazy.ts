// ============================================================
//  Cliente de Supabase Realtime que se descarga solo al entrar a una sala.
//
//  metro.config.js cambia "@supabase/realtime-js" por un sustituto vacío para
//  que la app abra más liviana (supabase-js lo crea siempre al arrancar). Aquí
//  se importa por la ruta del archivo, que el sustituto no toca, y con import()
//  para que quede en un pedazo aparte: quien nunca usa salas no lo descarga.
// ============================================================
import type { RealtimeClient } from '@supabase/realtime-js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

let client: RealtimeClient | null = null;
let loading: Promise<RealtimeClient> | null = null;

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function realtimeClient(): Promise<RealtimeClient> {
  if (client) return Promise.resolve(client);
  if (loading) return loading;
  loading = Promise.resolve()
    // @ts-ignore: ruta de archivo a propósito (ver arriba)
    .then(() => import('@supabase/realtime-js/dist/module/index.js'))
    .then(async (mod: any) => {
      const Ctor = mod.RealtimeClient ?? mod.default?.RealtimeClient;
      const url = (SUPABASE_URL || 'https://placeholder.supabase.co').replace(/^http/i, 'ws').replace(/\/+$/, '') + '/realtime/v1';
      const c: RealtimeClient = new Ctor(url, { params: { apikey: SUPABASE_ANON_KEY }, accessToken: token });
      await c.setAuth(await token());
      // Al renovarse la sesión, el canal sigue autorizado.
      supabase.auth.onAuthStateChange((_e, s) => { c.setAuth(s?.access_token ?? null).catch(() => {}); });
      client = c;
      return c;
    })
    .catch((e) => { loading = null; throw e; });
  return loading;
}
