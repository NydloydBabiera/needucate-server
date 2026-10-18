import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiClient } from '../src/gemini.js';

test('Gemini transport sends authenticated JSON with a timeout', async () => {
  let sent;
  const client = createGeminiClient({ apiKey: 'test-key', fetchImpl: async (url, init) => {
    sent = { url, ...init };
    return new Response(JSON.stringify({ candidates: [] }));
  } });
  assert.deepEqual(await client.generateContent('test-model', { contents: [] }), { candidates: [] });
  assert.equal(sent.url, 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');
  assert.equal(sent.headers['x-goog-api-key'], 'test-key');
  assert.equal(sent.method, 'POST');
  assert.deepEqual(JSON.parse(sent.body), { contents: [] });
  assert.ok(sent.signal instanceof AbortSignal);
});

test('Gemini transport handles HTTP, timeout and connection failures', async () => {
  for (const status of [401, 429, 500, 504]) {
    const client = createGeminiClient({ apiKey: 'test', fetchImpl: async () => new Response('secret', { status }) });
    await assert.rejects(client.generateContent('test', {}), error => error.status === status && !error.message.includes('secret'));
  }
  for (const [error, status] of [[new DOMException('secret', 'TimeoutError'), 504], [new TypeError('secret'), 502]]) {
    const client = createGeminiClient({ apiKey: 'test', fetchImpl: async () => { throw error; } });
    await assert.rejects(client.generateContent('test', {}), result => result.status === status && !result.message.includes('secret'));
  }
});
