import {
  canSubmit,
  createGame,
  gameReducer,
  pendingJudgeEntries,
  type BoostAction,
  type GameAction,
  type GameState,
} from './game';
import { localVerdict } from './localJudge';
import type { CellKey, JudgeEntry, LevelDef, Verdict } from './types';

// A run is the list of moves a player made on a level, from its deal. Because
// the deal is seeded and the reducer is pure, replaying the moves rebuilds the
// exact game, which is how a daily puzzle resumes after the app closes and
// how the leaderboard server checks a score without trusting the phone.

export type RunAction =
  | { type: 'place'; tileId: number; cell: CellKey; word?: string }
  | { type: 'move'; from: CellKey; to: CellKey }
  | { type: 'remove'; cell: CellKey }
  | { type: 'swap'; tileId: number }
  /** A submit that was judged and counted. */
  | { type: 'submit' }
  | BoostAction;

export type RunJudge = (entries: JudgeEntry[]) => Verdict[];

/** The built-in judge as a run judge: deterministic, so anyone replaying a run gets the same verdicts. */
export const builtinJudge: RunJudge = (entries) => entries.map((entry) => localVerdict(entry));

export interface Replay {
  state: GameState;
  /** Why the replay stopped early, or null if every move applied. */
  error: string | null;
  /** Moves left over after the game ended (only possible when judges disagree). */
  extraMoves: number;
}

/** Replays a run from the level's deal, judging each submit with `judge`. Stops at the first illegal move. */
export function replayRun(level: LevelDef, actions: readonly RunAction[], judge: RunJudge): Replay {
  let state = createGame(level);
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const carriesOn = state.phase === 'lost' && action.type === 'extraSubmit';
    if ((state.phase === 'won' || state.phase === 'lost') && !carriesOn) {
      return { state, error: null, extraMoves: actions.length - i };
    }
    if (action.type === 'submit') {
      if (!canSubmit(state)) return { state, error: `move ${i + 1}: that board can't be submitted`, extraMoves: 0 };
      state = gameReducer(state, { type: 'submitStart' });
      state = gameReducer(state, { type: 'submitResult', verdicts: judge(pendingJudgeEntries(state)) });
      continue;
    }
    const next = gameReducer(state, action);
    if (next === state) return { state, error: `move ${i + 1} isn't allowed`, extraMoves: 0 };
    state = next;
  }
  return { state, error: null, extraMoves: 0 };
}

/**
 * The move a game action adds to the run log, if any: board moves that
 * changed something, and submits once they're judged and counted.
 */
export function runActionFor(action: GameAction, before: GameState, after: GameState): RunAction | null {
  if (after === before) return null;
  switch (action.type) {
    case 'place':
      return action.word === undefined
        ? { type: 'place', tileId: action.tileId, cell: action.cell }
        : { type: 'place', tileId: action.tileId, cell: action.cell, word: action.word };
    case 'move':
    case 'remove':
    case 'swap':
    case 'addSwaps':
    case 'makeWildcard':
    case 'hint':
    case 'extraSubmit':
      return action;
    case 'submitResult':
      return after.submitsUsed > before.submitsUsed ? { type: 'submit' } : null;
    default:
      return null;
  }
}

const CELL = /^\d{1,2},\d{1,2}$/;
const MAX_ACTIONS = 600;

/**
 * Checks an untrusted run log (e.g. from a request body). Returns the moves,
 * or what's wrong. Boosters are refused: boosted games don't count on
 * leaderboards.
 */
export function parseRun(value: unknown): RunAction[] | string {
  if (!Array.isArray(value)) return 'actions must be a list';
  if (value.length > MAX_ACTIONS) return 'too many actions';
  const actions: RunAction[] = [];
  for (const [i, raw] of value.entries()) {
    const a = raw as Record<string, unknown>;
    const bad = `action ${i + 1} is malformed`;
    if (typeof a !== 'object' || a === null) return bad;
    const cell = (v: unknown) => typeof v === 'string' && CELL.test(v);
    const id = (v: unknown) => Number.isInteger(v) && (v as number) > 0 && (v as number) < 100_000;
    switch (a.type) {
      case 'place':
        if (!id(a.tileId) || !cell(a.cell)) return bad;
        if (a.word !== undefined && (typeof a.word !== 'string' || a.word.length > 30)) return bad;
        actions.push(
          a.word === undefined
            ? { type: 'place', tileId: a.tileId as number, cell: a.cell as CellKey }
            : { type: 'place', tileId: a.tileId as number, cell: a.cell as CellKey, word: a.word as string },
        );
        break;
      case 'move':
        if (!cell(a.from) || !cell(a.to)) return bad;
        actions.push({ type: 'move', from: a.from as CellKey, to: a.to as CellKey });
        break;
      case 'remove':
        if (!cell(a.cell)) return bad;
        actions.push({ type: 'remove', cell: a.cell as CellKey });
        break;
      case 'swap':
        if (!id(a.tileId)) return bad;
        actions.push({ type: 'swap', tileId: a.tileId as number });
        break;
      case 'submit':
        actions.push({ type: 'submit' });
        break;
      case 'addSwaps':
      case 'makeWildcard':
      case 'hint':
      case 'extraSubmit':
        return "boosted games don't count on leaderboards";
      default:
        return bad;
    }
  }
  return actions;
}
