// Downloads the approved training labels (your own, and players' corrections
// you approved on the Review screen) into training/labels.jsonl, for
// npm run train:judge.
//
//   npm run pull:labels
//
// It logs in as your admin account (James, or --user Name), asking for the
// password each time (or reading CROSSPHRASE_PASSWORD), with the Supabase URL
// and publishable key from .env.local: no secret key needed. Labels already
// in the file are skipped, so running it twice adds nothing.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { adminSession } from './adminSession.mts';

const LABELS = new URL('../training/labels.jsonl', import.meta.url);
const { supabase, username } = await adminSession();

const { data, error } = await supabase.rpc('admin_training_labels');
if (error) {
  console.error(
    /Admins only/.test(error.message) ? `${username} isn't an admin account.` : `Couldn't read the labels: ${error.message}`,
  );
  process.exit(1);
}

const have = new Set(
  existsSync(LABELS)
    ? readFileSync(LABELS, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            const label = JSON.parse(line);
            return `${label.phrase}|${label.at}`;
          } catch {
            return '';
          }
        })
    : [],
);

const rows = data as { phrase: string; tier: string; judged: string | null; source: 'admin' | 'play'; at: string }[];
const lines: string[] = [];
for (const row of rows) {
  const at = new Date(row.at).toISOString();
  if (have.has(`${row.phrase}|${at}`)) continue;
  have.add(`${row.phrase}|${at}`);
  lines.push(
    JSON.stringify({
      phrase: row.phrase,
      tier: row.tier,
      // Your own labels count like the labelling screen's; approved corrections like "Wrong?" taps.
      source: row.source === 'admin' ? 'labeler' : 'play',
      ...(row.judged ? { judged: row.judged } : {}),
      at,
    }),
  );
}
if (lines.length) appendFileSync(LABELS, lines.join('\n') + '\n');
console.log(`${rows.length} approved labels online; added ${lines.length} new ones to training/labels.jsonl.`);
if (lines.length) {
  console.log('Next: npm run train:judge, then npm run bundle:server, commit, push, and npx supabase functions deploy scores.');
}
await supabase.auth.signOut({ scope: 'local' });
process.exit(0);
