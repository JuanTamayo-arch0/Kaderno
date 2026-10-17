import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

// ============================================================
//  Arrastrar tarjetas del tablero (web, con ratón o con el dedo).
//
//  Antes se usaba el arrastrar-y-soltar nativo de HTML5. Tenía tres
//  problemas: no existe en los navegadores del celular, la imagen que
//  arrastra el navegador es una copia borrosa, y al mantener presionado
//  medio segundo se disparaba "seleccionar" en vez de arrastrar.
//
//  Ahora se hace con eventos de puntero:
//    · Ratón: se arrastra apenas se mueve 4 px. Un clic sin mover abre la
//      tarjeta como siempre.
//    · Dedo: se mantiene presionada 200 ms y se arrastra. Si el dedo se
//      mueve antes, es scroll normal.
//  Mientras se arrastra, la tarjeta flota bajo el puntero, en la columna de
//  destino aparece un hueco del mismo alto donde va a caer, y el tablero y
//  la columna se desplazan solos al acercarse a los bordes. Esc cancela.
// ============================================================

const isWeb = Platform.OS === 'web';

export type DragState = { id: string; fromCol: string; overCol: string; beforeId: string | null; height: number; width: number };
type Pending = {
  id: string; col: string; x: number; y: number; type: string;
  rect: DOMRect; started: boolean; timer: ReturnType<typeof setTimeout> | null; origNext: string | null;
};

