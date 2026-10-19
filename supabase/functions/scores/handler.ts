// The request logic of the `scores` function, kept free of Supabase so it can
// be tested with a fake store. The scoring itself (replaying the moves and
// re-judging them) is the app's own game core, bundled by
// `npm run bundle:server`.

import { JUDGE_VERSION, scoreDaily, scoreLevel } from "../_shared/scores.bundle.js";

export interface ScoredRun {
  won: boolean;
  score: number;
  stars: number;
  submits: number;
}

export interface ScoreStore {
  /** Saves a daily result unless the player has one already. True if saved. */
  saveDaily(row: { userId: string; day: string; actions: unknown; judgeVersion: string } & ScoredRun): Promise<boolean>;
  /** Saves a level clear if it beats the player's best. True if saved. */
  saveLevel(row: { userId: string; levelId: string; actions: unknown; judgeVersion: string } & ScoredRun): Promise<boolean>;
}

export interface Outcome {
  status: number;
  body: Record<string, unknown>;
}

const bad = (error: string, status = 400): Outcome => ({ status, body: { error } });

export async function handleScore(body: unknown, userId: string, store: ScoreStore, now: Date): Promise<Outcome> {
  if (typeof body !== "object" || body === null) return bad("body must be an object");
  const { kind, actions } = body as Record<string, unknown>;

  if (kind === "daily") {
    const { day } = body as { day?: unknown };
    if (typeof day !== "string") return bad("day must be a string");
    const scored = scoreDaily(day, actions, now) as ScoredRun | string;
    if (typeof scored === "string") return bad(scored, 422);
    const saved = await store.saveDaily({ userId, day, actions, judgeVersion: JUDGE_VERSION, ...scored });
    return { status: 200, body: { ...scored, saved } };
  }

  if (kind === "level") {
    const { levelId } = body as { levelId?: unknown };
    if (typeof levelId !== "string") return bad("levelId must be a string");
    const scored = scoreLevel(levelId, actions) as ScoredRun | string;
    if (typeof scored === "string") return bad(scored, 422);
    const saved = await store.saveLevel({ userId, levelId, actions, judgeVersion: JUDGE_VERSION, ...scored });
    return { status: 200, body: { ...scored, saved } };
  }

  return bad('kind must be "daily" or "level"');
}
