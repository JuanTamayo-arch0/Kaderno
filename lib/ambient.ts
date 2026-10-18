// ============================================================
//  Sonidos de fondo del Enfoque (solo web).
//
//  Todo se genera en el navegador con Web Audio: ruido filtrado y
//  modulado para lluvia, mar, viento, río y fuego, y cantos cortos
//  sintetizados para los pájaros. No hay archivos que descargar ni
//  licencias que cuidar, y suena igual sin conexión.
//
//  El controlador de abajo mira el reloj del Enfoque y las preferencias
//  y decide qué suena: la mezcla durante el enfoque, lo elegido para el
//  descanso, y nada si el reloj está en pausa. Entra en 3 s y sale en 2 s.
//
//  Los navegadores solo dejan sonar después de un toque: el botón
//  "Empezar" (o cualquier toque si se recargó la página con el reloj
//  corriendo) desbloquea el audio.
// ============================================================
import { Platform } from 'react-native';
import {
  type AmbientPrefs, type Mix, type SoundId, DEFAULT_PREFS, sanitizePrefs, targetMix, mixLabel, activeIds,
} from './ambientMix';
import { whiteNoise, pinkNoise, brownNoise, impulses, seamless } from './noise';
import { subscribeFocus, startFocus, pauseFocus, remainingMs, totalMs, type FocusState } from './focusTimer';

const web = Platform.OS === 'web' && typeof window !== 'undefined';

// Ganancia de salida: el volumen general (0..1) se multiplica por esto.
const OUTPUT = 3;
// Volumen relativo de cada sonido a nivel 100%, para que todos se sientan parejos.
// Medido con Playwright (RMS de cada sonido solo, al 60% y volumen 35%): todos
// quedan entre -26 y -29 dBFS; los pájaros, que son agudos e intermitentes, un poco menos.
const GAIN: Record<SoundId, number> = {
  lluvia: 0.77, mar: 1.0, bosque: 2.0, rio: 0.86, viento: 0.93, fuego: 0.85, rosa: 0.52, cafe: 0.64, pajaros: 2.0,
};

type Voice = { gain: GainNode; stop: () => void };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;   // volumen general (preferencia)
let fade: GainNode | null = null;     // entradas y salidas suaves
let duck: GainNode | null = null;     // baja un momento con la campana
const voices = new Map<SoundId, Voice>();
const buffers = new Map<string, AudioBuffer>();
let gen = 0; // cada cambio de objetivo invalida los apagados pendientes

function ensureCtx(): AudioContext | null {
  if (!web) return null;
  if (ctx) return ctx;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC() as AudioContext;
    master = ctx.createGain(); fade = ctx.createGain(); duck = ctx.createGain();
    fade.gain.value = 0;
    // Limitador al final: con varios sonidos al máximo no satura.
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -6; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.005; lim.release.value = 0.25;
    master.connect(fade); fade.connect(duck); duck.connect(lim); lim.connect(ctx.destination);
    return ctx;
  } catch { ctx = null; return null; }
}

export function ambientSupported(): boolean {
  return web && !!((window as any).AudioContext || (window as any).webkitAudioContext);
}

