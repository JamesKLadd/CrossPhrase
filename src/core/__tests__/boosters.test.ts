import { createGame, entryWords, gameReducer, pendingJudgeEntries, submitLimit, type GameAction, type GameState } from '../game';
import { hintLine } from '../levelBot';
import { builtinJudge, parseRun, replayRun, type RunAction } from '../run';
import { WILDCARD, type CellKey, type LevelDef, type Verdict } from '../types';
import { TUTORIAL } from '../../data/tutorial';

const level: LevelDef = {
  id: 'test',
  name: 'Test',
  theme: 'breakfast',
  layout: ['....', '.###', '.###', '.###'],
  swaps: 1,
  stars: [5, 10, 15],
  seed: 77,
};

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);

function fill(state: GameState): GameState {
  for (const cell of Object.keys(state.board) as CellKey[]) {
    if (!state.board[cell]) state = gameReducer(state, { type: 'place', tileId: state.hand[0].id, cell });
  }
  return state;
}

const rejectAll = (state: GameState): Verdict[] =>
  pendingJudgeEntries(state).map((e) => ({ entryId: e.id, valid: false, tier: 'invalid', reading: '', reason: 'no', quip: '' }));

/** Fills the board with fresh words and fails a submit, until the level is lost. */
function loseLevel(state: GameState): GameState {
  while (state.phase === 'playing') {
    for (const cell of Object.keys(state.board) as CellKey[]) {
      if (state.board[cell]) state = gameReducer(state, { type: 'remove', cell });
    }
    // Fresh words from the back of the hand, so every submit has new phrases.
    state = fill({ ...state, hand: state.hand.slice(-4) });
    state = run(state, { type: 'submitStart' });
    state = gameReducer(state, { type: 'submitResult', verdicts: rejectAll(state) });
  }
  return state;
}

describe('boosters', () => {
  it('add swaps', () => {
    const state = run(createGame(level), { type: 'addSwaps', count: 2 });
    expect(state.swapsLeft).toBe(3);
    expect(state.boosts).toBe(1);
    expect(run(createGame(level), { type: 'addSwaps', count: 0 }).boosts).toBe(0);
  });

  it('turn a hand word into a wildcard', () => {
    const start = createGame(level);
    const tile = start.hand[2];
    const state = run(start, { type: 'makeWildcard', tileId: tile.id });
    expect(state.hand[2]).toEqual({ id: tile.id, word: WILDCARD, wildcard: true });
    // An unknown tile, or one that's already a wildcard, changes nothing.
    expect(run(state, { type: 'makeWildcard', tileId: tile.id })).toBe(state);
    expect(run(state, { type: 'makeWildcard', tileId: 999 })).toBe(state);
  });

  it('give one more submit after a loss, carrying on where it stopped', () => {
    const lost = loseLevel(createGame(level));
    expect(lost.phase).toBe('lost');
    const again = run(lost, { type: 'extraSubmit' });
    expect(again.phase).toBe('playing');
    expect(submitLimit(again)).toBe(4);
    expect(again.board).toEqual(lost.board);
    expect(again.failedSubmits).toBe(3);
    // Only a lost game can buy one.
    expect(run(createGame(level), { type: 'extraSubmit' }).phase).toBe('playing');
    expect(submitLimit(run(createGame(level), { type: 'extraSubmit' }))).toBe(3);
  });

  it('replay with the extra submit, but never count on leaderboards', () => {
    const actions: RunAction[] = [{ type: 'addSwaps', count: 2 }];
    expect(replayRun(level, actions, builtinJudge).state.swapsLeft).toBe(3);
    expect(parseRun(actions)).toMatch(/boosted/);
    expect(parseRun([{ type: 'extraSubmit' }])).toMatch(/boosted/);
  });
});

describe('hints', () => {
  it('fill a line the built-in judge passes, from the hand', () => {
    const start = createGame(TUTORIAL[0]);
    const hint = hintLine(start);
    expect(hint).not.toBeNull();
    const state = run(start, { type: 'hint', places: hint!.places });
    expect(state.boosts).toBe(1);
    const words = entryWords(state, hint!.entry)!;
    expect(words).not.toBeNull();
    expect(builtinJudge([{ id: hint!.entry.id, words }])[0].valid).toBe(true);
  });

  it('only place plain hand words into empty cells', () => {
    const start = createGame(TUTORIAL[0]);
    const hint = hintLine(start)!;
    const placed = run(start, { type: 'hint', places: hint.places });
    // The same placements again: the cells are full now.
    expect(run(placed, { type: 'hint', places: hint.places })).toBe(placed);
    expect(run(start, { type: 'hint', places: [] })).toBe(start);
  });

  it('give up when the board is full', () => {
    expect(hintLine(fill(createGame(level)))).toBeNull();
  });
});
