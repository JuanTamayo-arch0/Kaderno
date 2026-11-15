import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- Fase 2: comentarios y menciones ----------
const PEOPLE = [{ user_id: 'ana', name: 'Ana María' }, { user_id: 'an', name: 'Ana' }, { user_id: 'luis', name: 'luis' }, { user_id: 'me', name: 'Juan José' }];

test('menciones: qué se busca después de la @', async () => {
  const { mentionQuery, mentionMatches, insertMention, mentionName } = await import('../lib/comments');
  assert.deepEqual(mentionQuery('Hola @an', 8), { start: 5, query: 'an' });
  assert.deepEqual(mentionQuery('@', 1), { start: 0, query: '' });
  assert.deepEqual(mentionQuery('Hola @Ana Ma', 12), { start: 5, query: 'Ana Ma' });
  assert.equal(mentionQuery('correo juan@upb', 15), null, 'una @ dentro de una palabra no es mención');
  assert.equal(mentionQuery('hola', 4), null);
  assert.deepEqual(mentionMatches(PEOPLE, 'ma', 'me').map((p) => p.user_id), ['ana'], 'por cualquier palabra del nombre');
  assert.deepEqual(mentionMatches(PEOPLE, 'án', 'me').map((p) => p.user_id), ['ana', 'an'], 'sin tildes');
  assert.deepEqual(mentionMatches(PEOPLE, '', 'me').map((p) => p.user_id), ['ana', 'an', 'luis'], 'sin mí');
  assert.deepEqual(insertMention('Hola @an ¿listo?', 5, 8, 'Ana María'), { text: 'Hola @Ana María ¿listo?', caret: 16 });
  assert.equal(mentionName({ display_name: '  ', email: 'luis@upb.edu.co' }), 'luis');
  assert.equal(mentionName(null), 'Integrante');
});

test('menciones: quién quedó en el texto y cómo se pinta', async () => {
  const { mentionsIn, commentParts, countByTask } = await import('../lib/comments');
  assert.deepEqual(mentionsIn('@Ana María y @luis, ¿ya?', PEOPLE), ['ana', 'luis'], '"@Ana María" no cuenta también a "@Ana"');
  assert.deepEqual(mentionsIn('@ana y @Ana María', PEOPLE), ['ana', 'an']);
  assert.deepEqual(mentionsIn('@Anabel no existe', PEOPLE), []);
  assert.deepEqual(mentionsIn('sin menciones', PEOPLE), []);
  assert.deepEqual(commentParts('Hola @Ana María, mira @Juan José', PEOPLE, 'me'), [
    { text: 'Hola ', mention: false }, { text: '@Ana María', mention: true, me: false }, { text: ', mira ', mention: false }, { text: '@Juan José', mention: true, me: true },
  ]);
  assert.deepEqual(commentParts('correo@ana.com', PEOPLE), [{ text: 'correo@ana.com', mention: false }], 'un correo no es mención');
  assert.deepEqual(mentionsIn('escribe a correo@ana.com', PEOPLE), []);
  assert.deepEqual(countByTask([{ task_id: 'a' }, { task_id: 'b' }, { task_id: 'a' }]), { a: 2, b: 1 });
});