/** Llamar dentro de un toque: crea o reanuda el audio. */
export function unlockAmbient(): void {
  const c = ensureCtx();
  if (!c) return;
  try {
    // iPhone: que suene aunque el interruptor de silencio esté activo.
    const nav = navigator as any;
    if (nav.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
  } catch { /* noop */ }
  if (c.state !== 'running') c.resume().then(() => { status.needsTap = false; evaluate(); }).catch(() => {});
}

// ---------- Búferes ----------
function buf(key: string, seconds: number, make: (len: number, seed: number) => Float32Array): AudioBuffer {
  const c = ctx!;
  const k = `${key}:${c.sampleRate}`;
  const hit = buffers.get(k);
  if (hit) return hit;
  const rate = c.sampleRate;
  const len = Math.round(seconds * rate);
  const fadeLen = Math.round(0.25 * rate);
  const b = c.createBuffer(2, len - fadeLen, rate);
  // Dos canales distintos: suena amplio, no "dentro de la cabeza".
  for (let ch = 0; ch < 2; ch++) {
    const data = seamless(make(len, ch * 7919 + key.length * 31 + 1), fadeLen);
    b.getChannelData(ch).set(data.subarray(0, b.length));
  }
  buffers.set(k, b);
  return b;
}
const B = {
  white: () => buf('white', 5, (n, s) => whiteNoise(n, s)),
  pink: () => buf('pink', 6, (n, s) => pinkNoise(n, s)),
  brown: () => buf('brown', 8, (n, s) => brownNoise(n, s)),
  drops: () => buf('drops', 7, (n, s) => impulses(n, ctx!.sampleRate, 420, 2.5, s)),
  bubbles: () => buf('bubbles', 7, (n, s) => impulses(n, ctx!.sampleRate, 35, 9, s)),
  crackle: () => buf('crackle', 9, (n, s) => impulses(n, ctx!.sampleRate, 9, 1.2, s, 6)),
};

// ---------- Piezas ----------
type Parts = { nodes: AudioScheduledSourceNode[]; timers: ReturnType<typeof setTimeout>[] };

function src(p: Parts, b: AudioBuffer): AudioBufferSourceNode {
  const s = ctx!.createBufferSource();
  s.buffer = b; s.loop = true;
  s.start(0, Math.random() * b.duration);
  p.nodes.push(s);
  return s;
}
function filt(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx!.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f;
}
function g(v: number): GainNode { const n = ctx!.createGain(); n.gain.value = v; return n; }
/** Oscilador lento que mueve un parámetro alrededor de su valor. */
function lfo(p: Parts, hz: number, depth: number, param: AudioParam, phase = Math.random()) {
  const o = ctx!.createOscillator(); o.frequency.value = hz;
  const d = g(depth);
  // La fase se corre con un retardo (no se puede arrancar un oscilador en el pasado).
  const dl = ctx!.createDelay(Math.ceil(1 / hz) + 1); dl.delayTime.value = (phase % 1) / hz;
  o.connect(dl); dl.connect(d); d.connect(param);
  o.start(); p.nodes.push(o);
  return o;
}
function chain(...n: AudioNode[]): AudioNode { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }

/** Un canto corto: 2 a 5 notas que suben o bajan, con un poco de vibrato. */
function chirp(out: AudioNode) {
  const c = ctx!; const t0 = c.currentTime + 0.05;
  const base = 2200 + Math.random() * 2000;
  const notes = 2 + Math.floor(Math.random() * 4);
  const up = Math.random() < 0.5;
  const pan = (c as any).createStereoPanner ? c.createStereoPanner() : null;
  const amp = g(0.12 + Math.random() * 0.12);
  if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; amp.connect(pan); pan.connect(out); } else amp.connect(out);
  let t = t0;
  for (let i = 0; i < notes; i++) {
    const dur = 0.05 + Math.random() * 0.09;
    const o = c.createOscillator(); o.type = 'sine';
    const f0 = base * (1 + (Math.random() - 0.5) * 0.15);
    o.frequency.setValueAtTime(up ? f0 : f0 * 1.35, t);
    o.frequency.exponentialRampToValueAtTime(up ? f0 * 1.35 : f0, t + dur);
    const e = c.createGain(); e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(1, t + 0.012);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(amp); o.start(t); o.stop(t + dur + 0.02);
    t += dur + 0.03 + Math.random() * 0.06;
  }
  setTimeout(() => { try { amp.disconnect(); pan?.disconnect(); } catch { /* */ } }, (t - t0 + 0.5) * 1000);
}
function birds(p: Parts, out: AudioNode, minS: number, maxS: number) {
  const loop = () => {
    chirp(out);
    p.timers.push(setTimeout(loop, (minS + Math.random() * (maxS - minS)) * 1000));
  };
  p.timers.push(setTimeout(loop, 400 + Math.random() * 1500));
}

