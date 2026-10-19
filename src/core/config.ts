import type { Tier } from './types';

// Tuning knobs. Everything here is expected to move during playtesting.

export const HAND_SIZE = 7;

/** Every line on a board is at least this many words (a design decision after playtesting). */
export const MIN_ENTRY_LENGTH = 4;

export const MAX_SUBMITS = 3;

/** Points lost per failed submit, as a fraction of the level's 1-star threshold. */
export const FAILED_SUBMIT_PENALTY = 0.15;

export const TIER_MULTIPLIER: Record<Tier, number> = {
  invalid: 0,
  ok: 1,
  great: 1.5,
  poetic: 2,
};

/**
 * Word value is 1 + the number of these Zipf thresholds the word falls below,
 * so "the" (7.7) is worth 1 and anything under 2.0 is worth 10.
 */
export const RARITY_THRESHOLDS = [6.0, 5.5, 5.0, 4.5, 4.0, 3.5, 3.0, 2.5, 2.0];

/**
 * Draw weight = min(cap, base ^ (zipf - pivot)), multiplied by themeBoost for
 * words from the level's theme pool and nounBoost for nouns. Common words come
 * up more often, but the cap stops "the" from flooding the hand. Nouns only
 * come from theme pools and most phrases need one, hence their boost.
 */
export const DRAW_WEIGHTING = {
  base: 2,
  pivot: 3,
  cap: 6,
  themeBoost: 1.5,
  nounBoost: 1.5,
};

/**
 * Default star thresholds, in points per entry slot (the summed length of all
 * entries, so a crossing cell counts twice, just like it does when scoring).
 */
export const DEFAULT_STAR_POINTS_PER_SLOT: [number, number, number] = [3, 4.5, 6];

/** Chance that a draw is a wildcard tile, which the player can make any dictionary word. */
export const WILDCARD_CHANCE = 0.015;

/**
 * A wildcard's word scores this fraction of its rarity value (rounded up), so
 * a wildcard fills a tricky gap without being a free rarity-10 word.
 */
export const WILDCARD_VALUE_FACTOR = 0.5;

/** Points for each bonus objective met, as a fraction of the 1-star threshold. */
export const OBJECTIVE_BONUS_FRACTION = 0.2;

/**
 * Generated levels set their star thresholds from bot playthroughs (see
 * src/core/levelBot.ts). 1★ is a fraction of what a careful bot scores (set per
 * band below, rising as levels go on), 3★ a fraction of what a greedy,
 * rarity-hunting bot scores, and 2★ sits halfway.
 */
export const STAR_BASELINE = {
  threeStars: 0.95,
  /** The smallest gap between thresholds, as a fraction of 1★. */
  minStep: 0.2,
};

/** One difficulty band of generated levels. Levels 1-10 are the scripted tutorial. */
export interface LevelBand {
  name: string;
  /** The first level number in the band. */
  from: number;
  maxRows: number;
  maxCols: number;
  /** How many entries (across + down runs). */
  entries: [number, number];
  /** Words per entry. */
  length: [number, number];
  /** Chance of allowing an entry that crosses two or more others, closing a loop. */
  loops: number;
  anchors: [number, number];
  /** Share of open, unanchored cells that get a soft part-of-speech hint. */
  hints: number;
  swaps: number;
  objectives: [number, number];
  /** 1★ as a fraction of the careful bot's score. */
  oneStar: number;
}

export const LEVEL_BANDS: LevelBand[] = [
  { name: 'warm-up', from: 11, maxRows: 4, maxCols: 4, entries: [2, 3], length: [4, 4], loops: 0, anchors: [1, 2], hints: 0.5, swaps: 5, objectives: [0, 0], oneStar: 0.75 },
  { name: 'early', from: 21, maxRows: 5, maxCols: 5, entries: [3, 4], length: [4, 5], loops: 0.15, anchors: [1, 2], hints: 0.35, swaps: 4, objectives: [1, 1], oneStar: 0.8 },
  { name: 'mid', from: 41, maxRows: 5, maxCols: 5, entries: [4, 6], length: [4, 5], loops: 0.3, anchors: [1, 2], hints: 0.25, swaps: 4, objectives: [1, 1], oneStar: 0.85 },
  { name: 'hard', from: 71, maxRows: 6, maxCols: 5, entries: [5, 7], length: [4, 5], loops: 0.4, anchors: [1, 3], hints: 0.15, swaps: 4, objectives: [1, 1], oneStar: 0.9 },
  { name: 'late', from: 101, maxRows: 6, maxCols: 6, entries: [6, 8], length: [4, 6], loops: 0.5, anchors: [1, 2], hints: 0.1, swaps: 3, objectives: [1, 2], oneStar: 0.95 },
];

/** The daily puzzle: the same mid-sized board for everyone, generated ahead of time like the levels. */
export const DAILY_BAND: LevelBand = { name: 'daily', from: 0, maxRows: 5, maxCols: 5, entries: [3, 5], length: [4, 5], loops: 0.2, anchors: [1, 2], hints: 0.2, swaps: 4, objectives: [1, 1], oneStar: 0.85 };

/**
 * Zen boards are made on the phone as you go, so they skip the bot's checks
 * (a zen board can't be failed: submits and swaps are unlimited).
 */
export const ZEN_BAND: LevelBand = { name: 'zen', from: 0, maxRows: 5, maxCols: 5, entries: [2, 4], length: [4, 5], loops: 0.1, anchors: [1, 2], hints: 0, swaps: 0, objectives: [0, 0], oneStar: 1 };

/** Swaps per zen board: enough to never run out. */
export const ZEN_SWAPS = 99;
