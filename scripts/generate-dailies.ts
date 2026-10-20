// Generates a year of daily puzzles into src/data/dailies.generated.json.
// Everyone plays the same board on the same day, and the leaderboard server
// rebuilds the day's board from the same file, so it's made ahead of time
// rather than on the phone. Like the levels, it's deterministic.
//
//   npm run generate:dailies
//
// Regenerate (with a later START) before the last day runs out; the app says
// "no daily puzzle today" past the end of the file.
//
//   npm run generate:dailies -- --from 2026-10-21
//
// keeps every day before --from exactly as it is in the file (days already
// played must not change: their runs are replayed to resume and to check
// leaderboard scores) and makes new boards from that day on.

import { readFileSync, writeFileSync } from 'node:fs';

import { DAILY_BAND } from '../src/core/config';
import { generateLevel } from '../src/core/levelGen';
import { encodeProof } from '../src/core/proof';
import type { LevelDef } from '../src/core/types';
import { addDays, DAILY_ID_PREFIX } from '../src/data/dailies';
import { LEVELS } from '../src/data/levels';
import { THEME_ORDER } from '../src/data/themes';
import { saveProofs } from './proofsFile';

const START = '2026-10-19';
const DAYS = 366;
const OUT = new URL('../src/data/dailies.generated.json', import.meta.url);

const fromFlag = process.argv.indexOf('--from');
const FROM = fromFlag > 0 ? process.argv[fromFlag + 1] : START;
const existing = new Map<string, LevelDef>(
  (JSON.parse(readFileSync(OUT, 'utf8')).levels as LevelDef[]).map((l) => [l.id, l]),
);

const levels: LevelDef[] = [];
const proofs: Record<string, string> = {};
const names = new Set<string>();
const seeds = new Set(LEVELS.map((l) => l.seed));
const started = performance.now();

for (let i = 0; i < DAYS; i++) {
  const day = addDays(START, i);
  const kept = day < FROM ? existing.get(`${DAILY_ID_PREFIX}${day}`) : undefined;
  if (day < FROM && !kept) throw new Error(`No existing daily for ${day} to keep`);
  if (kept) {
    names.add(kept.name);
    seeds.add(kept.seed);
    levels.push(kept);
    continue;
  }
  const theme = THEME_ORDER[i % THEME_ORDER.length];
  const { level, proof } = generateLevel({
    number: 1000 + i,
    id: `${DAILY_ID_PREFIX}${day}`,
    theme,
    seed: 777_000 + i * 131,
    takenNames: names,
    band: DAILY_BAND,
  });
  if (seeds.has(level.seed)) throw new Error(`Daily ${day} reuses seed ${level.seed}`);
  names.add(level.name);
  seeds.add(level.seed);
  levels.push(level);
  proofs[level.id] = encodeProof(proof);
  if (i % 30 === 0) console.log(`${day} ${theme.padEnd(9)} stars ${level.stars!.join('/')}  ${level.name}`);
}

writeFileSync(OUT, JSON.stringify({ generatedBy: 'scripts/generate-dailies.ts', start: START, levels }) + '\n');
saveProofs(proofs);
console.log(`\nWrote ${levels.length} daily puzzles from ${START} in ${Math.round((performance.now() - started) / 1000)}s.`);