// ---------- Recetas ----------
function build(id: SoundId, out: GainNode, p: Parts) {
  switch (id) {
    case 'lluvia': {
      chain(src(p, B.pink()), filt('highpass', 600), filt('lowpass', 7000), g(0.55), out);
      chain(src(p, B.drops()), filt('highpass', 1800), g(0.3), out);
      chain(src(p, B.brown()), filt('lowpass', 250), g(0.3), out);
      break;
    }
    case 'mar': {
      // Una ola cada ~11 s: el mismo oscilador abre el filtro y sube el volumen.
      const lp = filt('lowpass', 520); const amp = g(0.55);
      chain(src(p, B.brown()), lp, amp, out);
      const o = ctx!.createOscillator(); o.frequency.value = 0.09; o.start(); p.nodes.push(o);
      const d1 = g(380); const d2 = g(0.42); o.connect(d1); d1.connect(lp.frequency); o.connect(d2); d2.connect(amp.gain);
      const foam = g(0.12); chain(src(p, B.pink()), filt('bandpass', 1400, 0.6), foam, out);
      lfo(p, 0.09, 0.1, foam.gain, 0.15);
      break;
    }
    case 'viento': {
      const bp = filt('bandpass', 500, 0.8); const amp = g(0.6);
      chain(src(p, B.pink()), bp, amp, out);
      lfo(p, 0.05, 260, bp.frequency); lfo(p, 0.13, 110, bp.frequency); lfo(p, 0.07, 0.35, amp.gain);
      break;
    }
    case 'rio': {
      chain(src(p, B.pink()), filt('highpass', 250), filt('lowpass', 3200), g(0.55), out);
      const hiss = g(0.12); chain(src(p, B.white()), filt('bandpass', 1500, 1.2), hiss, out);
      lfo(p, 0.4, 0.05, hiss.gain);
      chain(src(p, B.bubbles()), filt('bandpass', 900, 2), g(0.35), out);
      break;
    }
    case 'fuego': {
      const rumble = g(0.45); chain(src(p, B.brown()), filt('lowpass', 380), rumble, out);
      lfo(p, 0.21, 0.12, rumble.gain);
      chain(src(p, B.crackle()), filt('highpass', 1200), g(0.55), out);
      chain(src(p, B.pink()), filt('bandpass', 220, 0.5), g(0.12), out);
      break;
    }
    case 'bosque': {
      const bp = filt('bandpass', 700, 0.6); const w = g(0.28);
      chain(src(p, B.pink()), bp, w, out);
      lfo(p, 0.06, 200, bp.frequency); lfo(p, 0.09, 0.15, w.gain);
      const leaves = g(0.07); chain(src(p, B.pink()), filt('highpass', 2500), filt('lowpass', 6000), leaves, out);
      lfo(p, 0.2, 0.05, leaves.gain);
      birds(p, out, 1.4, 5.5);
      break;
    }
    case 'pajaros': {
      chain(src(p, B.pink()), filt('bandpass', 600, 0.6), g(0.08), out);
      birds(p, out, 0.6, 2.6);
      break;
    }
    case 'rosa': chain(src(p, B.pink()), filt('lowpass', 9000), g(0.6), out); break;
    case 'cafe': chain(src(p, B.brown()), filt('lowpass', 900), g(0.8), out); break;
  }
}

function ramp(param: AudioParam, to: number, sec: number) {
  const now = ctx!.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(to, now + Math.max(0.02, sec));
}

function startVoice(id: SoundId): Voice {
  const gain = g(0); gain.connect(master!);
  const p: Parts = { nodes: [], timers: [] };
  build(id, gain, p);
  return {
    gain,
    stop: () => {
      p.timers.forEach(clearTimeout);
      p.nodes.forEach((n) => { try { n.stop(); } catch { /* */ } });
      try { gain.disconnect(); } catch { /* */ }
    },
  };
}

