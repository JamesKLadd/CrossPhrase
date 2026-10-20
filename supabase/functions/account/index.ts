// CrossPhrase accounts.
//
// POST { action: "signup", username, password }  ->  { username }
//   Turns the caller's anonymous user into an account. They log in later with
//   supabase.auth.signInWithPassword, using accountEmail(username).
// POST { action: "delete" }  ->  { deleted: true }
//   Deletes the caller's user and everything that belongs to it.
//
// Callers must be signed in (the game signs every player in anonymously).
//
// Deploy:  supabase functions deploy account

import { type SupabaseContext, withSupabase } from "npm:@supabase/server@1.9.2";
import { type AccountStore, handleAccount } from "./handler.ts";

type AdminClient = SupabaseContext["supabaseAdmin"];

/** Account requests allowed per player per hour (sign-up attempts and deletes). */
const LIMIT_PER_HOUR = 20;

function store(admin: AdminClient): AccountStore {
  return {
    async allowed(userId) {
      // The quota table counts by window length; an hour is separate from the other limits.
      const { data, error } = await admin.rpc("consume_judge_quota", {
        p_user: userId,
        p_window_seconds: 3600,
        p_limit: LIMIT_PER_HOUR,
      });
      if (error) console.error("Rate limit check failed:", error);
      return error ? true : data === true;
    },
    async hasAccount(userId) {
      const { data, error } = await admin.from("accounts").select("user_id").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async claim(userId, username) {
      const { error } = await admin.from("accounts").insert({ user_id: userId, username });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw error;
    },
    async release(userId) {
      const { error } = await admin.from("accounts").delete().eq("user_id", userId);
      if (error) console.error("Releasing a username failed:", error);
    },
    async setLogin(userId, email, password) {
      const { error } = await admin.auth.admin.updateUserById(userId, { email, password, email_confirm: true });
      return error ? error.message : null;
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
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
    try {
      const { status, body: result } = await handleAccount(body, userId, store(ctx.supabaseAdmin));
      return Response.json(result, { status });
    } catch (error) {
      console.error("Account request failed:", error);
      return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }
  }),
};
