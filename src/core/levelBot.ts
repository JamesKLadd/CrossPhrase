import { TIER_MULTIPLIER } from './config';
import { createGame, entryTiles, gameReducer, type GameAction, type GameState } from './game';
import { isGrammatical } from './grammar';
import { BUNDLED_MODEL, ruleProblem } from './localJudge';
import { scoreSubmission, tileValue } from './scoring';
import type { RunAction } from './run';
import { predict, type TinyModel } from './tinyJudge';
import type { CellKey, Entry, LevelDef, Pos, Tier, Tile, Verdict } from './types';
import { wordInfo } from './words';

// A simulated player, used by the level generator to check that a level can be
// solved with the hand it deals and to set its star thresholds. It only plays
// grammatical English (see makeJudge), so "solvable" means solvable by people. It plays by the
// real rules (the game reducer: same deals, refills and swaps) and is judged by
// the built-in judge. It fills one entry at a time, trying every way to put
// hand words into the entry's empty cells, and swaps when it's stuck. If it
// paints itself into a corner it backs up and tries its next-best phrases, the
// way a player would rearrange (the deal order never changes, so this is fair).
//
//   careful: picks the phrase the judge is surest about (a cautious player)
//   greedy:  picks the highest-scoring valid phrase (a player chasing rare words)

export type BotStyle = 'careful' | 'greedy';

export interface BotRun {
  solved: boolean;
  /** Board score before bonuses and penalties; 0 if unsolved. */
  score: number;
  swapsUsed: number;
  /** The final game state, filled when solved. */
  state: GameState;
  /** The moves that fill the board, as a run log (without the final submit). */
  moves: RunAction[];
  /** The built-in judge's tier for each entry of a solved board. */
  tiers: Record<string, Tier>;
}

const GLUE: ReadonlySet<Pos> = new Set(['det', 'prep', 'conj']);

function glueOnly(word: string): boolean {
  return wordInfo(word).pos.every((pos) => GLUE.has(pos));
}

function detOnly(word: string): boolean {
  return wordInfo(word).pos.every((pos) => pos === 'det');
}

/** Problems a half-filled entry already has, whatever goes in its empty cells. */
function partialProblem(words: (string | null)[]): boolean {
  const last = words[words.length - 1];
  if (last && glueOnly(last)) return true;
  for (let i = 1; i < words.length; i++) {
    const [a, b] = [words[i - 1], words[i]];
    if (!a || !b) continue;
    if (a === b && glueOnly(a)) return true;
    if (detOnly(a) && detOnly(b)) return true;
  }
  return false;
}

interface Judged {
  tier: Tier;
  pValid: number;
}

/**
 * How the bot judges a line: only real English counts (src/core/grammar.ts),
 * so a board it solves can be solved by people writing sentences, not just by
 * word salad the built-in judge happens to let through. Among those, the
 * built-in judge's tier and confidence rank the choices.
 */
function makeJudge(model: TinyModel) {
  const memo = new Map<string, Judged>();
  return (words: string[]): Judged => {
    const key = words.join(' ');
    let judged = memo.get(key);
    if (!judged) {
      if (ruleProblem(words) || !isGrammatical(words, { strict: true })) {
        judged = { tier: 'invalid', pValid: 0 };
      } else {
        const { tier, pValid } = predict(model, words);
        // The built-in judge passes every grammatical line (as at least OK).
        judged = { tier: tier === 'invalid' ? 'ok' : tier, pValid };
      }
      memo.set(key, judged);
    }
    return judged;
  };
}

type Judge = ReturnType<typeof makeJudge>;

interface Choice {
  /** Hand tile id for each empty cell of the entry, in order. */
  tileIds: number[];
  utility: number;
}

/** How many alternatives to keep per entry when backing up. */
const BRANCHING = 6;
/**
 * The bot searches twice. First it swaps only when nothing fits, always the
 * likeliest word to be useless (quick, and enough for most boards); if that
 * fails, it searches again trying a few different swaps, also after lines
 * that fit but lead nowhere. Each pass may try filling this many entries (and
 * the second pass this many swaps), so a hopeless level fails fast.
 */
const PASSES = [
  { budget: 400, swapWidth: 1 },
  { budget: 1000, swapWidth: 3 },
];