/** Pone la mezcla. `null` apaga todo con un fundido. */
function play(mix: Mix | null, vol: number, quick = false) {
  const c = ensureCtx(); if (!c || !master || !fade) return;
  const my = ++gen;
  if (!mix) {
    if (!voices.size) return;
    ramp(fade.gain, 0, quick ? 0.8 : 2);
    setTimeout(() => {
      if (my !== gen) return;
      voices.forEach((v) => v.stop()); voices.clear();
      if (c.state === 'running') c.suspend().catch(() => {});
    }, (quick ? 0.8 : 2) * 1000 + 150);
    return;
  }
  if (c.state !== 'running') {
    // Dentro de un toque esto basta. Si no hubo toque (recarga con el reloj
    // corriendo), el navegador lo deja en pausa y se pide un toque.
    c.resume().then(() => { if (status.needsTap) { status.needsTap = false; emit(); } }).catch(() => {});
    setTimeout(() => {
      if (ctx && ctx.state !== 'running' && status.playing) { status.needsTap = true; armTapUnlock(); emit(); }
    }, 400);
  }
  const starting = fade.gain.value < 0.01 || !voices.size;
  master.gain.setTargetAtTime(vol * OUTPUT, c.currentTime, 0.08);
  const ids = new Set<SoundId>([...voices.keys(), ...activeIds(mix)]);
  ids.forEach((id) => {
    const level = (mix[id] ?? 0) * GAIN[id];
    let v = voices.get(id);
    if (level > 0) {
      if (!v) { v = startVoice(id); voices.set(id, v); ramp(v.gain.gain, level, starting ? 0.05 : 1.5); }
      else v.gain.gain.setTargetAtTime(level, c.currentTime, 0.12);
    } else if (v) {
      const dead = v; voices.delete(id);
      ramp(dead.gain.gain, 0, 1.5);
      setTimeout(() => dead.stop(), 1700);
    }
  });
  if (starting || fade.gain.value < 0.99) ramp(fade.gain, 1, starting ? 3 : 1);
}

/** La campana del pomodoro: el fondo baja un momento para que se oiga. */
export function duckAmbient() {
  if (!ctx || !duck || !voices.size) return;
  const now = ctx.currentTime;
  duck.gain.cancelScheduledValues(now);
  duck.gain.setValueAtTime(duck.gain.value, now);
  duck.gain.linearRampToValueAtTime(0.2, now + 0.15);
  duck.gain.setValueAtTime(0.2, now + 1.4);
  duck.gain.linearRampToValueAtTime(1, now + 2.6);
}

// Si se recargó con el reloj corriendo, el primer toque en cualquier lado desbloquea.
let tapArmed = false;
function armTapUnlock() {
  if (!web || tapArmed) return;
  tapArmed = true;
  const h = () => { tapArmed = false; window.removeEventListener('pointerdown', h, true); window.removeEventListener('keydown', h, true); unlockAmbient(); };
  window.addEventListener('pointerdown', h, true);
  window.addEventListener('keydown', h, true);
}

// ============================================================
//  Controlador: preferencias + reloj → qué suena.
// ============================================================
const KEY = 'kd:ambient';
let prefs: AmbientPrefs = { ...DEFAULT_PREFS };
let focus: Pick<FocusState, 'running' | 'mode'> = { running: false, mode: 'work' };
let previewUntil = 0;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let hadLocal = false;

export type AmbientStatus = { playing: boolean; label: string; needsTap: boolean; preview: boolean };
const status: AmbientStatus = { playing: false, label: 'Silencio', needsTap: false, preview: false };
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

