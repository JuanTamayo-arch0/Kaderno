// ============================================================
//  El patio de la sala: cómo se mueven las mascotas de cada quien.
//  Puro (sin DOM ni React) para poder probarlo. Lo dibuja
//  components/rooms/PetPatio.tsx.
//
//  Reglas (para que acompañen y no distraigan):
//   · Dueño enfocado → la mascota va a su puesto y se queda quieta,
//     concentrada.
//   · Dueño en descanso → juega: persigue a las otras que también están en
//     descanso, salta y se pasan una pelota.
//   · En la sala sin reloj → pasea tranquila.
//   · Fuera → duerme donde estaba.
//  Las unidades son píxeles del cuarto (120 x 64) y segundos.
// ============================================================
import type { Frame, Mood, Outfit, Species } from './art';
import { ANIMS } from './art';

export type PatioState = 'work' | 'break' | 'online' | 'away';
export type PatioMember = { uid: string; name: string; species: Species; outfit: Outfit; state: PatioState; left: number | null; me: boolean };

export type Actor = {
  uid: string;
  x: number;            // centro, en píxeles del cuarto
  lane: number;         // fila de los pies (profundidad)
  dir: 1 | -1;
  tx: number | null;    // a dónde va
  speed: number;
  wait: number;         // segundos antes de decidir otra cosa
  chase: string | null; // a quién persigue (descanso)
  hopT: number;         // -1 si no está saltando
  celebrateUntil: number;
  say: string | null;
  sayUntil: number;
  seed: number;
};

export type Ball = { from: string; to: string; x0: number; x1: number; t: number; dur: number; rest: number };

export const WALK = 14, RUN = 34, HOP = 0.45, HOP_H = 6, BALL_H = 16, MARGIN = 12;

/** Puestos repartidos a lo ancho (uno por persona, en el orden dado). */
export function slotX(i: number, n: number, width: number): number {
  if (n <= 1) return width / 2;
  return MARGIN + ((width - 2 * MARGIN) * i) / (n - 1);
}
/** Profundidad: unas mascotas un poco más atrás para que no se tapen del todo. */
// El piso empieza en la fila 48: los pies quedan entre 51 y 57 y abajo cabe el nombre.
export function laneFor(i: number): number { return [57, 53, 55, 51][i % 4]; }

export function moodFor(state: PatioState, a?: Actor, now = 0): Mood {
  if (a && now < a.celebrateUntil) return 'feliz';
  return state === 'work' ? 'concentrado' : state === 'break' ? 'feliz' : state === 'away' ? 'dormido' : 'normal';
}

/** Cuadro de animación según lo que esté haciendo. */
export function frameFor(a: Actor, state: PatioState, now: number): Frame {
  const t = now / 1000 + a.seed * 7;
  if (a.hopT >= 0) return 'salto';
  if (state === 'away') return Math.floor(t * 1.5) % 2 ? 'sueno2' : 'sueno1';
  if (a.tx !== null && Math.abs(a.tx - a.x) > 0.6) {
    const fr = ANIMS.camina.frames;
    return fr[Math.floor(t * (a.speed > WALK ? 12 : 8)) % fr.length];
  }
  const q = ANIMS.quieto.frames;
  return q[Math.floor(t * ANIMS.quieto.fps * (state === 'work' ? 0.6 : 1)) % q.length];
}

/** Altura del salto (para dibujar) en píxeles del cuarto. */
export function hopHeight(a: Actor): number {
  return a.hopT >= 0 ? Math.sin((Math.PI * Math.min(a.hopT, HOP)) / HOP) * HOP_H : 0;
}

export function ballPos(b: Ball): { x: number; h: number } {
  const u = Math.min(1, b.t / b.dur);
  return { x: b.x0 + (b.x1 - b.x0) * u, h: 4 * BALL_H * u * (1 - u) };
}

export class PatioSim {
  actors = new Map<string, Actor>();
  ball: Ball | null = null;
  width: number;
  private rnd: () => number;

  constructor(width: number, rnd: () => number = Math.random) { this.width = width; this.rnd = rnd; }

  private ensure(m: PatioMember, i: number, n: number): Actor {
    let a = this.actors.get(m.uid);
    if (!a) {
      a = { uid: m.uid, x: slotX(i, n, this.width), lane: laneFor(i), dir: this.rnd() < 0.5 ? 1 : -1, tx: null, speed: WALK, wait: this.rnd() * 2, chase: null, hopT: -1, celebrateUntil: 0, say: null, sayUntil: 0, seed: this.rnd() };
      this.actors.set(m.uid, a);
    }
    return a;
  }

  hop(uid: string) { const a = this.actors.get(uid); if (a && a.hopT < 0) a.hopT = 0; }
  sayFor(uid: string, text: string, now: number, ms = 3000) { const a = this.actors.get(uid); if (a) { a.say = text; a.sayUntil = now + ms; } }
  celebrate(now: number, ms: number) { this.actors.forEach((a) => { a.celebrateUntil = now + ms; a.hopT = 0; }); }

  /** Saludo: la que saluda va hacia la otra (si no está enfocada) y las dos saltan. */
  greet(from: string, to: string, fromName: string, toName: string, members: PatioMember[], now: number) {
    const a = this.actors.get(from), b = this.actors.get(to);
    const sa = members.find((m) => m.uid === from)?.state;
    if (a && b && sa !== 'work' && sa !== 'away') { a.tx = Math.max(MARGIN, Math.min(this.width - MARGIN, b.x + (a.x < b.x ? -10 : 10))); a.speed = RUN; a.wait = 3; }
    if (a) { this.hop(from); this.sayFor(from, `¡Hola, ${toName}!`, now); }
    if (b) { this.hop(to); this.sayFor(to, `¡Hola, ${fromName}!`, now + 400, 3000); }
  }

