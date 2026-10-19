import { HAND_SIZE, MAX_SUBMITS } from '../config';
import {
  canSubmit,
  createGame,
  gameReducer,
  pendingJudgeEntries,
  verdictFor,
  type GameAction,
  type GameState,
} from '../game';
import type { CellKey, LevelDef, Tier, Verdict } from '../types';

const level: LevelDef = {
  id: 'test',
  name: 'Test',
  theme: 'breakfast',
  layout: ['...', '.##', '.##'],
  anchors: { '2,0': 'toast' },
  swaps: 2,
  stars: [5, 10, 15],
  seed: 1234,
};

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);

function fillBoard(state: GameState): GameState {
  for (const cell of Object.keys(state.board) as CellKey[]) {
    if (!state.board[cell]) {
      state = gameReducer(state, { type: 'place', tileId: state.hand[0].id, cell });
    }
  }
  return state;
}

function judgeAll(state: GameState, tier: Tier): Verdict[] {
  return pendingJudgeEntries(state).map((e) => ({
    entryId: e.id,
    valid: tier !== 'invalid',
    tier,
    reading: e.words.join(' '),
    reason: '',
    quip: '',
  }));
}

describe('createGame', () => {
  it('deals a full hand and places anchors', () => {
    const state = createGame(level);
    expect(state.hand).toHaveLength(HAND_SIZE);
    expect(state.board['2,0']).toMatchObject({ word: 'toast', anchor: true });
    expect(state.entries.map((e) => e.id)).toEqual(['1A', '1D']);
  });

  it('is deterministic for a level seed', () => {
    expect(createGame(level).hand).toEqual(createGame(level).hand);
  });
});

describe('placing and moving', () => {
  it('draws a replacement when a word is placed', () => {
    const state = createGame(level);
    const tile = state.hand[0];
    const next = gameReducer(state, { type: 'place', tileId: tile.id, cell: '0,0' });
    expect(next.board['0,0']).toEqual(tile);
    expect(next.hand).toHaveLength(HAND_SIZE);
    expect(next.hand).not.toContainEqual(tile);
  });

  it('returns a displaced word to the hand without drawing', () => {
    let state = createGame(level);
    const first = state.hand[0];
    state = gameReducer(state, { type: 'place', tileId: first.id, cell: '0,0' });
    const second = state.hand[0];
    const next = gameReducer(state, { type: 'place', tileId: second.id, cell: '0,0' });
    expect(next.board['0,0']).toEqual(second);
    expect(next.hand[0]).toEqual(first);
    expect(next.nextTileId).toBe(state.nextTileId);
  });

  it('lets the hand grow past 7 when words are removed, with no extra draws', () => {
    let state = createGame(level);
    state = gameReducer(state, { type: 'place', tileId: state.hand[0].id, cell: '0,0' });
    state = gameReducer(state, { type: 'remove', cell: '0,0' });
    expect(state.hand).toHaveLength(HAND_SIZE + 1);
    const placed = gameReducer(state, { type: 'place', tileId: state.hand[0].id, cell: '0,1' });
    expect(placed.hand).toHaveLength(HAND_SIZE);
    expect(placed.nextTileId).toBe(state.nextTileId);
  });

  it('never moves, replaces or removes an anchor', () => {
    let state = createGame(level);
    state = gameReducer(state, { type: 'place', tileId: state.hand[0].id, cell: '0,0' });
    expect(run(state, { type: 'place', tileId: state.hand[0].id, cell: '2,0' })).toBe(state);
    expect(run(state, { type: 'move', from: '2,0', to: '0,1' })).toBe(state);
    expect(run(state, { type: 'move', from: '0,0', to: '2,0' })).toBe(state);
    expect(run(state, { type: 'remove', cell: '2,0' })).toBe(state);
  });

  it('swaps two placed words when moving onto an occupied cell', () => {
    let state = createGame(level);
    const [a, b] = state.hand;
    state = run(
      state,
      { type: 'place', tileId: a.id, cell: '0,0' },
      { type: 'place', tileId: b.id, cell: '0,1' },
      { type: 'move', from: '0,0', to: '0,1' },
    );
    expect(state.board['0,0']).toEqual(b);
    expect(state.board['0,1']).toEqual(a);
  });
});

