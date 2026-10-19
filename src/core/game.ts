import { HAND_SIZE, MAX_SUBMITS } from './config';
import { buildPool, drawWord, type DrawPool } from './draw';
import { extractEntries, openCells } from './grid';
import { scoreSubmission } from './scoring';
import type { CellKey, Entry, JudgeEntry, LevelDef, SubmitResult, Tile, Verdict } from './types';

export type GamePhase = 'playing' | 'judging' | 'won' | 'lost';

/** A verdict as cached by phrase, independent of which entry produced it. */
export type CachedVerdict = Omit<Verdict, 'entryId'>;

export interface GameState {
  level: LevelDef;
  entries: Entry[];
  /** Every open cell; null when empty. Anchors are tiles with `anchor: true`. */
  board: Record<CellKey, Tile | null>;
  hand: Tile[];
  rng: number;
  nextTileId: number;
  swapsLeft: number;
  submitsUsed: number;
  failedSubmits: number;
  /**
   * Verdicts by phrase key. Resubmits only send phrases that aren't cached
   * yet, which keeps verdicts consistent and saves judge calls.
   */
  verdictCache: Record<string, CachedVerdict>;
  phase: GamePhase;
  lastResult: SubmitResult | null;
}

export type GameAction =
  | { type: 'place'; tileId: number; cell: CellKey }
  | { type: 'move'; from: CellKey; to: CellKey }
  | { type: 'remove'; cell: CellKey }
  | { type: 'swap'; tileId: number }
  | { type: 'submitStart' }
  | { type: 'submitResult'; verdicts: Verdict[] }
  | { type: 'submitError' }
  | { type: 'restart' };

const pools = new Map<string, DrawPool>();
function poolFor(theme: string): DrawPool {
  let pool = pools.get(theme);
  if (!pool) {
    pool = buildPool(theme);
    pools.set(theme, pool);
  }
  return pool;
}

export function createGame(level: LevelDef): GameState {
  const board: Record<CellKey, Tile | null> = {};
  for (const cell of openCells(level.layout)) board[cell] = null;

  let nextTileId = 1;
  for (const [cell, word] of Object.entries(level.anchors ?? {})) {
    if (!(cell in board)) throw new Error(`Anchor ${cell} in ${level.id} is not an open cell`);
    board[cell as CellKey] = { id: nextTileId++, word: word!, anchor: true };
  }

  const state: GameState = {
    level,
    entries: extractEntries(level.layout),
    board,
    hand: [],
    rng: level.seed,
    nextTileId,
    swapsLeft: level.swaps,
    submitsUsed: 0,
    failedSubmits: 0,
    verdictCache: {},
    phase: 'playing',
    lastResult: null,
  };
  return refillHand(state);
}

function drawTile(state: GameState): [Tile, GameState] {
  const [word, rng] = drawWord(poolFor(state.level.theme), state.rng);
  const tile = { id: state.nextTileId, word };
  return [tile, { ...state, rng, nextTileId: state.nextTileId + 1 }];
}

/** Draws until the hand holds HAND_SIZE tiles. A larger hand is left alone. */
function refillHand(state: GameState): GameState {
  let next = state;
  const hand = [...state.hand];
  while (hand.length < HAND_SIZE) {
    let tile: Tile;
    [tile, next] = drawTile(next);
    hand.push(tile);
  }
  return { ...next, hand };
}

export function phraseKey(words: string[]): string {
  return words.join(' ');
}

/** The words currently in an entry, or null if any of its cells is empty. */
export function entryWords(state: GameState, entry: Entry): string[] | null {
  const words: string[] = [];
  for (const cell of entry.cells) {
    const tile = state.board[cell];
    if (!tile) return null;
    words.push(tile.word);
  }
  return words;
}

export function isBoardFull(state: GameState): boolean {
  return Object.values(state.board).every((tile) => tile !== null);
}

/** The cached verdict for an entry's current words, if it has been judged. */
export function verdictFor(state: GameState, entry: Entry): CachedVerdict | null {
  const words = entryWords(state, entry);
  return words ? (state.verdictCache[phraseKey(words)] ?? null) : null;
}

/** Entries that still need judging (filled, and their phrase isn't cached). */
export function pendingJudgeEntries(state: GameState): JudgeEntry[] {
  const pending: JudgeEntry[] = [];
  const seen = new Set<string>();
  for (const entry of state.entries) {
    const words = entryWords(state, entry);
    if (!words) continue;
    const key = phraseKey(words);
    if (key in state.verdictCache || seen.has(key)) continue;
    seen.add(key);
    pending.push({ id: entry.id, words });
  }
  return pending;
}

