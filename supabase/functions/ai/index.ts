// ============================================================
//  Edge Function: ai
//  Genera un RESUMEN, FLASHCARDS o MICROTAREAS (task: 'steps') a partir de un texto,
//  usando un modelo de Claude. v20 fase 3: SIMULACRO (quiz), CORRECCIÓN (grade)
//  y "PONME A PRUEBA" (recall). v22: RESUMEN DE UNA CLASE transcrita (class_summary).
//
//  Desplegar:   npx supabase functions deploy ai
//  (usa la misma ANTHROPIC_API_KEY que ya configuraste para "ocr")
//
//  v20: las tarjetas vienen de dos tipos (pregunta y completar), no repiten
//  las que ya existen y se validan. Con schema_v19 hay tope diario por
//  persona (función ai_take); sin la migración, funciona sin tope.
//  v24: el tope depende del plan (Gratis o Pro, ver _shared/plans.ts y
//  schema_v23). Sin schema_v23 se usan los topes de Pro. Nueva tarea:
//  ACTA DE REUNIÓN (meeting), con decisiones y tareas con responsable.
//  v25: ESTADO DEL PROYECTO (project_update), con el cupo de resúmenes. El acta
//  respeta el formato que eligió la persona y revisa los pendientes anteriores.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { flashcardPrompt, parseCards } from '../_shared/cards.ts';
import { quizPrompt, parseQuiz, gradePrompt, parseGrades, recallPrompt, parseRecall } from '../_shared/quiz.ts';
import { classSummaryPrompt, parseClassSummary } from '../_shared/classSummary.ts';
import { limitOf, limitMessage, type LimitKey } from '../_shared/plans.ts';
import { meetingPrompt, parseMeeting } from '../_shared/meeting.ts';
import { projectUpdatePrompt, parseProjectUpdate } from '../_shared/projectUpdate.ts';
import { langOf, answerIn, say } from '../_shared/lang.ts';

