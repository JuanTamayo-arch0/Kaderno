// ============================================================
//  Motor de movimiento de la mascota (puro: sin React ni DOM).
//
//  La mascota vive en una capa fija sobre la app. Pisa "superficies":
//  el piso (el borde de abajo: la barra inferior en el celular, el pie de
//  la ventana en el computador) y las tarjetas marcadas para pisar. Las
//  tarjetas son de un solo sentido: se sube cayendo desde arriba y se baja
//  atravesándolas.
//
//  Estados: quieta, camina, en el aire (salto o caída), agarrada y dormida.
//  Quien lo usa llama step(dt) en cada cuadro y pinta x, y, dir y frame().
// ============================================================
import { ANIMS, type Frame } from './art';

export type Rect = { left: number; right: number; top: number };
export type World = {
  /** Ancho útil y borde izquierdo (en el computador, a la derecha del menú). */
  minX: number; maxX: number;
  /** Altura del piso (y de su borde de arriba). */
  floor: number;
  /** Tarjetas que se pueden pisar, con una clave estable. */
  perches(): { key: string; rect: Rect }[];
  /** Rectángulo actual de una tarjeta (null si ya no está o salió de la vista). */
  rectOf(key: string): Rect | null;
  /** Algo sobre el piso que hay que saltar (o null). */
  obstacle(): Rect | null;
};

export type Mode = 'idle' | 'walk' | 'air' | 'held' | 'sleep';

export const GRAVITY = 1500;   // px/s²
export const WALK_SPEED = 36;  // px/s

export class PetMotion {
  x = 0; y = 0; vx = 0; vy = 0;
  dir: 1 | -1 = 1;
  mode: Mode = 'idle';
  /** Clave de la tarjeta que pisa (null = piso). */
  on: string | null = null;
  /** Tarjetas que ignora al caer ('todas' para bajar directo al piso). */
  ignore: string | null = null;
  /** Saltos de celebración que quedan. */
  party = 0;
  /** Quieta en su esquina (ajuste) o durante un enfoque. */
  still = false;
  focus = false;
  /** Se queda quieta (por ejemplo, mientras muestra su globo). */
  hold = false;
  squash = 0;
  /** Saltó un obstáculo caminando: al caer sigue hacia donde iba. */
  private resume = false;
  private t = 0;
  private until = 1.5;
  private target = 0;

  constructor(public world: World, public size: number, private rand: () => number = Math.random) {}

  /** Píxel de pantalla por píxel del dibujo (la sombra pisa la superficie). */
  private get unit() { return this.size / 32; }
  yOn(top: number) { return top - this.size + this.unit; }
  feet() { return this.y + this.size - this.unit; }
  center() { return this.x + this.size / 2; }
  corner() { return this.world.maxX - this.size - 6; }

  surfaceTop(): number | null {
    if (!this.on) return this.world.floor;
    const r = this.world.rectOf(this.on);
    return r ? r.top : null;
  }

  placeOnFloor(x: number) {
    this.on = null; this.mode = 'idle'; this.vx = 0; this.vy = 0;
    this.x = this.clampX(x); this.y = this.yOn(this.world.floor); this.t = 0; this.until = 1.2;
  }

  private clampX(x: number) { return Math.max(this.world.minX, Math.min(this.world.maxX - this.size, x)); }

  walkTo(x: number) {
    this.target = this.clampX(x);
    if (Math.abs(this.target - this.x) < 1) { this.mode = 'idle'; return; }
    this.mode = 'walk'; this.dir = this.target > this.x ? 1 : -1;
  }

  jump(vx: number, vy: number) {
    this.mode = 'air'; this.vx = vx; this.vy = vy; this.on = null;
    if (vx) this.dir = vx > 0 ? 1 : -1;
  }

  /** Bajarse de la tarjeta. `toFloor` = no parar en otras tarjetas. */
  hopDown(dir: number = this.dir, toFloor = false) {
    this.ignore = toFloor ? 'todas' : this.on;
    this.jump(dir * 60, -200);
  }

  celebrate(times = 2) {
    if (this.mode === 'held') return;
    this.party = times - 1;
    if (this.mode !== 'air') { this.ignore = null; this.jump(0, -360); }
  }

