import {
  DEFAULT_STAR_POINTS_PER_SLOT,
  FAILED_SUBMIT_PENALTY,
  RARITY_THRESHOLDS,
  TIER_MULTIPLIER,
} from './config';
import { extractEntries } from './grid';
import type { Entry, LevelDef, SubmitResult, Verdict } from './types';
import { wordInfo } from './words';

/** Rarity points for a word, 1 (very common) to 10 (rare). */
export function wordValue(word: string): number {
  const { zipf } = wordInfo(word);
  return 1 + RARITY_THRESHOLDS.filter((threshold) => zipf < threshold).length;
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
  return Math.max(1, Math.ceil(starThresholds(level)[0] * FAILED_SUBMIT_PENALTY));
}

/**
 * Scores a fully judged board. Each entry scores the sum of its word values
 * times its tier multiplier, so a word on a crossing cell counts in both of
 * its entries.
 */
export function scoreSubmission(
  level: LevelDef,
  entries: Entry[],
  wordsByEntry: Record<string, string[]>,
  verdicts: Record<string, Verdict>,
  failedSubmits: number,
): SubmitResult {
  const entryScores: Record<string, number> = {};
  let raw = 0;
  let allValid = true;
  for (const entry of entries) {
    const verdict = verdicts[entry.id];
    if (!verdict?.valid) allValid = false;
    const base = wordsByEntry[entry.id].reduce((sum, word) => sum + wordValue(word), 0);
    const score = Math.round(base * TIER_MULTIPLIER[verdict?.tier ?? 'invalid']);
    entryScores[entry.id] = score;
    raw += score;
  }

  const penalty = failedSubmits * failedSubmitPenalty(level);
  const total = Math.max(0, raw - penalty);
  const thresholds = starThresholds(level);
  const stars = allValid ? (thresholds.filter((t) => total >= t).length as 0 | 1 | 2 | 3) : 0;

  return { passed: stars > 0, entryScores, raw, penalty, total, stars };
}
