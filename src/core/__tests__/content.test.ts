import { LEVEL_BANDS } from '../config';
import { createGame, entryWords } from '../game';
import { extractEntries, openCells, validateLayout } from '../grid';
import { playLevel } from '../levelBot';
import { localVerdict } from '../localJudge';
import { starThresholds } from '../scoring';
import { WILDCARD, type Pos } from '../types';
import { LEVELS } from '../../data/levels';
import { THEMES } from '../../data/themes';
import { TUTORIAL } from '../../data/tutorial';
import { isWord, poolNames } from '../words';

const POS: Pos[] = ['noun', 'verb', 'adj', 'adv', 'det', 'pron', 'prep', 'conj', 'interj'];

describe.each(LEVELS.map((level) => [level.id, level] as const))('level %s', (_, level) => {
  it('has a playable layout that fits a phone', () => {
    expect(validateLayout(level.layout)).toEqual([]);
    expect(level.layout.length).toBeLessThanOrEqual(6);
    expect(level.layout[0].length).toBeLessThanOrEqual(6);
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
    for (const [cell, pos] of Object.entries(level.hints ?? {})) {
      expect(open.has(cell as never)).toBe(true);
      expect(POS).toContain(pos);
    }
  });

  it('deals only dictionary words and wildcards from its deck', () => {
    for (const word of level.deck ?? []) expect(word === WILDCARD || isWord(word)).toBe(true);
  });

  it('has rising star thresholds and sensible bonus objectives', () => {
    const [one, two, three] = starThresholds(level);
    expect(one).toBeGreaterThan(0);
    expect(two).toBeGreaterThan(one);
    expect(three).toBeGreaterThan(two);
    for (const objective of level.objectives ?? []) {
      expect(objective.points).toBeGreaterThan(0);
    }
  });

  it('starts a game, with no line made entirely of anchors', () => {
    const state = createGame(level);
    for (const entry of state.entries) expect(entryWords(state, entry)).toBeNull();
  });
});

describe('levels', () => {
  it('have unique ids, names and seeds', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(LEVELS.length);
    expect(new Set(LEVELS.map((l) => l.seed)).size).toBe(LEVELS.length);
  });

  it('number over a hundred, starting with the tutorial', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(100);
    expect(LEVELS.slice(0, TUTORIAL.length)).toEqual(TUTORIAL);
  });

  it('get harder: bigger boards and higher targets band by band', () => {
    const generated = LEVELS.slice(TUTORIAL.length);
    const bandOf = (index: number) =>
      [...LEVEL_BANDS].reverse().find((b) => index + TUTORIAL.length + 1 >= b.from)!.name;
    const average = (name: string, f: (l: (typeof LEVELS)[number]) => number) => {
      const levels = generated.filter((_, i) => bandOf(i) === name);
      return levels.reduce((sum, l) => sum + f(l), 0) / levels.length;
    };
    for (let i = 1; i < LEVEL_BANDS.length; i++) {
      const [before, after] = [LEVEL_BANDS[i - 1].name, LEVEL_BANDS[i].name];
      expect(average(after, (l) => extractEntries(l.layout).length)).toBeGreaterThan(
        average(before, (l) => extractEntries(l.layout).length),
      );
      expect(average(after, (l) => starThresholds(l)[0])).toBeGreaterThan(
        average(before, (l) => starThresholds(l)[0]),
      );
    }
  });
});

describe.each(TUTORIAL.map((level) => [level.id, level] as const))('tutorial %s', (_, level) => {
  it('can be cleared with the hand its deck deals', () => {
    const run = playLevel(level, 'careful');
    expect(run.solved).toBe(true);
    expect(run.score).toBeGreaterThanOrEqual(starThresholds(level)[0]);
  });

  it('has an opening line from the owl', () => {
    expect(level.intro).toBeTruthy();
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
