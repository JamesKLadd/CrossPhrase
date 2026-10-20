import { bandFor, LEVEL_BANDS } from './config';
import { starThresholds } from './scoring';
import type { LevelDef } from './types';

// Difficulty tuning for the generated levels, set in the `tuning` row of the
// remote config (see src/remote and README) so a level that playtesters find
// too hard can be eased without an update. The leaderboard server applies the
// same tuning before replaying a run, so scores still check out. Tutorial
// levels and daily puzzles are never tuned: the daily is the same for
// everyone all day.
//
// Draw weighting isn't here on purpose: it changes every deal, so the bot's
// star targets and solvability checks would no longer hold. Changing it means
// regenerating the levels (npm run generate:levels).

export interface LevelTweak {
  /** Swaps added (or, if negative, taken away). */
  swaps?: number;
  /** Star targets are multiplied by this (0.8 = 20% easier). */
  stars?: number;
}

export interface Tuning {
  /** By band name: warm-up, early, mid, hard, late. */
  bands?: Record<string, LevelTweak>;
  /** By level id, e.g. "level-37". Applies on top of its band's tweak. */
  levels?: Record<string, LevelTweak>;
}

const MIN_STARS = 0.5;
const MAX_STARS = 2;

function parseTweak(value: unknown): LevelTweak | null {
  if (typeof value !== 'object' || value === null) return null;
  const { swaps, stars } = value as Record<string, unknown>;
  const tweak: LevelTweak = {};
  if (Number.isInteger(swaps) && Math.abs(swaps as number) <= 10) tweak.swaps = swaps as number;
  if (typeof stars === 'number' && stars >= MIN_STARS && stars <= MAX_STARS) tweak.stars = stars;
  return tweak.swaps === undefined && tweak.stars === undefined ? null : tweak;
}

/** Remote tuning, keeping only well-formed tweaks for known bands and level ids. */
export function parseTuning(value: unknown): Tuning {
  const tuning: Tuning = {};
  if (typeof value !== 'object' || value === null) return tuning;
  const { bands, levels } = value as Record<string, unknown>;
  const names = new Set(LEVEL_BANDS.map((b) => b.name));
  for (const [key, raw] of Object.entries(typeof bands === 'object' && bands ? bands : {})) {
    const tweak = parseTweak(raw);
    if (tweak && names.has(key)) (tuning.bands ??= {})[key] = tweak;
  }
  for (const [key, raw] of Object.entries(typeof levels === 'object' && levels ? levels : {})) {
    const tweak = parseTweak(raw);
    if (tweak && /^level-\d+$/.test(key)) (tuning.levels ??= {})[key] = tweak;
  }
  return tuning;
}

/**
 * A level with its band's and its own tweaks applied. `number` is its place on
 * the map; levels before the first generated band come back unchanged.
 */
export function tuneLevel(level: LevelDef, number: number, tuning: Tuning): LevelDef {
  if (number < LEVEL_BANDS[0].from || level.zen) return level;
  const band = tuning.bands?.[bandFor(number).name] ?? {};
  const own = tuning.levels?.[level.id] ?? {};
  const swapsBonus = (band.swaps ?? 0) + (own.swaps ?? 0);
  const scale = Math.min(MAX_STARS, Math.max(MIN_STARS, (band.stars ?? 1) * (own.stars ?? 1)));
  if (swapsBonus === 0 && scale === 1) return level;

  let floor = 0;
  const stars = starThresholds(level).map((target) => {
    // Each target stays at least a point above the one before.
    floor = Math.max(floor + 1, Math.round(target * scale));
    return floor;
  }) as [number, number, number];
  return { ...level, swaps: Math.max(0, level.swaps + swapsBonus), stars };
}
