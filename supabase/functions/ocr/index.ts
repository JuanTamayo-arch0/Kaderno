// ============================================================
//  Edge Function: ocr
//  Recibe una imagen (base64) y devuelve el texto transcrito usando un
//  modelo de visión (Anthropic Claude).
//
//  v22: exige sesión y tiene tope diario (80 páginas por persona, con
//  ai_take de schema_v19). Modos: "notes" (Markdown con títulos, tablas,
//  fórmulas y la caja de los dibujos), "board" (pizarra) y "plain" (texto
//  tal cual, para cronogramas). Sin modo responde como antes ({ text }).
//
//  Desplegar:   npx supabase functions deploy ocr
//  Secreto:     npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//  La API key NUNCA vive en la app: solo aquí, en el servidor.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ocrPrompt, parseOcr, type OcrMode } from '../_shared/ocrMarkdown.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const DAILY_PAGES = 80;
const MAX_B64 = 8_000_000; // unos 6 MB de imagen

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Solo con sesión: si no, cualquiera con la llave pública gastaría tus créditos.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: who } = await supabase.auth.getUser();
    if (!who?.user) return json({ error: 'Inicia sesión para leer fotos.' }, 401);

    const body = await req.json();
    const { imageBase64, mediaType = 'image/jpeg' } = body;
    const mode: OcrMode | null = ['notes', 'board', 'plain'].includes(body.mode) ? body.mode : null;
    if (!imageBase64 || typeof imageBase64 !== 'string') return json({ error: 'Falta imageBase64' }, 400);
    if (imageBase64.length > MAX_B64) return json({ error: 'La imagen es muy grande.' }, 413);
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) return json({ error: 'Formato de imagen no soportado.' }, 400);

    const { data: left, error: takeErr } = await supabase.rpc('ai_take', { p_task: 'ocr', p_limit: DAILY_PAGES });
    if (!takeErr && typeof left === 'number' && left < 0) {
      return json({ error: `Llegaste al límite de hoy (${DAILY_PAGES} páginas). Mañana se renueva.`, code: 'limit' }, 429);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500);

    const prompt = mode ? ocrPrompt(mode)
      : 'Transcribe fielmente el texto manuscrito de esta imagen de apuntes escolares. ' +
        'Devuelve SOLO el texto, conservando saltos de línea y viñetas. ' +
        'No inventes contenido ilegible; marca lo dudoso con [?]. No agregues comentarios.';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        // Modelo de visión. Se puede fijar con la variable OCR_MODEL.
        model: Deno.env.get('OCR_MODEL') ?? 'claude-sonnet-5',
        max_tokens: mode === 'plain' || !mode ? 2000 : 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!res.ok) return json({ error: 'Fallo del modelo de visión', detail: (await res.text()).slice(0, 500) }, 502);

    const data = await res.json();
    const text = (data.content ?? []).map((b: any) => b.text ?? '').join('').trim();
    if (!mode) return json({ text });
    const r = parseOcr(text, mode);
    return json({ text: r.markdown, markdown: r.markdown, figures: r.figures, title: r.title });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
