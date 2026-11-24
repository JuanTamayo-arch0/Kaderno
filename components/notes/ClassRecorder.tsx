import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../../lib/theme';
import { Button } from '../ds';
import { confirm, notify, toast, friendlyError } from '../../lib/feedback';
import {
  addSegment, startMarks, updateMarks, marksList, fmtClock, timeline, transcriptText, searchSegments, summaryMarkdown, taskQuickText, findMark, segmentAt,
  MAX_SECONDS, type MarkMap, type Segment, type Mark,
} from '../../lib/classRec';
import { browserSpeechSupported, createBrowserTranscriber, keepAwake, LANGS, type Transcriber, type TranscriberState } from '../../lib/transcribe';
import { createTranscript, saveTranscript, getTranscripts, deleteTranscript, summarizeClass, meetingMinutes, type Transcript } from '../../lib/transcriptsDb';
import { isMeeting, minutesMarkdown, meetingTaskQuick, minutesPlain, mailtoUrl, type MeetingMinutes } from '../../lib/meeting';
import { getMinutesStyle, previousOpenFor } from '../../lib/meetingDb';
import { MinutesStyleSheet } from './MinutesStyleSheet';
import { openWhatsApp } from '../../lib/clientLinks';
import { copyText } from '../../lib/fileIO';
import { MeetingPublish } from './MeetingPublish';
import { openAdd } from '../../lib/uiBus';
import { getMode, useMode } from '../../lib/mode';
import { t, trn, lang as appLang, dateLocale } from '../../lib/i18n';

// ============================================================
//  Grabar la clase (v22, fase 1): el texto de la clase se escribe solo
//  mientras tomas apuntes, con el minuto de cada párrafo. El audio no se
//  guarda. Al final: resumen con IA, tarjetas y tareas.
// ============================================================

const CONSENT_KEY = 'kd-rec-consent';
const LANG_KEY = 'kd-rec-lang';

export type Recorder = ReturnType<typeof useClassRecorder>;

