// Logs a PC script in as the admin account (James, or --user Name), asking
// for the password (or reading CROSSPHRASE_PASSWORD), with the Supabase URL
// and publishable key from .env.local: no secret key needed. Exits with a
// message if it can't. Used by npm run pull:labels and rescore:dailies.

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

import { accountEmail } from '../supabase/functions/_shared/accountRules';

const ROOT = new URL('../', import.meta.url);

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

export async function adminSession() {
  const env = { ...envFile('.env'), ...envFile('.env.local'), ...process.env };
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local first.');
    process.exit(1);
  }
  const userFlag = process.argv.indexOf('--user');
  const username = userFlag > 0 ? process.argv[userFlag + 1] : 'James';
  const password = env.CROSSPHRASE_PASSWORD || (await askHidden(`Password for ${username}: `));
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.auth.signInWithPassword({ email: accountEmail(username), password });
  if (error) {
    console.error(`Couldn't log in as ${username}: ${error.message}`);
    process.exit(1);
  }
  return { supabase, username };
}
