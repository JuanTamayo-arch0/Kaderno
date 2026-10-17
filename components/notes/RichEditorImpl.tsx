// ============================================================
//  Editor de notas para web (TipTap / ProseMirror).
//
//  · Se lee y se edita en el mismo lugar: el formato se ve mientras escribes,
//    sin asteriscos ni numerales a la vista.
//  · Se guarda en Markdown, igual que antes: resumen, flashcards, Oráculo,
//    PDF y notas viejas siguen funcionando sin migrar nada.
//  · Barra delgada pegada arriba, barra al seleccionar texto, menú con "/",
//    fórmulas (KaTeX), tablas, listas de tareas e imágenes dentro del texto.
//
//  Este archivo solo se carga en web y de forma diferida (ver NoteEditor.web.tsx).
// ============================================================
import { createPortal } from 'react-dom';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Extension, type Range } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extensions';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import katex from 'katex';
import { C, noteFontStack, noteFontFamily, loadWebFont, fontFamilyOf, PERSONALIZE } from '../../lib/theme';
import { signedUrl } from '../../lib/db';
import { KD_IMG, type HeadingItem, type NoteEditorHandle, type NoteEditorProps } from './editorTypes';

// ---------- Estilos ----------
function loadKatexCss() {
  if (typeof document === 'undefined' || document.getElementById('kd-katex-css')) return;
  const l = document.createElement('link');
  l.id = 'kd-katex-css'; l.rel = 'stylesheet'; l.href = '/katex/katex.min.css';
  document.head.appendChild(l);
}
function hexA(hex: string, a: number): string {
  const h = String(hex).replace('#', '');
  if (h.length < 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}
function injectCss() {
  if (typeof document === 'undefined') return;
  const body = noteFontStack();
  const ui = fontFamilyOf(PERSONALIZE.fontId);
  const css = `
  .kd-ed { position: relative; --kd-ui-font: ${ui ? `'${ui}', ` : ''}system-ui, sans-serif; }
  .kd-ed .ProseMirror { outline: none; color: ${C.text}; font-family: ${body}; font-size: 17.5px; line-height: 1.7; word-wrap: break-word; caret-color: ${C.brand}; padding-bottom: 40px; }
  .kd-ed .ProseMirror > * + * { margin-top: 0.75em; }
  .kd-ed .ProseMirror p { margin: 0; }
  .kd-ed .ProseMirror h1, .kd-ed .ProseMirror h2, .kd-ed .ProseMirror h3, .kd-ed .ProseMirror h4, .kd-ed .ProseMirror h5, .kd-ed .ProseMirror h6 {
    font-family: var(--kd-ui-font); line-height: 1.3; margin: 1.3em 0 0.2em; color: ${C.text}; scroll-margin-top: 70px; }
  .kd-ed .ProseMirror h1 { font-size: 27px; font-weight: 800; letter-spacing: -0.01em; }
  .kd-ed .ProseMirror h2 { font-size: 22px; font-weight: 800; }
  .kd-ed .ProseMirror h3, .kd-ed .ProseMirror h4, .kd-ed .ProseMirror h5, .kd-ed .ProseMirror h6 { font-size: 18px; font-weight: 800; color: ${C.brand2}; }
  .kd-ed .ProseMirror > :first-child { margin-top: 0; }
  .kd-ed .ProseMirror strong { font-weight: 700; color: ${C.text}; }
  .kd-ed .ProseMirror a { color: ${C.brand}; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .kd-ed .ProseMirror mark { background: ${hexA(C.warn, 0.32)}; color: inherit; border-radius: 3px; padding: 0 2px; }
  .kd-ed .ProseMirror code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.86em; background: ${C.surface2}; border: 1px solid ${C.line}; border-radius: 6px; padding: 1px 5px; }
  .kd-ed .ProseMirror pre { background: ${C.surface2}; border: 1px solid ${C.line}; border-radius: 12px; padding: 14px 16px; overflow-x: auto; }
  .kd-ed .ProseMirror pre code { background: none; border: 0; padding: 0; font-size: 14px; line-height: 1.55; }
  .kd-ed .ProseMirror ul, .kd-ed .ProseMirror ol { padding-left: 1.4em; margin: 0.5em 0; }
  .kd-ed .ProseMirror li > p { margin: 0; }
  .kd-ed .ProseMirror li + li { margin-top: 0.2em; }
  .kd-ed .ProseMirror li::marker { color: ${C.muted}; }
  .kd-ed .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0.2em; }
  .kd-ed .ProseMirror ul[data-type="taskList"] li { display: flex; gap: 10px; align-items: flex-start; }
  .kd-ed .ProseMirror ul[data-type="taskList"] li > label { margin-top: 0.32em; flex: none; user-select: none; }
  .kd-ed .ProseMirror ul[data-type="taskList"] li > label input { width: 17px; height: 17px; accent-color: ${C.brand}; cursor: pointer; }
  .kd-ed .ProseMirror ul[data-type="taskList"] li > div { flex: 1; min-width: 0; }
  .kd-ed .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { color: ${C.muted}; text-decoration: line-through; }
  .kd-ed .ProseMirror blockquote { margin: 0.9em 0; padding: 12px 16px; border-radius: 12px; background: ${hexA(C.warn, 0.1)}; border: 1px solid ${hexA(C.warn, 0.35)}; font-size: 16px; }
  .kd-ed .ProseMirror blockquote p { margin: 0; }
  .kd-ed .ProseMirror hr { border: 0; border-top: 1px solid ${C.line}; margin: 1.6em 0; }
  .kd-ed .ProseMirror img { display: block; max-width: 100%; height: auto; border-radius: 12px; border: 1px solid ${C.line}; margin: 0.8em 0; background: ${C.surface2}; min-height: 60px; }
  .kd-ed .ProseMirror img.ProseMirror-selectednode { outline: 2px solid ${C.brand}; outline-offset: 2px; }
  .kd-ed .tableWrapper { overflow-x: auto; margin: 0.9em 0; }
  .kd-ed .ProseMirror table { border-collapse: collapse; width: 100%; font-size: 15.5px; line-height: 1.5; }
  .kd-ed .ProseMirror th, .kd-ed .ProseMirror td { border: 1px solid ${C.line}; padding: 8px 10px; vertical-align: top; min-width: 60px; position: relative; }
  .kd-ed .ProseMirror th { background: ${C.surface2}; font-weight: 700; text-align: left; }
  .kd-ed .ProseMirror .selectedCell::after { content: ''; position: absolute; inset: 0; background: ${hexA(C.brand, 0.18)}; pointer-events: none; }
  .kd-ed .ProseMirror .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: ${C.brand}; pointer-events: none; }
  .kd-ed .ProseMirror [data-type="block-math"] { display: block; margin: 1em 0; padding: 16px; border-radius: 12px; background: ${C.surface}; border: 1px solid ${C.line}; text-align: center; overflow-x: auto; cursor: pointer; font-size: 1.15em; }
  .kd-ed .ProseMirror [data-type="inline-math"] { cursor: pointer; padding: 0 2px; border-radius: 4px; }
  .kd-ed .ProseMirror [data-type="inline-math"]:hover, .kd-ed .ProseMirror [data-type="block-math"]:hover { background: ${hexA(C.brand, 0.1)}; }
  .kd-ed .ProseMirror .katex-error, .kd-ed .ProseMirror .tiptap-mathematics-render--error { color: ${C.badText}; font-family: ui-monospace, monospace; font-size: 14px; }
  .kd-ed .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: ${C.muted}; float: left; height: 0; pointer-events: none; }
  .kd-ed .ProseMirror ::selection { background: ${hexA(C.brand, 0.35)}; }
  .kd-ed.kd-reading .ProseMirror { cursor: text; }
  .kd-tb { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; align-items: center; gap: 2px; padding: 5px; margin-bottom: 18px; border-radius: 12px; background: ${C.surface}; border: 1px solid ${C.line}; box-shadow: 0 6px 18px rgba(0,0,0,0.18); }
  .kd-tb::-webkit-scrollbar { display: none; }
  .kd-tb-table { display: flex; flex-wrap: wrap; gap: 2px; margin: -10px 0 14px; padding: 4px; border-radius: 10px; background: ${C.surface}; border: 1px solid ${C.line}; }
  @media (max-width: 600px) { .kd-ed .ProseMirror { font-size: 16.5px; line-height: 1.65; } .kd-ed .ProseMirror h1 { font-size: 24px; } .kd-ed .ProseMirror h2 { font-size: 20px; } }
  .kd-btn { flex: none; appearance: none; border: 0; background: transparent; color: ${C.text}; height: 34px; min-width: 34px; padding: 0 8px; border-radius: 8px; font: 600 13.5px/1 system-ui, sans-serif; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
  .kd-btn:hover { background: ${C.surface2}; }
  .kd-btn:focus-visible { outline: 2px solid ${C.focus}; outline-offset: 1px; }
  .kd-btn[aria-pressed="true"] { background: ${hexA(C.brand, 0.2)}; color: ${C.brand}; }
  .kd-btn[disabled] { opacity: 0.4; cursor: default; }
  .kd-sep { width: 1px; height: 20px; background: ${C.line}; margin: 0 4px; }
  .kd-pop { background: ${C.surface}; border: 1px solid ${C.line}; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.35); color: ${C.text}; font-family: system-ui, sans-serif; }
  .kd-bubble { display: flex; align-items: center; gap: 2px; padding: 4px; }
  .kd-menu { width: 290px; max-height: 340px; overflow-y: auto; padding: 6px; }
  .kd-menu-h { font-size: 11px; letter-spacing: 0.08em; color: ${C.muted}; padding: 6px 10px 4px; font-weight: 700; }
  .kd-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 10px; border: 0; border-radius: 9px; background: transparent; color: ${C.text}; text-align: left; cursor: pointer; font: inherit; }
  .kd-item[aria-selected="true"], .kd-item:hover { background: ${C.surface2}; }
  .kd-item-ic { width: 30px; height: 30px; border-radius: 8px; background: ${C.surface2}; border: 1px solid ${C.line}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; color: ${C.text}; flex: none; }
  .kd-item-t { font-size: 14px; font-weight: 600; }
  .kd-item-d { font-size: 12px; color: ${C.muted}; }
  .kd-math { position: fixed; z-index: 1000; width: min(440px, calc(100vw - 32px)); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .kd-math textarea { width: 100%; box-sizing: border-box; min-height: 70px; resize: vertical; background: ${C.surface2}; color: ${C.text}; border: 1px solid ${C.line}; border-radius: 10px; padding: 10px; font: 14px/1.5 ui-monospace, monospace; outline: none; }
  .kd-math textarea:focus { border-color: ${C.brand}; }
  .kd-math-prev { min-height: 44px; padding: 10px; border-radius: 10px; background: ${C.bg}; border: 1px dashed ${C.line}; text-align: center; overflow-x: auto; }
  .kd-chip { appearance: none; border: 1px solid ${C.line}; background: ${C.surface2}; color: ${C.text}; border-radius: 999px; padding: 4px 9px; font: 12.5px ui-monospace, monospace; cursor: pointer; }
  .kd-primary { background: ${C.brand}; color: ${C.onBrand}; }
  .kd-primary:hover { background: ${C.brand}; filter: brightness(1.08); }
  `;
  let el = document.getElementById('kd-prose-css');
  if (!el) { el = document.createElement('style'); el.id = 'kd-prose-css'; document.head.appendChild(el); }
  el.textContent = css;
}

// ---------- Imágenes dentro del texto ----------
const urlCache = new Map<string, { url: string; at: number }>();
async function resolveImg(src: string): Promise<string | null> {
  if (!src.startsWith(KD_IMG)) return /^(https?:|blob:|data:image\/)/i.test(src) ? src : null;
  const path = src.slice(KD_IMG.length);
  const hit = urlCache.get(path);
  if (hit && Date.now() - hit.at < 50 * 60 * 1000) return hit.url;
  const url = await signedUrl(path).catch(() => null);
  if (url) urlCache.set(path, { url, at: Date.now() });
  return url;
}
const KdImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img');
      let current = '';
      const set = (n: typeof node) => {
        const src = String(n.attrs.src ?? '');
        img.alt = n.attrs.alt ?? '';
        if (src === current) return;
        current = src;
        resolveImg(src).then((u) => { if (current === src && u) img.src = u; });
      };
      set(node);
      return {
        dom: img,
        update: (n) => { if (n.type.name !== node.type.name) return false; set(n); return true; },
      };
    };
  },
}).configure({ inline: false, allowBase64: false });