export function useBoardDrag({ enabled, onDrop }: {
  enabled: boolean;
  onDrop: (taskId: string, colKey: string, beforeId: string | null) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const cards = useRef(new Map<string, { el: HTMLElement; col: string }>());
  const cols = useRef(new Map<string, HTMLElement>());
  const lists = useRef(new Map<string, HTMLElement>());
  const board = useRef<HTMLElement | null>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  const p = useRef<Pending | null>(null);
  const pos = useRef({ x: 0, y: 0 });
  const target = useRef<{ col: string; before: string | null } | null>(null);
  const raf = useRef<number | null>(null);
  const lastEnd = useRef(0);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  // Todas las funciones se crean UNA vez: solo usan refs y setters estables,
  // y así quitar los listeners de window siempre quita los mismos que se pusieron.
  const api = useMemo(() => {
  // ---------- registro de elementos ----------
  const cardRef = (id: string, col: string) => (el: HTMLElement | null) => {
    if (el) cards.current.set(id, { el, col }); else cards.current.delete(id);
  };
  const colRef = (col: string) => (el: any) => {
    const node = el as HTMLElement | null;
    if (node) cols.current.set(col, node); else cols.current.delete(col);
  };
  const listRef = (col: string) => (sv: any) => {
    const node: HTMLElement | null = sv?.getScrollableNode?.() ?? null;
    if (node) lists.current.set(col, node); else lists.current.delete(col);
  };
  const boardRef = (sv: any) => { board.current = sv?.getScrollableNode?.() ?? null; };

  // ---------- cálculo del destino ----------
  function computeTarget(x: number, y: number, dragId: string): { col: string; before: string | null } | null {
    let best: { col: string; d: number } | null = null;
    cols.current.forEach((el, col) => {
      const r = el.getBoundingClientRect();
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (!best || d < best.d) best = { col, d };
    });
    if (!best) return null;
    const col = (best as { col: string }).col;
    const inCol: { id: string; mid: number }[] = [];
    cards.current.forEach((c, id) => {
      if (c.col !== col || id === dragId) return;
      const r = c.el.getBoundingClientRect();
      if (r.height === 0) return;
      inCol.push({ id, mid: r.top + r.height / 2 });
    });
    inCol.sort((a, b) => a.mid - b.mid);
    const before = inCol.find((c) => c.mid > y)?.id ?? null;
    return { col, before };
  }

  function placeGhost() {
    const g = ghost.current; const pp = p.current;
    if (!g || !pp) return;
    const offX = pp.x - pp.rect.left; const offY = pp.y - pp.rect.top;
    g.style.transform = `translate3d(${pos.current.x - offX}px, ${pos.current.y - offY}px, 0) rotate(1.5deg)`;
  }

  function tick() {
    const pp = p.current;
    if (!pp || !pp.started) return;
    const { x, y } = pos.current;
    // desplazamiento automático cerca de los bordes
    const b = board.current;
    if (b) {
      const r = b.getBoundingClientRect();
      const edge = 70;
      if (x < r.left + edge) b.scrollLeft -= Math.ceil((r.left + edge - x) / 6);
      else if (x > r.right - edge) b.scrollLeft += Math.ceil((x - (r.right - edge)) / 6);
    }
    const t = target.current;
    const list = t ? lists.current.get(t.col) : null;
    if (list) {
      const r = list.getBoundingClientRect();
      const edge = 50;
      if (y < r.top + edge && y > r.top - 40) list.scrollTop -= Math.ceil((r.top + edge - y) / 5);
      else if (y > r.bottom - edge && y < r.bottom + 40) list.scrollTop += Math.ceil((y - (r.bottom - edge)) / 5);
    }
    update();
    raf.current = requestAnimationFrame(tick);
  }

  function update() {
    const pp = p.current;
    if (!pp) return;
    const t = computeTarget(pos.current.x, pos.current.y, pp.id);
    if (!t) return;
    const prev = target.current;
    if (!prev || prev.col !== t.col || prev.before !== t.before) {
      target.current = t;
      setDrag((d) => (d ? { ...d, overCol: t.col, beforeId: t.before } : d));
    }
  }

  function start() {
    const pp = p.current;
    if (!pp || pp.started) return;
    pp.started = true;
    if (pp.timer) { clearTimeout(pp.timer); pp.timer = null; }
    target.current = { col: pp.col, before: pp.origNext };
    setDrag({ id: pp.id, fromCol: pp.col, overCol: pp.col, beforeId: pp.origNext, height: pp.rect.height, width: pp.rect.width });
    try { document.body.style.userSelect = 'none'; document.body.style.cursor = 'grabbing'; } catch { /* */ }
    if (pp.type === 'touch') { try { (navigator as any).vibrate?.(8); } catch { /* */ } }
    raf.current = requestAnimationFrame(() => { placeGhost(); tick(); });
  }

  function cleanup() {
    const pp = p.current;
    if (pp?.timer) clearTimeout(pp.timer);
    p.current = null; target.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('touchmove', onTouchMove);
    try { document.body.style.userSelect = ''; document.body.style.cursor = ''; } catch { /* */ }
  }

  function onMove(e: PointerEvent) {
    const pp = p.current;
    if (!pp) return;
    pos.current = { x: e.clientX, y: e.clientY };
    const dist = Math.hypot(e.clientX - pp.x, e.clientY - pp.y);
    if (!pp.started) {
      if (pp.type === 'touch') { if (dist > 10) cleanup(); return; }  // era scroll
      if (dist > 4) start();
      return;
    }
    placeGhost();
  }
  function onTouchMove(e: TouchEvent) {
    // Ya arrastrando: que el dedo no haga scroll de la página.
    if (p.current?.started && e.cancelable) e.preventDefault();
  }
  function onUp() {
    const pp = p.current;
    if (pp?.started) {
      lastEnd.current = Date.now();
      const t = target.current;
      const id = pp.id;
      const same = !t || (t.col === pp.col && t.before === pp.origNext);
      setDrag(null);
      cleanup();
      if (!same && t) {
        onDropRef.current(id, t.col, t.before);
        setLanded(id);
        setTimeout(() => setLanded((l) => (l === id ? null : l)), 700);
      }
      return;
    }
    cleanup();
  }
  function onCancel() { if (p.current?.started) lastEnd.current = Date.now(); setDrag(null); cleanup(); }
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && p.current?.started) { e.preventDefault(); onCancel(); } }

  /** Props para el contenedor de cada tarjeta. */
  function bind(id: string, col: string, nextId: string | null, enabledNow: boolean) {
    if (!isWeb || !enabledNow) return null;
    return {
      ref: cardRef(id, col),
      onPointerDown: (e: any) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        if (p.current) return;
        if ((e.target as HTMLElement)?.closest?.('[data-nodrag]')) return;
        const el = cards.current.get(id)?.el;
        if (!el) return;
        p.current = { id, col, x: e.clientX, y: e.clientY, type: e.pointerType, rect: el.getBoundingClientRect(), started: false, timer: null, origNext: nextId };
        pos.current = { x: e.clientX, y: e.clientY };
        if (e.pointerType === 'touch') p.current.timer = setTimeout(start, 200);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKey, true);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
      },
      // Mantener presionado en el celular no debe abrir el menú del navegador.
      onContextMenu: (e: any) => { if (p.current) e.preventDefault(); },
    };
  }

    return { cardRef, colRef, listRef, boardRef, bind, cleanup };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => api.cleanup(), [api]);

  /** true si el clic que acaba de llegar es el final de un arrastre (no abrir la tarjeta). */
  const consumeClick = () => Date.now() - lastEnd.current < 350;

  const bind = (id: string, col: string, nextId: string | null) => api.bind(id, col, nextId, enabled);
  return { drag, landed, bind, colRef: api.colRef, listRef: api.listRef, boardRef: api.boardRef, ghostRef: ghost, consumeClick, isActive: isWeb && enabled };
}

/** Envoltorio de una tarjeta. En nativo o sin arrastre no agrega nada. */
export function DragCard({ binding, hidden, landed, children }: {
  binding: ReturnType<ReturnType<typeof useBoardDrag>['bind']>; hidden: boolean; landed: boolean; children: React.ReactNode;
}) {
  if (!binding) return <>{children}</>;
  return React.createElement('div', {
    ...binding,
    'data-landed': landed ? '1' : undefined,
    'data-pet-perch': hidden ? undefined : '1',
    style: {
      cursor: 'grab', touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none',
      ...(hidden ? { height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' } : null),
    },
  }, children);
}

/** La tarjeta que sigue al puntero. */
export function DragGhost({ drag, ghostRef, children }: { drag: DragState | null; ghostRef: React.MutableRefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  if (!isWeb || !drag) return null;
  return React.createElement('div', {
    ref: ghostRef,
    'data-ghost': '1',
    style: {
      position: 'fixed', left: 0, top: 0, width: drag.width, zIndex: 2000, pointerEvents: 'none',
      transform: 'translate3d(-9999px, -9999px, 0)', willChange: 'transform',
    },
  }, children);
}