/** The best few ways to fill an entry's empty cells from the hand, best first. */
function bestChoices(state: GameState, entry: Entry, style: BotStyle, judge: Judge): Choice[] {
  const empty = entry.cells.filter((cell) => !state.board[cell]);
  const hand = state.hand.filter((tile) => !tile.wildcard);
  if (empty.length > hand.length) return [];
  const crossers = new Map<CellKey, Entry>();
  for (const other of state.entries) {
    if (other === entry) continue;
    for (const cell of other.cells) if (empty.includes(cell)) crossers.set(cell, other);
  }

  const best: Choice[] = [];
  const tried = new Set<string>();
  const used = new Array<boolean>(hand.length).fill(false);
  const picked: Tile[] = [];

  const evaluate = () => {
    const key = picked.map((t) => t.word).join(' ');
    if (tried.has(key)) return;
    tried.add(key);
    const placed = new Map(empty.map((cell, i) => [cell, picked[i]]));
    const wordAt = (cell: CellKey) => placed.get(cell)?.word ?? state.board[cell]?.word ?? null;

    const words = entry.cells.map(wordAt) as string[];
    const own = judge(words);
    if (own.tier === 'invalid') return;
    const tileAt = (cell: CellKey) => (placed.get(cell) ?? state.board[cell])!;
    let points = entry.cells.reduce((s, c) => s + tileValue(tileAt(c)), 0) * TIER_MULTIPLIER[own.tier];
    let confidence = own.pValid;

    for (const other of new Set(crossers.values())) {
      const otherWords = other.cells.map(wordAt);
      if (otherWords.every((w) => w !== null)) {
        const judged = judge(otherWords as string[]);
        if (judged.tier === 'invalid') return;
        points += other.cells.reduce((s, c) => s + tileValue(tileAt(c)), 0) * TIER_MULTIPLIER[judged.tier];
        confidence += judged.pValid;
      } else if (partialProblem(otherWords)) {
        return;
      }
    }

    const utility = style === 'careful' ? confidence : points + confidence * 0.1;
    if (best.length < BRANCHING || utility > best[best.length - 1].utility) {
      best.push({ tileIds: picked.map((t) => t.id), utility });
      best.sort((a, b) => b.utility - a.utility);
      if (best.length > BRANCHING) best.pop();
    }
  };

  const search = (depth: number) => {
    if (depth === empty.length) return evaluate();
    for (let i = 0; i < hand.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      picked.push(hand[i]);
      search(depth + 1);
      picked.pop();
      used[i] = false;
    }
  };
  search(0);
  return best;
}

/** The unfinished entry to fill next: the most constrained one (most cells already filled). */
function nextEntry(state: GameState): Entry | null {
  let best: Entry | null = null;
  let bestKey = -1;
  for (const entry of state.entries) {
    const filled = entry.cells.filter((cell) => state.board[cell]).length;
    if (filled === entry.cells.length) continue;
    const key = filled * 10 + entry.cells.length;
    if (key > bestKey) {
      best = entry;
      bestKey = key;
    }
  }
  return best;
}

/** Words that carry little meaning alone: glue, pronouns and auxiliaries like "is". */
function functionWord(word: string): boolean {
  return glueOnly(word) || wordInfo(word).zipf >= 6.5;
}

/**
 * The words worth swapping when stuck, best first: an unusable wildcard, a
 * surplus function word, then the rarest words (the hardest to fit). One per
 * word, since swapping either copy of a word is the same.
 */
function tilesToSwap(hand: Tile[], width: number): Tile[] {
  const fillers = hand.filter((t) => !t.wildcard && functionWord(t.word));
  const rarest = hand.filter((t) => !t.wildcard).sort((a, b) => wordInfo(a.word).zipf - wordInfo(b.word).zipf);
  const ordered = [
    ...hand.filter((t) => t.wildcard),
    ...(fillers.length > 3 ? [fillers[fillers.length - 1]] : []),
    ...rarest,
  ];
  return ordered.filter((t, i) => ordered.findIndex((o) => o.word === t.word) === i).slice(0, width);
}

