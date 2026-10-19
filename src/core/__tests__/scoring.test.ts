import { extractEntries } from '../grid';
import { failedSubmitPenalty, scoreSubmission, starThresholds, wordValue } from '../scoring';
import type { LevelDef, Verdict } from '../types';

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
    expect(wordValue('munches')).toBe(10);
    expect(wordValue('toast')).toBeGreaterThan(wordValue('big'));
  });
});

describe('scoreSubmission', () => {
  it('applies tier multipliers per entry', () => {
    const ok = scoreSubmission(level, entries, words, verdicts('ok', 'ok'), 0);
    const great = scoreSubmission(level, entries, words, verdicts('great', 'ok'), 0);
    expect(great.entryScores['1A']).toBe(Math.round(ok.entryScores['1A'] * 1.5));
    expect(great.entryScores['1D']).toBe(ok.entryScores['1D']);
  });

  it('counts the crossing word in both entries', () => {
    const result = scoreSubmission(level, entries, words, verdicts('ok', 'ok'), 0);
    const sum = (ws: string[]) => ws.reduce((s, w) => s + wordValue(w), 0);
    expect(result.raw).toBe(sum(words['1A']) + sum(words['1D']));
  });

  it('gives no stars when any entry is invalid', () => {
    const result = scoreSubmission(level, entries, words, verdicts('poetic', 'invalid'), 0);
    expect(result.entryScores['1D']).toBe(0);
    expect(result.stars).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('subtracts the failed-submit penalty', () => {
    const fresh = scoreSubmission(level, entries, words, verdicts('ok', 'ok'), 0);
    const after2 = scoreSubmission(level, entries, words, verdicts('ok', 'ok'), 2);
    expect(after2.penalty).toBe(2 * failedSubmitPenalty(level));
    expect(after2.total).toBe(fresh.total - after2.penalty);
  });
});

describe('starThresholds', () => {
  it('derives defaults from entry slots when a level has none', () => {
    const { stars: _, ...noStars } = level;
    // 2 entries x 3 cells = 6 slots at 3 / 4.5 / 6 points per slot.
    expect(starThresholds(noStars)).toEqual([18, 27, 36]);
  });
});
