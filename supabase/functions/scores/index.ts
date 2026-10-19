// CrossPhrase scores: checks and saves daily puzzle results and level clears
// for the leaderboards.
//
// POST { kind: "daily", day: "2026-10-20", actions: [...] }
// POST { kind: "level", levelId: "level-12", actions: [...] }
//  ->  { won, score, stars, submits, saved }
//
// `actions` is the player's run: every move from the level's deal. The score
// is worked out here by replaying it with the game core and re-judging it
// with the built-in judge; nothing the phone says about its score is used.
// Callers must be signed in (the app signs players in anonymously).
//
// Deploy:  supabase functions deploy scores

import { type SupabaseContext, withSupabase } from "npm:@supabase/server@1.9.2";
import { handleScore, type ScoreStore } from "./handler.ts";

type AdminClient = SupabaseContext["supabaseAdmin"];

/**
 * Score submissions allowed per player per 15 minutes (a game sends one at
 * most). The quota table counts by window length, so this 15-minute window
 * is counted separately from the judge's 10-minute one.
 */
const LIMIT_PER_15_MIN = Number(Deno.env.get("SCORES_LIMIT_PER_15_MIN") ?? 60);

function store(admin: AdminClient): ScoreStore {
  return {
    async saveDaily(row) {
      const { data, error } = await admin.rpc("save_daily_score", {
        p_user: row.userId,
        p_day: row.day,
        p_won: row.won,
        p_score: row.score,
        p_stars: row.stars,
        p_submits: row.submits,
        p_actions: row.actions,
        p_judge_version: row.judgeVersion,
      });
      if (error) throw error;
      return data === true;
    },
    async saveLevel(row) {
      const { data, error } = await admin.rpc("save_level_score", {
        p_user: row.userId,
        p_level: row.levelId,
        p_score: row.score,
        p_stars: row.stars,
        p_actions: row.actions,
        p_judge_version: row.judgeVersion,
      });
      if (error) throw error;
      return data === true;
    },
  };
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: "sign in first" }, { status: 401 });
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "body must be JSON" }, { status: 400 });
    }
    const { data: allowed, error: quotaError } = await ctx.supabaseAdmin.rpc("consume_judge_quota", {
      p_user: userId,
      p_window_seconds: 15 * 60,
      p_limit: LIMIT_PER_15_MIN,
    });
    if (quotaError) console.error("Rate limit check failed:", quotaError);
    else if (!allowed) return Response.json({ error: "too many scores; try again later" }, { status: 429 });
    try {
      const { status, body: result } = await handleScore(body, userId, store(ctx.supabaseAdmin), new Date());
      return Response.json(result, { status });
    } catch (error) {
      console.error("Saving a score failed:", error);
      return Response.json({ error: "couldn't save the score" }, { status: 500 });
    }
  }),
};
