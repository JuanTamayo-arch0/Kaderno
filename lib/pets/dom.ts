// ============================================================
//  La mascota en la pantalla (solo web).
//
//  Se dibuja fuera de React, en una capa fija sobre la app: así moverla 60
//  veces por segundo no hace que React vuelva a pintar nada. La capa no
//  captura toques salvo sobre la mascota y su globo.
//
//  · Un solo bucle de requestAnimationFrame que solo cambia `transform`.
//  · En reposo baja a ~8 cuadros por segundo; con la pestaña oculta, se para.
//  · El dibujo es una tira de cuadros (petSheet) usada como fondo; cambiar
//    de cuadro es mover el fondo.
// ============================================================
import { petSheet, type Frame, type Mood, type Outfit, type Species } from './art';
import { PetMotion, type Rect, type World } from './motion';
import type { ActionId } from './brain';

const FRAMES: Frame[] = ['quieto', 'respira', 'parpadeo', 'paso1', 'paso2', 'paso3', 'paso4', 'salto', 'agarrado', 'cae', 'sueno1', 'sueno2'];
export const PET_SIZE = 64;
const IDLE_SLEEP_MS = 10 * 60_000;

// Claves de las tarjetas que se pueden pisar. Son de todo el módulo (no de cada
// mascota): antes cada mascota nueva volvía a contar desde 1 y, al volver de una
// pantalla donde no aparece, dos tarjetas podían quedar con la misma clave. La
// mascota "perdía" la tarjeta, caía un píxel, volvía a aterrizar... y temblaba.
const perchKeys = new WeakMap<Element, string>();
const perchEls = new Map<string, WeakRef<HTMLElement>>();
let perchSeq = 0;
function keyOf(el: HTMLElement): string {
  let k = perchKeys.get(el);
  if (!k) { k = `p${++perchSeq}`; perchKeys.set(el, k); }
  perchEls.set(k, new WeakRef(el));
  return k;
}

export type BubbleAction = { id: ActionId; label: string };
export type PetLook = { species: Species; outfit: Outfit; name: string };
export type ControllerOpts = PetLook & {
  move: 'pasea' | 'quieta';
  onTap: () => void;
  onAction: (id: ActionId) => void;
  onGrab?: () => void;
  onWake?: () => void;
  palette: { paper: string; ink: string; muted: string; brand: string; onBrand: string; soft: string; coin: string };
};

const sheetCache = new Map<string, string>();
function sheetUrl(species: Species, mood: Mood, outfit: Outfit): string {
  const key = `${species}|${mood}|${JSON.stringify(outfit)}`;
  let url = sheetCache.get(key);
  if (!url) {
    url = `url("data:image/svg+xml,${encodeURIComponent(petSheet(species, FRAMES, { mood, outfit, look: 1 }))}")`;
    if (sheetCache.size > 40) sheetCache.clear();
    sheetCache.set(key, url);
  }
  return url;
}

function zoomOf(): number {
  const z = parseFloat((document.documentElement.style as any).zoom || '1');
  return z > 0 ? z : 1;
}

export class PetController {
  private layer: HTMLDivElement;
  private el: HTMLDivElement;
  private bubble: HTMLDivElement;
  private bText: HTMLDivElement;
  private bActs: HTMLDivElement;
  private bName: HTMLSpanElement;
  private note: HTMLDivElement;      // nota musical flotando (enfoque con sonido de fondo)
  private motion: PetMotion;
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = 0;
  private mood: Mood = 'normal';
  private moodUntil = 0;
  private baseMood: Mood = 'normal';
  private curFrame = '';
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTouch = Date.now();
  private drag: null | { id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean; hist: { x: number; y: number; t: number }[] } = null;
  private floor = 0;
  private reduce: boolean;
  private off: (() => void)[] = [];
  private destroyed = false;

