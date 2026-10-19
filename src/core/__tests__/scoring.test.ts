import { extractEntries } from '../grid';
import {
  failedSubmitPenalty,
  scoreSubmission,
  starThresholds,
  tileValue,
  wordValue,
} from '../scoring';
import type { LevelDef, Objective, Verdict } from '../types';

const level: LevelDef = {
  id: 'test',
  name: 'Test',
  theme: 'breakfast',
  layout: ['...', '.##', '.##'],
  swaps: 3,
  stars: [10, 20, 30],
  seed: 1,
};
const entries = extractEntries(level.layout);
const words = { '1A': ['the', 'golden', 'toast'], '1D': ['the', 'sleepy', 'chef'] };
const tiles = {
  '1A': words['1A'].map((word) => ({ word })),
  '1D': words['1D'].map((word) => ({ word })),
};

function verdicts(tierA: Verdict['tier'], tierD: Verdict['tier']): Record<string, Verdict> {
  const v = (entryId: string, tier: Verdict['tier']): Verdict => ({
    entryId,
    tier,
    valid: tier !== 'invalid',
    reading: '',
    reason: '',
    quip: '',
  });
  return { '1A': v('1A', tierA), '1D': v('1D', tierD) };
}

describe('wordValue', () => {
  it('scores common words low and rare words high', () => {
    expect(wordValue('the')).toBe(1);
    expect(wordValue('toast')).toBeGreaterThan(wordValue('big'));
    expect(wordValue('nebula')).toBeGreaterThan(wordValue('moon'));
  });

  it('scores an inflected form the same as its base form', () => {
    expect(wordValue('munches')).toBe(wordValue('munch'));
    expect(wordValue('ate')).toBe(wordValue('eat'));
  });
});

describe('scoreSubmission', () => {
  it('applies tier multipliers per entry', () => {
    const ok = scoreSubmission(level, entries, tiles, verdicts('ok', 'ok'), 0);
    const great = scoreSubmission(level, entries, tiles, verdicts('great', 'ok'), 0);
    expect(great.entryScores['1A']).toBe(Math.round(ok.entryScores['1A'] * 1.5));
    expect(great.entryScores['1D']).toBe(ok.entryScores['1D']);
  });

  it('counts the crossing word in both entries', () => {
    const result = scoreSubmission(level, entries, tiles, verdicts('ok', 'ok'), 0);
    const sum = (ws: string[]) => ws.reduce((s, w) => s + wordValue(w), 0);
    expect(result.raw).toBe(sum(words['1A']) + sum(words['1D']));
  });

  it('gives no stars when any entry is invalid', () => {
    const result = scoreSubmission(level, entries, tiles, verdicts('poetic', 'invalid'), 0);
    expect(result.entryScores['1D']).toBe(0);
    expect(result.stars).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('subtracts the failed-submit penalty', () => {
    const fresh = scoreSubmission(level, entries, tiles, verdicts('ok', 'ok'), 0);
    const after2 = scoreSubmission(level, entries, tiles, verdicts('ok', 'ok'), 2);
    expect(after2.penalty).toBe(2 * failedSubmitPenalty(level));
    expect(after2.total).toBe(fresh.total - after2.penalty);
  });
});

describe('wildcards', () => {
  it('score half their word value, rounded up', () => {
    expect(tileValue({ word: 'nebula', wildcard: true })).toBe(Math.ceil(wordValue('nebula') / 2));
    expect(tileValue({ word: 'the', wildcard: true })).toBe(1);
    expect(tileValue({ word: 'nebula' })).toBe(wordValue('nebula'));
  });
});

describe('bonus objectives', () => {
  const objective: Objective = { kind: 'swapsLeft', count: 1, points: 7 };

  it('add the points of objectives met', () => {
    const plain = scoreSubmission(level, entries, tiles, verdicts('ok', 'ok'), 0);
    const met = scoreSubmission(level, entries, tiles, verdicts('ok', 'ok'), 0, [
      { objective, met: true, have: 2, need: 1 },
    ]);
    const missed = scoreSubmission(level, entries, tiles, verdicts('ok', 'ok'), 0, [
      { objective, met: false, have: 0, need: 1 },
    ]);
    expect(met.bonus).toBe(7);
    expect(met.total).toBe(plain.total + 7);
    expect(missed.bonus).toBe(0);
    expect(missed.total).toBe(plain.total);
  });

  it("can't rescue a board with an invalid line", () => {
    const result = scoreSubmission(level, entries, tiles, verdicts('ok', 'invalid'), 0, [
      { objective: { ...objective, points: 1000 }, met: true, have: 2, need: 1 },
    ]);
    expect(result.passed).toBe(false);
  });
});

describe('starThresholds', () => {
  it('derives defaults from entry slots when a level has none', () => {
    const { stars: _, ...noStars } = level;
    // 2 entries x 3 cells = 6 slots at 3 / 4.5 / 6 points per slot.
    expect(starThresholds(noStars)).toEqual([18, 27, 36]);
  });
});
