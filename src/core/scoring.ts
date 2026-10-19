import {
  DEFAULT_STAR_POINTS_PER_SLOT,
  FAILED_SUBMIT_PENALTY,
  OBJECTIVE_BONUS_FRACTION,
  RARITY_THRESHOLDS,
  TIER_MULTIPLIER,
  WILDCARD_VALUE_FACTOR,
} from './config';
import { extractEntries } from './grid';
import type { Entry, LevelDef, ObjectiveResult, SubmitResult, Tile, Verdict } from './types';
import { wordInfo } from './words';

/** Rarity points for a word, 1 (very common) to 10 (rare). */
export function wordValue(word: string): number {
  const { zipf } = wordInfo(word);
  return 1 + RARITY_THRESHOLDS.filter((threshold) => zipf < threshold).length;
}

/** What a tile on the board scores: its word's value, or part of it for a wildcard. */
export function tileValue(tile: Pick<Tile, 'word' | 'wildcard'>): number {
  const value = wordValue(tile.word);
  return tile.wildcard ? Math.ceil(value * WILDCARD_VALUE_FACTOR) : value;
}

export function starThresholds(level: LevelDef): [number, number, number] {
  if (level.stars) return level.stars;
  const slots = extractEntries(level.layout).reduce((sum, e) => sum + e.cells.length, 0);
  return DEFAULT_STAR_POINTS_PER_SLOT.map((points) => Math.round(points * slots)) as [
    number,
    number,
    number,
  ];
}

export function failedSubmitPenalty(level: LevelDef): number {
  if (level.zen) return 0;
  return Math.max(1, Math.ceil(starThresholds(level)[0] * FAILED_SUBMIT_PENALTY));
}

/** Points for each bonus objective, unless the level sets its own. */
export function objectiveBonus(level: LevelDef): number {
  return Math.max(5, Math.round(starThresholds(level)[0] * OBJECTIVE_BONUS_FRACTION));
}

/**
 * Scores a fully judged board. Each entry scores the sum of its tile values
 * times its tier multiplier, so a word on a crossing cell counts in both of
 * its entries. Bonus objectives met add their points before stars are counted.
 */
export function scoreSubmission(
  level: LevelDef,
  entries: Entry[],
  tilesByEntry: Record<string, Pick<Tile, 'word' | 'wildcard'>[]>,
  verdicts: Record<string, Verdict>,
  failedSubmits: number,
  objectives: ObjectiveResult[] = [],
): SubmitResult {
  const entryScores: Record<string, number> = {};
  let raw = 0;
  let allValid = true;
  for (const entry of entries) {
    const verdict = verdicts[entry.id];
    if (!verdict?.valid) allValid = false;
    const base = tilesByEntry[entry.id].reduce((sum, tile) => sum + tileValue(tile), 0);
    const score = Math.round(base * TIER_MULTIPLIER[verdict?.tier ?? 'invalid']);
    entryScores[entry.id] = score;
    raw += score;
  }

  const bonus = objectives.reduce((sum, o) => sum + (o.met ? o.objective.points : 0), 0);
  const penalty = failedSubmits * failedSubmitPenalty(level);
  const total = Math.max(0, raw + bonus - penalty);
  // Zen boards have no star targets: every line valid clears them.
  const thresholds = starThresholds(level);
  const stars =
    allValid && !level.zen ? (thresholds.filter((t) => total >= t).length as 0 | 1 | 2 | 3) : 0;
  const passed = level.zen ? allValid : stars > 0;

  return { passed, entryScores, raw, bonus, penalty, total, stars, objectives };
}
