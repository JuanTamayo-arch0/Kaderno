// v31: proveedor de IA (Claude o Gemini) y vectores del Oráculo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  providerOf, modelFor, complete, claudeBody, geminiBody, geminiText, embedText, embedProviderOf, embedModelOf, DEFAULTS, type Env,
} from '../supabase/functions/_shared/llm';

const envOf = (o: Record<string, string>): Env => (k) => o[k];
type Call = { url: string; init: any };
function fakeFetch(replies: ((url: string) => { status: number; body: unknown }) | { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  let i = 0;
  const f = (async (url: string, init: any) => {
    calls.push({ url, init: { ...init, body: JSON.parse(init.body) } });
    const r = typeof replies === 'function' ? replies(url) : replies[Math.min(i++, replies.length - 1)];
    return { ok: r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) } as any;
  }) as unknown as typeof fetch;
  return { f, calls };
}
const claudeOk = (text: string) => ({ status: 200, body: { content: [{ type: 'text', text }] } });
const geminiOk = (text: string) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'pensando…', thought: true }, { text }] }, finishReason: 'STOP' }] } });

test('v31 IA: el proveedor y el modelo salen de los secretos', () => {
  assert.equal(providerOf(envOf({})), 'claude');
  assert.equal(providerOf(envOf({ AI_PROVIDER: 'Gemini' })), 'gemini');
  assert.equal(providerOf(envOf({ AI_PROVIDER: 'anthropic' })), 'claude');
  assert.equal(modelFor(envOf({}), 'claude'), DEFAULTS.claude);
  assert.equal(modelFor(envOf({ AI_MODEL: 'claude-x' }), 'claude'), 'claude-x');
  assert.equal(modelFor(envOf({}), 'gemini'), 'gemini-3.8-flash');
  assert.equal(modelFor(envOf({}), 'gemini', 'light'), 'gemini-3.5-flash-lite');
  assert.equal(modelFor(envOf({ GEMINI_MODEL: 'gemini-4-argon' }), 'gemini', 'vision'), 'gemini-4-argon');
});

test('v31 IA: el pedido se traduce al formato de cada proveedor', () => {
  const ask = { system: 'Sé breve', maxTokens: 1000, messages: [
    { role: 'user' as const, content: 'hola' }, { role: 'assistant' as const, content: 'hola, ¿qué necesitas?' },
    { role: 'user' as const, content: [{ type: 'image' as const, mediaType: 'image/png', data: 'AAA' }, { type: 'text' as const, text: 'lee esto' }] },
  ] };
  const c = claudeBody('claude-sonnet-5', ask);
  assert.equal(c.system, 'Sé breve'); assert.equal(c.max_tokens, 1000);
  assert.deepEqual((c.messages[2].content as any[])[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } });
  const g = geminiBody('gemini-3.8-flash', ask);
  assert.deepEqual(g.systemInstruction, { parts: [{ text: 'Sé breve' }] });
  assert.deepEqual(g.contents.map((m) => m.role), ['user', 'model', 'user']);
  assert.deepEqual(g.contents[2].parts[0], { inlineData: { mimeType: 'image/png', data: 'AAA' } });
  assert.equal(g.generationConfig.maxOutputTokens, 2000, 'margen para el pensamiento');
  assert.equal(g.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.equal(geminiBody('gemini-3.5-flash-lite', ask).generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  assert.equal(geminiText(geminiOk('respuesta').body), 'respuesta', 'sin el pensamiento');
});

test('v31 IA: llama a Claude o a Gemini según AI_PROVIDER', async () => {
  const a = { messages: [{ role: 'user' as const, content: 'resume' }], maxTokens: 500 };
  let { f, calls } = fakeFetch([claudeOk('resumen de Claude')]);
  let r = await complete(envOf({ ANTHROPIC_API_KEY: 'sk' }), a, f);
  assert.deepEqual([r.ok, r.ok && r.text, r.provider], [true, 'resumen de Claude', 'claude']);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages'); assert.equal(calls[0].init.headers['x-api-key'], 'sk');

  ({ f, calls } = fakeFetch([geminiOk('resumen de Gemini')]));
  r = await complete(envOf({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }), { ...a, kind: 'light' }, f);
  assert.deepEqual([r.ok, r.ok && r.text, r.provider], [true, 'resumen de Gemini', 'gemini']);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'g');

  r = await complete(envOf({ AI_PROVIDER: 'gemini' }), a, f);
  assert.equal(r.ok, false); assert.equal(!r.ok && r.missingKey, 'GEMINI_API_KEY');

  ({ f } = fakeFetch([{ status: 200, body: { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] } }]));
  r = await complete(envOf({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }), a, f);
  assert.equal(r.ok, false); assert.match(!r.ok ? r.detail : '', /SAFETY/);
});

