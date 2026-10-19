// Generates levels 11 onwards with the procedural generator and the bot
// (src/core/levelGen.ts) and writes them to src/data/levels.generated.json.
// Levels 1-10 are the scripted tutorial in src/data/tutorial.ts.
//
//   npm run generate:levels
//
// The output is deterministic: the same word data, built-in judge model and
// tuning knobs (src/core/config.ts) always give the same levels. Regenerating
// after changing any of those can change every level, including ones testers
// have already played, so do it deliberately and commit the result.

import { writeFileSync } from 'node:fs';

import { bandFor, generateLevel } from '../src/core/levelGen';
import type { LevelDef } from '../src/core/types';
import { THEME_ORDER } from '../src/data/themes';
import { TUTORIAL } from '../src/data/tutorial';

const FIRST = TUTORIAL.length + 1;
const LAST = 120;
const OUT = new URL('../src/data/levels.generated.json', import.meta.url);

const levels: LevelDef[] = [];
const names = new Set(TUTORIAL.map((l) => l.name));
const seeds = new Set(TUTORIAL.map((l) => l.seed));
const started = performance.now();

for (let n = FIRST; n <= LAST; n++) {
  const theme = THEME_ORDER[Math.floor((n - FIRST) / 10) % THEME_ORDER.length];
  const { level, stats } = generateLevel({
    number: n,
    id: `level-${n}`,
    theme,
    seed: n * 1009 + 17,
    takenNames: names,
  });
  if (seeds.has(level.seed)) throw new Error(`Level ${n} reuses seed ${level.seed}; change its generator seed`);
  names.add(level.name);
  seeds.add(level.seed);
  levels.push(level);

  const size = `${level.layout[0].length}×${level.layout.length}`;
  const objectives = (level.objectives ?? []).map((o) => o.kind).join(',') || '-';
  console.log(
    `${String(n).padStart(3)} ${bandFor(n).name.padEnd(7)} ${theme.padEnd(9)} ${size}  ` +
      `stars ${level.stars!.join('/').padEnd(10)} bot ${stats.careful}/${stats.greedy} ` +
      `(${stats.carefulSolved}/5 solved, ${stats.attempts} tries)  ${objectives}  ${level.name}`,
  );
}

writeFileSync(OUT, JSON.stringify({ generatedBy: 'scripts/generate-levels.ts', levels }, null, 1) + '\n');
console.log(
  `\nWrote ${levels.length} levels to src/data/levels.generated.json in ` +
    `${Math.round((performance.now() - started) / 1000)}s.`,
);
