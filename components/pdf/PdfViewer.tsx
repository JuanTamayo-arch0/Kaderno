import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { Button, IconButton } from '../ds';
import { openPdf, loadPdfjs } from '../../lib/pdfjs';
import { HL_COLORS, hlColor, toPageRects, cleanPdfText, sortHighlights, clampPage, quoteMarkdown, type FileKind, type HlColor, type HlRect } from '../../lib/highlights';
import { getHighlights, addHighlight, updateHighlight, deleteHighlight, type Highlight } from '../../lib/highlightsDb';
import { toast, friendlyError, confirm } from '../../lib/feedback';
import { useCardMaker } from '../cards/CardMaker';
import { SendToNoteSheet } from './SendToNoteSheet';

// ============================================================
//  Visor de PDF con resaltados (v22, fase 2). Solo web.
//  Páginas que se dibujan al acercarse (canvas + capa de texto de pdf.js),
//  resaltados en 4 colores, comentarios, "Enviar a una nota", "Hacer
//  tarjeta" y la lista de resaltados del archivo.
// ============================================================

const GAP = 14;
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

type Size = { w: number; h: number };
type Pending = { page: number; rects: HlRect[]; text: string; x: number; y: number };
type Pop = { id: string; x: number; y: number; editing?: boolean };

const CSS = `
.kd-pdf{position:relative}
.kd-pdf-page{position:absolute;left:50%;transform:translateX(-50%);background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);border-radius:2px;overflow:hidden}
.kd-pdf-page canvas{position:absolute;inset:0;width:100%;height:100%}
.kd-pdf-hl{position:absolute;mix-blend-mode:multiply;border-radius:2px;pointer-events:none}
.kd-pdf-hl.kd-flash{animation:kdFlash 1.2s ease-out 1}
@keyframes kdFlash{0%{outline:3px solid ${C.brand}}100%{outline:3px solid transparent}}
.kd-pdf-num{position:absolute;bottom:4px;right:8px;font:600 11px system-ui;color:#888;z-index:3;pointer-events:none}
.kd-pdf .textLayer{position:absolute;text-align:initial;inset:0;overflow:clip;opacity:1;line-height:1;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;z-index:2}
.kd-pdf .textLayer :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}
.kd-pdf .textLayer span.markedContent{top:0;height:0}
.kd-pdf .textLayer ::selection{background:rgba(0,90,255,.28)}
.kd-pdf .textLayer br::selection{background:transparent}
.kd-pdf .textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:0;cursor:default;user-select:none}
.kd-pdf .textLayer.selecting .endOfContent{top:0}
.kd-pdf-bar{position:fixed;z-index:1000;display:flex;gap:4px;align-items:center;padding:6px;border-radius:12px;background:${C.surface};border:1px solid ${C.line};box-shadow:0 8px 24px rgba(0,0,0,.28);font:600 13px system-ui;color:${C.text}}
.kd-pdf-bar button{all:unset;cursor:pointer;padding:6px 9px;border-radius:8px;display:flex;align-items:center;gap:6px;white-space:nowrap}
.kd-pdf-bar button:hover,.kd-pdf-bar button:focus-visible{background:${C.surface2}}
.kd-pdf-bar .dot{width:18px;height:18px;border-radius:9px;padding:0;border:2px solid transparent}
.kd-pdf-bar .dot.on{border-color:${C.text}}
.kd-pdf-bar textarea{all:unset;box-sizing:border-box;width:240px;min-height:60px;padding:8px;border-radius:8px;background:${C.surface2};border:1px solid ${C.line};font:400 13px system-ui;color:${C.text};white-space:pre-wrap}
`;

