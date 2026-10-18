// ============================================================
//  Las mascotas de los compañeros de sala, sueltas por la pantalla (web).
//
//  Usan el mismo motor que tu mascota (lib/pets/motion.ts): caminan por el
//  piso, se suben a las tarjetas y saltan. Encima de eso, se portan según
//  el estado de su dueño:
//   · Enfocado → se va a una esquina (junto a la tuya) y se queda quieta.
//   · Descanso → juega: persigue a las otras que descansan, salta y se
//     pasan una pelota (también con tu mascota si estás en descanso).
//   · En la sala → pasea como la tuya.  · Fuera → duerme.
//  Fuera de la pantalla de la sala no hablan y los clics las atraviesan.
// ============================================================
import { petSheet, type Frame, type Mood, type Outfit, type Species } from './art';
import { PetMotion, type World } from './motion';
import { domBounds, domObstacle, domPerches, domRectOf, ownPetBox, ownPetHop } from './dom';
import type { PatioState } from './patio';

export const FRIEND_SIZE = 56;
const FRAMES: Frame[] = ['quieto', 'respira', 'parpadeo', 'paso1', 'paso2', 'paso3', 'paso4', 'salto', 'agarrado', 'cae', 'sueno1', 'sueno2'];
const sheets = new Map<string, string>();
function sheetUrl(species: Species, mood: Mood, outfit: Outfit): string {
  const k = `${species}|${mood}|${JSON.stringify(outfit)}`;
  let u = sheets.get(k);
  if (!u) {
    u = `url("data:image/svg+xml,${encodeURIComponent(petSheet(species, FRAMES, { mood, outfit }))}")`;
    if (sheets.size > 60) sheets.clear();
    sheets.set(k, u);
  }
  return u;
}

export type FriendSpec = { uid: string; name: string; species: Species; outfit: Outfit; state: PatioState; left: number | null };
export type FriendsOpts = {
  interactive: boolean;   // pantalla de la sala: se pueden tocar, con nombre y globos
  quiet: boolean;         // tú estás enfocado fuera de la sala: todas quietas en su esquina
  meOnBreak: boolean;     // tu mascota también juega a la pelota
};

type Friend = {
  spec: FriendSpec;
  m: PetMotion;
  box: HTMLDivElement; sprite: HTMLDivElement; label: HTMLDivElement; bubble: HTMLDivElement; badge: HTMLDivElement;
  sayUntil: number; partyUntil: number; nextPlay: number; sheet: string; lastState: PatioState;
};

type Ball = { from: string; to: string; t: number; dur: number; x0: number; y0: number; rest: number };

export class FriendsController {
  private layer: HTMLDivElement;
  private ballEl: HTMLDivElement;
  private friends = new Map<string, Friend>();
  private ball: Ball | null = null;
  private world: World;
  private raf = 0;
  private last = 0;
  private lastMeasure = 0;
  private opts: FriendsOpts = { interactive: false, quiet: false, meOnBreak: false };
  private reduce: boolean;
  private destroyed = false;
  private offVis: () => void;

  constructor(private onTap: (uid: string) => void, private palette: { paper: string; ink: string; brand: string }) {
    this.reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const L = (this.layer = document.createElement('div'));
    L.setAttribute('data-pet-friends', '1');
    Object.assign(L.style, { position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '899', overflow: 'hidden' });
    const ball = (this.ballEl = document.createElement('div'));
    ball.setAttribute('aria-hidden', 'true');
    Object.assign(ball.style, { position: 'absolute', left: '0', top: '0', width: '14px', height: '14px', borderRadius: '50%', background: '#f5b64c', border: '2px solid #1f2433', display: 'none', zIndex: '2000' });
    L.appendChild(ball);
    document.body.appendChild(L);
    const b = domBounds();
    this.world = {
      minX: b.minX, maxX: b.maxX, floor: b.floor,
      perches: () => domPerches(FRIEND_SIZE, this.world.floor),
      rectOf: (k) => domRectOf(k, this.world.floor),
      obstacle: () => domObstacle(),
    };
    const onVis = () => { if (document.hidden) this.stop(); else this.start(); };
    document.addEventListener('visibilitychange', onVis);
    this.offVis = () => document.removeEventListener('visibilitychange', onVis);
    this.start();
  }

  // ---------- Quiénes están ----------
  set(list: FriendSpec[], opts: FriendsOpts) {
    this.opts = opts;
    const keep = new Set(list.map((f) => f.uid));
    this.friends.forEach((f, k) => { if (!keep.has(k)) { f.box.remove(); this.friends.delete(k); } });
    list.forEach((spec, i) => {
      let f = this.friends.get(spec.uid);
      if (!f) { f = this.create(spec); this.friends.set(spec.uid, f); }
      f.spec = spec;
      f.m.cornerShift = (i + 1) * (FRIEND_SIZE + 6);
      f.box.style.pointerEvents = opts.interactive ? 'auto' : 'none';
      f.box.style.cursor = opts.interactive ? 'pointer' : 'default';
      f.box.setAttribute('aria-hidden', opts.interactive ? 'false' : 'true');
      f.label.style.display = opts.interactive ? 'block' : 'none';
    });
  }

