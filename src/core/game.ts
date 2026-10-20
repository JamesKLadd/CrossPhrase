import { HAND_SIZE, MAX_SUBMITS, WILDCARD_CHANCE } from './config';
import { buildPool, drawWord, type DrawPool } from './draw';
import { extractEntries, openCells } from './grid';
import { evaluateObjectives } from './objectives';
import { nextRandom } from './rng';
import { scoreSubmission } from './scoring';
import {
  WILDCARD,
  type CellKey,
  type Entry,
  type JudgeEntry,
  type LevelDef,
  type ObjectiveResult,
  type PhraseVerdict,
  type SubmitResult,
  type Tier,
  type Tile,
  type Verdict,
} from './types';
import { isWord } from './words';

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
  /** How many of the level's scripted deck words have been dealt. */
  deckIndex: number;
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
  /** Extra submits bought after running out (the "one more submit" booster). */
  bonusSubmits: number;
  /** Boosters used this game. Boosted games don't go on the leaderboards. */
  boosts: number;
}

export type GameAction =
  /** `word` is required when placing a wildcard: the dictionary word it becomes. */
  | { type: 'place'; tileId: number; cell: CellKey; word?: string }
  | { type: 'move'; from: CellKey; to: CellKey }
  | { type: 'remove'; cell: CellKey }
  | { type: 'swap'; tileId: number }
  | { type: 'submitStart' }
  | { type: 'submitResult'; verdicts: Verdict[] }
  | { type: 'submitError' }
  | { type: 'reconcile'; verdicts: PhraseVerdict[] }
  | { type: 'restart' }
  | BoostAction;

/** Boosters, bought with feathers (see src/core/economy.ts). Levels only. */
export type BoostAction =
  /** More swaps. */
  | { type: 'addSwaps'; count: number }
  /** Turns a hand word into a wildcard. */
  | { type: 'makeWildcard'; tileId: number }
  /** The owl fills a line: hand tiles into empty cells (found by `hintLine` in levelBot). */
  | { type: 'hint'; places: { tileId: number; cell: CellKey }[] }
  /** One more submit after a lost level, which carries on where it stopped. */
  | { type: 'extraSubmit' };

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
    deckIndex: 0,
    nextTileId,
    swapsLeft: level.swaps,
    submitsUsed: 0,
    failedSubmits: 0,
    verdictCache: {},
    phase: 'playing',
    lastResult: null,
    bonusSubmits: 0,
    boosts: 0,
  };
  return refillHand(state);
}

/** Deals the next scripted deck word if there is one, else a random draw. */
function drawTile(state: GameState): [Tile, GameState] {
  const id = state.nextTileId;
  const deck = state.level.deck ?? [];
  if (state.deckIndex < deck.length) {
    const word = deck[state.deckIndex];
    const tile: Tile = word === WILDCARD ? { id, word, wildcard: true } : { id, word };
    return [tile, { ...state, deckIndex: state.deckIndex + 1, nextTileId: id + 1 }];
  }
  const [roll, afterRoll] = nextRandom(state.rng);
  if (roll < WILDCARD_CHANCE) {
    return [{ id, word: WILDCARD, wildcard: true }, { ...state, rng: afterRoll, nextTileId: id + 1 }];
  }
  const [word, rng] = drawWord(poolFor(state.level.theme), afterRoll);
  return [{ id, word }, { ...state, rng, nextTileId: id + 1 }];
}

