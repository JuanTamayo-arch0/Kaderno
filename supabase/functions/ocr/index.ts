// ============================================================
//  Edge Function: ocr
//  Recibe una imagen (base64) y devuelve el texto transcrito
//  usando un modelo de visión (Anthropic Claude).
//
//  Desplegar:   supabase functions deploy ocr
//  Secreto:     supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//  La API key NUNCA vive en la app: solo aquí, en el servidor.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { imageBase64, mediaType = 'image/jpeg' } = await req.json();
    if (!imageBase64) {
      return json({ error: 'Falta imageBase64' }, 400);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500);

    const prompt =
      'Transcribe fielmente el texto manuscrito de esta imagen de apuntes escolares. ' +
      'Devuelve SOLO el texto, conservando saltos de línea y viñetas. ' +
      'No inventes contenido ilegible; marca lo dudoso con [?]. No agregues comentarios.';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Modelo de visión actual (2026). Alternativas: 'claude-haiku-4-5' (más barato),
        // 'claude-opus-4-8' (más preciso). Puedes fijarlo por variable de entorno OCR_MODEL.
        model: Deno.env.get('OCR_MODEL') ?? 'claude-sonnet-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return json({ error: 'Fallo del modelo de visión', detail: err }, 502);
    }

    const data = await res.json();
    const text = (data.content ?? []).map((b: any) => b.text ?? '').join('').trim();
    return json({ text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}
