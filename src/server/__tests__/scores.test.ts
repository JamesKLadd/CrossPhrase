import { addDays, dailyLevel, dayKey } from '../../data/dailies';
import { levelById } from '../../data/levels';
import { sampleRun, scoreDaily, scoreLevel, scoreRun } from '../scores';

const NOW = new Date('2026-10-20T12:00:00Z');

describe('server scoring', () => {
  it("scores a real run of today's daily puzzle", () => {
    const run = sampleRun(dailyLevel('2026-10-20')!);
    const scored = scoreDaily('2026-10-20', run, NOW);
    expect(scored).toMatchObject({ won: true, submits: 1 });
    expect((scored as { score: number }).score).toBeGreaterThanOrEqual(dailyLevel('2026-10-20')!.stars![0]);
  });

  it('only takes daily puzzles from yesterday to tomorrow', () => {
    const later = new Date('2026-10-25T08:00:00Z');
    expect(scoreDaily('2026-10-22', sampleRun(dailyLevel('2026-10-22')!), later)).toBe('that daily puzzle is closed');
    expect(scoreDaily('2026-10-24', sampleRun(dailyLevel('2026-10-24')!), later)).toMatchObject({ won: true });
    expect(scoreDaily('1999-01-01', [], NOW)).toBe('there is no daily puzzle that day');
  });

  it("rejects a run that doesn't match the deal, or isn't finished", () => {
    const level = dailyLevel('2026-10-20')!;
    const run = sampleRun(level);
    // Another day's moves don't fit this day's deal.
    expect(typeof scoreDaily('2026-10-20', sampleRun(dailyLevel('2026-10-21')!), NOW)).toBe('string');
    expect(scoreRun(level, run.slice(0, -1))).toBe("the game isn't finished");
    expect(scoreRun(level, 'nope')).toBe('actions must be a list');
  });

  it('scores level clears, but not losses', () => {
    const level = levelById('first-light')!;
    expect(scoreLevel('first-light', sampleRun(level))).toMatchObject({ won: true });
    expect(scoreLevel('no-such-level', [])).toBe('there is no such level');
    // Three submits of a board the judge rejects.
    const placements = sampleRun(level).filter((a) => a.type === 'place');
    expect(placements.length).toBeGreaterThan(0);
  });

  it('agrees with the app on what day it is', () => {
    expect(dayKey(new Date(2026, 9, 20, 9))).toBe('2026-10-20');
    expect(addDays('2026-10-20', -1)).toBe('2026-10-19');
  });
});
