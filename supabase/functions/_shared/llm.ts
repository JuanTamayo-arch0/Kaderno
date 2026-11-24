// ============================================================
//  v31: proveedor de IA (Claude o Gemini) para las funciones del servidor.
//  TypeScript puro: recibe las variables de entorno y fetch, así se prueba
//  en Node sin red.
//
//  Secretos (Supabase, Edge Functions):
//   AI_PROVIDER          claude (por defecto) o gemini
//   ANTHROPIC_API_KEY    para Claude
//   GEMINI_API_KEY       para Gemini (de un proyecto de Google con facturación)
//   AI_MODEL / OCR_MODEL modelo de Claude (por defecto claude-sonnet-5)
//   GEMINI_MODEL         modelo principal de Gemini (por defecto gemini-3.8-flash)
//   GEMINI_MODEL_LIGHT   para tareas cortas (por defecto gemini-3.5-flash-lite)
//   AI_FALLBACK          "1": si el proveedor elegido falla y está la llave del
//                        otro, se intenta con el otro (útil si se acaba el saldo).
//  Vectores del Oráculo:
//   EMBED_PROVIDER       openai (por defecto si hay OPENAI_API_KEY) o gemini
// ============================================================

export type Env = (k: string) => string | undefined;
export type Provider = 'claude' | 'gemini';
export type Part = { type: 'text'; text: string } | { type: 'image'; mediaType: string; data: string };
export type Msg = { role: 'user' | 'assistant'; content: string | Part[] };
/** main: respuestas largas y JSON; light: tareas cortas; vision: leer fotos. */
export type Kind = 'main' | 'light' | 'vision';
export type Ask = { system?: string; messages: Msg[]; maxTokens: number; kind?: Kind };
export type Answer =
  | { ok: true; text: string; provider: Provider; model: string }
  | { ok: false; status: number; detail: string; provider: Provider; missingKey?: string };

export const DEFAULTS = {
  claude: 'claude-sonnet-5',
  gemini: 'gemini-3.8-flash',
  geminiLight: 'gemini-3.5-flash-lite',
  openaiEmbed: 'text-embedding-3-small',
  geminiEmbed: 'gemini-embedding-2',
} as const;

/** El proveedor elegido. Acepta "claude", "anthropic" y "gemini", sin importar mayúsculas. */
export function providerOf(env: Env): Provider {
  const p = (env('AI_PROVIDER') ?? '').trim().toLowerCase();
  return p === 'gemini' || p === 'google' ? 'gemini' : 'claude';
}

const keyName = (p: Provider) => (p === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY');

export function modelFor(env: Env, p: Provider, kind: Kind = 'main'): string {
  if (p === 'claude') return env('AI_MODEL') ?? env('OCR_MODEL') ?? DEFAULTS.claude;
  if (kind === 'light') return env('GEMINI_MODEL_LIGHT') ?? DEFAULTS.geminiLight;
  return env('GEMINI_MODEL') ?? DEFAULTS.gemini;
}

/** El cuerpo de la llamada a Claude (Messages API). */
export function claudeBody(model: string, a: Ask) {
  return {
    model,
    max_tokens: a.maxTokens,
    ...(a.system ? { system: a.system } : {}),
    messages: a.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content.map((p) =>
        p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } }),
    })),
  };
}

/**
 * El cuerpo de la llamada a Gemini (generateContent). Los modelos 3.x piensan
 * antes de responder: se pide poco pensamiento y se da el doble de margen,
 * porque el pensamiento puede contar dentro de maxOutputTokens.
 */
export function geminiBody(model: string, a: Ask) {
  const light = /flash-lite/.test(model);
  return {
    ...(a.system ? { systemInstruction: { parts: [{ text: a.system }] } } : {}),
    contents: a.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: typeof m.content === 'string' ? [{ text: m.content }] : m.content.map((p) =>
        p.type === 'text' ? { text: p.text } : { inlineData: { mimeType: p.mediaType, data: p.data } }),
    })),
    generationConfig: {
      maxOutputTokens: a.maxTokens * 2,
      thinkingConfig: { thinkingLevel: light ? 'minimal' : 'low' },
    },
  };
}