/** Scores the board from cached verdicts, or null if any entry is unjudged. */
function scoreFromCache(state: GameState, cache: Record<string, CachedVerdict>): SubmitResult | null {
  const wordsByEntry: Record<string, string[]> = {};
  const verdicts: Record<string, Verdict> = {};
  for (const entry of state.entries) {
    const words = entryWords(state, entry);
    const cached = words && cache[phraseKey(words)];
    if (!words || !cached) return null;
    wordsByEntry[entry.id] = words;
    verdicts[entry.id] = { entryId: entry.id, ...cached };
  }
  return scoreSubmission(state.level, state.entries, wordsByEntry, verdicts, state.failedSubmits);
}

/**
 * True when there is something new to judge. A board made only of already
 * judged phrases can only be submitted if it would pass, so a resubmit can't
 * burn one of the player's limited submits for nothing.
 */
export function hasNewPhrases(state: GameState): boolean {
  return pendingJudgeEntries(state).length > 0 || (scoreFromCache(state, state.verdictCache)?.passed ?? true);
}

export function canSubmit(state: GameState): boolean {
  return (
    state.phase === 'playing' &&
    state.submitsUsed < MAX_SUBMITS &&
    isBoardFull(state) &&
    hasNewPhrases(state)
  );
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'restart') return createGame(state.level);

  if (state.phase === 'judging') {
    if (action.type === 'submitResult') return applyVerdicts(state, action.verdicts);
    if (action.type === 'submitError') return { ...state, phase: 'playing' };
    return state;
  }
  if (state.phase !== 'playing') return state;

  switch (action.type) {
    case 'place': {
      const index = state.hand.findIndex((t) => t.id === action.tileId);
      const target = state.board[action.cell];
      if (index === -1 || target === undefined || target?.anchor) return state;
      const hand = [...state.hand];
      // A tile already in the cell goes back to the hand in the placed tile's slot.
      if (target) hand.splice(index, 1, target);
      else hand.splice(index, 1);
      const board = { ...state.board, [action.cell]: state.hand[index] };
      return refillHand({ ...state, hand, board });
    }

    case 'move': {
      const tile = state.board[action.from];
      const target = state.board[action.to];
      if (!tile || tile.anchor || target === undefined || target?.anchor) return state;
      if (action.from === action.to) return state;
      return { ...state, board: { ...state.board, [action.from]: target, [action.to]: tile } };
    }

    case 'remove': {
      const tile = state.board[action.cell];
      if (!tile || tile.anchor) return state;
      return {
        ...state,
        board: { ...state.board, [action.cell]: null },
        hand: [...state.hand, tile],
      };
    }

    case 'swap': {
      const index = state.hand.findIndex((t) => t.id === action.tileId);
      if (index === -1 || state.swapsLeft <= 0) return state;
      const [tile, next] = drawTile(state);
      const hand = [...state.hand];
      hand[index] = tile;
      return { ...next, hand, swapsLeft: state.swapsLeft - 1 };
    }

    case 'submitStart':
      return canSubmit(state) ? { ...state, phase: 'judging' } : state;

    default:
      return state;
  }
}

function applyVerdicts(state: GameState, verdicts: Verdict[]): GameState {
  const byId = new Map(verdicts.map((v) => [v.entryId, v]));
  const verdictCache = { ...state.verdictCache };
  for (const entry of state.entries) {
    const fresh = byId.get(entry.id);
    if (fresh) {
      const { entryId: _, ...cached } = fresh;
      verdictCache[phraseKey(entryWords(state, entry)!)] = cached;
    }
  }

  const result = scoreFromCache(state, verdictCache);
  // A missing verdict means the judge skipped an entry; don't charge a submit for that.
  if (!result) return { ...state, verdictCache, phase: 'playing' };
  const submitsUsed = state.submitsUsed + 1;
  if (result.passed) {
    return { ...state, verdictCache, submitsUsed, lastResult: result, phase: 'won' };
  }
  return {
    ...state,
    verdictCache,
    submitsUsed,
    failedSubmits: state.failedSubmits + 1,
    lastResult: result,
    phase: submitsUsed >= MAX_SUBMITS ? 'lost' : 'playing',
  };
}