/** A tile going back to the hand. A wildcard forgets its word, so it can be anything again. */
function toHand(tile: Tile): Tile {
  return tile.wildcard ? { ...tile, word: WILDCARD } : tile;
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

/** The tiles currently in an entry, or null if any of its cells is empty. */
export function entryTiles(state: GameState, entry: Entry): Tile[] | null {
  const tiles: Tile[] = [];
  for (const cell of entry.cells) {
    const tile = state.board[cell];
    if (!tile) return null;
    tiles.push(tile);
  }
  return tiles;
}

/** The words currently in an entry, or null if any of its cells is empty. */
export function entryWords(state: GameState, entry: Entry): string[] | null {
  return entryTiles(state, entry)?.map((tile) => tile.word) ?? null;
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

/** The level's bonus objectives, judged against the board and the verdicts so far. */
export function objectiveProgress(
  state: GameState,
  cache: Record<string, CachedVerdict> = state.verdictCache,
): ObjectiveResult[] {
  const tiers: Record<string, Tier | undefined> = {};
  for (const entry of state.entries) {
    const words = entryWords(state, entry);
    if (words) tiers[entry.id] = cache[phraseKey(words)]?.tier;
  }
  return evaluateObjectives({
    level: state.level,
    entries: state.entries,
    board: state.board,
    tiers,
    swapsLeft: state.swapsLeft,
  });
}

/** Scores the board from cached verdicts, or null if any entry is unjudged. */
function scoreFromCache(state: GameState, cache: Record<string, CachedVerdict>): SubmitResult | null {
  const tilesByEntry: Record<string, Tile[]> = {};
  const verdicts: Record<string, Verdict> = {};
  for (const entry of state.entries) {
    const tiles = entryTiles(state, entry);
    const cached = tiles && cache[phraseKey(tiles.map((t) => t.word))];
    if (!tiles || !cached) return null;
    tilesByEntry[entry.id] = tiles;
    verdicts[entry.id] = { entryId: entry.id, ...cached };
  }
  return scoreSubmission(
    state.level,
    state.entries,
    tilesByEntry,
    verdicts,
    state.failedSubmits,
    objectiveProgress(state, cache),
  );
}

/**
 * True when there is something new to judge. A board made only of already
 * judged phrases can only be submitted if it would pass, so a resubmit can't
 * burn one of the player's limited submits for nothing.
 */
export function hasNewPhrases(state: GameState): boolean {
  return pendingJudgeEntries(state).length > 0 || (scoreFromCache(state, state.verdictCache)?.passed ?? true);
}

/** Submits allowed on a level: MAX_SUBMITS, or no limit in zen mode. */
export function maxSubmits(level: LevelDef): number {
  return level.zen ? Infinity : MAX_SUBMITS;
}

/** Submits allowed in this game, counting any bought with the "one more submit" booster. */
export function submitLimit(state: GameState): number {
  return maxSubmits(state.level) + state.bonusSubmits;
}

export function canSubmit(state: GameState): boolean {
  return (
    state.phase === 'playing' &&
    state.submitsUsed < submitLimit(state) &&
    isBoardFull(state) &&
    hasNewPhrases(state)
  );
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'restart') return createGame(state.level);
  if (action.type === 'reconcile') return reconcile(state, action.verdicts);
  if (action.type === 'extraSubmit') {
    if (state.phase !== 'lost') return state;
    return { ...state, phase: 'playing', bonusSubmits: state.bonusSubmits + 1, boosts: state.boosts + 1 };
  }

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
      let tile = state.hand[index];
      if (tile.wildcard) {
        // Only dictionary words, so nothing but known words ever reaches the judge.
        if (!action.word || !isWord(action.word)) return state;
        tile = { ...tile, word: action.word };
      }
      const hand = [...state.hand];
      // A tile already in the cell goes back to the hand in the placed tile's slot.
      if (target) hand.splice(index, 1, toHand(target));
      else hand.splice(index, 1);
      const board = { ...state.board, [action.cell]: tile };
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
        hand: [...state.hand, toHand(tile)],
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

    case 'addSwaps':
      if (!Number.isInteger(action.count) || action.count < 1) return state;
      return { ...state, swapsLeft: state.swapsLeft + action.count, boosts: state.boosts + 1 };

    case 'makeWildcard': {
      const index = state.hand.findIndex((t) => t.id === action.tileId);
      if (index === -1 || state.hand[index].wildcard) return state;
      const hand = [...state.hand];
      hand[index] = { id: action.tileId, word: WILDCARD, wildcard: true };
      return { ...state, hand, boosts: state.boosts + 1 };
    }

    case 'hint': {
      if (action.places.length === 0) return state;
      let next = state;
      for (const { tileId, cell } of action.places) {
        const tile = next.hand.find((t) => t.id === tileId);
        // Hints only put plain hand words into empty cells.
        if (!tile || tile.wildcard || next.board[cell] !== null) return state;
        next = gameReducer(next, { type: 'place', tileId, cell });
      }
      return { ...next, boosts: state.boosts + 1 };
    }

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
    phase: submitsUsed >= submitLimit(state) ? 'lost' : 'playing',
  };
}

const TIER_RANK: Record<Tier, number> = { invalid: 0, ok: 1, great: 2, poetic: 3 };

/**
 * Applies the AI judge's verdicts to phrases that were graded offline. A
 * provisional verdict is only ever upgraded, never revoked. If the level was
 * already won, its score is recomputed so the player gets any extra points.
 */
function reconcile(state: GameState, verdicts: PhraseVerdict[]): GameState {
  const verdictCache = { ...state.verdictCache };
  let changed = false;
  for (const { phrase, verdict } of verdicts) {
    const current = verdictCache[phrase];
    if (!current?.provisional) continue;
    verdictCache[phrase] =
      TIER_RANK[verdict.tier] >= TIER_RANK[current.tier]
        ? { ...verdict, provisional: false }
        : { ...current, provisional: false };
    changed = true;
  }
  if (!changed) return state;

  const next = { ...state, verdictCache };
  if (state.phase === 'won' && state.lastResult) {
    const rescored = scoreFromCache(next, verdictCache);
    if (rescored && rescored.total > state.lastResult.total) next.lastResult = rescored;
  }
  return next;
}