  sleep() { if (this.mode !== 'held' && this.mode !== 'air') { this.mode = 'sleep'; this.t = 0; } }
  wake() { if (this.mode === 'sleep') { this.mode = 'idle'; this.t = 0; this.until = 1.2; } }

  grab() { this.resume = false; this.mode = 'held'; this.on = null; this.vx = 0; this.vy = 0; }
  dragTo(x: number, y: number) {
    this.x = Math.max(this.world.minX - this.size * 0.2, Math.min(this.world.maxX - this.size * 0.8, x));
    this.y = Math.max(-this.size * 0.2, Math.min(this.yOn(this.world.floor), y));
  }
  release(vx: number, vy: number) {
    this.ignore = null;
    this.jump(Math.max(-300, Math.min(300, vx * 0.6)), Math.max(-500, Math.min(150, vy * 0.5)));
  }

  /**
   * Subirse sola de un salto a una tarjeta que esté a la vista (no muy alta).
   * Devuelve false si no hay ninguna a su alcance.
   */
  climb(): boolean {
    const feet = this.feet();
    const options = this.world.perches().filter((p) => p.rect.top < feet - 60 && p.rect.top > feet - 460 && p.rect.right - p.rect.left > this.size * 1.6);
    if (!options.length) return false;
    const p = options[Math.floor(this.rand() * options.length) % options.length];
    const r = p.rect;
    const tx = Math.max(r.left, Math.min(r.right - this.size, r.left + this.rand() * (r.right - r.left - this.size)));
    const over = 26;
    const vy = -Math.sqrt(2 * GRAVITY * (feet - r.top + over));
    const air = -vy / GRAVITY + Math.sqrt((2 * over) / GRAVITY);
    this.ignore = null;
    this.jump((tx - this.x) / air, vy);
    return true;
  }

  /** Mover a un lado (por ejemplo, para no tapar un campo de texto). */
  moveAwayFrom(left: number, right: number) {
    if (this.mode === 'held' || this.mode === 'air') return;
    const roomL = left - this.world.minX, roomR = this.world.maxX - right;
    const x = roomR >= roomL ? this.world.maxX - this.size - 6 : this.world.minX + 6;
    if (this.on) { this.hopDown(x > this.x ? 1 : -1, true); return; }
    this.walkTo(x);
  }

  private decide() {
    this.t = 0;
    const W = this.world;
    if (this.hold) { this.mode = 'idle'; this.until = 0.5; return; }
    if (this.still || this.focus) {
      if (this.on) { this.hopDown(1, true); return; }
      if (Math.abs(this.x - this.corner()) > 2) { this.walkTo(this.corner()); return; }
      this.dir = -1; this.mode = 'idle'; this.until = 3; return;
    }
    const r = this.rand();
    if (this.on) {
      const s = W.rectOf(this.on);
      if (!s || r < 0.35) { this.hopDown(this.dir); return; }
      if (r < 0.8) { this.walkTo(s.left + this.rand() * Math.max(0, s.right - s.left - this.size)); return; }
    } else if (r < 0.18 && this.climb()) {
      return;
    } else if (r < 0.6) {
      let tx = W.minX + 4 + this.rand() * (W.maxX - W.minX - this.size - 8);
      const ob = W.obstacle();
      if (ob) {
        const cx = tx + this.size / 2, l = ob.left - this.size * 0.3, rr = ob.right + this.size * 0.3;
        if (cx > l && cx < rr) tx = cx < (l + rr) / 2 ? l - this.size / 2 - 6 : rr - this.size / 2 + 6;
      }
      this.walkTo(tx); return;
    }
    this.mode = 'idle'; this.until = 1.5 + this.rand() * 4;
    if (this.rand() < 0.3) this.dir = this.dir === 1 ? -1 : 1;
  }

