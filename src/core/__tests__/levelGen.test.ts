import { LEVEL_BANDS } from '../config';
import { extractEntries, validateLayout } from '../grid';
import { playLevel } from '../levelBot';
import { bandFor, generateLevel, growLayout, levelName, starsFromRuns } from '../levelGen';
import { Rng } from '../phraseGen';

describe('bandFor', () => {
  it('picks the band a level number falls in', () => {
    expect(bandFor(11).name).toBe('warm-up');
    expect(bandFor(20).name).toBe('warm-up');
    expect(bandFor(21).name).toBe('early');
    expect(bandFor(500).name).toBe(LEVEL_BANDS[LEVEL_BANDS.length - 1].name);
  });
});

describe('growLayout', () => {
  it.each(LEVEL_BANDS.map((b) => [b.name, b] as const))('grows playable %s layouts', (_, band) => {
    const rng = new Rng(7);
    let grown = 0;
    for (let i = 0; i < 25; i++) {
      const layout = growLayout(rng, band);
      if (!layout) continue;
      grown++;
      expect(validateLayout(layout)).toEqual([]);
      expect(layout.length).toBeLessThanOrEqual(band.maxRows);
      expect(layout[0].length).toBeLessThanOrEqual(band.maxCols);
      const entries = extractEntries(layout);
      expect(entries.length).toBeGreaterThanOrEqual(band.entries[0]);
      expect(entries.length).toBeLessThanOrEqual(band.entries[1]);
      for (const entry of entries) {
        expect(entry.cells.length).toBeGreaterThanOrEqual(band.length[0]);
        expect(entry.cells.length).toBeLessThanOrEqual(band.length[1]);
      }
    }
    expect(grown).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect(growLayout(new Rng(3), LEVEL_BANDS[1])).toEqual(growLayout(new Rng(3), LEVEL_BANDS[1]));
  });
});

describe('starsFromRuns', () => {
  it('rises from 1 to 3 stars, even when the bots score the same', () => {
    const [one, two, three] = starsFromRuns([40, 42, 44], [42, 42], LEVEL_BANDS[0]);
    expect(one).toBe(Math.round(42 * LEVEL_BANDS[0].oneStar));
    expect(two).toBeGreaterThan(one);
    expect(three).toBeGreaterThan(two);
  });

  it("never asks more than the careful bot scored on the level's own deal", () => {
    expect(starsFromRuns([40, 42, 44], [50], LEVEL_BANDS[0], 20)[0]).toBe(20);
  });
});

describe('levelName', () => {
  it('avoids names already taken', () => {
    const rng = new Rng(1);
    const taken = new Set<string>();
    for (let i = 0; i < 20; i++) taken.add(levelName(rng, 'garden', taken));
    expect(taken.size).toBe(20);
  });
});

describe('generateLevel', () => {
  const options = { number: 12, id: 'level-12', theme: 'garden', seed: 4242 };

  it('makes the same level from the same inputs', () => {
    expect(generateLevel(options).level).toEqual(generateLevel(options).level);
  });

  it('makes a level the bot can clear on its own deal', () => {
    const { level } = generateLevel(options);
    expect(validateLayout(level.layout)).toEqual([]);
    expect(level.swaps).toBe(bandFor(12).swaps);
    const run = playLevel(level, 'careful');
    expect(run.solved).toBe(true);
    expect(run.score).toBeGreaterThanOrEqual(level.stars![0]);
  });
});
