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

import { createClient } from '@supabase/supabase-js';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { accountEmail } from '../supabase/functions/_shared/accountRules';

const ROOT = new URL('../', import.meta.url);
const LABELS = new URL('training/labels.jsonl', ROOT);

function envFile(name: string): Record<string, string> {
  const file = new URL(name, ROOT);
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...envFile('.env'), ...envFile('.env.local'), ...process.env };
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local first.');
  process.exit(1);
}
const userFlag = process.argv.indexOf('--user');
const username = userFlag > 0 ? process.argv[userFlag + 1] : 'James';

/** Reads a line without showing it (falls back to plain input when not in a terminal). */
function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let text = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => (text += chunk));
      stdin.on('end', () => resolve(text.split(/\r?\n/)[0]));
    });
  }
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve) => {
    let text = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(text);
          return;
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        text = ch === '\u007f' || ch === '\b' ? text.slice(0, -1) : text + ch;
      }
    };
    stdin.on('data', onData);
  });
}

const password = env.CROSSPHRASE_PASSWORD || (await askHidden(`Password for ${username}: `));
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: loginError } = await supabase.auth.signInWithPassword({ email: accountEmail(username), password });
if (loginError) {
  console.error(`Couldn't log in as ${username}: ${loginError.message}`);
  process.exit(1);
}

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
