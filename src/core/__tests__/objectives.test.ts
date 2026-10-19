import { extractEntries } from '../grid';
import { crossingCells, describeObjective, evaluateObjectives, type ObjectiveContext } from '../objectives';
import { wordValue } from '../scoring';
import type { CellKey, LevelDef, Objective, Tile } from '../types';

// 1A: 0,0 0,1 0,2 / 1D: 0,0 1,0 2,0. The corner is the only crossing.
const layout = ['...', '.##', '.##'];
const entries = extractEntries(layout);

function context(
  words: Partial<Record<CellKey, string>>,
  objective: Objective,
  extra: Partial<ObjectiveContext> = {},
): ObjectiveContext {
  const board: Record<CellKey, Tile | null> = {};
  let id = 1;
  for (const cell of entries.flatMap((e) => e.cells)) {
    const word = words[cell];
    board[cell] = word ? { id: id++, word } : null;
  }
  const level: LevelDef = { id: 't', name: 'T', theme: 'night-sky', layout, swaps: 3, seed: 1, objectives: [objective] };
  return { level, entries, board, tiers: {}, swapsLeft: 3, ...extra };
}

const check = (ctx: ObjectiveContext) => evaluateObjectives(ctx)[0];

describe('bonus objectives', () => {
  it('long word: the longest placed word', () => {
    const goal: Objective = { kind: 'longWord', letters: 9, points: 5 };
    expect(check(context({ '0,0': 'the', '0,1': 'moon' }, goal))).toMatchObject({ met: false, have: 4, need: 9 });
    expect(check(context({ '0,1': 'telescope' }, goal))).toMatchObject({ met: true, have: 9 });
  });

  it("don't count anchors", () => {
    const ctx = context({}, { kind: 'longWord', letters: 9, points: 5 });
    ctx.board['0,1'] = { id: 99, word: 'telescope', anchor: true };
    expect(check(ctx).met).toBe(false);
  });

  it('great lines: counts lines judged great or poetic', () => {
    const goal: Objective = { kind: 'greatLines', count: 2, points: 5 };
    expect(check(context({}, goal, { tiers: { '1A': 'great', '1D': 'ok' } }))).toMatchObject({ have: 1, met: false });
    expect(check(context({}, goal, { tiers: { '1A': 'great', '1D': 'poetic' } })).met).toBe(true);
  });

  it('theme words: counts placed words from the theme pool', () => {
    const goal: Objective = { kind: 'themeWords', count: 2, points: 5 };
    expect(check(context({ '0,0': 'the', '0,1': 'moon', '0,2': 'glows' }, goal))).toMatchObject({ have: 2, met: true });
    expect(check(context({ '0,0': 'the', '0,1': 'toast' }, goal))).toMatchObject({ have: 0 });
  });

  it('swaps left', () => {
    const goal: Objective = { kind: 'swapsLeft', count: 2, points: 5 };
    expect(check(context({}, goal, { swapsLeft: 2 })).met).toBe(true);
    expect(check(context({}, goal, { swapsLeft: 1 })).met).toBe(false);
  });

  it('rare crossing: only words on a crossing count', () => {
    const goal: Objective = { kind: 'rareCrossing', value: wordValue('nebula'), points: 5 };
    expect(crossingCells(entries)).toEqual(new Set(['0,0']));
    expect(check(context({ '0,2': 'nebula' }, goal)).met).toBe(false);
    expect(check(context({ '0,0': 'nebula' }, goal)).met).toBe(true);
  });

  it('read naturally', () => {
    expect(describeObjective({ kind: 'longWord', letters: 8, points: 5 })).toBe('Use a word of 8+ letters');
    expect(describeObjective({ kind: 'swapsLeft', count: 1, points: 5 })).toBe('Finish with a swap to spare');
    expect(describeObjective({ kind: 'greatLines', count: 2, points: 5 })).toBe(
      'Get 2 lines judged Great or better',
    );
  });
});
