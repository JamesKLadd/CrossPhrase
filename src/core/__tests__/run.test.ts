import { createGame, gameReducer, pendingJudgeEntries, type GameAction, type GameState } from '../game';
import { playLevel } from '../levelBot';
import { builtinJudge, parseRun, replayRun, runActionFor, type RunAction } from '../run';
import type { LevelDef } from '../types';
import { TUTORIAL } from '../../data/tutorial';

const level = TUTORIAL[0];

/** The bot's moves on a level, plus a submit, and the game they lead to. */
function botRun(def: LevelDef): { actions: RunAction[]; state: GameState } {
  const actions: RunAction[] = [...playLevel(def, 'careful').moves, { type: 'submit' }];
  let state = createGame(def);
  for (const action of actions) {
    if (action.type === 'submit') {
      const before = state;
      state = gameReducer(state, { type: 'submitStart' });
      state = gameReducer(state, { type: 'submitResult', verdicts: builtinJudge(pendingJudgeEntries(state)) });
      expect(runActionFor({ type: 'submitResult', verdicts: [] }, before, state)).toEqual({ type: 'submit' });
    } else {
      const next = gameReducer(state, action as GameAction);
      expect(runActionFor(action as GameAction, state, next)).toEqual(action);
      state = next;
    }
  }
  return { actions, state };
}

describe('runs', () => {
  it('replay to the same game', () => {
    const { actions, state } = botRun(level);
    expect(state.phase).toBe('won');
    const replay = replayRun(level, actions, builtinJudge);
    expect(replay.error).toBeNull();
    expect(replay.state.board).toEqual(state.board);
    expect(replay.state.lastResult).toEqual(state.lastResult);
    expect(actions.filter((a) => a.type === 'submit')).toHaveLength(1);
  });

  it('reject moves the deal never allowed', () => {
    const replay = replayRun(level, [{ type: 'place', tileId: 999, cell: '0,0' }], builtinJudge);
    expect(replay.error).toBe("move 1 isn't allowed");
    expect(replayRun(level, [{ type: 'submit' }], builtinJudge).error).toMatch(/can't be submitted/);
  });

  it("don't log moves that changed nothing, or submits that weren't counted", () => {
    const state = createGame(level);
    expect(runActionFor({ type: 'remove', cell: '0,0' }, state, state)).toBeNull();
    const judging = gameReducer(state, { type: 'submitStart' });
    expect(runActionFor({ type: 'submitError' }, judging, state)).toBeNull();
  });

  it('count moves after the game ended, which only happens when judges disagree', () => {
    const { actions } = botRun(level);
    const replay = replayRun(level, [...actions, { type: 'remove', cell: '0,1' }], builtinJudge);
    expect(replay.error).toBeNull();
    expect(replay.extraMoves).toBe(1);
  });
});

describe('parseRun', () => {
  it('accepts well-formed moves', () => {
    expect(
      parseRun([
        { type: 'place', tileId: 3, cell: '0,1' },
        { type: 'place', tileId: 4, cell: '1,0', word: 'nebula' },
        { type: 'move', from: '0,1', to: '0,2' },
        { type: 'remove', cell: '0,2' },
        { type: 'swap', tileId: 5 },
        { type: 'submit' },
      ]),
    ).toHaveLength(6);
  });

  it('rejects anything else', () => {
    expect(parseRun('nope')).toBe('actions must be a list');
    expect(parseRun([{ type: 'place', tileId: -1, cell: '0,1' }])).toBe('action 1 is malformed');
    expect(parseRun([{ type: 'move', from: 'x', to: '0,1' }])).toBe('action 1 is malformed');
    expect(parseRun([{ type: 'submitResult', verdicts: [] }])).toBe('action 1 is malformed');
    expect(parseRun(Array(601).fill({ type: 'submit' }))).toBe('too many actions');
  });
});
