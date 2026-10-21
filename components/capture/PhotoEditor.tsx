import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { C } from '../../lib/theme';
import { Button } from '../ds';
import { processImage } from '../../lib/captureImage';
import { clampCrop, type Crop } from '../../lib/capture';
import type { PageEdit } from '../../lib/captureDraft';

// ============================================================
//  Editar una foto antes de leerla (v22, fase 4): girar, recortar
//  arrastrando las esquinas y modo escáner. Solo web.
// ============================================================

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };
type Corner = 'tl' | 'tr' | 'bl' | 'br' | 'move';

export function PhotoEditor({ original, edit, onCancel, onApply }: {
  original: string | null; edit: PageEdit; onCancel: () => void; onApply: (e: PageEdit) => void;
}) {
  const [rotate, setRotate] = useState(edit.rotate);
  const [scan, setScan] = useState(edit.scan);
  const [crop, setCrop] = useState<Crop>(edit.crop ?? FULL);
  const [preview, setPreview] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ corner: Corner; sx: number; sy: number; start: Crop } | null>(null);

  useEffect(() => { setRotate(edit.rotate); setScan(edit.scan); setCrop(edit.crop ?? FULL); }, [original]);
  // Vista previa de la foto girada (y con escáner), sin recortar: el recorte se dibuja encima.
  useEffect(() => {
    if (!original) return;
    let live = true;
    setPreview(null);
    processImage(`data:image/jpeg;base64,${original}`, { rotate, scan, max: 1200 }).then((r) => live && setPreview(r.uri)).catch(() => {});
    return () => { live = false; };
  }, [original, rotate, scan]);

  const turn = (d: number) => {
    setRotate((r) => (((r + d) % 360) + 360) % 360);
    setCrop(FULL); // el recorte es de la foto girada: se reinicia
  };

  const onDown = (corner: Corner) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { corner, sx: e.clientX, sy: e.clientY, start: crop };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, el = box.current?.querySelector('img');
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - d.sx) / r.width, dy = (e.clientY - d.sy) / r.height;
    const s = d.start;
    let n: Crop = s;
    if (d.corner === 'move') n = { ...s, x: Math.min(1 - s.w, Math.max(0, s.x + dx)), y: Math.min(1 - s.h, Math.max(0, s.y + dy)) };
    if (d.corner === 'tl') n = { x: s.x + dx, y: s.y + dy, w: s.w - dx, h: s.h - dy };
    if (d.corner === 'tr') n = { x: s.x, y: s.y + dy, w: s.w + dx, h: s.h - dy };
    if (d.corner === 'bl') n = { x: s.x + dx, y: s.y, w: s.w - dx, h: s.h + dy };
    if (d.corner === 'br') n = { x: s.x, y: s.y, w: s.w + dx, h: s.h + dy };
    setCrop(clampCrop(n));
  };
  const onUp = () => { drag.current = null; };

  const handle = (corner: Corner, style: React.CSSProperties) => (
    <div role="slider" aria-label={`Esquina del recorte`} onPointerDown={onDown(corner)}
      style={{ position: 'absolute', width: 26, height: 26, margin: -13, borderRadius: 13, background: C.brand, border: '3px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,.4)', touchAction: 'none', cursor: 'grab', ...style }} />
  );

  return (
    <Modal visible={!!original} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', padding: 16, gap: 12 }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Editar la foto</Text>
        <div ref={box} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, touchAction: 'none' }}>
          {!preview ? <ActivityIndicator color="#fff" /> : (
            <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', display: 'inline-block' }}>
              <img src={preview} alt="Foto a editar" draggable={false} style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(100vh - 190px)', userSelect: 'none' }} />
              {/* Lo que queda fuera del recorte, oscurecido */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'none' }}>
                <div style={{ position: 'absolute', left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, boxShadow: '0 0 0 9999px rgba(0,0,0,.55)', outline: '2px solid #fff' }} />
              </div>
              <div onPointerDown={onDown('move')} aria-label="Mover el recorte"
                style={{ position: 'absolute', left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, cursor: 'move', touchAction: 'none' }}>
                {handle('tl', { left: 0, top: 0 })}
                {handle('tr', { right: 0, top: 0, margin: '-13px -13px 0 0' })}
                {handle('bl', { left: 0, bottom: 0, margin: '0 0 -13px -13px' })}
                {handle('br', { right: 0, bottom: 0, margin: '0 -13px -13px 0' })}
              </div>
            </div>
          )}
        </div>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button label="Girar a la izquierda" icon="arrow-undo-outline" size="sm" kind="secondary" onPress={() => turn(-90)} />
          <Button label="Girar a la derecha" icon="arrow-redo-outline" size="sm" kind="secondary" onPress={() => turn(90)} />
          <Button label={scan ? 'Escáner: sí' : 'Escáner: no'} icon="scan-outline" size="sm" kind={scan ? 'primary' : 'secondary'} onPress={() => setScan(!scan)} />
          <Button label="Quitar recorte" size="sm" kind="ghost" onPress={() => setCrop(FULL)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
          <Button label="Cancelar" kind="secondary" onPress={onCancel} />
          <Button label="Aplicar y leer" icon="checkmark" onPress={() => onApply({ rotate, scan, crop: crop.w > 0.995 && crop.h > 0.995 ? null : crop })} />
        </View>
      </View>
    </Modal>
  );
}