const TASKS: LimitKey[] = ['flashcards', 'quiz', 'recall', 'grade', 'class_summary', 'meeting', 'summary', 'steps'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const { task, content } = body;
    // v30: la IA responde en el idioma de la app.
    const lang = langOf(body.lang);
    const notes: { title?: string; content?: string }[] = Array.isArray(body.notes) ? body.notes.slice(0, 30) : [];
    const items: { q: string; expected: string; given: string }[] = Array.isArray(body.items) ? body.items.map((it: any) => ({ q: String(it?.q ?? ''), expected: String(it?.expected ?? ''), given: String(it?.given ?? '') })) : [];
    if (task === 'quiz' ? !notes.some((n) => String(n?.content ?? '').trim()) : task === 'grade' ? !items.length : !content) return json({ error: say(lang, 'Falta el contenido') }, 400);
    // "3 preguntas rápidas" de una nota cuenta como prueba de la nota, no como simulacro.
    const limitKey: LimitKey = task === 'quiz' && body.quick ? 'recall' : TASKS.includes(task) ? task : 'summary';

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: say(lang, 'ANTHROPIC_API_KEY no configurada') }, 500);

    // v22: solo con sesión (antes, el resumen y los pasos no la pedían).
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: who } = await supabase.auth.getUser();
    if (!who?.user) return json({ error: say(lang, 'Inicia sesión para usar la IA.') }, 401);

    // Tope diario según el plan (si la base tiene schema_v19; el plan, con schema_v23).
    const { data: mp, error: planErr } = await supabase.rpc('my_plan');
    const plan = planErr ? 'pro' : String((mp as any)?.plan ?? 'free');
    const { data: left, error } = await supabase.rpc('ai_take', { p_task: limitKey, p_limit: limitOf(plan, limitKey) });
    if (!error && typeof left === 'number' && left < 0) {
      return json({ error: limitMessage(plan, limitKey, lang), code: 'limit', plan }, 429);
    }

    const headings: string[] = Array.isArray(body.headings) ? body.headings.map(String).slice(0, 40) : [];
    const prompt = task === 'project_update'
      ? projectUpdatePrompt(String(content))
      : task === 'meeting'
      ? meetingPrompt(String(content), String(body.notes_md ?? ''), Array.isArray(body.people) ? body.people.map((x: unknown) => String(x).slice(0, 60)).slice(0, 40) : [], /^\d{4}-\d{2}-\d{2}$/.test(String(body.today ?? '')) ? String(body.today) : '',
          { style: body.style && typeof body.style === 'object' ? body.style : null, prevOpen: Array.isArray(body.prev_open) ? body.prev_open.map(String) : [] })
      : task === 'class_summary'
      ? classSummaryPrompt(String(content), String(body.notes_md ?? ''), body.subject ? String(body.subject) : null)
      : task === 'quiz'
      ? quizPrompt(notes, Number(body.count ?? 10), body.subject ? String(body.subject) : null)
      : task === 'grade'
      ? gradePrompt(items)
      : task === 'recall'
      ? recallPrompt(String(body.title ?? say(lang, 'Nota')), String(content), headings, String(body.recalled ?? ''))
      : task === 'steps'
      ? 'Eres un asistente de estudio. Divide esta tarea universitaria en entre 3 y 7 microtareas concretas, ' +
        'en el orden en que conviene hacerlas, cada una de máximo 8 palabras y empezando con un verbo. ' +
        'Devuelve SOLO un arreglo JSON de textos, sin nada más, por ejemplo ["Leer el enunciado","Hacer el esquema"]. Tarea:\n\n' + content
      : task === 'flashcards'
      ? flashcardPrompt(String(content), Number(body.count ?? 6), Array.isArray(body.existing) ? body.existing.map(String) : [], body.mode === 'selection' ? 'selection' : 'note')
      : 'Resume estos apuntes en 3 a 5 frases claras, en español, capturando lo esencial. ' +
        'Devuelve solo el resumen, sin encabezados. Apuntes:\n\n' + content;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: Deno.env.get('AI_MODEL') ?? Deno.env.get('OCR_MODEL') ?? 'claude-sonnet-5',
        max_tokens: task === 'quiz' ? 7000 : task === 'grade' || task === 'meeting' ? 3000 : 2500,
        messages: [{ role: 'user', content: prompt + answerIn(lang) }],
      }),
    });

    if (!res.ok) return json({ error: say(lang, 'Fallo del modelo'), detail: await res.text() }, 502);

    const data = await res.json();
    const text = (data.content ?? []).map((b: any) => b.text ?? '').join('').trim();

    if (task === 'project_update') {
      const up = parseProjectUpdate(text);
      if (!up) return json({ error: say(lang, 'La IA no pudo redactar el estado, intenta de nuevo.') }, 502);
      return json(up);
    }
    if (task === 'meeting') {
      const minutes = parseMeeting(text);
      if (!minutes) return json({ error: say(lang, 'La IA no pudo armar el acta, intenta de nuevo.') }, 502);
      return json({ minutes });
    }
    if (task === 'class_summary') {
      const summary = parseClassSummary(text);
      if (!summary) return json({ error: say(lang, 'La IA no pudo resumir la clase, intenta de nuevo.') }, 502);
      return json({ summary });
    }
    if (task === 'quiz') {
      const questions = parseQuiz(text, Math.max(1, Math.min(20, Number(body.count ?? 10))), Math.max(1, notes.length));
      if (!questions.length) return json({ error: say(lang, 'La IA no devolvió preguntas, intenta de nuevo.'), questions: [] }, 502);
      return json({ questions });
    }
    if (task === 'grade') {
      return json({ grades: parseGrades(text, Math.min(items.length, 25)) });
    }
    if (task === 'recall') {
      const result = parseRecall(text, headings);
      if (!result) return json({ error: say(lang, 'La IA no pudo comparar tu respuesta, intenta de nuevo.') }, 502);
      return json({ result });
    }
    if (task === 'flashcards') {
      const cards = parseCards(text, Math.max(1, Math.min(12, Number(body.count ?? 12))));
      if (!cards.length) return json({ error: say(lang, 'La IA no devolvió tarjetas, intenta de nuevo.'), cards: [] }, 502);
      return json({ cards, v: 2 });
    }
    if (task === 'steps') {
      const match = text.match(/\[[\s\S]*\]/);
      let steps: string[] = [];
      try { steps = (JSON.parse(match ? match[0] : text) as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 8); } catch { steps = []; }
      return json({ steps });
    }
    return json({ summary: text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
