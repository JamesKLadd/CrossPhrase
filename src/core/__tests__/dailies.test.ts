import { validateLayout } from '../grid';
import { zenLevel } from '../levelGen';
import { starThresholds } from '../scoring';
import { addDays, dailyLevel, dayKey } from '../../data/dailies';
import { LEVELS } from '../../data/levels';

describe('daily puzzles', () => {
  it('cover a year from the start date, one per day', () => {
    expect(dailyLevel('2026-10-19')?.id).toBe('daily-2026-10-19');
    expect(dailyLevel(addDays('2026-10-19', 365))?.id).toBe(`daily-${addDays('2026-10-19', 365)}`);
    expect(dailyLevel('2026-10-18')).toBeNull();
    expect(dailyLevel('not a day')).toBeNull();
  });

  it('are all playable, with rising star targets and seeds of their own', () => {
    const seeds = new Set(LEVELS.map((l) => l.seed));
    for (let i = 0; i < 366; i++) {
      const level = dailyLevel(addDays('2026-10-19', i))!;
      expect(validateLayout(level.layout)).toEqual([]);
      const [one, two, three] = starThresholds(level);
      expect(one < two && two < three).toBe(true);
      expect(seeds.has(level.seed)).toBe(false);
      seeds.add(level.seed);
    }
  });

  it('deal balanced hands from 21 Oct 2026, keeping the days played before as they were', () => {
    expect(dailyLevel('2026-10-19')?.draw).toBeUndefined();
    expect(dailyLevel('2026-10-20')?.draw).toBeUndefined();
    for (let i = 2; i < 366; i++) expect(dailyLevel(addDays('2026-10-19', i))?.draw).toBe(2);
  });

  it('use local dates', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('zen boards', () => {
  it('are playable, unlimited and different each time', () => {
    const boards = [1, 2, 3, 4, 5].map((seed) => zenLevel(seed, 'library'));
    for (const board of boards) {
      expect(validateLayout(board.layout)).toEqual([]);
      expect(board.zen).toBe(true);
    }
    expect(new Set(boards.map((b) => b.layout.join('/'))).size).toBeGreaterThan(2);
    expect(zenLevel(9, 'garden')).toEqual(zenLevel(9, 'garden'));
  });
});