/** El texto de la respuesta de Gemini, sin las partes de pensamiento. */
export function geminiText(j: any): string {
  const parts = j?.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p: any) => !p.thought && typeof p.text === 'string').map((p: any) => p.text).join('').trim();
}

export function claudeText(j: any): string {
  return (j?.content ?? []).map((b: any) => b.text ?? '').join('').trim();
}

async function callOne(env: Env, f: typeof fetch, p: Provider, a: Ask): Promise<Answer> {
  const key = env(keyName(p));
  if (!key) return { ok: false, status: 500, detail: `${keyName(p)} no configurada`, provider: p, missingKey: keyName(p) };
  const model = modelFor(env, p, a.kind ?? 'main');
  try {
    if (p === 'claude') {
      const r = await f('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(claudeBody(model, a)),
      });
      if (!r.ok) return { ok: false, status: r.status, detail: (await r.text()).slice(0, 800), provider: p };
      return { ok: true, text: claudeText(await r.json()), provider: p, model };
    }
    const r = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(geminiBody(model, a)),
    });
    if (!r.ok) return { ok: false, status: r.status, detail: (await r.text()).slice(0, 800), provider: p };
    const j = await r.json();
    const text = geminiText(j);
    if (!text) return { ok: false, status: 502, detail: `Gemini no devolvió texto (${j?.candidates?.[0]?.finishReason ?? j?.promptFeedback?.blockReason ?? 'sin motivo'})`, provider: p };
    return { ok: true, text, provider: p, model };
  } catch (e) {
    return { ok: false, status: 502, detail: String(e).slice(0, 300), provider: p };
  }
}

/** Le pregunta al proveedor elegido; con AI_FALLBACK=1, si falla, al otro (si tiene llave). */
export async function complete(env: Env, a: Ask, f: typeof fetch = fetch): Promise<Answer> {
  const first = providerOf(env);
  const r = await callOne(env, f, first, a);
  if (r.ok || env('AI_FALLBACK') !== '1') return r;
  const other: Provider = first === 'claude' ? 'gemini' : 'claude';
  if (!env(keyName(other))) return r;
  const r2 = await callOne(env, f, other, a);
  return r2.ok ? r2 : r;
}

// ---------- Vectores para el Oráculo ----------

export type EmbedProvider = 'openai' | 'gemini';

/** Quién arma los vectores: EMBED_PROVIDER, o el que tenga llave (OpenAI primero). */
export function embedProviderOf(env: Env): EmbedProvider | null {
  const p = (env('EMBED_PROVIDER') ?? '').trim().toLowerCase();
  if (p === 'gemini') return env('GEMINI_API_KEY') ? 'gemini' : null;
  if (p === 'openai') return env('OPENAI_API_KEY') ? 'openai' : null;
  if (env('OPENAI_API_KEY')) return 'openai';
  if (env('GEMINI_API_KEY') && providerOf(env) === 'gemini') return 'gemini';
  return null;
}

/** El nombre del modelo de vectores, que se guarda con cada vector (no se mezclan). */
export function embedModelOf(env: Env): string | null {
  const p = embedProviderOf(env);
  return p === 'gemini' ? DEFAULTS.geminiEmbed : p === 'openai' ? DEFAULTS.openaiEmbed : null;
}

/** Vector de 1536 números para el texto, o null si no hay proveedor o falla. */
export async function embedText(env: Env, text: string, f: typeof fetch = fetch): Promise<number[] | null> {
  const p = embedProviderOf(env);
  if (!p) return null;
  try {
    if (p === 'openai') {
      const r = await f('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env('OPENAI_API_KEY')}` },
        body: JSON.stringify({ model: DEFAULTS.openaiEmbed, input: text.slice(0, 8000) }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      return j.data?.[0]?.embedding ?? null;
    }
    const r = await f(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULTS.geminiEmbed}:embedContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY')! },
      body: JSON.stringify({ model: `models/${DEFAULTS.geminiEmbed}`, content: { parts: [{ text: text.slice(0, 8000) }] }, output_dimensionality: 1536 }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j.embedding?.values ?? j.embeddings?.[0]?.values ?? null;
    return Array.isArray(v) && v.length === 1536 ? v : null;
  } catch {
    return null;
  }
}
