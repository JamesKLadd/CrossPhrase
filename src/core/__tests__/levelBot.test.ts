import { entryWords } from '../game';
import { playLevel } from '../levelBot';
import { localVerdict } from '../localJudge';
import type { LevelDef } from '../types';
import { TUTORIAL } from '../../data/tutorial';

describe('the level bot', () => {
  const level = TUTORIAL[0];

  it('fills a level with lines the built-in judge accepts', () => {
    for (const style of ['careful', 'greedy'] as const) {
      const run = playLevel(level, style);
      expect(run.solved).toBe(true);
      for (const entry of run.state.entries) {
        const words = entryWords(run.state, entry)!;
        expect(localVerdict({ id: entry.id, words }).valid).toBe(true);
        expect(run.tiers[entry.id]).not.toBe('invalid');
      }
      expect(run.swapsUsed).toBeLessThanOrEqual(level.swaps);
    }
  });

  it('scores at least as much when greedy', () => {
    expect(playLevel(level, 'greedy').score).toBeGreaterThanOrEqual(playLevel(level, 'careful').score);
  });

  it('is deterministic', () => {
    expect(playLevel(level, 'careful', { seed: 9 }).score).toBe(playLevel(level, 'careful', { seed: 9 }).score);
  });

  it('gives up on a level nobody could solve', () => {
    const impossible: LevelDef = {
      id: 'x',
      name: 'X',
      theme: 'garden',
      layout: ['...'],
      anchors: { '0,0': 'the', '0,1': 'a' },
      swaps: 2,
      seed: 1,
    };
    expect(playLevel(impossible, 'careful').solved).toBe(false);
  });
});