export function playLevel(
  level: LevelDef,
  style: BotStyle,
  options: { seed?: number; model?: TinyModel } = {},
): BotRun {
  const judge = makeJudge(options.model ?? BUNDLED_MODEL);
  let state = createGame(options.seed === undefined ? level : { ...level, seed: options.seed });
  const failed = (): BotRun => ({ solved: false, score: 0, swapsUsed: 0, state, moves: [], tiers: {} });

  // Anchors alone can complete an entry; the bot can't change those.
  for (const entry of state.entries) {
    const tiles = entryTiles(state, entry);
    if (tiles && judge(tiles.map((t) => t.word)).tier === 'invalid') return failed();
  }

  type Path = { state: GameState; moves: RunAction[] };
  const search = (budget: number, swapWidth: number): Path | null => {
    const solve = (current: GameState, moves: RunAction[]): Path | null => {
      const entry = nextEntry(current);
      if (!entry) return { state: current, moves };
      if (budget-- <= 0) return null;
      return fill(current, moves, entry);
    };
    const fill = (current: GameState, moves: RunAction[], entry: Entry): Path | null => {
      const empty = entry.cells.filter((cell) => !current.board[cell]);
      const choices = bestChoices(current, entry, style, judge);
      for (const choice of choices) {
        const places: RunAction[] = choice.tileIds.map((tileId, i) => ({ type: 'place', tileId, cell: empty[i] }));
        const placed = places.reduce((s, move) => gameReducer(s, move as GameAction), current);
        const solved = solve(placed, [...moves, ...places]);
        if (solved) return solved;
      }
      // Nothing fits (or, in the wider pass, nothing that fits works out): swap a word and try this entry again.
      if (current.swapsLeft > 0 && (choices.length === 0 || swapWidth > 1)) {
        for (const tile of tilesToSwap(current.hand, swapWidth)) {
          if (swapWidth > 1 && budget-- <= 0) return null;
          const swap: RunAction = { type: 'swap', tileId: tile.id };
          const solved = fill(gameReducer(current, swap), [...moves, swap], entry);
          if (solved) return solved;
        }
      }
      return null;
    };
    return solve(state, []);
  };
  let solved: Path | null = null;
  for (const pass of PASSES) {
    solved = search(pass.budget, pass.swapWidth);
    if (solved) break;
  }
  if (!solved) return failed();
  state = solved.state;

  const tiers: Record<string, Tier> = {};
  const verdicts: Record<string, Verdict> = {};
  const tilesByEntry: Record<string, Tile[]> = {};
  for (const entry of state.entries) {
    const tiles = entryTiles(state, entry)!;
    const { tier } = judge(tiles.map((t) => t.word));
    if (tier === 'invalid') return failed();
    tiers[entry.id] = tier;
    tilesByEntry[entry.id] = tiles;
    verdicts[entry.id] = { entryId: entry.id, valid: true, tier, reading: '', reason: '', quip: '' };
  }
  const { raw } = scoreSubmission(level, state.entries, tilesByEntry, verdicts, 0);
  return { solved: true, score: raw, swapsUsed: level.swaps - state.swapsLeft, state, moves: solved.moves, tiers };
}

/**
 * The hint booster: one line the owl would fill from the player's hand, as
 * placements into its empty cells. It tries the most-filled line first, like
 * the bot, and only suggests phrases the built-in judge passes, along with
 * any crossing lines they complete. Null when no line can be filled from
 * this hand (a swap might help).
 */
export function hintLine(
  state: GameState,
  model: TinyModel = BUNDLED_MODEL,
): { entry: Entry; places: { tileId: number; cell: CellKey }[] } | null {
  const judge = makeJudge(model);
  const filled = (entry: Entry) => entry.cells.filter((cell) => state.board[cell]).length;
  const open = state.entries
    .filter((entry) => filled(entry) < entry.cells.length)
    .sort((a, b) => filled(b) * 10 + b.cells.length - (filled(a) * 10 + a.cells.length));
  for (const entry of open) {
    const [best] = bestChoices(state, entry, 'careful', judge);
    if (!best) continue;
    const empty = entry.cells.filter((cell) => !state.board[cell]);
    return { entry, places: best.tileIds.map((tileId, i) => ({ tileId, cell: empty[i] })) };
  }
  return null;
}