test('v31 IA: con AI_FALLBACK=1, si se acaba el saldo de uno, responde el otro', async () => {
  const a = { messages: [{ role: 'user' as const, content: 'x' }], maxTokens: 100 };
  const out = (url: string) => url.includes('anthropic')
    ? { status: 400, body: { error: { message: 'Your credit balance is too low' } } }
    : geminiOk('respondió Gemini');
  let { f, calls } = fakeFetch(out);
  let r = await complete(envOf({ ANTHROPIC_API_KEY: 'sk', GEMINI_API_KEY: 'g', AI_FALLBACK: '1' }), a, f);
  assert.deepEqual([r.ok, r.provider, calls.length], [true, 'gemini', 2]);
  ({ f, calls } = fakeFetch(out));
  r = await complete(envOf({ ANTHROPIC_API_KEY: 'sk', GEMINI_API_KEY: 'g' }), a, f);
  assert.deepEqual([r.ok, calls.length], [false, 1], 'sin AI_FALLBACK no cambia de proveedor');
  ({ f, calls } = fakeFetch(out));
  r = await complete(envOf({ ANTHROPIC_API_KEY: 'sk', AI_FALLBACK: '1' }), a, f);
  assert.deepEqual([r.ok, calls.length], [false, 1], 'sin la otra llave no hay a quién pasar');
});

test('v31 IA: vectores del Oráculo con OpenAI o Gemini, sin mezclarlos', async () => {
  assert.equal(embedProviderOf(envOf({})), null);
  assert.equal(embedProviderOf(envOf({ OPENAI_API_KEY: 'o' })), 'openai');
  assert.equal(embedProviderOf(envOf({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' })), 'gemini', 'solo Gemini: vectores de Gemini');
  assert.equal(embedProviderOf(envOf({ GEMINI_API_KEY: 'g' })), null, 'con Claude no se cambian los vectores sin pedirlo');
  assert.equal(embedProviderOf(envOf({ EMBED_PROVIDER: 'gemini', OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' })), 'gemini');
  assert.equal(embedModelOf(envOf({ OPENAI_API_KEY: 'o' })), 'text-embedding-3-small');
  assert.equal(embedModelOf(envOf({ EMBED_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' })), 'gemini-embedding-2');
  const v = Array.from({ length: 1536 }, (_, i) => i / 1536);
  const { f, calls } = fakeFetch([{ status: 200, body: { embedding: { values: v } } }]);
  assert.deepEqual(await embedText(envOf({ EMBED_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }), 'apuntes', f), v);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent');
  assert.equal(calls[0].init.body.output_dimensionality, 1536, 'mismo tamaño que la tabla (vector(1536))');
  const bad = fakeFetch([{ status: 200, body: { embedding: { values: [1, 2, 3] } } }]);
  assert.equal(await embedText(envOf({ EMBED_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }), 'x', bad.f), null, 'otro tamaño no se guarda');
});

test('v31 IA: las funciones usan el proveedor compartido y no llaman a Claude directo', () => {
  const root = path.join(__dirname, '..', 'supabase', 'functions');
  for (const f of ['ai', 'oracle', 'ocr']) {
    const s = fs.readFileSync(path.join(root, f, 'index.ts'), 'utf8');
    assert.match(s, /from '\.\.\/_shared\/llm\.ts'/, f);
    assert.doesNotMatch(s, /api\.anthropic\.com|api\.openai\.com/, f);
  }
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema_v28.sql'), 'utf8');
  assert.match(sql, /embed_model text not null default 'text-embedding-3-small'/);
});
