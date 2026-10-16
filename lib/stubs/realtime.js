// Sustituto vacío de @supabase/realtime-js (ver metro.config.js).
// Kaderno no usa canales en tiempo real; supabase-js crea el cliente igual
// al arrancar y eso sumaba ~150 KB (realtime-js + phoenix) a la descarga.
// Si algún día se usan canales, basta con borrar el alias de metro.config.js.
export class RealtimeClient {
  constructor() { this.channels = []; }
  channel() { throw new Error('Realtime no está incluido en esta versión de Kaderno'); }
  getChannels() { return []; }
  removeChannel() { return Promise.resolve('ok'); }
  removeAllChannels() { return Promise.resolve([]); }
  setAuth() { return Promise.resolve(); }
  connect() {}
  disconnect() {}
  isConnected() { return false; }
}
export default { RealtimeClient };
