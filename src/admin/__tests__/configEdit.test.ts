import { DEFAULT_ECONOMY, parseEconomy } from '../../core/economy';
import { parseTuning } from '../../core/tuning';
import { economyOverrides, tweakOf, withTweak } from '../configEdit';

describe('editing the tuning', () => {
  it('sets one level, keeping the rest of the value', () => {
    const raw = { bands: { mid: { stars: 0.9 } }, levels: { 'level-12': { swaps: 1 } }, future: true };
    const edited = withTweak(raw, 'levels', 'level-37', { stars: 0.85, swaps: 1 });
    expect(edited).toEqual({
      bands: { mid: { stars: 0.9 } },
      levels: { 'level-12': { swaps: 1 }, 'level-37': { stars: 0.85, swaps: 1 } },
      future: true,
    });
    expect(parseTuning(edited).levels?.['level-37']).toEqual({ stars: 0.85, swaps: 1 });
    expect(raw.levels).toEqual({ 'level-12': { swaps: 1 } }); // not changed in place
  });

  it('removes a tweak set back to normal, and the group once empty', () => {
    const raw = { levels: { 'level-37': { stars: 0.85 } } };
    expect(withTweak(raw, 'levels', 'level-37', { stars: 1, swaps: 0 })).toEqual({});
    expect(withTweak({}, 'bands', 'mid', { stars: 0.949999 })).toEqual({ bands: { mid: { stars: 0.95 } } });
  });

  it('reads a tweak back', () => {
    expect(tweakOf({ bands: { mid: { swaps: 2 } } }, 'bands', 'mid')).toEqual({ swaps: 2 });
    expect(tweakOf('junk', 'levels', 'level-1')).toEqual({});
  });
});

describe('editing the economy', () => {
  it('stores only what differs from the defaults', () => {
    const config = parseEconomy({ lives: { refillMinutes: 20 }, boosters: { hint: { cost: 10 } } });
    expect(economyOverrides(config)).toEqual({ lives: { refillMinutes: 20 }, boosters: { hint: { cost: 10 } } });
    expect(economyOverrides(DEFAULT_ECONOMY)).toEqual({});
    expect(parseEconomy(economyOverrides(config))).toEqual(config);
  });

  it('can switch hearts off', () => {
    const off = { ...DEFAULT_ECONOMY, lives: { ...DEFAULT_ECONOMY.lives, enabled: false } };
    expect(economyOverrides(off)).toEqual({ lives: { enabled: false } });
  });
});