// ---------- Fórmulas: "$...$" solo si parece fórmula (no "$20.000 y $30.000") ----------
const SafeInlineMath = InlineMath.extend({
  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src: string) => src.indexOf('$'),
    tokenize: (src: string) => {
      const m = src.match(/^\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\d$])/);
      if (!m) return undefined;
      return { type: 'inlineMath', raw: m[0], latex: m[1].trim() };
    },
  },
} as any);

// ---------- Menú "/" ----------
type SlashItem = { key: string; icon: string; title: string; hint: string; words: string; run: (e: Editor, r: Range) => void };
type SlashState = { items: SlashItem[]; index: number; rect: DOMRect | null; command: (it: SlashItem) => void } | null;

function makeSlashItems(api: { pickImage: () => void; openMath: (mode: 'block' | 'inline') => void }): SlashItem[] {
  const del = (e: Editor, r: Range) => e.chain().focus().deleteRange(r);
  return [
    { key: 'h1', icon: 'H1', title: 'Título', hint: 'Título grande de sección', words: 'titulo h1 encabezado', run: (e, r) => del(e, r).setNode('heading', { level: 1 }).run() },
    { key: 'h2', icon: 'H2', title: 'Subtítulo', hint: 'Parte de una sección', words: 'subtitulo h2', run: (e, r) => del(e, r).setNode('heading', { level: 2 }).run() },
    { key: 'h3', icon: 'H3', title: 'Apartado', hint: 'Título pequeño', words: 'apartado h3 seccion', run: (e, r) => del(e, r).setNode('heading', { level: 3 }).run() },
    { key: 'ul', icon: '•', title: 'Lista', hint: 'Lista con viñetas', words: 'lista viñetas bullets', run: (e, r) => del(e, r).toggleBulletList().run() },
    { key: 'ol', icon: '1.', title: 'Lista numerada', hint: 'Pasos en orden', words: 'numerada pasos ordenada', run: (e, r) => del(e, r).toggleOrderedList().run() },
    { key: 'task', icon: '☐', title: 'Lista de tareas', hint: 'Casillas para marcar', words: 'tareas checklist casillas pendientes', run: (e, r) => del(e, r).toggleTaskList().run() },
    { key: 'quote', icon: '!', title: 'Aviso o cita', hint: 'Caja destacada para lo importante', words: 'aviso cita importante nota destacado', run: (e, r) => del(e, r).toggleBlockquote().run() },
    { key: 'math', icon: 'fx', title: 'Fórmula', hint: 'Ecuación centrada (LaTeX)', words: 'formula ecuacion latex matematica', run: (e, r) => { del(e, r).run(); api.openMath('block'); } },
    { key: 'imath', icon: 'x²', title: 'Fórmula en la línea', hint: 'Dentro del párrafo', words: 'formula linea inline latex', run: (e, r) => { del(e, r).run(); api.openMath('inline'); } },
    { key: 'table', icon: '▦', title: 'Tabla', hint: 'Filas y columnas', words: 'tabla filas columnas', run: (e, r) => del(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { key: 'img', icon: '▣', title: 'Imagen o diagrama', hint: 'Desde tu equipo; también puedes pegarla', words: 'imagen foto diagrama dibujo', run: (e, r) => { del(e, r).run(); api.pickImage(); } },
    { key: 'code', icon: '</>', title: 'Código', hint: 'Bloque de código', words: 'codigo programacion code', run: (e, r) => del(e, r).toggleCodeBlock().run() },
    { key: 'hr', icon: '―', title: 'Línea divisoria', hint: 'Separa partes de la nota', words: 'linea divisoria separador', run: (e, r) => del(e, r).setHorizontalRule().run() },
  ];
}
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const SlashCommand = Extension.create<{ getItems: () => SlashItem[]; onState: (s: SlashState) => void; onKey: (e: KeyboardEvent) => boolean }>({
  name: 'kdSlash',
  addOptions() { return { getItems: () => [], onState: () => {}, onKey: () => false }; },
  addProseMirrorPlugins() {
    const opts = this.options;
    return [Suggestion<SlashItem>({
      editor: this.editor,
      char: '/',
      allowSpaces: false,
      startOfLine: false,
      allow: ({ editor }) => editor.isEditable && !editor.isActive('codeBlock'),
      items: ({ query }) => {
        const q = norm(query);
        return opts.getItems().filter((it) => !q || norm(it.title).includes(q) || it.words.includes(q)).slice(0, 13);
      },
      command: ({ editor, range, props }) => props.run(editor, range),
      render: () => ({
        onStart: (p: SuggestionProps<SlashItem>) => opts.onState({ items: p.items, index: 0, rect: p.clientRect?.() ?? null, command: p.command }),
        onUpdate: (p: SuggestionProps<SlashItem>) => opts.onState({ items: p.items, index: 0, rect: p.clientRect?.() ?? null, command: p.command }),
        onKeyDown: (p: SuggestionKeyDownProps) => opts.onKey(p.event),
        onExit: () => opts.onState(null),
      }),
    })];
  },
});

// ---------- Íconos (trazos simples) ----------
const I = {
  list: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>,
  olist: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.5v4M4 8.5h3M4 14.5c0-1 2.8-1 2.8.3 0 1-2.8 2-2.8 3.2h3" /></svg>,
  task: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="7" height="7" rx="1.5" /><path d="M5 7.5l1.3 1.3L8.5 6M13 7h8M3 16h7M13 16h8" /></svg>,
  quote: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></svg>,
  table: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M10 4v16" /></svg>,
  image: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" /></svg>,
  undo: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>,
  redo: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>,
  cards: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="14" height="13" rx="2" /><path d="M7 4h12a2 2 0 0 1 2 2v11" /></svg>,
  spark: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>,
};

function Btn({ label, onClick, active, disabled, children, className }: { label: string; onClick: (e: React.MouseEvent) => void; active?: boolean; disabled?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" className={`kd-btn ${className ?? ''}`} aria-label={label} title={label} aria-pressed={active ? 'true' : undefined} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</button>
  );
}

// ---------- Fórmulas: panel para escribir LaTeX con vista previa ----------
type MathEdit = { mode: 'block' | 'inline'; pos: number | null; latex: string; top: number; left: number } | null;
const MATH_SNIPPETS: { t: string; s: string }[] = [
  { t: 'a/b', s: '\\frac{a}{b}' }, { t: '√x', s: '\\sqrt{x}' }, { t: 'x²', s: 'x^{2}' }, { t: 'xᵢ', s: 'x_{i}' },
  { t: '∫', s: '\\int_{a}^{b} f(x)\\,dx' }, { t: 'Σ', s: '\\sum_{i=1}^{n}' }, { t: 'α β λ', s: '\\alpha \\beta \\lambda' },
  { t: 'Δ', s: '\\Delta' }, { t: '·', s: '\\cdot' }, { t: '→', s: '\\vec{v}' },
];
function MathPanel({ edit, onSave, onCancel, onRemove }: { edit: NonNullable<MathEdit>; onSave: (latex: string) => void; onCancel: () => void; onRemove?: () => void }) {
  const [v, setV] = useState(edit.latex);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const html = useMemo(() => {
    if (!v.trim()) return '';
    try { return katex.renderToString(v, { throwOnError: false, displayMode: edit.mode === 'block' }); } catch { return ''; }
  }, [v, edit.mode]);
  const insert = (s: string) => {
    const el = ref.current; if (!el) { setV(v + s); return; }
    const a = el.selectionStart, b = el.selectionEnd;
    const next = v.slice(0, a) + s + v.slice(b);
    setV(next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + s.length; });
  };
  return (
    <div className="kd-pop kd-math" role="dialog" aria-label="Escribir fórmula" style={{ top: edit.top, left: edit.left }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(v); } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 14, flex: 1 }}>{edit.mode === 'block' ? 'Fórmula' : 'Fórmula en la línea'}</strong>
        <span style={{ fontSize: 12, color: C.muted }}>LaTeX · Ctrl + Enter para guardar</span>
      </div>
      <textarea ref={ref} value={v} onChange={(e) => setV(e.target.value)} placeholder="F = P \cdot A" aria-label="Fórmula en LaTeX" spellCheck={false} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {MATH_SNIPPETS.map((m) => <button key={m.t} type="button" className="kd-chip" onClick={() => insert(m.s)} title={m.s}>{m.t}</button>)}
      </div>
      <div className="kd-math-prev" aria-live="polite" dangerouslySetInnerHTML={{ __html: html || `<span style="color:${C.muted};font-size:13px">Vista previa</span>` }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onRemove && <button type="button" className="kd-btn" style={{ color: C.badText, marginRight: 'auto' }} onClick={onRemove}>Quitar</button>}
        <button type="button" className="kd-btn" onClick={onCancel}>Cancelar</button>
        <button type="button" className="kd-btn kd-primary" onClick={() => onSave(v)} disabled={!v.trim()}>Guardar</button>
      </div>
    </div>
  );
}

