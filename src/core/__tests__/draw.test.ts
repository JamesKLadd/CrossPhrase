import { buildPool, drawWeight, drawWord } from '../draw';
import { CORE_POOL, poolWords } from '../words';

describe('draw', () => {
  it('includes the core pool and the theme pool', () => {
    const pool = buildPool('garden');
    expect(pool.words).toEqual(expect.arrayContaining(['the', 'and', 'tulip', 'bloom']));
    expect(pool.words).not.toContain('pancake');
  });

  it('caps the weight of very common words and boosts theme words', () => {
    expect(drawWeight('the', false)).toBe(6);
    expect(drawWeight('tulip', true)).toBeCloseTo(drawWeight('tulip', false) * 1.5);
  });

  it('is deterministic for a given seed', () => {
    const pool = buildPool('breakfast');
    const sequence = (seed: number) => {
      const words: string[] = [];
      let rng = seed;
      for (let i = 0; i < 20; i++) {
        let word: string;
        [word, rng] = drawWord(pool, rng);
        words.push(word);
      }
      return words;
    };
    expect(sequence(42)).toEqual(sequence(42));
    expect(sequence(42)).not.toEqual(sequence(43));
  });

  it('deals a mix of glue and content words', () => {
    const pool = buildPool('night-sky');
    const core = new Set(poolWords(CORE_POOL));
    let rng = 7;
    let themed = 0;
    for (let i = 0; i < 1000; i++) {
      let word: string;
      [word, rng] = drawWord(pool, rng);
      if (!core.has(word)) themed++;
    }
    // Loose bounds: theme words should be common but not dominant.
    expect(themed).toBeGreaterThan(150);
    expect(themed).toBeLessThan(600);
  });
});