describe('swaps', () => {
  it('replaces the tile in place and stops at the limit', () => {
    let state = createGame(level);
    const before = state.hand.map((t) => t.id);
    state = gameReducer(state, { type: 'swap', tileId: state.hand[3].id });
    expect(state.hand[3].id).not.toBe(before[3]);
    expect(state.hand.map((t) => t.id).filter((id, i) => id === before[i])).toHaveLength(6);
    state = gameReducer(state, { type: 'swap', tileId: state.hand[0].id });
    expect(state.swapsLeft).toBe(0);
    expect(gameReducer(state, { type: 'swap', tileId: state.hand[1].id })).toBe(state);
  });
});

describe('submitting', () => {
  it('only submits a full board', () => {
    const state = createGame(level);
    expect(gameReducer(state, { type: 'submitStart' })).toBe(state);
  });

  it('wins when every entry is valid and the score clears 1 star', () => {
    let state = fillBoard(createGame(level));
    state = gameReducer(state, { type: 'submitStart' });
    expect(state.phase).toBe('judging');
    state = gameReducer(state, { type: 'submitResult', verdicts: judgeAll(state, 'great') });
    expect(state.phase).toBe('won');
    expect(state.lastResult!.stars).toBeGreaterThan(0);
  });

  it('charges a submit and a penalty for a failed submission', () => {
    let state = fillBoard(createGame(level));
    state = run(state, { type: 'submitStart' });
    state = gameReducer(state, { type: 'submitResult', verdicts: judgeAll(state, 'invalid') });
    expect(state.phase).toBe('playing');
    expect(state.submitsUsed).toBe(1);
    expect(state.failedSubmits).toBe(1);
    expect(verdictFor(state, state.entries[0])?.tier).toBe('invalid');
  });

  it(`loses the level after ${MAX_SUBMITS} failed submissions`, () => {
    let state = fillBoard(createGame(level));
    const used = new Set([state.board['0,1']!.word]);
    for (let i = 0; i < MAX_SUBMITS; i++) {
      // Place a word not tried in this cell yet, so there is something new to judge.
      const fresh = state.hand.find((t) => !used.has(t.word))!;
      used.add(fresh.word);
      state = gameReducer(state, { type: 'place', tileId: fresh.id, cell: '0,1' });
      state = gameReducer(state, { type: 'submitStart' });
      state = gameReducer(state, { type: 'submitResult', verdicts: judgeAll(state, 'invalid') });
    }
    expect(state.phase).toBe('lost');
    expect(gameReducer(state, { type: 'submitStart' })).toBe(state);
  });

  it('only re-judges entries whose words changed', () => {
    let state = fillBoard(createGame(level));
    state = run(state, { type: 'submitStart' });
    state = gameReducer(state, { type: 'submitResult', verdicts: judgeAll(state, 'invalid') });
    // 0,2 is only in 1A, so 1D's cached verdict still applies.
    state = gameReducer(state, { type: 'place', tileId: state.hand[0].id, cell: '0,2' });
    expect(pendingJudgeEntries(state).map((e) => e.id)).toEqual(['1A']);
  });

  it('blocks resubmitting a board that was already judged and failed', () => {
    let state = fillBoard(createGame(level));
    state = run(state, { type: 'submitStart' });
    state = gameReducer(state, { type: 'submitResult', verdicts: judgeAll(state, 'invalid') });
    expect(canSubmit(state)).toBe(false);
    expect(gameReducer(state, { type: 'submitStart' })).toBe(state);
  });

  it('allows submitting previously judged phrases when they would now pass', () => {
    let state = fillBoard(createGame(level));
    state = run(state, { type: 'submitStart' });
    // Judge 1A great and 1D ok, but pretend 1D was skipped by the judge...
    const [first] = judgeAll(state, 'great');
    state = gameReducer(state, { type: 'submitResult', verdicts: [first] });
    expect(state.submitsUsed).toBe(0);
    // ...then judged on the next attempt. Everything is cached and passing now.
    state = run(state, { type: 'submitStart' });
    state = gameReducer(state, { type: 'submitResult', verdicts: judgeAll(state, 'great') });
    expect(state.phase).toBe('won');
  });

  it('does not charge a submit when judging errors out', () => {
    let state = fillBoard(createGame(level));
    state = run(state, { type: 'submitStart' }, { type: 'submitError' });
    expect(state.phase).toBe('playing');
    expect(state.submitsUsed).toBe(0);
  });

  it('ignores board changes while judging', () => {
    let state = fillBoard(createGame(level));
    state = gameReducer(state, { type: 'submitStart' });
    expect(gameReducer(state, { type: 'remove', cell: '0,0' })).toBe(state);
  });
});