// ---------- El editor ----------
function headingsOf(ed: Editor): (HeadingItem & { pos: number })[] {
  const out: (HeadingItem & { pos: number })[] = [];
  ed.state.doc.descendants((n, pos) => {
    if (n.type.name === 'heading') out.push({ level: n.attrs.level, text: n.textContent.trim(), index: out.length, pos });
    return n.type.name !== 'heading';
  });
  return out.filter((h) => h.text);
}

const RichEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function RichEditor(props, ref) {
  const { value, editing, onRequestEdit, minHeight = 320 } = props;
  const cb = useRef(props); cb.current = props;
  const [slash, setSlash] = useState<SlashState>(null);
  const slashRef = useRef<SlashState>(null); slashRef.current = slash;
  const [math, setMath] = useState<MathEdit>(null);
  const [blockMenu, setBlockMenu] = useState<{ top: number; left: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const pendingMd = useRef<string | null>(null);
  const timer = useRef<any>(null);
  const heads = useRef<(HeadingItem & { pos: number })[]>([]);
  const edRef = useRef<Editor | null>(null);

  useMemo(() => { injectCss(); loadKatexCss(); loadWebFont(noteFontFamily()); }, []);

  const openMath = useCallback((mode: 'block' | 'inline', pos: number | null = null, latex = '') => {
    const ed = edRef.current; if (!ed) return;
    const box = boxRef.current?.getBoundingClientRect();
    let top = 120, left = 16;
    try {
      const at = pos ?? ed.state.selection.from;
      const c = ed.view.coordsAtPos(Math.min(at, ed.state.doc.content.size));
      top = Math.min(window.innerHeight - 340, c.bottom + 10);
      left = Math.max(16, Math.min(window.innerWidth - 456, (box?.left ?? c.left)));
    } catch { /* noop */ }
    setMath({ mode, pos, latex, top: Math.max(16, top), left });
  }, []);
  const pickImage = useCallback(() => fileRef.current?.click(), []);
  const items = useMemo(() => makeSlashItems({ pickImage, openMath: (m) => openMath(m) }), [pickImage, openMath]);
  const itemsRef = useRef(items); itemsRef.current = items;

  const emit = useCallback((ed: Editor) => {
    clearTimeout(timer.current);
    pendingMd.current = null;
    const md = ed.getMarkdown();
    cb.current.onChange(md);
  }, []);
  const emitOutline = useCallback((ed: Editor) => {
    heads.current = headingsOf(ed);
    cb.current.onOutline?.(heads.current.map(({ level, text, index }) => ({ level, text, index })));
  }, []);

  async function upload(files: File[], at?: number) {
    const up = cb.current.uploadImage;
    const ed = edRef.current;
    if (!up || !ed) return;
    for (const f of files.filter((x) => x.type.startsWith('image/')).slice(0, 6)) {
      try {
        const path = await up(f);
        const chain = ed.chain().focus();
        if (at != null) chain.setTextSelection(Math.min(at, ed.state.doc.content.size));
        chain.setImage({ src: KD_IMG + path, alt: f.name.replace(/\.[a-z0-9]+$/i, '') }).run();
      } catch { /* el aviso lo da uploadImage */ }
    }
  }

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editable: editing,
    content: value || '',
    contentType: 'markdown',
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
      }),
      Markdown.configure({ markedOptions: { gfm: true, breaks: false } }),
      Placeholder.configure({ placeholder: 'Escribe aquí. Usa / para insertar fórmulas, tablas, listas o imágenes.' }),
      TaskList,
      TaskItem.configure({ nested: true, onReadOnlyChecked: () => true }),
      Highlight,
      TableKit.configure({ table: { resizable: false } }),
      KdImage,
      BlockMath.configure({
        katexOptions: { throwOnError: false, displayMode: true },
        onClick: (node, pos) => { if (edRef.current?.isEditable) openMath('block', pos, node.attrs.latex ?? ''); },
      }),
      SafeInlineMath.configure({
        katexOptions: { throwOnError: false },
        onClick: (node: any, pos: number) => { if (edRef.current?.isEditable) openMath('inline', pos, node.attrs.latex ?? ''); },
      }),
      SlashCommand.configure({
        getItems: () => itemsRef.current,
        onState: (s) => setSlash(s),
        onKey: (e) => {
          const st = slashRef.current;
          if (!st || !st.items.length) return false;
          if (e.key === 'ArrowDown') { setSlash({ ...st, index: (st.index + 1) % st.items.length }); return true; }
          if (e.key === 'ArrowUp') { setSlash({ ...st, index: (st.index + st.items.length - 1) % st.items.length }); return true; }
          if (e.key === 'Enter' || e.key === 'Tab') { st.command(st.items[st.index]); return true; }
          if (e.key === 'Escape') { setSlash(null); return true; }
          return false;
        },
      }),
    ],
    editorProps: {
      attributes: { 'aria-label': 'Contenido de la nota', spellcheck: 'true' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape' && !slashRef.current && cb.current.onRequestRead) { cb.current.onRequestRead(); return true; }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (!files.length || !edRef.current?.isEditable) return false;
        upload(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (!files.length || !edRef.current?.isEditable) return false;
        const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos;
        upload(files, at);
        return true;
      },
    },
    onCreate: ({ editor: ed }) => { edRef.current = ed; emitOutline(ed); },
    onUpdate: ({ editor: ed, transaction }) => {
      if (!transaction.docChanged) return;
      pendingMd.current = 'dirty';
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { emit(ed); emitOutline(ed); }, 350);
    },
  });
  edRef.current = editor;
  // Para las pruebas automáticas (no hace nada si no se activa a propósito).
  if (typeof window !== 'undefined' && (window as any).__KD_DEBUG__) (window as any).__kdEditor = editor;

  // Al salir, no perder lo último que se escribió.
  useEffect(() => () => { clearTimeout(timer.current); const ed = edRef.current; if (ed && pendingMd.current) { pendingMd.current = null; cb.current.onChange(ed.getMarkdown()); } }, []);

  const clickAt = useRef<number | null>(null);
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editing, false);
    if (editing) {
      const c = clickAt.current; clickAt.current = null;
      requestAnimationFrame(() => {
        if (c != null) { editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(c).run(); return; }
        if (!editor.isFocused) editor.commands.focus(undefined, { scrollIntoView: false });
      });
    } else { setSlash(null); setMath(null); setBlockMenu(null); }
  }, [editing, editor]);

  useImperativeHandle(ref, () => ({
    scrollToHeading: (index: number) => {
      const ed = edRef.current; const h = heads.current[index];
      if (!ed || !h) return;
      const dom = ed.view.nodeDOM(h.pos) as HTMLElement | null;
      dom?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    },
    flush: () => {
      const ed = edRef.current;
      if (!ed || !pendingMd.current) return null;
      clearTimeout(timer.current); pendingMd.current = null;
      return ed.getMarkdown();
    },
  }), []);

  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const f = () => force((x) => x + 1);
    editor.on('selectionUpdate', f); editor.on('transaction', f);
    return () => { editor.off('selectionUpdate', f); editor.off('transaction', f); };
  }, [editor]);

  if (!editor) return null;
  const is = (n: string, a?: Record<string, any>) => editor.isActive(n, a);
  const chain = () => editor.chain().focus();
  const blockLabel = is('heading', { level: 1 }) ? 'Título' : is('heading', { level: 2 }) ? 'Subtítulo' : is('heading', { level: 3 }) ? 'Apartado' : 'Texto';
  const inTable = is('table');

  function saveMath(latex: string) {
    const m = math; if (!m) return;
    const l = latex.trim();
    if (!l) { setMath(null); return; }
    const c = chain();
    if (m.pos != null) {
      if (m.mode === 'block') c.updateBlockMath({ latex: l, pos: m.pos }).run();
      else c.updateInlineMath({ latex: l, pos: m.pos }).run();
    } else if (m.mode === 'block') c.insertBlockMath({ latex: l }).run();
    else c.insertInlineMath({ latex: l }).run();
    setMath(null);
  }
  function removeMath() {
    const m = math; if (!m || m.pos == null) return;
    if (m.mode === 'block') chain().deleteBlockMath({ pos: m.pos }).run();
    else chain().deleteInlineMath({ pos: m.pos }).run();
    setMath(null);
  }

  const selText = () => { const { from, to } = editor.state.selection; return editor.state.doc.textBetween(from, to, '\n').trim(); };

  return (
    <div ref={boxRef} className={`kd-ed${editing ? '' : ' kd-reading'}`} style={{ maxWidth: props.maxWidth ?? 720, width: '100%' }}
      onMouseUp={(e) => {
        if (editing || !onRequestEdit) return;
        const t = e.target as HTMLElement;
        if (t.closest('a, input, label, button, [data-type="block-math"], [data-type="inline-math"]')) return;
        if (window.getSelection()?.toString()) return; // estaba seleccionando para estudiar
        // La posición se calcula antes de que aparezca la barra (que corre el texto hacia abajo).
        clickAt.current = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos ?? null;
        onRequestEdit();
      }}>
      {editing && (
        <div className="kd-tb" role="toolbar" aria-label="Formato">
          <div style={{ position: 'relative' }}>
            <Btn label={`Tipo de bloque: ${blockLabel}`} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setBlockMenu((v) => (v ? null : { top: r.bottom + 6, left: r.left })); }}><span>{blockLabel}</span><span aria-hidden="true" style={{ fontSize: 10, opacity: 0.7 }}>▼</span></Btn>
            {blockMenu && createPortal(
              <div className="kd-pop kd-menu" role="menu" style={{ position: 'fixed', top: blockMenu.top, left: blockMenu.left, width: 200, zIndex: 1000 }}>
                {[
                  { t: 'Texto', run: () => chain().setParagraph().run() },
                  { t: 'Título', run: () => chain().setHeading({ level: 1 }).run() },
                  { t: 'Subtítulo', run: () => chain().setHeading({ level: 2 }).run() },
                  { t: 'Apartado', run: () => chain().setHeading({ level: 3 }).run() },
                ].map((o) => (
                  <button key={o.t} type="button" role="menuitem" className="kd-item" onMouseDown={(e) => e.preventDefault()} onClick={() => { o.run(); setBlockMenu(null); }}>
                    <span className="kd-item-t">{o.t}</span>
                  </button>
                ))}
              </div>, document.body,
            )}
          </div>
          <span className="kd-sep" />
          <Btn label="Negrita (Ctrl+B)" active={is('bold')} onClick={() => chain().toggleBold().run()}><b style={{ fontSize: 15 }}>B</b></Btn>
          <Btn label="Cursiva (Ctrl+I)" active={is('italic')} onClick={() => chain().toggleItalic().run()}><i style={{ fontSize: 15, fontFamily: 'Georgia, serif' }}>I</i></Btn>
          <Btn label="Resaltar" active={is('highlight')} onClick={() => chain().toggleHighlight().run()}><span style={{ fontWeight: 800, color: C.warnText, fontSize: 15 }}>A</span></Btn>
          <span className="kd-sep" />
          <Btn label="Lista" active={is('bulletList')} onClick={() => chain().toggleBulletList().run()}>{I.list}</Btn>
          <Btn label="Lista numerada" active={is('orderedList')} onClick={() => chain().toggleOrderedList().run()}>{I.olist}</Btn>
          <Btn label="Lista de tareas" active={is('taskList')} onClick={() => chain().toggleTaskList().run()}>{I.task}</Btn>
          <Btn label="Aviso o cita" active={is('blockquote')} onClick={() => chain().toggleBlockquote().run()}>{I.quote}</Btn>
          <span className="kd-sep" />
          <Btn label="Fórmula" onClick={() => openMath('block')}><i style={{ fontFamily: 'Georgia, serif', fontSize: 16 }}>fx</i></Btn>
          <Btn label="Tabla" active={inTable} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} disabled={inTable}>{I.table}</Btn>
          <Btn label="Imagen o diagrama" onClick={pickImage}>{I.image}</Btn>
          <Btn label="Código" active={is('codeBlock')} onClick={() => chain().toggleCodeBlock().run()}><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{'</>'}</span></Btn>
          <span className="kd-sep" />
          <Btn label="Deshacer (Ctrl+Z)" onClick={() => chain().undo().run()} disabled={!editor.can().undo()}>{I.undo}</Btn>
          <Btn label="Rehacer" onClick={() => chain().redo().run()} disabled={!editor.can().redo()}>{I.redo}</Btn>
        </div>
      )}
      {editing && inTable && (
            <div className="kd-tb-table" role="toolbar" aria-label="Tabla">
              <Btn label="Agregar fila" onClick={() => chain().addRowAfter().run()}>+ Fila</Btn>
              <Btn label="Agregar columna" onClick={() => chain().addColumnAfter().run()}>+ Columna</Btn>
              <Btn label="Quitar fila" onClick={() => chain().deleteRow().run()}>− Fila</Btn>
              <Btn label="Quitar columna" onClick={() => chain().deleteColumn().run()}>− Columna</Btn>
              <Btn label="Borrar tabla" onClick={() => chain().deleteTable().run()}><span style={{ color: C.badText }}>Borrar tabla</span></Btn>
            </div>
      )}

      <BubbleMenu editor={editor} options={{ placement: 'top', offset: 8 }}
        shouldShow={({ editor: ed, state }) => {
          const { empty, from, to } = state.selection;
          if (empty || (state.selection as any).node) return false;
          return state.doc.textBetween(from, to, ' ').trim().length > 0 && !ed.isActive('codeBlock');
        }}>
        <div className="kd-pop kd-bubble" role="toolbar" aria-label="Texto seleccionado">
          {editing && (
            <>
              <Btn label="Negrita" active={is('bold')} onClick={() => chain().toggleBold().run()}><b>B</b></Btn>
              <Btn label="Cursiva" active={is('italic')} onClick={() => chain().toggleItalic().run()}><i style={{ fontFamily: 'Georgia, serif' }}>I</i></Btn>
              <Btn label="Resaltar" active={is('highlight')} onClick={() => chain().toggleHighlight().run()}><span style={{ fontWeight: 800, color: C.warnText }}>A</span></Btn>
              <span className="kd-sep" />
            </>
          )}
          <Btn label="Crear flashcards con esto" onClick={() => { const t = selText(); if (t) cb.current.onSelectionAction?.('flashcard', t); }}>{I.cards}<span>Flashcards</span></Btn>
          <Btn label="Pedir al Oráculo que lo explique" onClick={() => { const t = selText(); if (t) cb.current.onSelectionAction?.('explain', t); }}>{I.spark}<span>Explicar</span></Btn>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} style={{ minHeight }} />

      {slash && slash.items.length > 0 && slash.rect && createPortal(
        <div className="kd-pop kd-menu" role="listbox" aria-label="Insertar"
          style={{ position: 'fixed', zIndex: 1000, top: Math.min(slash.rect.bottom + 6, window.innerHeight - 350), left: Math.max(8, Math.min(slash.rect.left, window.innerWidth - 300)) }}>
          <div className="kd-menu-h">INSERTAR</div>
          {slash.items.map((it, i) => (
            <button key={it.key} type="button" role="option" aria-selected={i === slash.index ? 'true' : 'false'} className="kd-item"
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setSlash({ ...slash, index: i })} onClick={() => slash.command(it)}>
              <span className="kd-item-ic">{it.icon}</span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="kd-item-t">{it.title}</span>
                <span className="kd-item-d">{it.hint}</span>
              </span>
            </button>
          ))}
        </div>, document.body,
      )}

      {math && createPortal(<MathPanel edit={math} onSave={saveMath} onCancel={() => { setMath(null); editor.commands.focus(); }} onRemove={math.pos != null ? removeMath : undefined} />, document.body)}

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; upload(fs); }} />
    </div>
  );
});

export default RichEditor;