  private create(spec: FriendSpec): Friend {
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'absolute', left: '0', top: '0', width: `${FRIEND_SIZE}px`, height: `${FRIEND_SIZE}px`, willChange: 'transform', touchAction: 'manipulation', userSelect: 'none' });
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', `Saludar a la mascota de ${spec.name}`);
    box.tabIndex = -1;
    const sprite = document.createElement('div');
    Object.assign(sprite.style, { width: '100%', height: '100%', backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', backgroundSize: `${FRAMES.length * FRIEND_SIZE}px ${FRIEND_SIZE}px`, transformOrigin: '50% 100%' });
    const label = document.createElement('div');
    // Nombre (y minutos si está enfocada) encima de la cabeza: abajo se saldría de la pantalla.
    Object.assign(label.style, { position: 'absolute', bottom: `${FRIEND_SIZE - 4}px`, left: '50%', transform: 'translateX(-50%)', font: '800 10.5px system-ui, sans-serif', color: '#fff', background: 'rgba(15,17,21,.72)', padding: '1px 6px', borderRadius: '6px', whiteSpace: 'nowrap', pointerEvents: 'none' });
    const bubble = document.createElement('div');
    Object.assign(bubble.style, { position: 'absolute', bottom: `${FRIEND_SIZE + 14}px`, left: '50%', transform: 'translateX(-50%)', background: this.palette.paper, color: this.palette.ink, font: '800 11.5px system-ui, sans-serif', padding: '3px 8px', borderRadius: '8px', whiteSpace: 'nowrap', display: 'none', boxShadow: `2px 2px 0 0 ${this.palette.ink}`, pointerEvents: 'none' });
    const badge = document.createElement('div');
    Object.assign(badge.style, { position: 'absolute', bottom: `${FRIEND_SIZE - 6}px`, left: '50%', transform: 'translateX(-50%)', background: 'rgba(26,32,54,.92)', color: '#a9bbff', font: '800 10px system-ui, sans-serif', padding: '1px 5px', borderRadius: '6px', whiteSpace: 'nowrap', display: 'none', pointerEvents: 'none' });
    box.append(sprite, label, badge, bubble);
    box.addEventListener('click', (e) => { e.stopPropagation(); if (this.opts.interactive) { this.hop(spec.uid); this.onTap(spec.uid); } });
    this.layer.appendChild(box);
    const m = new PetMotion(this.world, FRIEND_SIZE);
    m.placeOnFloor(this.world.minX + 20 + Math.random() * Math.max(40, this.world.maxX - this.world.minX - 120));
    m.still = this.reduce;
    return { spec, m, box, sprite, label, bubble, badge, sayUntil: 0, partyUntil: 0, nextPlay: performance.now() + 1500 + Math.random() * 2000, sheet: '', lastState: spec.state };
  }

  // ---------- Saludos y fiestas ----------
  hop(uid: string) {
    if (uid === 'yo') { ownPetHop(); return; }
    const f = this.friends.get(uid);
    if (f && f.m.mode !== 'air') { f.m.wake(); f.m.celebrate(1); }
  }
  say(uid: string, text: string, ms = 3000) {
    if (!this.opts.interactive) return; // fuera de la sala no hablan
    const f = this.friends.get(uid);
    if (!f) return;
    f.bubble.textContent = text; f.sayUntil = performance.now() + ms;
  }
  greet(from: string, to: string, fromName: string, toName: string, me: string) {
    const a = from === me ? 'yo' : from, b = to === me ? 'yo' : to;
    this.hop(a); this.hop(b);
    this.say(from, toName ? `¡Hola, ${toName.split(' ')[0]}!` : '¡Hola!');
    setTimeout(() => this.say(to, `¡Hola, ${fromName.split(' ')[0]}!`), 400);
    // La que saluda va hacia la otra (si su dueño no está enfocado).
    const fa = this.friends.get(from), target = b === 'yo' ? ownPetBox() : this.friends.get(to)?.m;
    if (fa && target && !fa.m.on && fa.spec.state !== 'work' && fa.spec.state !== 'away') {
      fa.m.walkTo(target.x + (fa.m.x < target.x ? -FRIEND_SIZE : FRIEND_SIZE));
    }
  }
  celebrate(big: boolean) {
    const now = performance.now();
    this.friends.forEach((f) => { f.partyUntil = now + (big ? 4000 : 1600); f.m.wake(); f.m.celebrate(big ? 3 : 1); if (big) this.say(f.spec.uid, '¡Meta!', 3500); });
    if (this.friends.size) ownPetHop();
  }

  // ---------- Bucle ----------
  private start() {
    if (this.destroyed || this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }
  private stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  private measure(now: number) {
    if (now - this.lastMeasure < 500) return;
    this.lastMeasure = now;
    const b = domBounds();
    this.world.minX = b.minX; this.world.maxX = b.maxX; this.world.floor = b.floor;
  }

  private center(uid: string): { x: number; y: number } | null {
    if (uid === 'yo') { const o = ownPetBox(); return o ? { x: o.x + o.size / 2, y: o.y + o.size * 0.35 } : null; }
    const f = this.friends.get(uid);
    return f ? { x: f.m.x + FRIEND_SIZE / 2, y: f.m.y + FRIEND_SIZE * 0.35 } : null;
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.measure(now);
    const breakers = [...this.friends.values()].filter((f) => f.spec.state === 'break' && !this.opts.quiet).map((f) => f.spec.uid);
    if (this.opts.meOnBreak && !this.opts.quiet && ownPetBox()) breakers.push('yo');

    this.friends.forEach((f) => {
      const { m, spec } = f;
      if (spec.state !== f.lastState) { if (f.lastState === 'away') m.wake(); f.lastState = spec.state; }
      const partying = now < f.partyUntil;
      m.focus = !partying && (spec.state === 'work' || this.opts.quiet);
      if (spec.state === 'away' && !partying) { if (m.mode === 'idle') m.sleep(); }
      else if (spec.state === 'break' && !this.opts.quiet && !this.reduce && now > f.nextPlay && m.resting && !m.on) {
        // Jugar: ir hacia otra que también descansa y saltar cerca.
        f.nextPlay = now + 2200 + Math.random() * 2600;
        const others = breakers.filter((u) => u !== spec.uid);
        const pick = others[Math.floor(Math.random() * others.length)];
        const c = pick ? this.center(pick) : null;
        if (c && Math.abs(c.x - (m.x + FRIEND_SIZE / 2)) < FRIEND_SIZE * 1.4) m.celebrate(1);
        else if (c) m.walkTo(c.x - FRIEND_SIZE / 2 + (Math.random() < 0.5 ? -FRIEND_SIZE : FRIEND_SIZE));
        else if (Math.random() < 0.5) m.celebrate(1);
      }
      m.step(dt);
      const mood: Mood = partying || spec.state === 'break' ? 'feliz' : spec.state === 'work' ? 'concentrado' : spec.state === 'away' ? 'dormido' : 'normal';
      const url = sheetUrl(spec.species, mood, spec.outfit);
      if (url !== f.sheet) { f.sheet = url; f.sprite.style.backgroundImage = url; }
      const fr = m.frame(Date.now() + spec.uid.charCodeAt(0) * 37, this.reduce);
      f.sprite.style.backgroundPosition = `${-FRAMES.indexOf(fr) * FRIEND_SIZE}px 0`;
      const sx = m.squash > 0 ? 1.1 : 1, sy = m.squash > 0 ? 0.86 : 1;
      f.sprite.style.transform = `scale(${sx * m.dir},${sy})`;
      f.box.style.transform = `translate(${m.x.toFixed(1)}px,${m.y.toFixed(1)}px)`;
      f.box.style.opacity = spec.state === 'away' ? '0.75' : '1';
      const talking = now < f.sayUntil;
      f.bubble.style.display = talking ? 'block' : 'none';
      const first = spec.name.split(' ')[0];
      const tag = spec.state === 'work' && spec.left ? `${first} · ${spec.left} min` : first;
      if (f.label.textContent !== tag) f.label.textContent = tag;
    });

    this.stepBall(breakers, dt);
    this.raf = requestAnimationFrame(this.tick);
  };

  private stepBall(breakers: string[], dt: number) {
    if (breakers.length < 2 || this.reduce) { this.ball = null; this.ballEl.style.display = 'none'; return; }
    if (!this.ball || !breakers.includes(this.ball.to)) {
      const from = breakers[Math.floor(Math.random() * breakers.length)];
      const others = breakers.filter((u) => u !== from);
      const to = others[Math.floor(Math.random() * others.length)];
      const c = this.center(from); if (!c) return;
      this.ball = { from, to, t: 0, dur: 1.2, x0: c.x, y0: c.y, rest: 0 };
    }
    const b = this.ball;
    if (b.rest > 0) {
      b.rest -= dt;
      const c = this.center(b.to);
      if (c) this.placeBall(c.x, c.y - 10);
      if (b.rest <= 0) {
        const others = breakers.filter((u) => u !== b.to);
        const next = others[Math.floor(Math.random() * others.length)];
        const c0 = this.center(b.to); if (!c0 || !next) return;
        this.hop(b.to); // patada
        this.ball = { from: b.to, to: next, t: 0, dur: 1 + Math.random() * 0.5, x0: c0.x, y0: c0.y - 10, rest: 0 };
      }
      return;
    }
    b.t += dt;
    const target = this.center(b.to);
    if (!target) { this.ball = null; return; }
    const u = Math.min(1, b.t / b.dur);
    const arc = 4 * 140 * u * (1 - u);
    this.placeBall(b.x0 + (target.x - b.x0) * u, b.y0 + (target.y - 10 - b.y0) * u - arc);
    if (u >= 1) { b.rest = 0.4 + Math.random() * 0.5; }
  }
  private placeBall(x: number, y: number) {
    this.ballEl.style.display = 'block';
    this.ballEl.style.transform = `translate(${(x - 7).toFixed(1)}px,${(y - 7).toFixed(1)}px)`;
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.offVis();
    this.layer.remove();
  }
}