  /** Avanza la simulación dt segundos. */
  step(dt: number) {
    dt = Math.min(0.05, Math.max(0, dt));
    this.t += dt;
    if (this.squash > 0) this.squash -= dt;
    const W = this.world;
    // Si la ventana cambió de tamaño, que no quede afuera.
    if (this.mode !== 'held') this.x = this.clampX(this.x);

    if (this.mode === 'walk' && this.hold) { this.mode = 'idle'; this.t = 0; this.until = 0.5; }
    if (this.mode === 'walk') {
      const step = WALK_SPEED * dt * this.dir;
      if (!this.on) {
        this.y = this.yOn(W.floor);
        const ob = W.obstacle();
        if (ob && ob.top < W.floor - 2) {
          const l = ob.left - this.size * 0.3, r = ob.right + this.size * 0.3;
          const cx = this.center(), nx = cx + step;
          const entering = this.dir > 0 ? (cx <= l && nx > l) : (cx >= r && nx < r);
          if (entering) {
            const h = Math.max(18, (W.floor - ob.top) + 16);
            const vy = -Math.sqrt(2 * GRAVITY * h), air = (2 * -vy) / GRAVITY;
            this.jump((this.dir * (r - l + 8)) / air, vy);
            this.resume = true;
            return;
          }
        }
      } else {
        const s = W.rectOf(this.on);
        if (!s) { this.jump(0, 0); return; }
        this.y = this.yOn(s.top);
        if (this.x + step < s.left - this.size * 0.25 || this.x + step > s.right - this.size * 0.75) { this.mode = 'idle'; this.t = 0; this.until = 1; return; }
      }
      this.x += step;
      if ((this.dir > 0 && this.x >= this.target) || (this.dir < 0 && this.x <= this.target)) {
        this.x = this.target; this.mode = 'idle'; this.t = 0; this.until = 1 + this.rand() * 3;
      }
    } else if (this.mode === 'air') {
      const prevFeet = this.feet();
      this.vy += GRAVITY * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < W.minX) { this.x = W.minX; this.vx = -this.vx * 0.4; }
      if (this.x > W.maxX - this.size) { this.x = W.maxX - this.size; this.vx = -this.vx * 0.4; }
      if (this.y < -this.size * 0.2) { this.y = -this.size * 0.2; this.vy = Math.max(0, this.vy); }
      if (this.vy > 0) {
        const feet = this.feet(), cx = this.center();
        let best: { key: string | null; top: number } | null = null;
        if (this.ignore !== 'todas') {
          for (const p of W.perches()) {
            if (p.key === this.ignore) continue;
            const s = p.rect;
            if (prevFeet <= s.top + 1 && feet >= s.top && cx > s.left + 6 && cx < s.right - 6 && (!best || s.top < best.top)) best = { key: p.key, top: s.top };
          }
        }
        if ((!best || W.floor < best.top) && prevFeet <= W.floor + 1 && feet >= W.floor) best = { key: null, top: W.floor };
        // Por si cayó muy rápido y pasó el piso de largo.
        if (!best && feet > W.floor) best = { key: null, top: W.floor };
        if (best) {
          this.y = this.yOn(best.top); this.on = best.key; this.ignore = null;
          this.vx = 0; this.vy = 0; this.squash = 0.1;
          if (this.party > 0) { this.party--; this.jump(0, -360); }
          else if (this.resume && !best.key) { this.resume = false; this.walkTo(this.target); }
          else { this.resume = false; this.mode = 'idle'; this.t = 0; this.until = 0.8 + this.rand() * 1.5; }
        }
      }
    } else if (this.mode === 'idle' || this.mode === 'sleep') {
      const top = this.surfaceTop();
      if (top === null) { this.jump(0, 0); return; }   // la tarjeta desapareció: cae
      this.y = this.yOn(top);
      if (this.mode === 'idle' && this.t > this.until) this.decide();
    }
  }

  /** Cuadro del dibujo para este momento. */
  frame(nowMs: number, reduceMotion = false): Frame {
    const s = nowMs / 1000;
    switch (this.mode) {
      case 'walk': return ANIMS.camina.frames[Math.floor(s * ANIMS.camina.fps) % ANIMS.camina.frames.length];
      case 'air': return this.vy < 0 ? 'salto' : 'cae';
      case 'held': return 'agarrado';
      case 'sleep': return ANIMS.duerme.frames[Math.floor(s * ANIMS.duerme.fps) % ANIMS.duerme.frames.length];
      default: {
        if (reduceMotion) return 'quieto';
        const q = ANIMS.quieto;
        return q.frames[Math.floor(s * q.fps) % q.frames.length];
      }
    }
  }

  /** Está en reposo (sirve para bajar el ritmo de cuadros y ahorrar batería). */
  get resting() { return this.mode === 'idle' || this.mode === 'sleep'; }
}
