import { playLevel } from '../core/levelBot';
import { BUNDLED_MODEL } from '../core/localJudge';
import { builtinJudge, parseRun, replayRun, type RunAction } from '../core/run';
import { parseTuning, tuneLevel } from '../core/tuning';
import type { LevelDef } from '../core/types';
import { addDays, dailyLevel } from '../data/dailies';
import { levelById, levelNumber } from '../data/levels';

// What the leaderboard server runs (bundled into supabase/functions/_shared by
// `npm run bundle:server`). It never trusts a score from a phone: it replays
// the player's moves from the level's own deal with the shared game core and
// re-judges every submit with the built-in judge, then scores the result.

/** Which built-in judge model scored a run; stored with each score. */
export const JUDGE_VERSION = BUNDLED_MODEL.trainedAt;

export interface ScoredRun {
  won: boolean;
  /**
   * The final score. A lost daily puzzle keeps its points (it ranks below
   * every solve); level boards only take wins.
   */
  score: number;
  stars: 0 | 1 | 2 | 3;
  submits: number;
}

export function scoreRun(level: LevelDef, actions: unknown): ScoredRun | string {
  const run = parseRun(actions);
  if (typeof run === 'string') return run;
  const { state, error } = replayRun(level, run, builtinJudge);
  if (error) return error;
  if (state.phase !== 'won' && state.phase !== 'lost') return "the game isn't finished";
  const won = state.phase === 'won';
  return {
    won,
    score: state.lastResult?.total ?? 0,
    stars: won ? state.lastResult!.stars : 0,
    submits: state.submitsUsed,
  };
}

/** A daily puzzle run. Days are players' local dates, so yesterday to tomorrow (UTC) are open. */
export function scoreDaily(day: string, actions: unknown, now: Date): ScoredRun | string {
  const level = dailyLevel(day);
  if (!level) return 'there is no daily puzzle that day';
  const today = now.toISOString().slice(0, 10);
  if (day < addDays(today, -1) || day > addDays(today, 1)) return 'that daily puzzle is closed';
  return scoreRun(level, actions);
}

/**
 * A cleared level. Only wins count on level leaderboards. `tuning` is the
 * remote config's `tuning` value, which the game applied to the level too.
 */
export function scoreLevel(levelId: string, actions: unknown, tuning: unknown = {}): ScoredRun | string {
  const level = typeof levelId === 'string' ? levelById(levelId) : undefined;
  if (!level) return 'there is no such level';
  const scored = scoreRun(tuneLevel(level, levelNumber(level.id), parseTuning(tuning)), actions);
  if (typeof scored === 'string') return scored;
  return scored.won ? scored : "the built-in judge didn't pass this board";
}

/** A winning run for a level, played by the bot: for tests and smoke checks of the server. */
export function sampleRun(level: LevelDef): RunAction[] {
  return [...playLevel(level, 'careful').moves, { type: 'submit' }];
}

export { dailyLevel, levelById };
