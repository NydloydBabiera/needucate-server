import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createQuestionnaireGenerator } from '../src/questionnaire.js';

const input = { topic: 'JavaScript', questionCount: 1, difficulty: 'medium', questionType: 'multiple_choice', language: 'English' };
const output = { title: 'JavaScript quiz', questions: [{ question: 'Which declares a constant?', options: ['const', 'let', 'var', 'def'], answer: 'const', explanation: 'const declares a binding that cannot be reassigned.' }] };
const silent = { error() {} };
const completed = data => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }] });
const mockClient = response => ({ generateContent: async () => response });

test('valid request flows through structured Gemini integration', async () => {
  let payload;
  const client = { generateContent: async (model, value) => {
    payload = { model, ...value };
    return completed(output);
  } };
  const app = createApp({ generateQuestionnaire: createQuestionnaireGenerator(client, 'test-model') });
  const res = await request(app).post('/api/questionnaires').send({ topic: 'JavaScript', questionCount: 1 }).expect(200);
  assert.deepEqual(res.body.data, { ...input, ...output });
  assert.equal(payload.model, 'test-model');
  assert.equal(payload.generationConfig.responseMimeType, 'application/json');
  assert.equal(payload.generationConfig.responseJsonSchema.properties.questions.minItems, 1);
  assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text), input);
});

test('invalid input is rejected before generation', async () => {
  let calls = 0;
  const app = createApp({ generateQuestionnaire: async () => { calls++; } });
  for (const body of [{}, { topic: ' ' }, { topic: 'JS', questionCount: 21 }, { topic: 'JS', questionCount: '5' }, { topic: 'JS', difficulty: 'unknown' }, { topic: 'JS', extra: true }]) {
    await request(app).post('/api/questionnaires').send(body).expect(400);
  }
  assert.equal(calls, 0);
});

test('HTTP errors and rate limits use JSON responses', async () => {
  const app = createApp({ generateQuestionnaire: async () => output, rateLimitMax: 1 });
  await request(app).get('/health').expect(200, { status: 'ok' });
  await request(app).get('/missing').expect(404);
  await request(app).post('/api/questionnaires').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).post('/api/questionnaires').send({ topic: 'JS' }).expect(200);
  await request(app).post('/api/questionnaires').send({ topic: 'JS' }).expect(429);
  const fresh = createApp({ generateQuestionnaire: async () => output });
  await request(fresh).post('/api/questionnaires').type('text').send('JS').expect(415);
  await request(fresh).post('/api/questionnaires').send({ topic: 'x'.repeat(17000) }).expect(413);
});

test('refusals, incomplete responses and invalid generated answers are rejected', async () => {
  const cases = [
    [{ promptFeedback: { blockReason: 'SAFETY' } }, 422],
    [{ candidates: [{ finishReason: 'SAFETY' }] }, 422],
    [{ candidates: [{ finishReason: 'MAX_TOKENS' }] }, 502],
    [{}, 502],
    [completed(null), 502],
    [completed({ ...output, questions: [{ ...output.questions[0], answer: 'invalid' }] }), 502],
    [completed({ ...output, questions: [] }), 502],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'bad json' }] } }] }, 502],
  ];
  for (const [response, status] of cases) {
    const app = createApp({ generateQuestionnaire: createQuestionnaireGenerator(mockClient(response), 'test'), logger: silent });
    await request(app).post('/api/questionnaires').send(input).expect(status);
  }
});

test('short answer questions have no options', async () => {
  const result = { ...output, questions: [{ ...output.questions[0], options: [] }] };
  const generate = createQuestionnaireGenerator(mockClient(completed(result)), 'test');
  assert.deepEqual((await generate({ ...input, questionType: 'short_answer' })).questions[0].options, []);
});

test('upstream failures never expose provider secrets or messages', async () => {
  for (const [error, expected] of [
    [Object.assign(new Error('secret'), { status: 401 }), 502],
    [Object.assign(new Error('secret'), { status: 429 }), 503],
    [Object.assign(new Error('secret'), { name: 'TimeoutError' }), 504],
    [new Error('secret'), 500],
  ]) {
    const app = createApp({ generateQuestionnaire: async () => { throw error; }, logger: silent });
    const res = await request(app).post('/api/questionnaires').send(input).expect(expected);
    assert.ok(!JSON.stringify(res.body).includes('secret'));
  }
});