export function PdfViewer({ url, name, kind, fileId, subjectId, startPage }: {
  url: string; name: string; kind?: FileKind | null; fileId?: string | null; subjectId?: string | null; startPage?: number;
}) {
  const { isWide } = useResponsive();
  const canMark = !!kind && !!fileId;
  const scroller = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<any>(null);
  const [lib, setLib] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [boxW, setBoxW] = useState(800);
  const [boxH, setBoxH] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [hls, setHls] = useState<Highlight[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [panel, setPanel] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [send, setSend] = useState<{ md: string; text: string } | null>(null);
  const [pageInput, setPageInput] = useState('');
  const maker = useCardMaker();

  // Abrir el PDF y medir las páginas (la primera para todas; cada una se corrige al dibujarse).
  useEffect(() => {
    let live = true;
    setDoc(null); setError(null);
    Promise.all([openPdf(url), loadPdfjs()]).then(async ([d, l]) => {
      if (!live) return;
      const p1 = await d.getPage(1);
      const v = p1.getViewport({ scale: 1 });
      setLib(l);
      setSizes(Array.from({ length: d.numPages }, () => ({ w: v.width, h: v.height })));
      setDoc(d);
    }).catch((e) => live && setError(String(e?.message ?? e).includes('password') ? 'Este PDF tiene contraseña.' : 'No se pudo abrir el PDF.'));
    return () => { live = false; };
  }, [url]);
  useEffect(() => { if (canMark) getHighlights(kind!, fileId!).then(setHls); }, [kind, fileId]);

  // Tamaño del contenedor.
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(() => { setBoxW(el.clientWidth); setBoxH(el.clientHeight); });
    ro.observe(el); setBoxW(el.clientWidth); setBoxH(el.clientHeight);
    return () => ro.disconnect();
  }, [doc]);

  const fit = sizes[0] ? Math.min(1.75, Math.max(0.3, (boxW - 32) / sizes[0].w)) : 1;
  const scale = fit * zoom;
  const tops = useMemo(() => {
    const out: number[] = []; let y = GAP;
    for (const s of sizes) { out.push(y); y += s.h * scale + GAP; }
    out.push(y);
    return out;
  }, [sizes, scale]);
  const total = sizes.length;
  const current = useMemo(() => {
    const mid = scrollTop + boxH * 0.35;
    let i = 0; while (i < total - 1 && tops[i + 1] <= mid) i++;
    return i + 1;
  }, [scrollTop, boxH, tops, total]);

  const goPage = useCallback((p: number, smooth = true) => {
    const i = clampPage(p, total) - 1;
    scroller.current?.scrollTo({ top: Math.max(0, tops[i] - 8), behavior: smooth ? 'smooth' : 'auto' });
  }, [tops, total]);
  const started = useRef(false);
  useEffect(() => { if (doc && total && startPage && startPage > 1 && !started.current) { started.current = true; setTimeout(() => goPage(startPage, false), 50); } }, [doc, total]);

  // Mantener la página al hacer zoom.
  const changeZoom = (z: number) => {
    const el = scroller.current; if (!el) return setZoom(z);
    const ratio = el.scrollTop / Math.max(1, tops[total] ?? 1);
    setZoom(z);
    requestAnimationFrame(() => { el.scrollTop = ratio * el.scrollHeight; });
  };

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    setScrollTop(el.scrollTop);
    if (pending) setPending(null);
    if (pop) setPop(null);
  };

  // Selección de texto → barra de resaltar.
  const readSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const startEl = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement) as HTMLElement | null;
    const pageEl = startEl?.closest('[data-page]') as HTMLElement | null;
    if (!pageEl || !scroller.current?.contains(pageEl)) return;
    const page = Number(pageEl.dataset.page);
    const box = pageEl.getBoundingClientRect();
    const rects = toPageRects(Array.from(range.getClientRects()).filter((r) => r.top >= box.top - 2 && r.bottom <= box.bottom + 2), box);
    const text = cleanPdfText(sel.toString());
    if (!rects.length || !text) return;
    const last = range.getClientRects()[range.getClientRects().length - 1] ?? box;
    setPop(null);
    setPending({ page, rects, text, x: Math.min(window.innerWidth - 330, Math.max(8, last.left)), y: Math.min(window.innerHeight - 60, last.bottom + 8) });
  }, [canMark]);
  useEffect(() => {
    let t: any;
    const onChange = () => { clearTimeout(t); t = setTimeout(readSelection, 350); };
    document.addEventListener('selectionchange', onChange);
    return () => { document.removeEventListener('selectionchange', onChange); clearTimeout(t); };
  }, [readSelection]);

  // Clic sobre un resaltado (la capa de texto está encima): buscar cuál.
  const onClick = (e: React.MouseEvent) => {
    if (window.getSelection()?.toString()) return;
    const pageEl = (e.target as HTMLElement).closest('[data-page]') as HTMLElement | null;
    if (!pageEl) { setPop(null); return; }
    const page = Number(pageEl.dataset.page);
    const box = pageEl.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width, y = (e.clientY - box.top) / box.height;
    const hit = hls.find((h) => h.page === page && h.rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h));
    if (hit) setPop({ id: hit.id, x: Math.min(window.innerWidth - 330, Math.max(8, e.clientX - 20)), y: Math.min(window.innerHeight - 220, e.clientY + 14) });
    else setPop(null);
  };

  async function mark(color: HlColor, withComment = false): Promise<Highlight | null> {
    if (!pending || !canMark) return null;
    try {
      const h = await addHighlight({ file_kind: kind!, file_id: fileId!, page: pending.page, rects: pending.rects, text: pending.text, color });
      setHls((l) => [...l, h]);
      window.getSelection()?.removeAllRanges();
      if (withComment) setPop({ id: h.id, x: pending.x, y: pending.y, editing: true });
      setPending(null);
      return h;
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); return null; }
  }
  async function sendPending() {
    if (!pending) return;
    const p = pending;
    if (canMark && !hls.some((h) => h.page === p.page && h.text === p.text)) await mark('yellow');
    else { window.getSelection()?.removeAllRanges(); setPending(null); }
    setSend({ md: canMark ? quoteMarkdown(p.text, name, kind!, fileId!, p.page) : `> ${p.text}\n>\n> ${name}, pág. ${p.page}\n`, text: p.text });
  }
  function cards(text: string) {
    window.getSelection()?.removeAllRanges(); setPending(null); setPop(null);
    maker.start(text, 'selection', { noteId: null, subjectId: subjectId ?? null, title: name });
  }

  const popH = pop ? hls.find((h) => h.id === pop.id) : null;
  const sorted = useMemo(() => sortHighlights(hls), [hls]);
  const showPanel = canMark && panel;

  if (error) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{error}</Text>
      <Button label="Abrir en una pestaña" icon="open-outline" onPress={() => Linking.openURL(url)} />
    </View>
  );

  const first = Math.max(0, tops.findIndex((t, i) => tops[i + 1] != null && tops[i + 1] >= scrollTop - boxH));
  const visible: number[] = [];
  for (let i = first; i < total && tops[i] <= scrollTop + boxH * 2; i++) visible.push(i);

  return (
    <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Barra superior */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isWide ? 6 : 0, paddingHorizontal: isWide ? 12 : 4, paddingVertical: isWide ? 8 : 4, borderBottomWidth: 1, borderBottomColor: C.line, flexWrap: 'wrap' }}>
          {isWide
            ? <Button label="Anterior" size="sm" kind="ghost" icon="chevron-up" onPress={() => goPage(current - 1)} disabled={current <= 1} />
            : <IconButton icon="chevron-up" label="Página anterior" onPress={() => goPage(current - 1)} color={C.text} />}
          <form onSubmit={(e) => { e.preventDefault(); const n = parseInt(pageInput, 10); if (n) goPage(n); setPageInput(''); }} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input aria-label="Ir a la página" value={pageInput} placeholder={String(current)} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
              style={{ width: 38, textAlign: 'center', padding: '5px 4px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface2, color: C.text, font: '600 13px system-ui' }} />
            <span style={{ color: C.muted, font: '500 13px system-ui' }}>de {total || '…'}</span>
          </form>
          {isWide
            ? <Button label="Siguiente" size="sm" kind="ghost" icon="chevron-down" onPress={() => goPage(current + 1)} disabled={current >= total} />
            : <IconButton icon="chevron-down" label="Página siguiente" onPress={() => goPage(current + 1)} color={C.text} />}
          <View style={{ flex: 1 }} />
          <IconButton icon="remove" label="Alejar" onPress={() => changeZoom(ZOOMS[Math.max(0, ZOOMS.findIndex((z) => z >= zoom) - 1)])} color={C.text} />
          <Text style={{ color: C.muted, fontSize: 12.5, minWidth: isWide ? 40 : 34, textAlign: 'center' }}>{Math.round(scale * 100)}%</Text>
          <IconButton icon="add" label="Acercar" onPress={() => changeZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.findIndex((z) => z > zoom))])} color={C.text} />
          {canMark && (isWide
            ? <Button label={`Resaltados${hls.length ? ` (${hls.length})` : ''}`} size="sm" kind={panel ? 'primary' : 'secondary'} icon="bookmark-outline" onPress={() => setPanel(!panel)} />
            : <IconButton icon={panel ? 'bookmark' : 'bookmark-outline'} label={`Resaltados (${hls.length})`} onPress={() => setPanel(!panel)} color={panel ? C.brand : C.text} />)}
        </View>
        {/* Páginas */}
        <div ref={scroller} className="kd-pdf" onScroll={onScroll} onClick={onClick} style={{ flex: 1, overflow: 'auto', background: C.surface2, position: 'relative', minHeight: 0 }}>
          {!doc && <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={C.brand} /><Text style={{ color: C.muted, marginTop: 10 }}>Abriendo el PDF…</Text></View>}
          {doc && <div style={{ height: tops[total] ?? 0, position: 'relative', minWidth: (sizes[0]?.w ?? 0) * scale + 24 }}>
            {visible.map((i) => (
              <PageView key={i} doc={doc} lib={lib} index={i} top={tops[i]} size={sizes[i]} scale={scale}
                hls={hls.filter((h) => h.page === i + 1)} flash={flash}
                onSize={(s) => setSizes((all) => (Math.abs(all[i].w - s.w) > 0.5 || Math.abs(all[i].h - s.h) > 0.5 ? all.map((x, k) => (k === i ? s : x)) : all))} />
            ))}
          </div>}
        </div>
      </View>

      {showPanel && (
        <View style={isWide
          ? { width: 300, borderLeftWidth: 1, borderLeftColor: C.line, backgroundColor: C.surface }
          : { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, borderTopLeftRadius: 16, borderTopRightRadius: 16, zIndex: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }}>Resaltados · {hls.length}</Text>
            <Button label="Cerrar" size="sm" kind="ghost" onPress={() => setPanel(false)} />
          </View>
          <div style={{ overflow: 'auto', flex: 1, padding: 10 }}>
            {sorted.length === 0 && <Text style={{ color: C.muted, fontSize: 13, padding: 6 }}>Selecciona texto en el PDF para resaltarlo o comentarlo.</Text>}
            {sorted.map((h) => (
              <button key={h.id} type="button" onClick={() => { goPage(h.page); setFlash(h.id); setTimeout(() => setFlash(null), 1300); if (!isWide) setPanel(false); }}
                style={{ all: 'unset', boxSizing: 'border-box', display: 'block', width: '100%', cursor: 'pointer', padding: 10, borderRadius: 10, marginBottom: 6, border: `1px solid ${C.line}`, borderLeft: `4px solid ${hlColor(h.color).dot}` }}>
                <div style={{ color: C.muted, font: '700 11px system-ui', marginBottom: 4 }}>PÁG. {h.page}</div>
                <div style={{ color: C.text, font: '400 13px/1.4 system-ui', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>{h.text || '(sin texto)'}</div>
                {h.comment && <div style={{ color: C.text, font: 'italic 400 12.5px/1.4 system-ui', marginTop: 6 }}>💬 {h.comment}</div>}
              </button>
            ))}
          </div>
        </View>
      )}

      {pending && (
        <div className="kd-pdf-bar" role="toolbar" aria-label="Texto seleccionado" style={{ left: pending.x, top: pending.y }} onMouseDown={(e) => e.preventDefault()}>
          {canMark && HL_COLORS.map((c) => <button key={c.key} type="button" className="dot" aria-label={`Resaltar en ${c.label.toLowerCase()}`} style={{ background: c.dot }} onClick={() => mark(c.key)} />)}
          {canMark && <button type="button" onClick={() => mark('yellow', true)}>💬 Comentar</button>}
          <button type="button" onClick={sendPending}>📝 A una nota</button>
          <button type="button" onClick={() => cards(pending.text)}>🗂 Tarjeta</button>
        </div>
      )}

      {pop && popH && (
        <HighlightPop h={popH} x={pop.x} y={pop.y} startEditing={!!pop.editing}
          onColor={async (c) => { try { await updateHighlight(popH.id, { color: c }); setHls((l) => l.map((x) => (x.id === popH.id ? { ...x, color: c } : x))); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } }}
          onComment={async (txt) => { try { await updateHighlight(popH.id, { comment: txt }); setHls((l) => l.map((x) => (x.id === popH.id ? { ...x, comment: txt.trim() || null } : x))); toast('Comentario guardado'); setPop(null); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } }}
          onSend={() => { setPop(null); setSend({ md: quoteMarkdown(popH.text, name, popH.file_kind, popH.file_id, popH.page, popH.comment), text: popH.text }); }}
          onCards={() => cards(popH.text)}
          onDelete={async () => { setPop(null); if (!(await confirm('¿Borrar el resaltado?', undefined, 'Borrar'))) return; try { await deleteHighlight(popH.id); setHls((l) => l.filter((x) => x.id !== popH.id)); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); } }}
          onClose={() => setPop(null)} />
      )}

      <SendToNoteSheet visible={!!send} md={send?.md ?? ''} fileName={name} subjectId={subjectId ?? null} onClose={() => setSend(null)} />
      {maker.sheet}
    </View>
  );
}

