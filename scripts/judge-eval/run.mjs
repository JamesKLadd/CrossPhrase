// Runs a judge over a labelled phrase set and reports agreement, tiers and
// latency. Use it after every change to the judge prompt.
//
//   node --env-file=.env.local scripts/judge-eval/run.mjs
//
// With EXPO_PUBLIC_JUDGE_URL set it asks the PC judge; otherwise it signs in
// to the Claude judge on Supabase like a player would. Both judges answer
// phrases they've seen before from their cache, so after changing the prompt,
// bump PROMPT_VERSION in supabase/functions/_shared/judgePrompt.ts (and
// restart or redeploy), or the eval will just replay old verdicts.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const phrases = JSON.parse(readFileSync(new URL('phrases.json', here)));
const dictionary = JSON.parse(
  readFileSync(new URL('../../supabase/functions/_shared/dictionary.json', here)),
);

const pcUrl = process.env.EXPO_PUBLIC_JUDGE_URL?.replace(/\/+$/, '');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!pcUrl && (!url || !key)) {
  console.error('Set EXPO_PUBLIC_JUDGE_URL (PC judge) or the Supabase settings (see .env.example).');
  process.exit(1);
}

/** Sends one batch to whichever judge is configured. */
let judgeBatch;
if (pcUrl) {
  judgeBatch = async (entries) => {
    const res = await fetch(`${pcUrl}/judge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) throw new Error(`PC judge returned ${res.status}: ${await res.text()}`);
    return (await res.json()).verdicts;
  };
} else {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw new Error(`anonymous sign-in failed: ${signInError.message}`);
  judgeBatch = async (entries) => {
    const { data, error } = await supabase.functions.invoke('judge', { body: { entries } });
    if (error) throw new Error(`judge request failed: ${error.message}`);
    return data.verdicts;
  };
}

for (const { phrase } of phrases) {
  const unknown = phrase.split(' ').filter((w) => !(w in dictionary));
  if (unknown.length) throw new Error(`"${phrase}" uses words not in the dictionary: ${unknown}`);
}

const BATCH = 10; // about the number of entries on a mid-sized board
let agree = 0;
const tiers = {};
const latencies = [];
for (let start = 0; start < phrases.length; start += BATCH) {
  const batch = phrases.slice(start, start + BATCH);
  const entries = batch.map((p, i) => ({ id: `${i + 1}A`, words: p.phrase.split(' ') }));
  const began = Date.now();
  const verdicts = await judgeBatch(entries);
  latencies.push(Date.now() - began);
  const byId = new Map(verdicts.map((v) => [v.entryId, v]));
  batch.forEach((p, i) => {
    const v = byId.get(`${i + 1}A`);
    const got = !v ? 'missing' : v.valid ? 'valid' : 'invalid';
    if (got === p.expect) agree++;
    if (v) tiers[v.tier] = (tiers[v.tier] ?? 0) + 1;
    const mark = got === p.expect ? '  ' : '✗ ';
    const detail = v ? `${v.tier.padEnd(7)} ${v.reading}${v.reason ? ` (${v.reason})` : ''}` : 'no verdict';
    console.log(`${mark}${p.phrase.padEnd(28)} expect ${p.expect.padEnd(7)} → ${detail}`);
    if (v?.quip) console.log(`${' '.repeat(32)}🦉 ${v.quip}`);
  });
}

const pct = ((100 * agree) / phrases.length).toFixed(0);
console.log(`\nAgreement: ${agree}/${phrases.length} (${pct}%)`);
console.log(`Tiers: ${JSON.stringify(tiers)}`);
console.log(`Latency per ${BATCH}-phrase request (ms): ${latencies.join(', ')}`);
