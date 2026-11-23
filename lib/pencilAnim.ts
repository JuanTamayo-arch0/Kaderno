// ============================================================
//  El lápiz escribe la K (v28). Puro, con pruebas.
//
//  El lápiz sale de la margen, se inclina, escribe los tres trazos de la K en
//  el orden de la mano y vuelve a su lugar con un rebote corto. Dura unos 2,3
//  segundos. La punta es el punto que se mueve; el lápiz gira sobre ella.
// ============================================================
import { LOGO, PENCIL } from './brand';

export type PencilPose = { x: number; y: number; a: number; lift: number; k: [number, number, number] };
export const PENCIL_REST: { x: number; y: number; a: number } = { x: PENCIL.cx, y: PENCIL.tip, a: 0 };
const TILT = 24;

type Seg =
  | { kind: 'hold'; t0: number; t1: number }
  | { kind: 'move'; t0: number; t1: number; from: { x: number; y: number; a: number }; to: { x: number; y: number; a: number }; hop: number; settle?: boolean }
  | { kind: 'draw'; t0: number; t1: number; stroke: number; s: [number, number, number, number] };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function build(): { segs: Seg[]; total: number } {
  const segs: Seg[] = [];
  let at = 0;
  type NoT<X> = X extends any ? Omit<X, 't0' | 't1'> : never;
  const push = (seg: NoT<Seg>, dur: number) => { segs.push({ ...(seg as any), t0: at, t1: at + dur }); at += dur; };
  push({ kind: 'hold' }, 0.25);
  let from: { x: number; y: number; a: number } = { ...PENCIL_REST };
  LOGO.kStrokes.forEach((s, i) => {
    const start = { x: s[0], y: s[1], a: TILT };
    push({ kind: 'move', from, to: start, hop: i === 0 ? 4 : 2.5 }, i === 0 ? 0.32 : 0.16);
    push({ kind: 'draw', stroke: i, s }, 0.16 + Math.hypot(s[2] - s[0], s[3] - s[1]) / 110);
    from = { x: s[2], y: s[3], a: TILT };
  });
  push({ kind: 'move', from, to: { ...PENCIL_REST }, hop: 5, settle: true }, 0.42);
  return { segs, total: at };
}
const TL = build();
/** Segundos que dura (sin pausa al final). */
export const PENCIL_ANIM_TOTAL = TL.total;

/** Dónde está el lápiz y cuánto de cada trazo va escrito en el segundo `t`. */
export function pencilPoseAt(t: number): PencilPose {
  const st: PencilPose = { x: PENCIL_REST.x, y: PENCIL_REST.y, a: 0, lift: 0, k: [0, 0, 0] };
  if (t >= TL.total) return { ...st, k: [1, 1, 1] };
  for (const seg of TL.segs) {
    if (t < seg.t0) break;
    const u = Math.min(1, (t - seg.t0) / (seg.t1 - seg.t0));
    if (seg.kind === 'draw') {
      st.k[seg.stroke] = u < 1 ? ease(u) : 1;
      if (t <= seg.t1) {
        const e = ease(u);
        st.x = seg.s[0] + (seg.s[2] - seg.s[0]) * e; st.y = seg.s[1] + (seg.s[3] - seg.s[1]) * e; st.a = TILT; st.lift = 0;
      }
    } else if (seg.kind === 'move' && t <= seg.t1) {
      const e = seg.settle ? easeOut(u) : ease(u);
      st.x = seg.from.x + (seg.to.x - seg.from.x) * e;
      st.y = seg.from.y + (seg.to.y - seg.from.y) * e - Math.sin(Math.PI * u) * seg.hop;
      st.a = seg.from.a + (seg.to.a - seg.from.a) * e;
      st.lift = Math.sin(Math.PI * u);
      if (seg.settle && u > 0.82) st.y += Math.sin(((u - 0.82) / 0.18) * Math.PI) * 0.8;
    }
  }
  return st;
}
