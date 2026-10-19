// Runs the judge over a labelled phrase set and reports agreement, tiers and
// latency. Use it after every change to the judge prompt.
//
//   EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... node scripts/judge-eval/run.mjs
//
// It signs in anonymously like a player would. The judge answers phrases it
// has seen before from its cache, so after changing the prompt, bump
// PROMPT_VERSION in supabase/functions/judge/model.ts and redeploy, or the
// eval will just replay old verdicts. New phrases cost a little API usage.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const phrases = JSON.parse(readFileSync(new URL('phrases.json', here)));
const dictionary = JSON.parse(
  readFileSync(new URL('../../supabase/functions/_shared/dictionary.json', here)),
);

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const { error: signInError } = await supabase.auth.signInAnonymously();
if (signInError) throw new Error(`anonymous sign-in failed: ${signInError.message}`);

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
  const { data, error } = await supabase.functions.invoke('judge', { body: { entries } });
  latencies.push(Date.now() - began);
  if (error) throw new Error(`judge request failed: ${error.message}`);
  const { verdicts } = data;
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
