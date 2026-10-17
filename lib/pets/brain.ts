// ============================================================
//  Cerebro de la mascota: decide qué cara pone y si dice algo.
//  Es puro (sin React ni red) para poder probarlo.
//
//  Reglas para que no moleste:
//   · Habla por algo que pasó, nunca por un temporizador al azar.
//   · "Solo cuando importa": máximo un mensaje espontáneo cada 45 min.
//     "Conversador": cada 20 min.
//   · Cada situación tiene su propia espera (no repite "hay vencidas" cada rato).
//   · Durante un enfoque no habla. "Silenciar por hoy" la deja callada salvo
//     cuando la tocas.
// ============================================================
import type { Mood, Species } from './art';
import { lineFor, dailyPhrase, type Situation } from './lines';

export type TalkMode = 'importa' | 'conversador';
export type ActionId = 'enfocar' | 'mover_hoy' | 'que_hago' | 'dos_min' | 'luego' | 'tienda' | 'terminar_enfoque' | 'seguir' | 'logros';

export type BrainState = {
  talk: TalkMode;
  focusing: boolean;
  mutedUntil: number;       // ms; 0 = no
  lastSpontaneous: number;  // ms
  lastSaid: Partial<Record<string, number>>; // por situación
};

export type TaskHint = { id: string; title: string; overdue?: boolean; today?: boolean; dueTs?: number | null; estimate?: number | null };

export type PetEvent =
  | { type: 'abrir'; overdue: TaskHint[]; today: TaskHint[]; hour: number; exam?: { materia: string; dias: number } | null; stale?: { title: string; dias: number } | null; streakAtRisk?: boolean }
  | { type: 'tarea_hecha'; allDone: boolean }
  | { type: 'paseo'; next: TaskHint | null }
  | { type: 'enfoque_inicio' }
  | { type: 'enfoque_fin'; minutes: number }
  | { type: 'toque' }
  | { type: 'agarrar' }
  | { type: 'despierta' }
  | { type: 'adoptada'; name: string }
  | { type: 'compra' }
  | { type: 'logro'; title: string; reward: number };

export type Reaction = {
  mood?: Mood;
  /** Cuánto dura el ánimo (ms). Sin valor: hasta que otro lo cambie. */
  moodMs?: number;
  say?: string;
  actions?: ActionId[];
  celebrate?: boolean;
  /** Cuenta como mensaje espontáneo (para la espera global). */
  spontaneous?: boolean;
  /** Clave de la situación, para su espera propia. */
  key?: string;
  /** Duración sugerida del globo (ms). */
  ms?: number;
};

const MIN = 60_000, HOUR = 60 * MIN;
export const GAP: Record<TalkMode, number> = { importa: 45 * MIN, conversador: 20 * MIN };
/** Espera propia de cada situación. */
export const COOLDOWN: Record<string, number> = {
  vencidas: 3 * HOUR, paseo: HOUR, sin_tocar: 6 * HOUR, parcial: 6 * HOUR,
  racha_riesgo: 2 * HOUR, tarde: 12 * HOUR, hola: 20 * HOUR, hecha: 10 * MIN,
};

export function initialBrain(talk: TalkMode = 'importa'): BrainState {
  return { talk, focusing: false, mutedUntil: 0, lastSpontaneous: 0, lastSaid: {} };
}

function canSpeak(s: BrainState, key: string, now: number): boolean {
  if (s.focusing || now < s.mutedUntil) return false;
  if (now - s.lastSpontaneous < GAP[s.talk]) return false;
  const last = s.lastSaid[key];
  return !(last && now - last < (COOLDOWN[key] ?? HOUR));
}

/** La tarea que conviene hacer ahora: vencidas primero (la más vieja), luego hoy (la más corta o la que vence antes). */
export function nextTask(overdue: TaskHint[], today: TaskHint[]): TaskHint | null {
  const byDue = (a: TaskHint, b: TaskHint) => (a.dueTs ?? Infinity) - (b.dueTs ?? Infinity);
  if (overdue.length) return [...overdue].sort(byDue)[0];
  if (today.length) {
    return [...today].sort((a, b) => (a.estimate ?? 999) - (b.estimate ?? 999) || byDue(a, b))[0];
  }
  return null;
}

/**
 * Qué hace la mascota ante un evento. Devuelve null si no hace nada.
 * No cambia `s`: quien la llama aplica `commit` si la mascota habló.
 */