export function getAmbientPrefs(): AmbientPrefs { return prefs; }
export function getAmbientStatus(): AmbientStatus { return status; }
export function subscribeAmbient(fn: () => void): () => void {
  initAmbient();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function evaluate() {
  const want = targetMix(focus, prefs);
  const preview = !want && !prefs.muted && Date.now() < previewUntil && !focus.running ? prefs.mix : null;
  const mix = want ?? (preview && activeIds(preview).length ? preview : null);
  // Un fallo de audio nunca debe romper la pantalla ni el reloj.
  try { play(mix, prefs.master, !focus.running && !preview); } catch (e) { console.warn('Sonido de fondo:', e); }
  status.playing = !!mix;
  status.preview = !want && !!mix;
  status.label = mix ? mixLabel(mix) : mixLabel(prefs.mix);
  if (!mix) status.needsTap = false;
  updateMediaSession(!!want, mix ? mixLabel(mix) : '');
  emit();
}

function updateMediaSession(on: boolean, label: string) {
  if (!web) return;
  const ms = (navigator as any).mediaSession;
  if (!ms) return;
  try {
    if (on) {
      const MM = (window as any).MediaMetadata;
      if (MM) ms.metadata = new MM({ title: `Kaderno · ${label}`, artist: 'Enfoque' });
      ms.playbackState = 'playing';
      ms.setActionHandler('pause', () => pauseFocus());
      ms.setActionHandler('play', () => { unlockAmbient(); startFocus(); });
    } else if (ms.playbackState === 'playing') {
      ms.playbackState = focus.running ? 'playing' : 'paused';
    }
  } catch { /* noop */ }
}

export function initAmbient(): void {
  if (started || !web) return;
  started = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) { prefs = sanitizePrefs(JSON.parse(raw)); hadLocal = true; }
  } catch { /* noop */ }
  subscribeFocus((f) => {
    const changed = f.running !== focus.running || f.mode !== focus.mode;
    // Silenciar dura hasta el siguiente pomodoro nuevo.
    if (prefs.muted && !focus.running && f.running && f.mode === 'work' && totalMs(f) - remainingMs(f) < 3000) prefs = { ...prefs, muted: false };
    focus = { running: f.running, mode: f.mode };
    if (changed) evaluate();
  });
}

/** Trae lo guardado en la nube si este dispositivo aún no tiene nada. */
export async function hydrateAmbient(fetchPrefs: () => Promise<any>): Promise<void> {
  initAmbient();
  if (hadLocal) return;
  try {
    const s = await fetchPrefs();
    if (s?.ambient && !hadLocal) { prefs = sanitizePrefs(s.ambient); hadLocal = true; persistLocal(); evaluate(); }
  } catch { /* sin conexión */ }
}

function persistLocal() {
  // "Silenciar" es momentáneo: no se guarda.
  try { window.localStorage.setItem(KEY, JSON.stringify({ ...prefs, muted: false })); } catch { /* noop */ }
}

/**
 * Cambia las preferencias. `savePrefs` guarda en la nube (con espera de 1,5 s
 * para no escribir con cada movimiento del deslizador). `preview` hace sonar la
 * mezcla 6 s aunque el reloj esté quieto, para probarla.
 */
export function updateAmbient(patch: Partial<AmbientPrefs>, opts: { preview?: boolean; savePrefs?: (s: any) => Promise<void> } = {}) {
  initAmbient();
  prefs = sanitizePrefs({ ...prefs, ...patch });
  hadLocal = true;
  persistLocal();
  if (opts.preview && !focus.running && !prefs.muted) {
    unlockAmbient();
    previewUntil = Date.now() + 6000;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { previewTimer = null; evaluate(); }, 6050);
  }
  evaluate();
  if (opts.savePrefs) {
    const save = opts.savePrefs;
    if (cloudTimer) clearTimeout(cloudTimer);
    const { muted, ...rest } = prefs; // silenciar es momentáneo: no viaja a otros dispositivos
    void muted;
    cloudTimer = setTimeout(() => { save({ ambient: rest }).catch(() => {}); }, 1500);
  }
}

export function stopPreview() {
  previewUntil = 0;
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
  evaluate();
}