  step(members: PatioMember[], dt: number, now: number): void {
    dt = Math.min(0.1, Math.max(0, dt));
    const n = members.length;
    const alive = new Set(members.map((m) => m.uid));
    this.actors.forEach((_, k) => { if (!alive.has(k)) this.actors.delete(k); });
    const breakers = members.filter((m) => m.state === 'break');

    // ---- Pelota: solo si hay dos o más en descanso ----
    if (breakers.length < 2) this.ball = null;
    else if (!this.ball || !alive.has(this.ball.to)) {
      const a = breakers[Math.floor(this.rnd() * breakers.length)];
      const others = breakers.filter((m) => m.uid !== a.uid);
      const b = others[Math.floor(this.rnd() * others.length)];
      const xa = this.actors.get(a.uid)?.x ?? this.width / 2;
      const xb = this.actors.get(b.uid)?.x ?? this.width / 2;
      this.ball = { from: a.uid, to: b.uid, x0: xa, x1: xb, t: 0, dur: 0.9 + Math.abs(xb - xa) / 60, rest: 0 };
    } else if (this.ball.rest > 0) {
      this.ball.rest -= dt;
      if (this.ball.rest <= 0) {
        const holder = this.ball.to;
        const others = breakers.filter((m) => m.uid !== holder);
        const b = others[Math.floor(this.rnd() * others.length)];
        const xa = this.actors.get(holder)?.x ?? this.ball.x1;
        const xb = this.actors.get(b.uid)?.x ?? this.width / 2;
        this.ball = { from: holder, to: b.uid, x0: xa, x1: xb, t: 0, dur: 0.9 + Math.abs(xb - xa) / 60, rest: 0 };
        this.hop(holder); // patada
      }
    } else {
      this.ball.t += dt;
      if (this.ball.t >= this.ball.dur) { this.ball.t = this.ball.dur; this.ball.rest = 0.35 + this.rnd() * 0.4; }
    }

    members.forEach((m, i) => {
      const a = this.ensure(m, i, n);
      if (a.say && now > a.sayUntil) a.say = null;
      if (a.hopT >= 0) { a.hopT += dt; if (a.hopT >= HOP) a.hopT = -1; }
      a.wait -= dt;
      const celebrating = now < a.celebrateUntil;

      if (celebrating) {
        a.tx = null;
        if (a.hopT < 0 && a.wait <= 0) { a.hopT = 0; a.wait = 0.25 + this.rnd() * 0.3; }
      } else if (m.state === 'away') {
        a.tx = null;
      } else if (m.state === 'work') {
        a.tx = slotX(i, n, this.width); a.speed = WALK;
      } else if (m.state === 'online') {
        if (a.wait <= 0 && (a.tx === null || Math.abs(a.tx - a.x) < 0.6)) {
          a.tx = MARGIN + this.rnd() * (this.width - 2 * MARGIN); a.speed = WALK; a.wait = 2 + this.rnd() * 5;
        }
      } else { // descanso: a jugar
        a.speed = RUN;
        if (this.ball && this.ball.to === m.uid) {
          a.tx = this.ball.x1; // correr a recibir la pelota
        } else if (breakers.length >= 2) {
          if (a.wait <= 0 || !a.chase || !alive.has(a.chase) || a.chase === m.uid) {
            const others = breakers.filter((o) => o.uid !== m.uid);
            a.chase = others[Math.floor(this.rnd() * others.length)].uid;
            a.wait = 2.5 + this.rnd() * 3;
          }
          const t = this.actors.get(a.chase);
          if (t) {
            const side = a.seed < 0.5 ? -12 : 12;
            a.tx = Math.max(MARGIN, Math.min(this.width - MARGIN, t.x + side));
            if (Math.abs(t.x - a.x) < 16 && a.hopT < 0 && this.rnd() < dt * 1.2) a.hopT = 0;
          }
        } else if (a.wait <= 0) {
          a.tx = MARGIN + this.rnd() * (this.width - 2 * MARGIN); a.wait = 1.5 + this.rnd() * 2.5;
          if (this.rnd() < 0.5) a.hopT = 0;
        }
      }

      if (a.tx !== null) {
        const d = a.tx - a.x;
        if (Math.abs(d) > 0.6) {
          const stepX = Math.sign(d) * Math.min(Math.abs(d), a.speed * dt);
          a.x += stepX; a.dir = d > 0 ? 1 : -1;
        } else if (m.state === 'work') {
          a.dir = 1;
        }
      }
      a.x = Math.max(MARGIN * 0.6, Math.min(this.width - MARGIN * 0.6, a.x));
    });
  }
}

/**
 * Qué mascotas de la sala se sueltan por la pantalla: primero las que juegan,
 * luego las que pasean, las enfocadas y las dormidas. Devuelve hasta `max`,
 * ordenadas por id para que cada una conserve su lugar en la esquina.
 */
export function pickFriends<T extends { uid: string; state: PatioState }>(list: T[], max: number, includeAway: boolean): T[] {
  const order: Record<PatioState, number> = { break: 0, online: 1, work: 2, away: 3 };
  return list
    .filter((x) => includeAway || x.state !== 'away')
    .sort((a, b) => order[a.state] - order[b.state] || a.uid.localeCompare(b.uid))
    .slice(0, Math.max(0, max))
    .sort((a, b) => a.uid.localeCompare(b.uid));
}
