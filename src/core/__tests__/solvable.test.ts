import { entryWords } from '../game';
import { isGrammatical } from '../grammar';
import { playLevel } from '../levelBot';
import type { LevelDef } from '../types';
import generatedDailies from '../../data/dailies.generated.json';
import { LEVELS } from '../../data/levels';
import { TUTORIAL } from '../../data/tutorial';

// Every generated board has an answer a person would write: the careful bot
// clears its own deal in plain English with a swap to spare (the generator's
// check, src/core/levelGen.ts). Fails if the data goes stale against the
// grammar, the bot or the dealing rules; regenerate with npm run
// generate:levels, or npm run generate:dailies -- --from <tomorrow>.

function expectSolvable(level: LevelDef) {
  const run = playLevel(level, 'careful');
  expect(run.solved).toBe(true);
  expect(run.swapsUsed).toBeLessThan(level.swaps);
  for (const entry of run.state.entries) {
    expect(isGrammatical(entryWords(run.state, entry)!, { strict: true })).toBe(true);
  }
}

describe.each(LEVELS.slice(TUTORIAL.length).map((level) => [level.id, level] as const))('%s', (_, level) => {
  it('can be cleared in plain English with a swap to spare', () => expectSolvable(level));
});

// Days dealt with balanced hands (the two before were played already and keep
// their old deal). Every fourth one, to keep the tests quick: a change that
// breaks boards breaks most of them.
const dailies = (generatedDailies.levels as unknown as LevelDef[]).filter((level) => level.draw === 2);

describe.each(dailies.filter((_, i) => i % 4 === 0).map((level) => [level.id, level] as const))('%s', (_, level) => {
  it('can be cleared in plain English with a swap to spare', () => expectSolvable(level));
});
