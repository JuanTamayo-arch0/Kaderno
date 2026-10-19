import React, { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { getCards, aiCards, saveDrafts, getStudyPrefs } from '../../lib/cardsDb';
import { toDrafts, cardsWanted, headingBefore, type Draft } from '../../lib/cards';
import { toast, notify, friendlyError } from '../../lib/feedback';
import { refreshNavCounts } from '../../lib/navCounts';
import { ReviewSheet } from './CardForms';
import { saveNoteCards } from '../../lib/notesDb';

// ============================================================
//  Crear tarjetas con IA desde una nota o una selección:
//  la IA propone, se revisan en "Revisa tus tarjetas" y recién ahí
//  se guardan (como nuevas: entran poco a poco).
// ============================================================

type Ctx = { noteId: string | null; subjectId: string | null; title?: string; markdown?: string; from?: 'quiz' | 'recall' | 'note'; lines?: Record<string, string> };

export function useCardMaker() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [redo, setRedo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ctx, setCtx] = useState<Ctx & { mode: 'note' | 'selection'; text: string; heading: string | null; existing: { id: string; front: string }[] } | null>(null);

  /** Pide tarjetas a la IA y abre la hoja de revisión. */
  const start = useCallback(async (text: string, mode: 'note' | 'selection', c: Ctx) => {
    if (!text.trim()) { notify('No hay texto', 'Escribe o digitaliza algo antes de crear tarjetas.'); return; }
    setBusy(true);
    try {
      const all = await getCards().catch(() => []);
      const existing = all.filter((x) => (c.subjectId ? x.subject_id === c.subjectId : !x.subject_id) || (c.noteId && x.note_id === c.noteId)).map((x) => ({ id: x.id, front: x.front }));
      const proposed = await aiCards(text, cardsWanted(text, mode === 'selection'), existing.map((e) => e.front), mode);
      if (!proposed.length) throw new Error('La IA no devolvió tarjetas. Intenta con un texto más largo.');
      const heading = mode === 'selection' && c.markdown ? headingBefore(c.markdown, text) : null;
      setCtx({ ...c, mode, text, heading, existing });
      setDrafts(toDrafts(proposed, existing));
      setOpen(true);
    } catch (e) { notify('No se pudieron crear', friendlyError(e)); }
    finally { setBusy(false); }
  }, []);

  /** Abre la revisión con tarjetas ya armadas (errores del simulacro, lo que faltó en "Ponme a prueba"). */
  const review = useCallback(async (proposed: { kind?: string; front: string; back?: string }[], c: Ctx) => {
    if (!proposed.length) { toast('No hay nada que convertir en tarjetas.'); return; }
    const all = await getCards().catch(() => []);
    const existing = all.filter((x) => (c.subjectId ? x.subject_id === c.subjectId : !x.subject_id) || (c.noteId && x.note_id === c.noteId)).map((x) => ({ id: x.id, front: x.front }));
    setCtx({ ...c, mode: 'note', text: proposed.map((p) => `${p.front}\n${p.back ?? ''}`).join('\n\n'), heading: null, existing });
    setDrafts(toDrafts(proposed, existing));
    setOpen(true);
  }, []);

  const onRedo = useCallback(async (key: string) => {
    if (!ctx) return;
    setRedo(key);
    try {
      const others = drafts.filter((d) => d.key !== key).map((d) => d.front);
      const [one] = await aiCards(ctx.text, 1, [...ctx.existing.map((e) => e.front), ...others, ...drafts.filter((d) => d.key === key).map((d) => d.front)], ctx.mode === 'selection' ? 'selection' : 'note');
      if (!one) throw new Error('La IA no devolvió otra. Intenta de nuevo.');
      const [d] = toDrafts([one], [...ctx.existing, ...drafts.filter((x) => x.key !== key).map((x) => ({ id: x.key, front: x.front }))]);
      setDrafts((ds) => ds.map((x) => (x.key === key ? { ...d, key } : x)));
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
    finally { setRedo(null); }
  }, [ctx, drafts]);

  const onSave = useCallback(async (keep: Draft[]) => {
    if (!ctx) return;
    setSaving(true);
    try {
      const n = ctx.from === 'note' && ctx.noteId
        ? await saveNoteCards(keep.map((d) => ({ kind: d.kind, front: d.front, back: d.back, line: ctx.lines?.[d.front] })), ctx.noteId, ctx.subjectId)
        : await saveDrafts(keep, { noteId: ctx.noteId, subjectId: ctx.subjectId, heading: ctx.heading, from: ctx.from === 'note' ? 'manual' : ctx.from ?? (ctx.mode === 'selection' ? 'selection' : 'ai') });
      const prefs = await getStudyPrefs();
      setOpen(false); setDrafts([]);
      refreshNavCounts(true);
      toast(`${n} ${n === 1 ? 'tarjeta guardada' : 'tarjetas guardadas'}. Entran poco a poco: ${prefs.newPerDay} nuevas por día.`, { tone: 'good', actionLabel: 'Repasar ahora', onAction: () => router.push('/repaso') });
    } catch (e) { notify('No se pudieron guardar', friendlyError(e)); }
    finally { setSaving(false); }
  }, [ctx, router]);

  const sheet = (
    <ReviewSheet visible={open} drafts={drafts} onChange={setDrafts} onClose={() => setOpen(false)}
      onSave={onSave} onRedo={onRedo} busyKey={redo} saving={saving} source={ctx?.title} />
  );
  return { start, review, busy, sheet };
}
