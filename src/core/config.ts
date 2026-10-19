import type { Tier } from './types';

// Tuning knobs. Everything here is expected to move during playtesting.

export const HAND_SIZE = 7;

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
 * words from the level's theme pool. Common words come up more often, but the
 * cap stops "the" from flooding the hand.
 */
export const DRAW_WEIGHTING = {
  base: 2,
  pivot: 3,
  cap: 6,
  themeBoost: 1.5,
};

/**
 * Default star thresholds, in points per entry slot (the summed length of all
 * entries, so a crossing cell counts twice, just like it does when scoring).
 */
export const DEFAULT_STAR_POINTS_PER_SLOT: [number, number, number] = [3, 4.5, 6];
