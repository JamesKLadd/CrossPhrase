// Adds "Wrong?" corrections that players sent with their play stats to
// training/labels.jsonl, for npm run train:judge.
//
//   1. Supabase → SQL Editor:  select at, phrase, tier, judged from player_labels;
//      then export the result as CSV (skim it first: drop anything silly).
//   2. npm run import:labels -- path/to/player_labels.csv
//
// Labels already in the file (same phrase and time) are skipped, so the same
// export can be imported twice.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const TIERS = new Set(['invalid', 'ok', 'great', 'poetic']);
const LABELS = new URL('../training/labels.jsonl', import.meta.url);

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run import:labels -- <player_labels.csv>');
  process.exit(1);
}

/** Splits one CSV line, allowing "quoted, fields" with "" for a quote. */
function cells(line) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') out.push(cell), (cell = '');
    else cell += ch;
  }
  out.push(cell);
  return out.map((c) => c.trim());
}

const [header, ...rows] = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const names = cells(header).map((h) => h.toLowerCase());
const col = (row, name) => row[names.indexOf(name)] ?? '';
for (const needed of ['at', 'phrase', 'tier']) {
  if (!names.includes(needed)) {
    console.error(`The CSV needs a "${needed}" column (found: ${names.join(', ')}).`);
    process.exit(1);
  }
}

const seen = new Set(
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

let added = 0;
let skipped = 0;
const lines = [];
for (const row of rows.map(cells)) {
  const phrase = col(row, 'phrase').toLowerCase();
  const tier = col(row, 'tier');
  const judged = col(row, 'judged');
  const time = Date.parse(col(row, 'at'));
  // Phrases are dictionary words the game dealt, so anything else isn't a real label.
  if (!/^[a-z']+( [a-z']+)*$/.test(phrase) || !TIERS.has(tier) || Number.isNaN(time)) {
    skipped++;
    continue;
  }
  const at = new Date(time).toISOString();
  if (seen.has(`${phrase}|${at}`)) continue;
  seen.add(`${phrase}|${at}`);
  lines.push(JSON.stringify({ phrase, tier, source: 'play', ...(TIERS.has(judged) ? { judged } : {}), at }));
  added++;
}
if (lines.length) appendFileSync(LABELS, lines.join('\n') + '\n');
console.log(`Added ${added} labels to training/labels.jsonl${skipped ? ` (skipped ${skipped} malformed rows)` : ''}.`);
if (added) console.log('Now run: npm run train:judge');
