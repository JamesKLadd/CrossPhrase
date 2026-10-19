// Generates a year of daily puzzles into src/data/dailies.generated.json.
// Everyone plays the same board on the same day, and the leaderboard server
// rebuilds the day's board from the same file, so it's made ahead of time
// rather than on the phone. Like the levels, it's deterministic.
//
//   npm run generate:dailies
//
// Regenerate (with a later START) before the last day runs out; the app says
// "no daily puzzle today" past the end of the file.

import { writeFileSync } from 'node:fs';

import { DAILY_BAND } from '../src/core/config';
import { generateLevel } from '../src/core/levelGen';
import type { LevelDef } from '../src/core/types';
import { addDays, DAILY_ID_PREFIX } from '../src/data/dailies';
import { LEVELS } from '../src/data/levels';
import { THEME_ORDER } from '../src/data/themes';

const START = '2026-10-19';
const DAYS = 366;
const OUT = new URL('../src/data/dailies.generated.json', import.meta.url);

const levels: LevelDef[] = [];
const names = new Set<string>();
const seeds = new Set(LEVELS.map((l) => l.seed));
const started = performance.now();

for (let i = 0; i < DAYS; i++) {
  const day = addDays(START, i);
  const theme = THEME_ORDER[i % THEME_ORDER.length];
  const { level } = generateLevel({
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
  if (i % 30 === 0) console.log(`${day} ${theme.padEnd(9)} stars ${level.stars!.join('/')}  ${level.name}`);
}

writeFileSync(OUT, JSON.stringify({ generatedBy: 'scripts/generate-dailies.ts', start: START, levels }) + '\n');
console.log(`\nWrote ${levels.length} daily puzzles from ${START} in ${Math.round((performance.now() - started) / 1000)}s.`);