export function react(ev: PetEvent, s: BrainState, sp: Species, now: number, seed = Math.random()): Reaction | null {
  const L = (sit: Situation, vars?: Record<string, string | number>) => lineFor(sit, sp, vars, seed);
  switch (ev.type) {
    case 'abrir': {
      if (ev.hour >= 23 || ev.hour < 5) {
        return canSpeak(s, 'tarde', now)
          ? { mood: 'dormido', say: L('tarde'), spontaneous: true, key: 'tarde' }
          : { mood: 'dormido' };
      }
      if (ev.overdue.length && canSpeak(s, 'vencidas', now)) {
        const t = nextTask(ev.overdue, [])!;
        return { mood: 'preocupado', moodMs: 6000, say: L('vencidas', { n: ev.overdue.length, tarea: t.title }), actions: ['enfocar', 'mover_hoy'], spontaneous: true, key: 'vencidas', ms: 10000 };
      }
      if (ev.exam && ev.exam.dias <= 3 && canSpeak(s, 'parcial', now)) {
        return { mood: 'preocupado', moodMs: 5000, say: L('parcial', ev.exam), actions: ['enfocar'], spontaneous: true, key: 'parcial', ms: 9000 };
      }
      if (ev.streakAtRisk && ev.hour >= 20 && canSpeak(s, 'racha_riesgo', now)) {
        return { say: L('racha_riesgo'), actions: ['enfocar'], spontaneous: true, key: 'racha_riesgo', ms: 8000 };
      }
      if (ev.stale && ev.stale.dias >= 3 && canSpeak(s, 'sin_tocar', now)) {
        return { say: L('sin_tocar', { tarea: ev.stale.title, dias: ev.stale.dias }), actions: ['dos_min'], spontaneous: true, key: 'sin_tocar', ms: 9000 };
      }
      if (canSpeak(s, 'hola', now)) {
        const say = ev.today.length ? `${L('hola', { n: ev.today.length })} ${dailyPhrase(new Date(now))}` : dailyPhrase(new Date(now));
        return { say, spontaneous: true, key: 'hola', ms: 7000 };
      }
      return null;
    }
    case 'paseo': {
      if (!ev.next || !canSpeak(s, 'paseo', now)) return null;
      return { mood: 'preocupado', moodMs: 4000, say: L('paseo', { tarea: ev.next.title }), actions: ['enfocar', 'dos_min'], spontaneous: true, key: 'paseo', ms: 10000 };
    }
    case 'tarea_hecha': {
      const r: Reaction = { mood: 'feliz', moodMs: 3500, celebrate: true };
      if (s.focusing || now < s.mutedUntil) return r;
      if (ev.allDone) return { ...r, say: L('dia_completo'), key: 'dia', ms: 5000 };
      const last = s.lastSaid.hecha;
      if (s.talk === 'conversador' || !last || now - last > COOLDOWN.hecha) return { ...r, say: L('hecha'), key: 'hecha', ms: 3500 };
      return r;
    }
    case 'enfoque_inicio':
      return { mood: 'concentrado', say: now < s.mutedUntil ? undefined : L('enfoque_inicio'), ms: 2500 };
    case 'enfoque_fin':
      if (ev.minutes < 1) return { mood: 'normal', say: now < s.mutedUntil ? undefined : L('enfoque_corto'), ms: 3500 };
      return { mood: 'feliz', moodMs: 3500, celebrate: true, say: now < s.mutedUntil ? undefined : L('enfoque_fin', { min: ev.minutes }), ms: 4500 };
    case 'toque':
      if (s.focusing) return { say: L('enfoque_activo'), actions: ['terminar_enfoque', 'seguir'], ms: 8000 };
      return { say: L('que_hacemos'), actions: ['que_hago', 'enfocar', 'tienda'], ms: 9000 };
    case 'agarrar':
      return seed < 0.5 && !s.focusing ? { say: L('agarrar'), ms: 1400 } : null;
    case 'despierta':
      return { mood: 'normal', say: s.focusing || now < s.mutedUntil ? undefined : L('despierta'), ms: 2200 };
    case 'adoptada':
      return { mood: 'feliz', moodMs: 3000, celebrate: true, say: L('adoptada', { nombre: ev.name }), ms: 6000 };
    case 'compra':
      return { mood: 'feliz', moodMs: 2500, celebrate: true, say: L('compra'), ms: 3000 };
    case 'logro':
      if (s.focusing) return { mood: 'feliz', moodMs: 3000 };
      return { mood: 'feliz', moodMs: 4000, celebrate: true, say: `${L('logro')} ${ev.title}. +${ev.reward}`, actions: ['logros'], ms: 7000 };
  }
}

/** Registra que la mascota habló (para las esperas). */
export function commit(s: BrainState, r: Reaction | null, now: number): BrainState {
  if (!r || !r.say) return s;
  return {
    ...s,
    lastSpontaneous: r.spontaneous ? now : s.lastSpontaneous,
    lastSaid: r.key ? { ...s.lastSaid, [r.key]: now } : s.lastSaid,
  };
}

/** Respuesta a "¿Qué hago ahora?". */
export function suggestion(overdue: TaskHint[], today: TaskHint[], sp: Species, seed = Math.random()): { say: string; task: TaskHint | null } {
  const t = nextTask(overdue, today);
  if (!t) return { say: lineFor('nada_pendiente', sp, {}, seed), task: null };
  return { say: lineFor('sugerencia', sp, { tarea: t.overdue ? `${t.title}, que ya venció` : t.title }, seed), task: t };
}

/** Detector de "paseo sin hacer nada": 3 cambios de pantalla en 2 min sin ninguna acción. */
export function isWandering(navTimes: number[], lastActionAt: number, now: number): boolean {
  const recent = navTimes.filter((t) => now - t <= 2 * MIN && t > lastActionAt);
  return recent.length >= 3;
}
