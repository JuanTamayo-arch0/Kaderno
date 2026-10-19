// ============================================================
//  Edge Function: ai
//  Genera un RESUMEN, FLASHCARDS o MICROTAREAS (task: 'steps') a partir de un texto,
//  usando un modelo de Claude.
//
//  Desplegar:   npx supabase functions deploy ai
//  (usa la misma ANTHROPIC_API_KEY que ya configuraste para "ocr")
//
//  v20: las tarjetas vienen de dos tipos (pregunta y completar), no repiten
//  las que ya existen y se validan. Con schema_v19 hay tope diario por
//  persona (función ai_take); sin la migración, funciona sin tope.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { flashcardPrompt, parseCards } from '../_shared/cards.ts';

// Usos por día y persona.
const LIMITS: Record<string, number> = { flashcards: 30 };
const LIMIT_TEXT: Record<string, string> = { flashcards: 'creaciones de tarjetas' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const { task, content } = body;
    if (!content) return json({ error: 'Falta content' }, 400);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500);

    // Tope diario (si la base tiene schema_v19).
    if (LIMITS[task]) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: left, error } = await supabase.rpc('ai_take', { p_task: task, p_limit: LIMITS[task] });
      if (!error && typeof left === 'number' && left < 0) {
        return json({ error: `Llegaste al límite de hoy (${LIMITS[task]} ${LIMIT_TEXT[task]}). Mañana se renueva.`, code: 'limit' }, 429);
      }
    }

    const prompt = task === 'steps'
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
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return json({ error: 'Fallo del modelo', detail: await res.text() }, 502);

    const data = await res.json();
    const text = (data.content ?? []).map((b: any) => b.text ?? '').join('').trim();

    if (task === 'flashcards') {
      const cards = parseCards(text, Math.max(1, Math.min(12, Number(body.count ?? 12))));
      if (!cards.length) return json({ error: 'La IA no devolvió tarjetas, intenta de nuevo.', cards: [] }, 502);
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
