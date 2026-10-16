import { Platform } from 'react-native';

// ============================================================
//  Sonidos de la interfaz.
//
//  Se sintetizan con Web Audio (osciladores), no son archivos: no pesan nada,
//  suenan al instante y no hay que descargarlos. Son cortos y suaves, pensados
//  para confirmar una acción sin distraer.
//
//  Se activan o apagan en Ajustes (se guarda en este dispositivo). En el
//  celular también vibra un instante si el navegador lo permite.
// ============================================================

export type SoundName = 'complete' | 'uncheck' | 'step' | 'drop' | 'delete' | 'celebrate' | 'tap' | 'error' | 'add';

const KEY = 'kd:sound';
const web = Platform.OS === 'web' && typeof window !== 'undefined';
let ctx: AudioContext | null = null;
let enabled: boolean | null = null;
let master: GainNode | null = null;

export function soundEnabled(): boolean {
  if (enabled !== null) return enabled;
  try { enabled = web ? window.localStorage.getItem(KEY) !== 'off' : false; } catch { enabled = web; }
  return enabled!;
}
export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try { if (web) window.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* */ }
  if (on) play('tap');
}

function audio(): AudioContext | null {
  if (!web) return null;
  try {
    if (!ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC() as AudioContext;
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** Una nota corta: frecuencia, inicio relativo, duración, forma y volumen. */
function note(a: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 1, slideTo?: number) {
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master!);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const VIBRATE: Partial<Record<SoundName, number | number[]>> = { complete: 12, drop: 8, delete: 15, celebrate: [12, 40, 12], error: [20, 30, 20] };

export function play(name: SoundName): void {
  if (!soundEnabled()) return;
  try { const v = VIBRATE[name]; if (v && (navigator as any).vibrate) (navigator as any).vibrate(v); } catch { /* */ }
  const a = audio();
  if (!a) return;
  try {
    switch (name) {
      case 'complete':   // dos notas que suben (mi, la): "hecho"
        note(a, 659.25, 0, 0.16, 'sine', 0.9);
        note(a, 880, 0.07, 0.24, 'sine', 0.8);
        note(a, 1760, 0.07, 0.12, 'sine', 0.12);
        break;
      case 'uncheck':    // una nota que baja
        note(a, 520, 0, 0.12, 'sine', 0.5, 380);
        break;
      case 'step':       // tic corto y alto
        note(a, 1200, 0, 0.06, 'triangle', 0.45);
        break;
      case 'drop':       // golpecito grave, como apoyar una tarjeta
        note(a, 220, 0, 0.09, 'triangle', 0.7, 140);
        note(a, 660, 0, 0.05, 'sine', 0.2);
        break;
      case 'delete':     // barrido hacia abajo
        note(a, 420, 0, 0.18, 'sine', 0.45, 160);
        break;
      case 'celebrate':  // arpegio do-mi-sol-do
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(a, f, i * 0.075, 0.28, 'sine', 0.7));
        note(a, 2093, 0.3, 0.3, 'sine', 0.12);
        break;
      case 'add':        // burbuja que sube: "agregado"
        note(a, 520, 0, 0.12, 'sine', 0.6, 880);
        break;
      case 'tap':
        note(a, 900, 0, 0.04, 'sine', 0.3);
        break;
      case 'error':
        note(a, 300, 0, 0.12, 'square', 0.15);
        note(a, 240, 0.12, 0.16, 'square', 0.15);
        break;
    }
  } catch { /* sin audio: no pasa nada */ }
}