export function useClassRecorder(noteId: string, getMd: () => string) {
  const supported = Platform.OS === 'web' && browserSpeechSupported();
  const [state, setState] = useState<TranscriberState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [interim, setInterim] = useState('');
  const [last, setLast] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [lang, setLangState] = useState<string>(appLang() === 'en' ? 'en-US' : 'es-CO');
  const r = useRef({ id: null as string | null, tr: null as Transcriber | null, segs: [] as Segment[], marks: {} as MarkMap, md: '', acc: 0, since: 0, dirty: false, release: () => {} });

  useEffect(() => { AsyncStorage.getItem(LANG_KEY).then((v) => { if (v) setLangState(v); }).catch(() => {}); }, []);
  const setLang = (v: string) => { setLangState(v); AsyncStorage.setItem(LANG_KEY, v).catch(() => {}); };

  const now = () => r.current.acc + (r.current.since ? (Date.now() - r.current.since) / 1000 : 0);
  const active = state === 'listening' || state === 'paused';

  const flush = useCallback(async () => {
    const c = r.current;
    if (!c.id || !c.dirty) return;
    c.dirty = false;
    try { await saveTranscript(c.id, { segments: c.segs, marks: marksList(c.marks), duration_s: now() }); }
    catch { c.dirty = true; }
  }, []);

  // Reloj, guardado cada 20 s y tope de 4 horas.
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => {
      const t = now();
      setElapsed(t);
      if (t >= MAX_SECONDS) { stop(); toast(trn('Llegaste a 4 horas: la grabación se detuvo.')); }
    }, 1000);
    const save = setInterval(flush, 20_000);
    return () => { clearInterval(tick); clearInterval(save); };
  }, [active]);

  // Si se cierra la pestaña, guardar lo que haya.
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const h = () => { flush(); };
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, [active]);

  // Cambiar de nota: terminar la grabación.
  useEffect(() => () => { if (r.current.tr) { r.current.tr.stop(); r.current.release(); flush(); } }, [noteId]);

  async function start() {
    if (!supported) {
      notify(t('Este navegador no puede transcribir'), t('Abre Kaderno en Chrome, Edge o Safari para grabar la {v}. En Firefox no está disponible.', { v: getMode() === 'trabajo' ? t('reunión') : t('clase') }));
      return false;
    }
    const ok = await AsyncStorage.getItem(CONSENT_KEY).catch(() => null);
    if (!ok) {
      const yes = await confirm(t('Antes de grabar'), getMode() === 'trabajo'
        ? t('Avisa a quienes están en la reunión. El audio no se guarda: Kaderno solo escribe lo que se dice, y el texto queda solo en tu cuenta.')
        : t('Pide permiso al profesor (o avisa en la reunión). El audio no se guarda: Kaderno solo escribe lo que se dice, y el texto queda solo en tu cuenta.'), trn('Entendido, grabar'));
      if (!yes) return false;
      AsyncStorage.setItem(CONSENT_KEY, '1').catch(() => {});
    }
    try {
      const id = await createTranscript(noteId, lang);
      const md = getMd();
      r.current = { ...r.current, id, segs: [], marks: startMarks(md), md, acc: 0, since: Date.now(), dirty: false };
      setElapsed(0); setLast(''); setInterim(''); setProblem(null);
      const tr = createBrowserTranscriber(lang, {
        onFinal: (text) => {
          const c = r.current;
          const next = addSegment(c.segs, now(), text);
          if (next !== c.segs) { c.segs = next; c.dirty = true; setLast(next[next.length - 1].text); }
          setProblem(null);
        },
        onInterim: setInterim,
        onState: (s) => setState(s),
        onError: (m, fatal) => { setProblem(m); if (fatal) { notify(t('La grabación se detuvo'), m); setTimeout(() => { stop(); }, 0); } },
      });
      r.current.tr = tr;
      r.current.release = await keepAwake();
      tr.start();
      return true;
    } catch (e) { notify(t('No se pudo empezar a grabar'), friendlyError(e)); return false; }
  }
  function pause() {
    const c = r.current; if (!c.tr) return;
    c.acc = now(); c.since = 0; c.tr.pause(); flush();
  }
  function resume() {
    const c = r.current; if (!c.tr) return;
    c.since = Date.now(); c.tr.resume();
  }
  async function stop() {
    const c = r.current; if (!c.tr) return;
    c.acc = now(); c.since = 0;
    c.tr.stop(); c.tr = null; c.release(); c.release = () => {};
    c.dirty = true;
    await flush();
    setState('stopped'); setInterim('');
    toast(c.segs.length ? t('{v}: {length} {v2} y {length2} apuntes con minuto', { v: getMode() === 'trabajo' ? t('Reunión guardada') : t('Grabación guardada'), length: c.segs.length, v2: c.segs.length === 1 ? t('frase') : t('frases'), length2: marksList(c.marks).length }) : t('No se alcanzó a escuchar nada.'));
    setVersion((v) => v + 1);
  }
  /** La nota cambió mientras se graba: marcar las líneas nuevas con el minuto. */
  function onNoteChange(md: string) {
    const c = r.current;
    if (!c.tr || !c.id) return;
    c.marks = updateMarks(c.marks, c.md, md, now());
    c.md = md; c.dirty = true;
  }

  return { supported, state, active, elapsed, interim, last, problem, version, lang, setLang, start, pause, resume, stop, onNoteChange };
}

/** Barra fija mientras se graba. */
export function RecorderBar({ rec }: { rec: Recorder }) {
  if (!rec.active) return null;
  const listening = rec.state === 'listening';
  const line = rec.interim || rec.last;
  return (
    <View accessibilityLiveRegion="polite" style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: listening ? C.bad : C.line, zIndex: 5 },
      Platform.OS === 'web' ? ({ position: 'sticky', top: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.18)' } as any) : null]}>
      <View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: listening ? C.bad : C.muted }, listening && Platform.OS === 'web' ? ({ animation: 'kdRecPulse 1.4s ease-in-out infinite' } as any) : null]} />
      <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{fmtClock(rec.elapsed)}</Text>
      <Text style={{ color: rec.problem ? C.warnText : C.muted, fontSize: 12.5, flex: 1, minWidth: 0 }} numberOfLines={1}>
        {rec.problem ?? (listening ? (line || t('Escuchando… escribe tus apuntes normal')) : t('En pausa'))}
      </Text>
      {listening
        ? <Button label={t('Pausar')} size="sm" kind="ghost" icon="pause" onPress={rec.pause} />
        : <Button label={t('Seguir')} size="sm" kind="ghost" icon="play" onPress={rec.resume} />}
      <Button label={t('Terminar')} size="sm" kind="danger" icon="stop" onPress={rec.stop} />
      {Platform.OS === 'web' && <style dangerouslySetInnerHTML={{ __html: '@keyframes kdRecPulse{0%,100%{opacity:1}50%{opacity:.25}}' }} />}
    </View>
  );
}

