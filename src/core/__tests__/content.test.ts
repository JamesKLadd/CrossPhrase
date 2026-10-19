import { LEVELS } from '../../data/levels';
import { THEMES } from '../../data/themes';
import { createGame } from '../game';
import { openCells, validateLayout } from '../grid';
import { localVerdict } from '../localJudge';
import { isWord, poolNames } from '../words';

describe.each(LEVELS.map((level) => [level.id, level] as const))('level %s', (_, level) => {
  it('has a playable layout', () => {
    expect(validateLayout(level.layout)).toEqual([]);
  });

  it('uses a known theme', () => {
    expect(THEMES[level.theme]).toBeDefined();
    expect(poolNames()).toContain(level.theme);
  });

  it('puts anchors and hints on open cells, with dictionary words', () => {
    const open = new Set(openCells(level.layout));
    for (const [cell, word] of Object.entries(level.anchors ?? {})) {
      expect(open.has(cell as never)).toBe(true);
      expect(isWord(word!)).toBe(true);
    }
    for (const cell of Object.keys(level.hints ?? {})) {
      expect(open.has(cell as never)).toBe(true);
    }
  });

  it('starts a game', () => {
    expect(() => createGame(level)).not.toThrow();
  });
});

describe('levels', () => {
  it('have unique ids and seeds', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    expect(new Set(LEVELS.map((l) => l.seed)).size).toBe(LEVELS.length);
  });
});

describe('localVerdict', () => {
  const judge = (phrase: string) => localVerdict({ id: '1A', words: phrase.split(' ') });

  it('accepts ordinary phrases as ok', () => {
    expect(judge('the sleepy chef')).toMatchObject({ valid: true, tier: 'ok' });
    expect(judge('i love toast')).toMatchObject({ valid: true, tier: 'ok' });
  });

  it('rejects phrases with no content words', () => {
    expect(judge('the of and')).toMatchObject({ valid: false, tier: 'invalid' });
  });

  it('rejects phrases ending on glue words', () => {
    expect(judge('golden toast the').reason).toMatch(/end on/);
  });

  it('rejects doubled articles', () => {
    expect(judge('the a moon').valid).toBe(false);
  });
});
