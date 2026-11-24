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
//  v24: el tope de páginas depende del plan (Gratis o Pro, ver
//  _shared/plans.ts). Sin schema_v23 se usa el de Pro.
//
//  Desplegar:   npx supabase functions deploy ocr
//  Secreto:     npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//  La API key NUNCA vive en la app: solo aquí, en el servidor.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { langOf, say } from '../_shared/lang.ts';
import { complete, providerOf } from '../_shared/llm.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ocrPrompt, parseOcr, type OcrMode } from '../_shared/ocrMarkdown.ts';
import { limitOf, limitMessage } from '../_shared/plans.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MAX_B64 = 8_000_000; // unos 6 MB de imagen

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Solo con sesión: si no, cualquiera con la llave pública gastaría tus créditos.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const body = await req.json();
    // v30: los mensajes en el idioma de la app (el texto de la foto no se traduce).
    const lang = langOf(body.lang);
    const { data: who } = await supabase.auth.getUser();
    if (!who?.user) return json({ error: say(lang, 'Inicia sesión para leer fotos.') }, 401);

    const { imageBase64, mediaType = 'image/jpeg' } = body;
    const mode: OcrMode | null = ['notes', 'board', 'plain'].includes(body.mode) ? body.mode : null;
    if (!imageBase64 || typeof imageBase64 !== 'string') return json({ error: say(lang, 'Falta imageBase64') }, 400);
    if (imageBase64.length > MAX_B64) return json({ error: say(lang, 'La imagen es muy grande.') }, 413);
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) return json({ error: say(lang, 'Formato de imagen no soportado.') }, 400);

    const { data: mp, error: planErr } = await supabase.rpc('my_plan');
    const plan = planErr ? 'pro' : String((mp as any)?.plan ?? 'free');
    const { data: left, error: takeErr } = await supabase.rpc('ai_take', { p_task: 'ocr', p_limit: limitOf(plan, 'ocr') });
    if (!takeErr && typeof left === 'number' && left < 0) {
      return json({ error: limitMessage(plan, 'ocr', lang), code: 'limit', plan }, 429);
    }

    const env = (k: string) => Deno.env.get(k);
    const keyName = providerOf(env) === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
    if (!env(keyName)) return json({ error: say(lang, `${keyName} no configurada`) }, 500);

    const prompt = mode ? ocrPrompt(mode)
      : 'Transcribe fielmente el texto manuscrito de esta imagen de apuntes escolares. ' +
        'Devuelve SOLO el texto, conservando saltos de línea y viñetas. ' +
        'No inventes contenido ilegible; marca lo dudoso con [?]. No agregues comentarios.';

    // Modelo de visión: OCR_MODEL (Claude) o GEMINI_MODEL (Gemini).
    const res = await complete(env, {
      kind: 'vision',
      maxTokens: mode === 'plain' || !mode ? 2000 : 4000,
      messages: [{ role: 'user', content: [{ type: 'image', mediaType, data: imageBase64 }, { type: 'text', text: prompt }] }],
    });
    if (!res.ok) return json({ error: say(lang, 'Fallo del modelo de visión'), detail: res.detail.slice(0, 500) }, 502);
    const text = res.text;
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