function PageView({ doc, lib, index, top, size, scale, hls, flash, onSize }: {
  doc: any; lib: any; index: number; top: number; size: Size; scale: number; hls: Highlight[]; flash: string | null; onSize: (s: Size) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const textDiv = useRef<HTMLDivElement>(null);
  const w = size.w * scale, h = size.h * scale;
  useEffect(() => {
    let cancelled = false; let task: any = null; let tl: any = null;
    (async () => {
      const page = await doc.getPage(index + 1);
      if (cancelled) return;
      const v1 = page.getViewport({ scale: 1 });
      onSize({ w: v1.width, h: v1.height });
      const vp = page.getViewport({ scale });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.min(dpr, Math.sqrt(16_000_000 / (vp.width * vp.height)));
      const c = canvas.current; if (!c) return;
      c.width = Math.floor(vp.width * px); c.height = Math.floor(vp.height * px);
      const ctx = c.getContext('2d');
      task = page.render({ canvasContext: ctx, viewport: vp, transform: px !== 1 ? [px, 0, 0, px, 0, 0] : undefined });
      await task.promise.catch(() => {});
      if (cancelled || !textDiv.current || !lib?.TextLayer) return;
      textDiv.current.replaceChildren();
      textDiv.current.style.setProperty('--scale-factor', String(scale));
      tl = new lib.TextLayer({ textContentSource: page.streamTextContent(), container: textDiv.current, viewport: vp });
      await tl.render().catch(() => {});
    })().catch(() => {});
    return () => { cancelled = true; try { task?.cancel(); } catch { /* noop */ } try { tl?.cancel(); } catch { /* noop */ } };
  }, [doc, index, scale]);
  return (
    <div className="kd-pdf-page" data-page={index + 1} style={{ top, width: w, height: h }} aria-label={`Página ${index + 1}`}>
      <canvas ref={canvas} />
      {hls.map((hl) => hl.rects.map((r, k) => (
        <div key={hl.id + k} className={`kd-pdf-hl${flash === hl.id ? ' kd-flash' : ''}`}
          style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, background: hlColor(hl.color).fill, zIndex: 1, borderBottom: hl.comment && k === hl.rects.length - 1 ? `2px dotted ${hlColor(hl.color).dot}` : undefined }} />
      )))}
      <div ref={textDiv} className="textLayer" />
      <span className="kd-pdf-num">{index + 1}</span>
    </div>
  );
}

