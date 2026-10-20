import { starThresholds } from '../scoring';
import { parseTuning, tuneLevel } from '../tuning';
import { LEVELS, levelNumber } from '../../data/levels';

const level = LEVELS[40]; // level 41, the first of the "mid" band
const number = levelNumber(level.id);

describe('level tuning', () => {
  it('leaves levels alone without tweaks', () => {
    expect(tuneLevel(level, number, {})).toBe(level);
  });

  it('adds swaps and scales star targets by band, then by level', () => {
    const tuned = tuneLevel(level, number, {
      bands: { mid: { swaps: 1, stars: 0.8 } },
      levels: { [level.id]: { swaps: 1, stars: 0.5 } },
    });
    expect(tuned.swaps).toBe(level.swaps + 2);
    const [one] = starThresholds(level);
    expect(tuned.stars![0]).toBe(Math.round(one * 0.5)); // 0.8 × 0.5 clamps to 0.5
    expect(tuned.stars![0]).toBeLessThan(tuned.stars![1]);
    expect(tuned.stars![1]).toBeLessThan(tuned.stars![2]);
  });

  it('never touches the tutorial', () => {
    const tutorial = LEVELS[0];
    expect(tuneLevel(tutorial, 1, { levels: { [tutorial.id]: { swaps: 3 } } })).toBe(tutorial);
  });

  it('keeps only well-formed remote tweaks', () => {
    expect(
      parseTuning({
        bands: { mid: { swaps: 2, stars: 9 }, nonsense: { swaps: 1 }, early: { stars: 0.9 } },
        levels: { 'level-12': { swaps: 1.5 }, 'level-13': { swaps: -1 }, 'first-light': { swaps: 1 } },
      }),
    ).toEqual({ bands: { mid: { swaps: 2 }, early: { stars: 0.9 } }, levels: { 'level-13': { swaps: -1 } } });
    expect(parseTuning('nope')).toEqual({});
  });
});
