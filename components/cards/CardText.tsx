import React, { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { C } from '../../lib/theme';
import { noteToHtml } from '../../lib/noteHtml';
import { clozeText } from '../../lib/cards';

// ============================================================
//  Texto de una tarjeta: Markdown con fórmulas ($...$ y $$...$$).
//  En la web usa marked + KaTeX (se cargan aparte, solo al repasar);
//  en el celular nativo, texto plano. Las de completar muestran
//  "[ … ]" o la respuesta resaltada.
// ============================================================

const cache = new Map<string, string>();
let cssDone = false;
function ensureKatexCss() {
  if (cssDone || Platform.OS !== 'web' || typeof document === 'undefined') return;
  cssDone = true;
  if (document.querySelector('link[data-katex]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = '/katex/katex.min.css'; l.setAttribute('data-katex', '1');
  document.head.appendChild(l);
  const st = document.createElement('style');
  st.textContent = `.kd-card p{margin:0 0 .5em} .kd-card p:last-child{margin-bottom:0} .kd-card strong{color:var(--kd-hl)} .kd-card ul,.kd-card ol{text-align:left;margin:.2em 0;padding-left:1.2em}
  .kd-card code{font-family:ui-monospace,monospace;font-size:.9em} .kd-card .math{margin:.4em 0;overflow-x:auto} .kd-clamp{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}`;
  document.head.appendChild(st);
}

const strip = (s: string) => s.replace(/\$\$?([^$]+)\$\$?/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/[#*_`>]/g, '');

export function CardText({ text, kind, reveal, size = 21, align = 'center', color, lines, highlight }: {
  text: string; kind?: 'basic' | 'cloze' | null; reveal?: boolean; size?: number; align?: 'center' | 'left';
  color?: string; lines?: number; highlight?: string;
}) {
  const src = kind === 'cloze' ? clozeText(text, !!reveal) : text;
  const [html, setHtml] = useState<string | null>(() => cache.get(src) ?? null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    ensureKatexCss();
    const hit = cache.get(src);
    if (hit) { setHtml(hit); return; }
    let alive = true;
    noteToHtml(src).then((h) => { if (cache.size > 400) cache.clear(); cache.set(src, h); if (alive) setHtml(h); }).catch(() => {});
    return () => { alive = false; };
  }, [src]);

  if (Platform.OS !== 'web' || html === null) {
    return <Text style={{ color: color ?? C.text, fontSize: size, lineHeight: Math.round(size * 1.42), textAlign: align }} numberOfLines={lines}>{strip(src)}</Text>;
  }
  return React.createElement('div', {
    className: `kd-card${lines ? ' kd-clamp' : ''}`,
    dangerouslySetInnerHTML: { __html: html },
    style: {
      color: color ?? C.text, fontSize: size, lineHeight: 1.42, textAlign: align, width: '100%', overflowWrap: 'anywhere',
      ['--kd-hl' as any]: highlight ?? C.brand, ...(lines ? { WebkitLineClamp: lines } : null),
    },
  });
}
