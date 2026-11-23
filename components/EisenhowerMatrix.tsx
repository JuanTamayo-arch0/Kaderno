import React, { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, RAD } from '../lib/theme';
import { QUADRANT_ORDER, quadrantInfo, type Quadrant } from '../lib/eisenhower';

// ============================================================
//  Vista "Matriz" de Hoy (v27, fase 1): cuatro cuadrantes según urgente e
//  importante. En el computador las tareas se arrastran entre cuadrantes;
//  en el teléfono se cambia con la estrella y la fecha.
// ============================================================

export type MatrixItem = { key: string; quadrant: Quadrant; draggable: boolean; node: React.ReactNode };

const ICON: Record<Quadrant, React.ComponentProps<typeof Ionicons>['name']> = {
  hacer: 'flame-outline', planear: 'calendar-outline', rapido: 'flash-outline', soltar: 'leaf-outline',
};

export function EisenhowerMatrix({ items, work, wide, onDrop }: {
  items: MatrixItem[]; work: boolean; wide: boolean;
  onDrop: (key: string, from: Quadrant, to: Quadrant) => void;
}) {
  const [over, setOver] = useState<Quadrant | null>(null);
  const dropRef = useRef(onDrop); dropRef.current = onDrop;
  const byQ = (q: Quadrant) => items.filter((i) => i.quadrant === q);
  const cell = (q: Quadrant) => {
    const info = quadrantInfo(q, work);
    const list = byQ(q);
    const accent = q === 'hacer' ? C.badText : q === 'planear' ? C.brand : q === 'rapido' ? C.warnText : C.muted;
    return (
      <DropZone key={q} q={q} onOver={setOver} onDrop={(k, from) => { setOver(null); if (from !== q) dropRef.current(k, from, q); }}
        style={{ flex: wide ? 1 : undefined, minWidth: 0, borderRadius: RAD.card, borderWidth: 1, borderColor: over === q ? accent : C.line,
          backgroundColor: over === q ? C.surface2 : 'transparent', padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="header">
          <Ionicons name={ICON[q]} size={16} color={accent} />
          <Text dataSet={{ head: '1' }} style={{ color: C.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{info.title}</Text>
          <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{list.length}</Text>
        </View>
        <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 17, marginTop: -4 }}>{info.hint}</Text>
        {list.length === 0
          ? <Text style={{ color: C.muted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 }}>{info.empty}</Text>
          : list.map((it) => <Draggable key={it.key} id={it.key} from={q} enabled={it.draggable && wide}>{it.node}</Draggable>)}
      </DropZone>
    );
  };
  if (!wide) return <View style={{ gap: 12 }}>{QUADRANT_ORDER.map(cell)}</View>;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>{cell('hacer')}{cell('planear')}</View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>{cell('rapido')}{cell('soltar')}</View>
      <Text style={{ color: C.muted, fontSize: 12.5 }}>Arrastra una tarea a otro cuadrante para cambiar si es importante. La urgencia sale de la fecha: si la cambias de fila, te ofrezco moverla.</Text>
    </View>
  );
}

const MIME = 'application/x-kaderno-task';

/** Contenedor que recibe tareas arrastradas (solo web). */
function DropZone({ q, onOver, onDrop, style, children }: {
  q: Quadrant; onOver: (q: Quadrant | null) => void; onDrop: (key: string, from: Quadrant) => void; style: any; children: React.ReactNode;
}) {
  const ref = useRef<any>(null);
  const cb = useRef({ onOver, onDrop }); cb.current = { onOver, onDrop };
  useEffect(() => {
    const el = ref.current as HTMLElement | null;
    if (Platform.OS !== 'web' || !el || !el.addEventListener) return;
    const has = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(MIME);
    const over = (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; cb.current.onOver(q); };
    const leave = (e: DragEvent) => { if (!el.contains(e.relatedTarget as Node | null)) cb.current.onOver(null); };
    const drop = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault();
      try { const d = JSON.parse(e.dataTransfer!.getData(MIME)); cb.current.onDrop(String(d.id), d.from as Quadrant); } catch { cb.current.onOver(null); }
    };
    el.addEventListener('dragover', over); el.addEventListener('dragleave', leave); el.addEventListener('drop', drop);
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('dragleave', leave); el.removeEventListener('drop', drop); };
  }, [q]);
  return <View ref={ref} style={style} dataSet={{ quadrant: q }}>{children}</View>;
}

/** Fila que se puede arrastrar (solo web y en pantallas anchas). */
function Draggable({ id, from, enabled, children }: { id: string; from: Quadrant; enabled: boolean; children: React.ReactNode }) {
  const ref = useRef<any>(null);
  useEffect(() => {
    const el = ref.current as HTMLElement | null;
    if (Platform.OS !== 'web' || !el || !el.setAttribute) return;
    if (!enabled) { el.removeAttribute('draggable'); return; }
    el.setAttribute('draggable', 'true');
    const start = (e: DragEvent) => {
      e.dataTransfer?.setData(MIME, JSON.stringify({ id, from }));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      el.style.opacity = '0.5';
    };
    const end = () => { el.style.opacity = ''; };
    el.addEventListener('dragstart', start); el.addEventListener('dragend', end);
    return () => { el.removeEventListener('dragstart', start); el.removeEventListener('dragend', end); };
  }, [id, from, enabled]);
  return <View ref={ref} style={enabled && Platform.OS === 'web' ? ({ cursor: 'grab' } as any) : undefined}>{children}</View>;
}
