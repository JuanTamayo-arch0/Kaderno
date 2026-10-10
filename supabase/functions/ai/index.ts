// ============================================================
//  Edge Function: ai
//  Genera un RESUMEN o FLASHCARDS a partir del texto de una nota,
//  usando un modelo de Claude.
//
//  Desplegar:   npx supabase functions deploy ai
//  (usa la misma ANTHROPIC_API_KEY que ya configuraste para "ocr")
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { task, content } = await req.json();
    if (!content) return json({ error: 'Falta content' }, 400);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500);

    const prompt = task === 'flashcards'
      ? 'A partir de estos apuntes, crea entre 4 y 8 tarjetas de estudio (flashcards). ' +
        'Devuelve SOLO un arreglo JSON válido, sin texto adicional, con este formato: ' +
        '[{"front":"pregunta","back":"respuesta"}]. Preguntas claras y respuestas concisas. Apuntes:\n\n' + content
      : 'Resume estos apuntes en 3 a 5 frases claras, en español, capturando lo esencial. ' +
        'Devuelve solo el resumen, sin encabezados. Apuntes:\n\n' + content;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: Deno.env.get('OCR_MODEL') ?? 'claude-sonnet-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return json({ error: 'Fallo del modelo', detail: await res.text() }, 502);

    const data = await res.json();
    const text = (data.content ?? []).map((b: any) => b.text ?? '').join('').trim();

    if (task === 'flashcards') {
      // Extrae el arreglo JSON de la respuesta de forma tolerante
      const match = text.match(/\[[\s\S]*\]/);
      let cards: { front: string; back: string }[] = [];
      try { cards = JSON.parse(match ? match[0] : text); } catch { cards = []; }
      return json({ cards });
    }
    return json({ summary: text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
