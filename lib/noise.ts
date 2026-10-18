// ============================================================
//  Generadores de ruido para los sonidos de fondo (puros, probables).
//  Devuelven muestras en [-1, 1]. lib/ambient.ts los copia a búferes
//  de Web Audio que se repiten sin corte.
// ============================================================

/** Generador pseudoaleatorio con semilla (mulberry32): mismo resultado en cada corrida. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function peakNormalize(out: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < out.length; i++) m = Math.max(m, Math.abs(out[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < out.length; i++) out[i] *= k; }
  return out;
}

/** Une el final con el principio (fundido cruzado) para que el bucle no haga clic. */
export function seamless(out: Float32Array, fade: number): Float32Array {
  const n = Math.min(fade, Math.floor(out.length / 4));
  for (let i = 0; i < n; i++) {
    // Fundido de igual potencia: el ruido no baja de volumen en la unión.
    const t = i / n;
    const head = out[i];
    const tail = out[out.length - n + i];
    out[i] = head * Math.sqrt(t) + tail * Math.sqrt(1 - t);
  }
  const res = out.subarray(0, out.length - n).slice();
  // El fundido de igual potencia puede pasar de 1 en algún pico: se reescala para no saturar.
  let m = 0;
  for (let i = 0; i < res.length; i++) m = Math.max(m, Math.abs(res[i]));
  if (m > 0.98) peakNormalize(res, 0.95);
  return res;
}

export function whiteNoise(len: number, seed = 1): Float32Array {
  const r = rng(seed); const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = r() * 2 - 1;
  return out;
}

/** Ruido rosa con el filtro de Paul Kellet (versión refinada). */
export function pinkNoise(len: number, seed = 2): Float32Array {
  const r = rng(seed); const out = new Float32Array(len);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return peakNormalize(out);
}

/** Ruido café (marrón): integra el blanco con una fuga para que no se escape. */
export function brownNoise(len: number, seed = 3): Float32Array {
  const r = rng(seed); const out = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = r() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    out[i] = last;
  }
  return peakNormalize(out);
}

/**
 * Golpecitos sueltos (gotas o chasquidos): impulsos cortos con caída
 * exponencial, repartidos al azar. `perSec` = cuántos por segundo,
 * `decayMs` = cuánto dura cada uno.
 */
export function impulses(len: number, rate: number, perSec: number, decayMs: number, seed = 4, burst = 0): Float32Array {
  const r = rng(seed); const out = new Float32Array(len);
  const decay = Math.max(1, Math.round((decayMs / 1000) * rate));
  const p = perSec / rate;
  for (let i = 0; i < len; i++) {
    if (r() >= p) continue;
    const amp = 0.25 + 0.75 * Math.pow(r(), 2);
    const n = 1 + (burst && r() < 0.25 ? Math.floor(r() * burst) : 0);
    for (let k = 0; k < n; k++) {
      const start = i + k * Math.round(rate * (0.01 + r() * 0.03));
      const d = Math.round(decay * (0.5 + r()));
      for (let j = 0; j < d * 4 && start + j < len; j++) {
        out[start + j] += amp * (r() * 2 - 1) * Math.exp(-j / d);
      }
    }
  }
  return peakNormalize(out, 0.95);
}
