import { HAND_SIZE, MAX_SUBMITS } from '../config';
import {
  canSubmit,
  createGame,
  gameReducer,
  objectiveProgress,
  pendingJudgeEntries,
  verdictFor,
  type GameAction,
  type GameState,
} from '../game';
import { WILDCARD, type CellKey, type LevelDef, type Tier, type Verdict } from '../types';

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

describe('reconcile (offline verdicts re-checked online)', () => {
  function playOffline(tier: Tier): GameState {
    let state = fillBoard(createGame(level));
    state = gameReducer(state, { type: 'submitStart' });
    const verdicts = judgeAll(state, tier).map((v) => ({ ...v, provisional: true }));
    return gameReducer(state, { type: 'submitResult', verdicts });
  }

  const phrases = (state: GameState) =>
    state.entries.map((e) => (entryWordsOf(state, e.id) ?? []).join(' '));
  const entryWordsOf = (state: GameState, id: string) =>
    state.entries.find((e) => e.id === id)!.cells.map((c) => state.board[c]!.word);
  const real = (phrase: string, tier: Tier) => ({
    phrase,
    verdict: { valid: tier !== 'invalid', tier, reading: phrase, reason: '', quip: '' },
  });

  it('upgrades a provisional verdict and rescores a won level', () => {
    const state = playOffline('ok');
    expect(state.phase).toBe('won');
    const before = state.lastResult!.total;
    const next = gameReducer(state, {
      type: 'reconcile',
      verdicts: phrases(state).map((p) => real(p, 'poetic')),
    });
    expect(verdictFor(next, next.entries[0])).toMatchObject({ tier: 'poetic', provisional: false });
    expect(next.lastResult!.total).toBe(before * 2);
  });

  it('never revokes a provisional pass', () => {
    const state = playOffline('ok');
    const next = gameReducer(state, {
      type: 'reconcile',
      verdicts: phrases(state).map((p) => real(p, 'invalid')),
    });
    expect(verdictFor(next, next.entries[0])).toMatchObject({ tier: 'ok', provisional: false });
    expect(next.lastResult).toEqual(state.lastResult);
  });

  it('turns a provisional rejection into a pass mid-level', () => {
    const state = playOffline('invalid');
    expect(state.phase).toBe('playing');
    expect(canSubmit(state)).toBe(false);
    const next = gameReducer(state, {
      type: 'reconcile',
      verdicts: phrases(state).map((p) => real(p, 'great')),
    });
    // Every phrase is now judged valid, so the same board may be resubmitted.
    expect(canSubmit(next)).toBe(true);
  });

  it('ignores verdicts for phrases that were not provisional', () => {
    let state = fillBoard(createGame(level));
    state = gameReducer(state, { type: 'submitStart' });
    state = gameReducer(state, { type: 'submitResult', verdicts: judgeAll(state, 'ok') });
    const next = gameReducer(state, {
      type: 'reconcile',
      verdicts: phrases(state).map((p) => real(p, 'poetic')),
    });
    expect(next).toBe(state);
  });
});

describe('scripted decks', () => {
  const scripted: LevelDef = {
    ...level,
    anchors: {},
    deck: ['the', 'golden', 'toast', 'chef', 'sleepy', 'hot', 'tea', 'muffin', 'jam'],
  };

  it('deals the deck in order, then draws at random', () => {
    let state = createGame(scripted);
    expect(state.hand.map((t) => t.word)).toEqual(scripted.deck!.slice(0, HAND_SIZE));
    state = gameReducer(state, { type: 'place', tileId: state.hand[0].id, cell: '0,0' });
    expect(state.hand[HAND_SIZE - 1].word).toBe('muffin');
    state = gameReducer(state, { type: 'swap', tileId: state.hand[0].id });
    expect(state.hand[0].word).toBe('jam');
    expect(state.deckIndex).toBe(scripted.deck!.length);
    state = gameReducer(state, { type: 'swap', tileId: state.hand[0].id });
    expect(state.rng).not.toBe(scripted.seed);
  });
});

describe('wildcards', () => {
  const wild: LevelDef = { ...level, anchors: {}, deck: ['*', 'the', 'golden', 'toast', 'chef', 'tea', 'hot'] };
  const wildcard = (state: GameState) => state.hand.find((t) => t.wildcard)!;

  it('need a dictionary word to be placed', () => {
    const state = createGame(wild);
    const tile = wildcard(state);
    expect(tile.word).toBe(WILDCARD);
    expect(gameReducer(state, { type: 'place', tileId: tile.id, cell: '0,0' })).toBe(state);
    expect(gameReducer(state, { type: 'place', tileId: tile.id, cell: '0,0', word: 'zzz' })).toBe(state);
    expect(gameReducer(state, { type: 'place', tileId: tile.id, cell: '0,0', word: '*' })).toBe(state);
    const next = gameReducer(state, { type: 'place', tileId: tile.id, cell: '0,0', word: 'nebula' });
    expect(next.board['0,0']).toEqual({ id: tile.id, word: 'nebula', wildcard: true });
  });

  it('forget their word when they go back to the hand', () => {
    let state = createGame(wild);
    const tile = wildcard(state);
    state = gameReducer(state, { type: 'place', tileId: tile.id, cell: '0,0', word: 'nebula' });
    const removed = gameReducer(state, { type: 'remove', cell: '0,0' });
    expect(wildcard(removed)).toEqual({ id: tile.id, word: WILDCARD, wildcard: true });
    const displaced = gameReducer(state, { type: 'place', tileId: state.hand[0].id, cell: '0,0' });
    expect(wildcard(displaced)).toEqual({ id: tile.id, word: WILDCARD, wildcard: true });
  });

  it('turn up now and then in random draws', () => {
    let wildcards = 0;
    for (let seed = 1; seed <= 300; seed++) {
      wildcards += createGame({ ...level, seed }).hand.filter((t) => t.wildcard).length;
    }
    // 2100 draws at 1.5% is about 32.
    expect(wildcards).toBeGreaterThan(10);
    expect(wildcards).toBeLessThan(70);
  });
});

describe('bonus objectives', () => {
  it('add their points to a winning submit', () => {
    const withGoal: LevelDef = { ...level, objectives: [{ kind: 'swapsLeft', count: 2, points: 7 }] };
    let state = fillBoard(createGame(withGoal));
    state = gameReducer(state, { type: 'submitStart' });
    state = gameReducer(state, { type: 'submitResult', verdicts: judgeAll(state, 'ok') });
    expect(state.lastResult!.bonus).toBe(7);
    expect(state.lastResult!.total).toBe(state.lastResult!.raw + 7);
    expect(state.lastResult!.objectives).toEqual([
      { objective: withGoal.objectives![0], met: true, have: 2, need: 2 },
    ]);
  });

  it('report progress while playing', () => {
    const withGoal: LevelDef = { ...level, objectives: [{ kind: 'swapsLeft', count: 2, points: 7 }] };
    let state = createGame(withGoal);
    expect(objectiveProgress(state)[0]).toMatchObject({ met: true, have: 2 });
    state = gameReducer(state, { type: 'swap', tileId: state.hand[0].id });
    expect(objectiveProgress(state)[0]).toMatchObject({ met: false, have: 1 });
  });
});