  constructor(private opts: ControllerOpts) {
    this.reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const L = (this.layer = document.createElement('div'));
    L.setAttribute('data-pet-layer', '1');
    Object.assign(L.style, { position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '900', overflow: 'hidden' });

    const el = (this.el = document.createElement('div'));
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    Object.assign(el.style, {
      position: 'absolute', left: '0', top: '0', width: `${PET_SIZE}px`, height: `${PET_SIZE}px`,
      pointerEvents: 'auto', cursor: 'grab', backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
      willChange: 'transform', touchAction: 'none', outline: 'none', userSelect: 'none',
    });
    el.addEventListener('focus', () => { el.style.outline = `2px solid ${opts.palette.brand}`; el.style.outlineOffset = '2px'; el.style.borderRadius = '12px'; });
    el.addEventListener('blur', () => { el.style.outline = 'none'; });

    // Nota musical: se muestra sobre la mascota mientras suena el fondo.
    const note = (this.note = document.createElement('div'));
    note.setAttribute('aria-hidden', 'true');
    Object.assign(note.style, { position: 'absolute', left: '0', top: '0', width: '18px', height: '18px', display: 'none', pointerEvents: 'none' });
    note.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="${opts.palette.brand}"><path d="M9 17.5a2.5 2.5 0 1 1-2-2.45V5l11-2v11.5a2.5 2.5 0 1 1-2-2.45V6.4L9 7.7z"/></svg>`;
    const inner = note.firstElementChild as HTMLElement | null;
    if (inner && !this.reduce && (inner as any).animate) {
      inner.animate([
        { transform: 'translateY(0) rotate(-8deg)', opacity: 0.9 },
        { transform: 'translateY(-10px) rotate(8deg)', opacity: 1 },
        { transform: 'translateY(0) rotate(-8deg)', opacity: 0.9 },
      ], { duration: 2400, iterations: Infinity, easing: 'ease-in-out' });
    }

    const b = (this.bubble = document.createElement('div'));
    b.setAttribute('role', 'status');
    b.setAttribute('aria-live', 'polite');
    Object.assign(b.style, {
      position: 'absolute', left: '0', top: '0', width: '240px', maxWidth: 'calc(100vw - 24px)', display: 'none', pointerEvents: 'auto',
      background: opts.palette.paper, color: opts.palette.ink, borderRadius: '14px', padding: '10px 12px 12px',
      boxShadow: `0 0 0 3px ${opts.palette.ink}, 0 12px 26px rgba(0,0,0,.4)`, flexDirection: 'column', gap: '8px',
      fontSize: '14.5px', lineHeight: '1.35', boxSizing: 'border-box',
    });
    const head = document.createElement('div');
    Object.assign(head.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
    this.bName = document.createElement('span');
    Object.assign(this.bName.style, { fontSize: '12.5px', fontWeight: '800', color: opts.palette.muted });
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Cerrar');
    Object.assign(x.style, { background: 'none', border: '0', cursor: 'pointer', color: opts.palette.muted, fontSize: '20px', lineHeight: '1', width: '28px', height: '28px', margin: '-6px -8px -6px 0' });
    x.addEventListener('click', (e) => { e.stopPropagation(); this.hideBubble(); });
    head.append(this.bName, x);
    this.bText = document.createElement('div');
    Object.assign(this.bText.style, { fontWeight: '700' });
    this.bActs = document.createElement('div');
    Object.assign(this.bActs.style, { display: 'flex', flexWrap: 'wrap', gap: '6px' });
    const tail = document.createElement('div');
    tail.setAttribute('data-tail', '1');
    Object.assign(tail.style, { position: 'absolute', bottom: '-8px', left: '50%', width: '12px', height: '12px', marginLeft: '-6px', background: opts.palette.paper, boxShadow: `3px 3px 0 0 ${opts.palette.ink}`, transform: 'rotate(45deg)' });
    b.append(head, this.bText, this.bActs, tail);

    L.append(b, el, this.note);
    document.body.appendChild(L);

    const world: World = {
      minX: 0, maxX: 0, floor: 0,
      perches: () => this.perches(),
      rectOf: (k) => this.rectOf(k),
      obstacle: () => this.obstacle(),
    };
    this.motion = new PetMotion(world, PET_SIZE);
    this.measure();
    this.motion.still = opts.move === 'quieta' || this.reduce;
    this.motion.placeOnFloor(this.motion.still ? this.motion.corner() : world.minX + 24 + Math.random() * 120);
    this.applySheet();

    // Arrastrar y tocar.
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.touch(); opts.onTap(); } });

    // Actividad general: despierta y cuenta para dormirse.
    const touchDoc = () => this.touch();
    document.addEventListener('pointerdown', touchDoc, true);
    document.addEventListener('keydown', touchDoc, true);
    // Al hacer scroll, si está sobre una tarjeta, salta al piso.
    const onScroll = () => { if (this.motion.on && this.motion.mode !== 'held') this.motion.hopDown(this.motion.dir, true); };
    document.addEventListener('scroll', onScroll, true);
    // Si se abre un campo de texto debajo de ella, se corre.
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !(t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const r = this.toLocal(t.getBoundingClientRect());
      const m = this.motion;
      const overlapX = m.x < r.right && m.x + PET_SIZE > r.left;
      const overlapY = m.y < r.bottom && m.y + PET_SIZE > r.top;
      if (overlapX && overlapY) m.moveAwayFrom(r.left, r.right);
    };
    document.addEventListener('focusin', onFocusIn, true);
    const onResize = () => this.measure();
    window.addEventListener('resize', onResize);
    const onVis = () => { if (document.hidden) this.stop(); else this.start(); };
    document.addEventListener('visibilitychange', onVis);
    this.off.push(
      () => document.removeEventListener('pointerdown', touchDoc, true),
      () => document.removeEventListener('keydown', touchDoc, true),
      () => document.removeEventListener('scroll', onScroll, true),
      () => document.removeEventListener('focusin', onFocusIn, true),
      () => window.removeEventListener('resize', onResize),
      () => document.removeEventListener('visibilitychange', onVis),
    );
    this.start();
  }

  // ---------- Mundo ----------
  private toLocal(r: DOMRect) {
    const z = zoomOf();
    return { left: r.left / z, right: r.right / z, top: r.top / z, bottom: r.bottom / z };
  }
  private measure() {
    const z = zoomOf();
    const W = window.innerWidth / z, H = window.innerHeight / z;
    const side = document.querySelector('[data-pet-sidebar]') as HTMLElement | null;
    const bar = document.querySelector('[data-pet-floor]') as HTMLElement | null;
    const w = this.motion.world;
    w.minX = side ? this.toLocal(side.getBoundingClientRect()).right : 0;
    w.maxX = W;
    const barTop = bar ? this.toLocal(bar.getBoundingClientRect()).top : H;
    const floor = barTop > 40 ? barTop : H;
    // Si el piso bajó (se fue la barra), cae; si subió, se acomoda.
    if (this.floor && floor > this.floor + 4 && !this.motion.on && this.motion.resting) { w.floor = floor; this.motion.jump(0, 0); }
    else w.floor = floor;
    this.floor = floor;
  }
  private perches(): { key: string; rect: Rect }[] {
    const out: { key: string; rect: Rect }[] = [];
    const floor = this.motion.world.floor;
    document.querySelectorAll<HTMLElement>('[data-pet-perch]').forEach((n) => {
      const r = this.toLocal(n.getBoundingClientRect());
      if (r.right - r.left < 90 || r.bottom - r.top < 28 || r.top < 30 || r.top > floor - PET_SIZE * 0.6) return;
      // Nada dentro de ventanas emergentes: quedan por encima de la mascota.
      if (n.closest('[aria-modal="true"],[role="dialog"],[data-ghost]')) return;
      const k = keyOf(n);
      out.push({ key: k, rect: r });
    });
    return out;
  }
  private rectOf(key: string): Rect | null {
    const n = perchEls.get(key)?.deref();
    if (!n || !n.isConnected) { perchEls.delete(key); return null; }
    const r = this.toLocal(n.getBoundingClientRect());
    if (r.right - r.left < 1) return null; // pantalla oculta
    if (r.top < 0 || r.top > this.motion.world.floor - 10) return null;
    return r;
  }
  private obstacle(): Rect | null {
    const n = document.querySelector('[data-pet-obstacle]') as HTMLElement | null;
    return n ? this.toLocal(n.getBoundingClientRect()) : null;
  }

  // ---------- Bucle ----------
  private start() {
    if (this.destroyed || this.raf || this.timer) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }
  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.raf = 0; this.timer = null;
  }
  private tick = (now: number) => {
    this.raf = 0; this.timer = null;
    if (this.destroyed) return;
    const dt = (now - this.last) / 1000; this.last = now;
    const m = this.motion;
    if (this.moodUntil && Date.now() > this.moodUntil) { this.moodUntil = 0; this.setMoodNow(this.baseMood); }
    // Se duerme tras un rato sin que toques nada.
    if (!m.focus && m.mode === 'idle' && Date.now() - this.lastTouch > IDLE_SLEEP_MS) { m.sleep(); this.hideBubble(); }
    this.measureEvery(now);
    m.step(dt);
    const f = m.frame(now, this.reduce);
    if (f !== this.curFrame) { this.curFrame = f; this.el.style.backgroundPosition = `${-FRAMES.indexOf(f) * PET_SIZE}px 0`; }
    let sx = 1, sy = 1;
    if (m.squash > 0) { sx = 1.1; sy = 0.86; }
    const rot = m.mode === 'held' ? Math.sin(now / 160) * 7 : 0;
    this.el.style.transformOrigin = m.mode === 'held' ? '50% 8%' : '50% 100%';
    this.el.style.transform = `translate(${m.x.toFixed(1)}px,${m.y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sx * m.dir},${sy})`;
    if (this.note.style.display !== 'none') this.note.style.transform = `translate(${(m.x + PET_SIZE - 14).toFixed(1)}px,${(m.y - 10).toFixed(1)}px)`;
    this.placeBubble();
    // En reposo y sin globo: ~8 cuadros por segundo alcanzan.
    if (m.resting && m.squash <= 0 && this.bubble.style.display === 'none') this.timer = setTimeout(() => this.tick(performance.now()), 120);
    else this.raf = requestAnimationFrame(this.tick);
  };
  private lastMeasure = 0;
  private measureEvery(now: number) {
    if (now - this.lastMeasure < 500) return;
    this.lastMeasure = now;
    this.measure();
  }

  // ---------- Toques ----------
  private touch() {
    this.lastTouch = Date.now();
    if (this.motion.mode === 'sleep') { this.motion.wake(); this.opts.onWake?.(); }
  }
  private onDown = (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    this.touch();
    this.el.setPointerCapture(e.pointerId);
    const z = zoomOf();
    this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX / z - this.motion.x, oy: e.clientY / z - this.motion.y, moved: false, hist: [] };
  };
  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
      d.moved = true; this.motion.grab(); this.el.style.cursor = 'grabbing'; this.hideBubble(); this.opts.onGrab?.(); this.start();
    }
    if (!d.moved) return;
    const z = zoomOf();
    this.motion.dragTo(e.clientX / z - d.ox, e.clientY / z - d.oy);
    d.hist.push({ x: e.clientX / z, y: e.clientY / z, t: performance.now() });
    if (d.hist.length > 6) d.hist.shift();
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    this.el.style.cursor = 'grab';
    if (!d.moved) { this.opts.onTap(); return; }
    let vx = 0, vy = 0;
    if (d.hist.length > 1) {
      const a = d.hist[0], b = d.hist[d.hist.length - 1], dt = Math.max(16, b.t - a.t) / 1000;
      vx = (b.x - a.x) / dt; vy = (b.y - a.y) / dt;
    }
    this.motion.release(vx, vy);
    this.start();
  };

  // ---------- Aspecto ----------
  private applySheet() {
    this.el.style.backgroundImage = sheetUrl(this.opts.species, this.mood, this.opts.outfit);
    this.el.style.backgroundSize = `${FRAMES.length * PET_SIZE}px ${PET_SIZE}px`;
    this.el.setAttribute('aria-label', `${this.opts.name}, tu mascota. Tócala para hablarle o arrástrala para moverla.`);
    this.bName.textContent = this.opts.name;
  }
  setLook(look: PetLook) {
    const changed = look.species !== this.opts.species || JSON.stringify(look.outfit) !== JSON.stringify(this.opts.outfit) || look.name !== this.opts.name;
    Object.assign(this.opts, look);
    if (changed) this.applySheet();
  }
  private setMoodNow(m: Mood) { if (m !== this.mood) { this.mood = m; this.applySheet(); } }
  /** Ánimo por un rato (ms) o fijo (sin ms). */
  setMood(m: Mood, ms?: number) {
    if (ms) { this.moodUntil = Date.now() + ms; this.setMoodNow(m); }
    else { this.baseMood = m; if (!this.moodUntil) this.setMoodNow(m); }
  }
  setMove(move: 'pasea' | 'quieta') {
    this.opts.move = move;
    this.motion.still = move === 'quieta' || this.reduce;
    this.start();
  }
  setFocus(on: boolean) {
    if (this.motion.focus === on) return;
    this.motion.focus = on;
    this.setMood(on ? 'concentrado' : 'normal');
    if (on) this.hideBubble();
    this.start();
  }
  /** Nota musical sobre la mascota (enfoque con sonido de fondo). */
  setMusic(on: boolean) {
    const want = on ? 'block' : 'none';
    if (this.note.style.display === want) return;
    this.note.style.display = want;
    this.start();
  }
  celebrate() { if (!this.reduce) { this.motion.celebrate(2); this.start(); } }
  sleep() { this.motion.sleep(); this.hideBubble(); }
  get focusing() { return this.motion.focus; }
  get asleep() { return this.motion.mode === 'sleep'; }

  // ---------- Globo ----------
  say(text: string, actions: BubbleAction[] = [], ms = 4500) {
    this.bText.textContent = text;
    this.bActs.replaceChildren(...actions.map((a, i) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = a.label;
      Object.assign(btn.style, {
        flex: '1 1 auto', border: '0', borderRadius: '9px', padding: '8px 10px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', fontFamily: 'inherit',
        background: i === 0 ? this.opts.palette.brand : this.opts.palette.soft, color: i === 0 ? this.opts.palette.onBrand : this.opts.palette.ink,
      });
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.touch(); this.opts.onAction(a.id); });
      return btn;
    }));
    this.bubble.style.display = 'flex';
    // Se detiene mientras habla, para que los botones del globo no se muevan.
    this.motion.hold = true;
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => this.hideBubble(), ms);
    this.start();
    // Primero se coloca junto a la mascota y después aparece (antes la animación
    // pisaba la posición y el globo se veía un instante arriba a la izquierda).
    this.placeBubble();
    if (!this.reduce) this.bubble.animate?.([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 160, easing: 'steps(3)' });
  }
  hideBubble() {
    this.bubble.style.display = 'none';
    this.motion.hold = false;
    if (this.bubbleTimer) { clearTimeout(this.bubbleTimer); this.bubbleTimer = null; }
  }
  private placeBubble() {
    if (this.bubble.style.display === 'none') return;
    const w = this.motion.world, bw = this.bubble.offsetWidth, bh = this.bubble.offsetHeight;
    const cx = this.motion.center();
    const left = Math.max(w.minX + 8, Math.min(w.maxX - bw - 8, cx - bw / 2));
    const top = Math.max(8, this.motion.y + PET_SIZE * 0.12 - bh - 12);
    this.bubble.style.left = `${left.toFixed(0)}px`;
    this.bubble.style.top = `${top.toFixed(0)}px`;
    this.bubble.style.transformOrigin = `${Math.max(16, Math.min(bw - 16, cx - left))}px 100%`;
    const tail = this.bubble.querySelector('[data-tail]') as HTMLElement | null;
    if (tail) tail.style.left = `${Math.max(16, Math.min(bw - 16, cx - left))}px`;
  }

  /** "+5" con la moneda, sube y se desvanece. */
  gain(n: number, coinSvg: string) {
    const g = document.createElement('div');
    g.innerHTML = `+${n} ${coinSvg}`;
    Object.assign(g.style, {
      position: 'absolute', left: `${this.motion.center() - 20}px`, top: `${this.motion.y - 8}px`, display: 'flex', alignItems: 'center', gap: '4px',
      fontWeight: '900', fontSize: '17px', color: this.opts.palette.coin, textShadow: '0 2px 0 rgba(0,0,0,.6)', pointerEvents: 'none',
    });
    this.layer.appendChild(g);
    if (this.reduce || !g.animate) { setTimeout(() => g.remove(), 1500); return; }
    g.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-14px)', opacity: 1, offset: 0.6 }, { transform: 'translateY(-44px)', opacity: 0 }], { duration: 1300, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => g.remove(), 1400);
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.off.forEach((f) => f());
    this.layer.remove();
  }
}
