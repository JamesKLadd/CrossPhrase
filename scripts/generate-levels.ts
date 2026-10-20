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
//
//   npm run generate:levels -- --from 101
//
// keeps the levels before 101 as they are in the file and makes the rest
// (e.g. after changing only the late band). The file is saved after every
// level, so a run that stops partway holds the levels made so far and can
// carry on with --from.

import { readFileSync, writeFileSync } from 'node:fs';

import { bandFor, generateLevel } from '../src/core/levelGen';
import type { LevelDef } from '../src/core/types';
import { THEME_ORDER } from '../src/data/themes';
import { TUTORIAL } from '../src/data/tutorial';

const FIRST = TUTORIAL.length + 1;
const LAST = 120;
const OUT = new URL('../src/data/levels.generated.json', import.meta.url);

const fromFlag = process.argv.indexOf('--from');
const FROM = fromFlag > 0 ? Number(process.argv[fromFlag + 1]) : FIRST;
if (!(FROM >= FIRST && FROM <= LAST)) throw new Error(`--from must be a level from ${FIRST} to ${LAST}`);
const existing: LevelDef[] = FROM > FIRST ? JSON.parse(readFileSync(OUT, 'utf8')).levels : [];

const levels: LevelDef[] = [];
const names = new Set(TUTORIAL.map((l) => l.name));
const seeds = new Set(TUTORIAL.map((l) => l.seed));
const started = performance.now();
const save = () =>
  writeFileSync(OUT, JSON.stringify({ generatedBy: 'scripts/generate-levels.ts', levels }, null, 1) + '\n');

for (let n = FIRST; n <= LAST; n++) {
  if (n < FROM) {
    const kept = existing.find((l) => l.id === `level-${n}`);
    if (!kept) throw new Error(`No existing level ${n} to keep`);
    names.add(kept.name);
    seeds.add(kept.seed);
    levels.push(kept);
    continue;
  }
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
  // Saved as it goes: a run that stops partway keeps what it made, and --from carries on.
  save();
}

save();
console.log(
  `\nWrote ${levels.length} levels to src/data/levels.generated.json in ` +
    `${Math.round((performance.now() - started) / 1000)}s.`,
);
