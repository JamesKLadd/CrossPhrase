// Exports the judge's most-used verdicts into src/data/seedVerdicts.json, so
// new installs can judge common phrases offline from day one.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_... \
//     node scripts/export_seed_verdicts.mjs [count=500]
//
// The secret key bypasses row level security: keep it out of the app and the repo.

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
  process.exit(1);
}
const count = Number(process.argv[2] ?? 500);

const supabase = createClient(url, secretKey, { auth: { persistSession: false } });
const { data, error } = await supabase
  .from('verdict_cache')
  .select('phrase, tier, reading, reason, quip')
  .order('hits', { ascending: false })
  .limit(count);
if (error) throw new Error(error.message);

const seed = Object.fromEntries(
  data.map(({ phrase, tier, reading, reason, quip }) => [
    phrase,
    { valid: tier !== 'invalid', tier, reading, reason, quip },
  ]),
);
const out = new URL('../src/data/seedVerdicts.json', import.meta.url);
writeFileSync(out, JSON.stringify(seed, null, 1) + '\n');
console.log(`Wrote ${data.length} verdicts to src/data/seedVerdicts.json`);