function HighlightPop({ h, x, y, startEditing, onColor, onComment, onSend, onCards, onDelete, onClose }: {
  h: Highlight; x: number; y: number; startEditing: boolean;
  onColor: (c: HlColor) => void; onComment: (t: string) => void; onSend: () => void; onCards: () => void; onDelete: () => void; onClose: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [txt, setTxt] = useState(h.comment ?? '');
  return (
    <div className="kd-pdf-bar" role="dialog" aria-label="Resaltado" style={{ left: x, top: y, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {HL_COLORS.map((c) => <button key={c.key} type="button" className={`dot${h.color === c.key ? ' on' : ''}`} aria-label={`Color ${c.label.toLowerCase()}`} style={{ background: c.dot }} onClick={() => onColor(c.key)} />)}
        <span style={{ flex: 1 }} />
        <button type="button" aria-label="Cerrar" onClick={onClose}>✕</button>
      </div>
      {editing ? (
        <>
          <textarea autoFocus aria-label="Comentario" value={txt} maxLength={2000} placeholder="Tu comentario" onChange={(e) => setTxt(e.target.value)} />
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setEditing(false); setTxt(h.comment ?? ''); }}>Cancelar</button>
            <button type="button" style={{ background: C.brand, color: C.onBrand }} onClick={() => onComment(txt)}>Guardar</button>
          </div>
        </>
      ) : (
        <>
          {h.comment && <div style={{ maxWidth: 260, font: 'italic 400 13px/1.4 system-ui', padding: '2px 6px' }}>{h.comment}</div>}
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setEditing(true)}>💬 {h.comment ? 'Editar' : 'Comentar'}</button>
            <button type="button" onClick={onSend}>📝 A una nota</button>
            <button type="button" onClick={onCards}>🗂 Tarjeta</button>
            <button type="button" onClick={onDelete} style={{ color: C.badText }}>Borrar</button>
          </div>
        </>
      )}
    </div>
  );
}