/** Botón para empezar, con el idioma de la clase. */
export function RecordButton({ rec, onStarted }: { rec: Recorder; onStarted: () => void }) {
  const [open, setOpen] = useState(false);
  const { space: mode } = useMode();
  const what = mode === 'trabajo' ? t('reunión') : t('clase');
  if (rec.active || Platform.OS !== 'web') return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Button label={mode === 'trabajo' ? t('Grabar reunión') : t('Grabar clase')} icon="mic-outline" size="sm" kind="secondary" onPress={async () => { if (await rec.start()) onStarted(); }} />
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={t('Idioma de la {what}: {v}', { what, v: LANGS.find((l) => l.code === rec.lang)?.label ?? rec.lang })} hitSlop={6}
        style={{ paddingHorizontal: 6, paddingVertical: 6 }}>
        <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '700' }}>{rec.lang.slice(0, 2).toUpperCase()} ▾</Text>
      </Pressable>
      {open && (
        <View style={{ position: 'absolute', top: 36, right: 0, zIndex: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 4, minWidth: 140 }} accessibilityRole="menu">
          {LANGS.map((l) => (
            <Pressable key={l.code} onPress={() => { rec.setLang(l.code); setOpen(false); }} accessibilityRole="menuitem"
              style={({ hovered }: any) => ({ padding: 8, borderRadius: 8, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: rec.lang === l.code ? '800' : '500' }}>{t('{v} en {toLowerCase}', { v: mode === 'trabajo' ? t('Reunión') : t('Clase'), toLowerCase: l.label.toLowerCase() })}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** Transcripciones de la nota: lo dicho con tus apuntes intercalados, buscador, resumen, tarjetas y tareas. */
export type NoteMark = Mark & { tid: string };
export type SaidFocus = { t: number; tid: string; key: number };

export function TranscriptPanel({ noteId, version, focus, subjectName, getMd, onInsert, onCards, onHasMarks }: {
  noteId: string; version: number; focus: SaidFocus | null; subjectName: string | null;
  getMd: () => string; onInsert: (md: string) => void; onCards: (text: string) => void; onHasMarks?: (marks: NoteMark[]) => void;
}) {
  const [list, setList] = useState<Transcript[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => getTranscripts(noteId).then((l) => {
    setList(l);
    onHasMarks?.(l.flatMap((t) => (t.marks ?? []).map((m) => ({ ...m, tid: t.id }))));
  }), [noteId]);
  useEffect(() => { setList(null); load(); }, [load, version]);
  useEffect(() => { if (focus) setOpen(focus.tid); }, [focus?.key]);

  if (!list?.length) return null;
  return (
    <View style={{ marginTop: 28, gap: 10 }} accessibilityLabel={t('Transcripciones')}>
      {list.map((t) => (
        <TranscriptCard key={t.id} t={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} focusT={focus?.tid === t.id ? focus : null}
          subjectName={subjectName} getMd={getMd} onInsert={onInsert} onCards={onCards}
          onChanged={(patch) => setList((l) => l?.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) ?? null)}
          onDeleted={() => { setList((l) => l?.filter((x) => x.id !== t.id) ?? null); }} />
      ))}
    </View>
  );
}

function TranscriptCard({ t, open, onToggle, focusT, subjectName, getMd, onInsert, onCards, onChanged, onDeleted }: {
  t: Transcript; open: boolean; onToggle: () => void; focusT: SaidFocus | null; subjectName: string | null;
  getMd: () => string; onInsert: (md: string) => void; onCards: (text: string) => void;
  onChanged: (patch: Partial<Transcript>) => void; onDeleted: () => void;
}) {
  const [q, setQ] = useState('');
  const { v: mv, work, study } = useMode();
  const [publish, setPublish] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const cls = t.summary && !isMeeting(t.summary) ? t.summary : null;
  const mtg = isMeeting(t.summary) ? t.summary : null;
  const [mine, setMine] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hl, setHl] = useState<number | null>(null);
  const scroller = useRef<ScrollView>(null);
  const rows = useRef<Record<number, number>>({});
  const segs = t.segments ?? [];
  const hits = useMemo(() => new Set(searchSegments(segs, q)), [segs, q]);
  const items = useMemo(() => timeline(segs, mine ? t.marks ?? [] : []), [segs, t.marks, mine]);
  const d = new Date(t.started_at);
  const dateLabel = d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });

  // "¿Qué se decía?": ir al minuto de ese párrafo.
  useEffect(() => {
    if (!focusT || !segs.length) return;
    const i = segmentAt(segs, Math.max(0, focusT.t - 20));
    setHl(i);
    setTimeout(() => { const y = rows.current[i]; if (y != null) scroller.current?.scrollTo({ y: Math.max(0, y - 40), animated: true }); }, 250);
  }, [focusT?.key]);

  async function summarize() {
    setBusy(true);
    try {
      const s = await summarizeClass(transcriptText(segs), getMd(), subjectName);
      await saveTranscript(t.id, { summary: s });
      onChanged({ summary: s });
    } catch (e) { notify(trn('No se pudo resumir'), friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function minutes() {
    setBusy(true);
    try {
      const [style, prevOpen] = await Promise.all([getMinutesStyle().catch(() => null), previousOpenFor(t.note_id).catch(() => [] as string[])]);
      const m = await meetingMinutes(transcriptText(segs), getMd(), [], { style, prevOpen });
      await saveTranscript(t.id, { summary: m });
      onChanged({ summary: m });
    } catch (e) { notify(trn('No se pudo armar el acta'), friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!(await confirm(trn('¿Borrar esta transcripción?'), trn('Se borra el texto de la grabación. Tus apuntes no cambian.'), trn('Borrar')))) return;
    try { await deleteTranscript(t.id); onDeleted(); toast(trn('Transcripción borrada')); } catch (e) { notify(trn('No se pudo borrar'), friendlyError(e)); }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.surface, overflow: 'hidden' }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
        <Ionicons name="mic-outline" size={18} color={C.brand} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800' }}>{mv.transcriptOf} · {dateLabel}</Text>
          <Text style={{ color: C.muted, fontSize: 12 }}>{trn('{duration_s} · {length} frases{v}{v2}', { duration_s: fmtClock(t.duration_s), length: segs.length, v: t.marks?.length ? trn(' · {length} apuntes con minuto', { length: t.marks.length }) : '', v2: mtg ? trn(' · con acta') : cls ? trn(' · con resumen') : '' })}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </Pressable>
      {open && (
        <View style={{ padding: 14, paddingTop: 0, gap: 12 }}>
          {cls ? (
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.surface2, gap: 8 }}>
              <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '800' }}>{trn('Resumen')}</Text>
              {cls.ideas.map((x, i) => <Text key={i} style={{ color: C.text, fontSize: 13.5, lineHeight: 20 }}>• {x}</Text>)}
              {cls.formulas.length > 0 && <Text style={{ color: C.muted, fontSize: 12.5 }}>{trn('{length} {v} (se ven al insertarlo en la nota)', { length: cls.formulas.length, v: cls.formulas.length === 1 ? trn('fórmula') : trn('fórmulas') })}</Text>}
              {cls.tasks.length > 0 && (
                <View style={{ gap: 6, marginTop: 2 }}>
                  <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{trn('Lo que dejó el profesor')}</Text>
                  {cls.tasks.map((k, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{k.title}{k.when ? ` · ${k.when}` : ''}</Text>
                      <Button label={trn('Crear tarea')} size="sm" kind="ghost" onPress={() => openAdd(taskQuickText(k))} />
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <Button label={trn('Insertar en la nota')} size="sm" icon="arrow-down-outline" onPress={() => { onInsert(summaryMarkdown(cls, dateLabel)); toast(trn('Resumen agregado al final de la nota')); }} />
                <Button label={trn('Rehacer')} size="sm" kind="ghost" busy={busy} onPress={summarize} />
              </View>
            </View>
          ) : mtg ? (
            <MinutesBlock m={mtg} dateLabel={dateLabel} busy={busy} onRedo={minutes} onInsert={(md) => { onInsert(md); toast(trn('Acta agregada al final de la nota')); }} onPublish={() => setPublish(true)} onStyle={() => setStyleOpen(true)} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {study && <Button label={trn('Resumir con IA')} icon="sparkles-outline" size="sm" busy={busy} disabled={segs.length < 3} onPress={summarize} />}
              {work && <Button label={trn('Hacer acta con IA')} icon="document-text-outline" size="sm" kind={study ? 'secondary' : 'primary'} busy={busy} disabled={segs.length < 3} onPress={minutes} />}
              {work && <Button label={trn('Formato del acta')} size="sm" kind="ghost" onPress={() => setStyleOpen(true)} />}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <View style={{ flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface2, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10 }}>
              <Ionicons name="search" size={15} color={C.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder={trn('Buscar en la {klass}', { klass: mv.klass })} placeholderTextColor={C.muted} accessibilityLabel={trn('Buscar en la transcripción')}
                style={[{ flex: 1, color: C.text, fontSize: 13.5, paddingVertical: 8 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
              {!!q && <Text style={{ color: C.muted, fontSize: 12 }}>{hits.size}</Text>}
            </View>
            <Pressable onPress={() => setMine(!mine)} accessibilityRole="switch" accessibilityState={{ checked: mine }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 }}>
              <Ionicons name={mine ? 'checkbox' : 'square-outline'} size={18} color={mine ? C.brand : C.muted} />
              <Text style={{ color: C.text, fontSize: 12.5 }}>{trn('Con mis apuntes')}</Text>
            </Pressable>
          </View>
          <ScrollView ref={scroller} style={{ maxHeight: 420 }} nestedScrollEnabled>
            {items.map((it, k) => it.kind === 'said' ? (
              <View key={k} onLayout={(e) => { rows.current[it.i] = e.nativeEvent.layout.y; }}
                style={{ flexDirection: 'row', gap: 10, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8, backgroundColor: hl === it.i ? C.brand + '22' : hits.has(it.i) && q ? C.warn + '26' : 'transparent' }}>
                <Text style={{ width: 52, color: C.muted, fontSize: 11.5, fontVariant: ['tabular-nums'], paddingTop: 2 }}>{fmtClock(it.t)}</Text>
                <Text selectable style={{ flex: 1, color: q && !hits.has(it.i) ? C.muted : C.text, fontSize: 13.5, lineHeight: 20 }}>{it.text}</Text>
              </View>
            ) : (
              <View key={k} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4, paddingHorizontal: 6 }}>
                <Text style={{ width: 52, color: C.brand, fontSize: 11.5, fontVariant: ['tabular-nums'], paddingTop: 2 }}>{fmtClock(it.t)}</Text>
                <View style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: C.brand, paddingLeft: 8 }}>
                  <Text style={{ color: C.brand, fontSize: 11, fontWeight: '800' }}>{trn('ESCRIBISTE')}</Text>
                  <Text style={{ color: C.text, fontSize: 13, fontStyle: 'italic' }}>{it.text}</Text>
                </View>
              </View>
            ))}
            {segs.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>{trn('No se alcanzó a escuchar nada en esta grabación.')}</Text>}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label={trn('Crear tarjetas')} icon="albums-outline" size="sm" kind="secondary" disabled={segs.length < 3}
              onPress={() => onCards((cls ? cls.ideas.join('\n') + '\n\n' : mtg ? mtg.summary.join('\n') + '\n\n' : '') + transcriptText(segs, 30_000, false))} />
            <Button label={trn('Borrar transcripción')} icon="trash-outline" size="sm" kind="ghost" onPress={remove} />
          </View>
          <Text style={{ color: C.muted, fontSize: 11.5 }}>{trn('Hecha con el reconocimiento del navegador: puede tener palabras mal entendidas. El audio no se guardó.')}</Text>
          {mtg && <MeetingPublish visible={publish} minutes={mtg} date={new Date(t.started_at)} onClose={() => setPublish(false)} />}
          {work && <MinutesStyleSheet visible={styleOpen} onClose={() => setStyleOpen(false)} />}
        </View>
      )}
    </View>
  );
}

/** Para "¿Qué se decía?": la grabación y el minuto de la línea seleccionada. */
export function whenSaid(marks: NoteMark[], selected: string): NoteMark | null {
  return (findMark(marks, selected) as NoteMark | null) ?? null;
}

/** El acta de la reunión: resumen, decisiones, tareas con responsable y pendientes. */
function MinutesBlock({ m, dateLabel, busy, onRedo, onInsert, onPublish, onStyle }: {
  m: MeetingMinutes; dateLabel: string; busy: boolean; onRedo: () => void; onInsert: (md: string) => void; onPublish: () => void; onStyle: () => void;
}) {
  const subject = (m.title ? trn('Acta: {title} ({dateLabel})', { title: m.title, dateLabel }) : trn('Acta ({dateLabel})', { dateLabel }));
  const sec = (title: string, items: string[]) => items.length > 0 && (
    <View style={{ gap: 4 }}>
      <Text style={{ color: C.text, fontSize: 13, fontWeight: '800' }}>{title}</Text>
      {items.map((x, i) => <Text key={i} style={{ color: C.text, fontSize: 13.5, lineHeight: 20 }}>• {x}</Text>)}
    </View>
  );
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.surface2, gap: 10 }} accessibilityLabel={t('Acta de la reunión')}>
      <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>{t('Acta{v}', { v: m.title ? `: ${m.title}` : '' })}</Text>
      {m.attendees.length > 0 && <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Asistentes: {join}', { join: m.attendees.join(', ') })}</Text>}
      {sec(t('Resumen'), m.summary)}
      {sec(t('Decisiones'), m.decisions)}
      {m.tasks.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.text, fontSize: 13, fontWeight: '800' }}>{t('Tareas')}</Text>
          {m.tasks.map((k, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 13.5 }}>{k.title}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>{k.owner ?? t('Sin responsable')}{k.when ? ` · ${k.when}` : k.due ? ` · ${new Date(k.due + 'T12:00:00').toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}` : ''}</Text>
              </View>
              <Button label={t('Para mí')} size="sm" kind="ghost" onPress={() => openAdd(meetingTaskQuick(k))} accessibilityLabel={t('Crear "{title}" en mis tareas', { title: k.title })} />
            </View>
          ))}
        </View>
      )}
      {sec(t('Pendientes para la próxima'), m.open)}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
        <Button label={t('Publicar en un proyecto')} size="sm" icon="people-outline" onPress={onPublish} />
        <Button label={t('Insertar en la nota')} size="sm" kind="secondary" icon="arrow-down-outline" onPress={() => onInsert(minutesMarkdown(m, dateLabel))} />
        <Button label={t('Rehacer')} size="sm" kind="ghost" busy={busy} onPress={onRedo} />
        <Button label={t('Formato')} size="sm" kind="ghost" onPress={onStyle} accessibilityLabel={t('Formato del acta')} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Enviar:')}</Text>
        <Button label="WhatsApp" size="sm" kind="secondary" icon="logo-whatsapp" onPress={() => openWhatsApp(minutesPlain(m, dateLabel, true, appLang()))} accessibilityLabel={t('Enviar el acta por WhatsApp')} />
        <Button label={t('Correo')} size="sm" kind="secondary" icon="mail-outline" onPress={() => Linking.openURL(mailtoUrl(subject, minutesPlain(m, dateLabel, false, appLang()))).catch(() => toast(t('No se pudo abrir el correo')))} accessibilityLabel={t('Enviar el acta por correo')} />
        <Button label={t('Copiar')} size="sm" kind="ghost" icon="copy-outline" onPress={async () => toast((await copyText(minutesPlain(m, dateLabel, false, appLang()))) ? t('Acta copiada') : t('No se pudo copiar'))} accessibilityLabel={t('Copiar el acta')} />
      </View>
    </View>
  );
}
