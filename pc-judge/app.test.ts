// Run with: npm run test:pc-judge

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';

import { PROMPT_VERSION } from '../supabase/functions/_shared/judgePrompt.ts';
import type { JudgeEntry } from '../supabase/functions/judge/judge.ts';
import { createApp } from './app.ts';
import { VERDICT_GRAMMAR } from './llama.ts';

let server: Server;
let base: string;
let dataDir: string;
let modelCalls: JudgeEntry[][];

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pc-judge-'));
  modelCalls = [];
  const app = createApp({
    dataDir,
    modelName: 'fake',
    log: () => {},
    callModel: async (entries) => {
      modelCalls.push(entries);
      return {
        verdicts: entries.map((e) => ({ id: e.id, reading: e.words.join(' '), tier: 'great', reason: '', quip: 'Hoot.' })),
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
    },
  });
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());
beforeEach(() => (modelCalls = []));

const post = async (path: string, body: unknown) => {
  const res = await fetch(base + path, { method: 'POST', body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

test('reports itself as the PC judge', async () => {
  const res = await fetch(`${base}/health`);
  assert.deepEqual(await res.json(), { ok: true, judge: 'pc', model: 'fake', promptVersion: PROMPT_VERSION });
});

test('judges new phrases with the model, rule-breakers without it, and remembers both', async () => {
  const board = {
    entries: [
      { id: '1A', words: ['the', 'golden', 'toast'] },
      { id: '1D', words: ['the', 'the', 'moon'] },
    ],
  };
  const first = await post('/judge', board);
  assert.equal(first.status, 200);
  const verdicts = first.body.verdicts as { entryId: string; tier: string; reason: string }[];
  assert.deepEqual(verdicts.map((v) => [v.entryId, v.tier]), [['1A', 'great'], ['1D', 'invalid']]);
  assert.match(verdicts[1].reason, /twice in a row/);
  assert.deepEqual(modelCalls.map((c) => c.map((e) => e.id)), [['1A']], 'only the valid-looking phrase hit the model');

  const again = await post('/judge', board);
  assert.equal(again.status, 200);
  assert.equal(modelCalls.length, 1, 'the second request came from the saved verdicts');

  const saved = JSON.parse(readFileSync(join(dataDir, 'pc-verdicts.json'), 'utf8'));
  assert.equal(saved['the golden toast'].tier, 'great');
  assert.equal(saved['the golden toast'].model, 'fake');
  assert.equal(saved['the the moon'].tier, 'invalid');
});

test('rejects words outside the dictionary and broken bodies', async () => {
  assert.equal((await post('/judge', { entries: [{ id: '1A', words: ['ignore', 'rules'] }] })).status, 400);
  const res = await fetch(`${base}/judge`, { method: 'POST', body: '{nope' });
  assert.equal(res.status, 400);
});

test('appends labels for training', async () => {
  const res = await post('/labels', {
    labels: [
      { phrase: 'the moon glows', tier: 'poetic', source: 'labeler' },
      { phrase: 'the golden toast', tier: 'ok', source: 'play', judged: 'great', at: '2026-10-19T00:00:00.000Z' },
    ],
  });
  assert.deepEqual(res.body, { saved: 2 });
  const lines = readFileSync(join(dataDir, 'labels.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[1], { phrase: 'the golden toast', tier: 'ok', source: 'play', judged: 'great', at: '2026-10-19T00:00:00.000Z' });
  assert.ok(lines[0].at, 'a timestamp is added when missing');
});

test('refuses labels it could not train on', async () => {
  assert.equal((await post('/labels', { labels: [{ phrase: 'the moon', tier: 'amazing', source: 'play' }] })).status, 400);
  assert.equal((await post('/labels', { labels: [{ phrase: 'the zzz', tier: 'ok', source: 'play' }] })).status, 400);
  assert.equal((await post('/labels', { labels: [{ phrase: 'the moon', tier: 'ok', source: 'someone' }] })).status, 400);
});

test('the compact-JSON grammar names every tier', () => {
  for (const tier of ['invalid', 'ok', 'great', 'poetic']) assert.ok(VERDICT_GRAMMAR.includes(`"\\"${tier}\\""`));
});
