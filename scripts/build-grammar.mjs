// Writes src/data/grammar.json: the form of every verb in the word lists
// (base "eat", "-s" form "eats", past "ate"), read from the slash groups in
// scripts/words/*.txt. The grammar check (src/core/grammar.ts) uses it for
// subject-verb agreement. Run after editing the word lists:
//
//   npm run build:words            (runs this after the word list build)
//   npm run build:grammar          (just this file)
//   node scripts/build-grammar.mjs --check   (fails if it's out of date; a test runs this)

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const WORDS = new URL('./words/', import.meta.url);
const OUT = new URL('../src/data/grammar.json', import.meta.url);

const verbs = {};
for (const file of readdirSync(WORDS).filter((f) => f.endsWith('.txt')).sort()) {
  for (const line of readFileSync(new URL(file, WORDS), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^verb:\s*(.*)$/);
    if (!match) continue;
    for (const group of match[1].trim().split(/\s+/)) {
      const forms = group.split('/');
      forms.forEach((word, i) => {
        // The first form is the base; a second form ending in -s is the
        // third-person "-s" form; anything else is a past form.
        const form = i === 0 ? 'base' : i === 1 && word.endsWith('s') ? 's' : 'past';
        verbs[word] = { base: forms[0], form };
      });
    }
  }
}

const json = JSON.stringify({ generatedBy: 'scripts/build-grammar.mjs', verbs: Object.fromEntries(Object.entries(verbs).sort()) }, null, 1) + '\n';
if (process.argv.includes('--check')) {
  let current = '';
  try {
    // Git on Windows may check the file out with CRLF line endings; compare the content, not those.
    current = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n');
  } catch {}
  if (current !== json) {
    console.error('src/data/grammar.json is out of date: run npm run build:grammar');
    process.exit(1);
  }
} else {
  writeFileSync(OUT, json);
  console.log(`Wrote ${Object.keys(verbs).length} verb forms to src/data/grammar.json.`);
}
