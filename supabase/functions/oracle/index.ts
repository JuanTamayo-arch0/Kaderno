// ============================================================
//  Edge Function: oracle
//  El "Oráculo": responde preguntas usando las notas del usuario (RAG).
//  Acciones: ask | index | reindex
//
//  Secretos:  ANTHROPIC_API_KEY (respuestas)  y  OPENAI_API_KEY (embeddings)
//  Desplegar: npx supabase functions deploy oracle
//
//  Degradación elegante: si no hay OPENAI_API_KEY o embeddings, usa las
//  notas recientes/de la materia como contexto directo (sigue funcionando).
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });

async function embed(text: string): Promise<number[] | null> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return null;
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.data?.[0]?.embedding ?? null;
}
const vecStr = (v: number[]) => `[${v.join(',')}]`;

const ABILITY: Record<string, string> = {
  explain: 'El usuario quiere que le EXPLIQUES el tema de forma clara, con ejemplos y a un nivel adecuado para estudiar.',
  quiz: 'Genera un QUIZ de 3 a 5 preguntas de práctica sobre el material; incluye las respuestas correctas al final.',
  summary: 'Haz un RESUMEN estructurado / guía de estudio con los puntos clave para repasar.',
  connect: 'CONECTA y relaciona los conceptos entre las distintas notas y materias para dar una visión integrada.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return json({ error: 'No autenticado' }, 401);

    const body = await req.json();
    const action = body.action ?? 'ask';

    // ---------- INDEX (una nota) ----------
    if (action === 'index') {
      const vec = await embed(body.content ?? '');
      if (!vec) return json({ ok: false, reason: 'sin OPENAI_API_KEY' });
      const { error } = await supabase.from('note_embeddings').upsert(
        { note_id: body.noteId, user_id: userId, subject_id: body.subjectId ?? null, content: body.content ?? '', embedding: vecStr(vec) },
        { onConflict: 'note_id' },
      );
      return json({ ok: !error, error: error?.message });
    }

    // ---------- REINDEX (todas) ----------
    if (action === 'reindex') {
      const { data: notes } = await supabase.from('notes').select('id, subject_id, content');
      let n = 0;
      for (const note of notes ?? []) {
        if (!note.content) continue;
        const vec = await embed(note.content);
        if (!vec) break;
        await supabase.from('note_embeddings').upsert(
          { note_id: note.id, user_id: userId, subject_id: note.subject_id, content: note.content, embedding: vecStr(vec) },
          { onConflict: 'note_id' },
        );
        n++;
      }
      return json({ ok: true, indexed: n });
    }

    // ---------- ASK ----------
    const { question, mode = 'all', subjectId = null, noteId = null, ability = null, history = [], pet = null } = body;
    if (!question) return json({ error: 'Falta question' }, 400);

    let contextNotes: { title: string; content: string; note_id: string }[] = [];
    let usedSemantic = false;

    if (mode === 'note' && noteId) {
      const { data } = await supabase.from('notes').select('id, title, content').eq('id', noteId).single();
      if (data) contextNotes = [{ note_id: data.id, title: data.title ?? 'Nota', content: data.content ?? '' }];
    } else {
      // Intento semántico
      try {
        const qvec = await embed(question);
        if (qvec) {
          const { data, error } = await supabase.rpc('match_notes', {
            query_embedding: vecStr(qvec), match_subject: mode === 'subject' ? subjectId : null, match_count: 6,
          });
          if (!error && data && data.length) {
            contextNotes = data.map((d: any) => ({ note_id: d.note_id, title: d.title ?? 'Nota', content: d.content ?? '' }));
            usedSemantic = true;
          }
        }
      } catch (_) { /* cae al respaldo */ }

      // Respaldo: notas recientes (por materia o todas)
      if (contextNotes.length === 0) {
        let q = supabase.from('notes').select('id, title, content').order('created_at', { ascending: false }).limit(8);
        if (mode === 'subject' && subjectId) q = q.eq('subject_id', subjectId);
        const { data } = await q;
        contextNotes = (data ?? []).map((d: any) => ({ note_id: d.id, title: d.title ?? 'Nota', content: d.content ?? '' }));
      }
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500);

    const contextBlock = contextNotes.length
      ? contextNotes.map((n, i) => `[Nota ${i + 1}: "${n.title}"]\n${n.content}`).join('\n\n---\n\n')
      : '(No se encontraron notas del usuario relevantes.)';

    // Tono de la mascota del estudiante (opcional): cambia la forma, no el contenido.
    const PERSONA: Record<string, string> = {
      pinguino: 'un pingüino ordenado y constante: frases claras y pasos numerados',
      gato: 'un gato tranquilo con un toque de humor seco, nunca grosero',
      perro: 'un perro entusiasta que anima y celebra los avances',
      loro: 'un loro curioso que a veces repite la idea clave como pregunta para fijarla',
    };
    const petName = pet && typeof pet.name === 'string' ? pet.name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 24) : '';
    const persona = pet && PERSONA[pet.species] && petName
      ? `Hablas como ${petName}, la mascota de estudio del estudiante: ${PERSONA[pet.species]}. Ese tono va solo en la forma (una frase corta al inicio o al cierre); el contenido sigue siendo preciso y completo. Sin emojis. `
      : '';

    const system =
      'Eres el "Oráculo" de Kaderno, un tutor de estudio amable y claro que responde en español. ' + persona +
      'Respondes basándote PRINCIPALMENTE en las notas del estudiante que se te proporcionan abajo. ' +
      (ABILITY[ability] ? ability + ': ' + ABILITY[ability] + ' ' : '') +
      'Si las notas no contienen la respuesta, puedes usar tu conocimiento general PERO avisa claramente que eso no salió de sus apuntes. ' +
      'Cuando uses una nota, menciónala por su título. Sé conciso pero completo.\n\n' +
      '=== NOTAS DEL ESTUDIANTE ===\n' + contextBlock;

    const messages = [
      ...(Array.isArray(history) ? history.slice(-8).map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })) : []),
      { role: 'user', content: question },
    ];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: Deno.env.get('OCR_MODEL') ?? 'claude-sonnet-5', max_tokens: 1500, system, messages }),
    });
    if (!res.ok) return json({ error: 'Fallo del modelo', detail: await res.text() }, 502);
    const data = await res.json();
    const answer = (data.content ?? []).map((b: any) => b.text ?? '').join('').trim();

    return json({ answer, usedSemantic, sources: contextNotes.map((n) => ({ note_id: n.note_id, title: n.title })) });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
