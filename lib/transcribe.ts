// ============================================================
//  Transcripción en vivo (v22, fase 1). Hoy solo con el reconocimiento del
//  navegador (gratis): Chrome, Edge y Safari. La pantalla usa esta interfaz,
//  así que más adelante se puede agregar un servicio pagado sin cambiarla.
//  El audio no se guarda en ningún lado.
// ============================================================

export type TranscriberState = 'idle' | 'listening' | 'paused' | 'stopped';
export type TranscriberEvents = {
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
  onState?: (s: TranscriberState) => void;
  /** Un problema que la persona debe ver (permiso negado, sin conexión…). */
  onError?: (message: string, fatal: boolean) => void;
};
export type Transcriber = { start: () => void; pause: () => void; resume: () => void; stop: () => void };

function speechCtor(): any {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function browserSpeechSupported(): boolean { return !!speechCtor(); }

export const LANGS = [
  { code: 'es-CO', label: 'Español' },
  { code: 'en-US', label: 'Inglés' },
] as const;

/** Reconocimiento del navegador que se vuelve a encender solo tras un silencio o un corte. */
export function createBrowserTranscriber(lang: string, ev: TranscriberEvents): Transcriber {
  const Ctor = speechCtor();
  if (!Ctor) throw new Error('Este navegador no puede transcribir. Usa Chrome, Edge o Safari.');
  let rec: any = null;
  let want: TranscriberState = 'idle';
  let fails = 0;
  let restartTimer: any = null;

  const setState = (s: TranscriberState) => { want = s; ev.onState?.(s); };

  const make = () => {
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      fails = 0;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = String(res[0]?.transcript ?? '');
        if (res.isFinal) { if (txt.trim()) ev.onFinal(txt); } else interim += txt;
      }
      ev.onInterim?.(interim.trim());
    };
    r.onerror = (e: any) => {
      const code = String(e?.error ?? '');
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        ev.onError?.('Kaderno no tiene permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.', true);
        setState('stopped');
      } else if (code === 'audio-capture') {
        ev.onError?.('No encontré un micrófono.', true);
        setState('stopped');
      } else if (code === 'network') {
        fails++;
        ev.onError?.('Sin conexión: el reconocimiento del navegador necesita internet. Reintentando…', false);
      } else if (code === 'language-not-supported') {
        ev.onError?.('El navegador no reconoce ese idioma.', true);
        setState('stopped');
      }
      // "no-speech" y "aborted" se arreglan solos al volver a encender.
    };
    r.onend = () => {
      ev.onInterim?.('');
      if (want !== 'listening') return;
      // Se apagó solo (silencio, límite del navegador): volver a encender.
      const wait = Math.min(10_000, 300 * 2 ** Math.min(fails, 5));
      restartTimer = setTimeout(() => { if (want === 'listening') { try { rec = make(); rec.start(); } catch { /* reintenta en el próximo onend */ } } }, wait);
    };
    return r;
  };

  const startNow = () => {
    clearTimeout(restartTimer);
    try { rec = make(); rec.start(); setState('listening'); }
    catch (e) { ev.onError?.(String((e as Error)?.message ?? e), true); setState('stopped'); }
  };
  const halt = (s: TranscriberState) => {
    clearTimeout(restartTimer);
    setState(s);
    try { rec?.stop(); } catch { /* noop */ }
    rec = null;
  };

  return {
    start: startNow,
    resume: startNow,
    pause: () => halt('paused'),
    stop: () => halt('stopped'),
  };
}

/** Mantiene la pantalla encendida mientras se graba (si el navegador lo permite). */
export async function keepAwake(): Promise<() => void> {
  try {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.wakeLock?.request) return () => {};
    let lock: any = await nav.wakeLock.request('screen');
    const again = async () => { if (document.visibilityState === 'visible' && lock?.released) { try { lock = await nav.wakeLock.request('screen'); } catch { /* noop */ } } };
    document.addEventListener('visibilitychange', again);
    return () => { document.removeEventListener('visibilitychange', again); try { lock?.release(); } catch { /* noop */ } };
  } catch { return () => {}; }
}
