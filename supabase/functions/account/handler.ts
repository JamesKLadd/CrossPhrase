// The request logic of the `account` function, kept free of Supabase so it
// can be tested with a fake store.
//
// Creating an account turns the caller's own user (the anonymous one every
// player starts with) into a permanent user with a username and password.
// It's the same user, so their scores and stats stay theirs.

import { accountEmail, passwordProblem, usernameProblem } from "../_shared/accountRules.ts";

export interface AccountStore {
  /** False when the player has made too many requests lately. */
  allowed(userId: string): Promise<boolean>;
  hasAccount(userId: string): Promise<boolean>;
  /** Reserves the username for this user. False if someone has it already. */
  claim(userId: string, username: string): Promise<boolean>;
  /** Undoes a claim when the rest of the sign-up fails. */
  release(userId: string): Promise<void>;
  /** Gives the user an email (already confirmed) and password. Returns Supabase's error, or null. */
  setLogin(userId: string, email: string, password: string): Promise<string | null>;
  deleteUser(userId: string): Promise<void>;
}

export interface Outcome {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, error: string): Outcome => ({ status, body: { error } });

export async function handleAccount(body: unknown, userId: string, store: AccountStore): Promise<Outcome> {
  if (typeof body !== "object" || body === null) return fail(400, "body must be an object");
  const { action } = body as Record<string, unknown>;
  if (!(await store.allowed(userId))) return fail(429, "Too many tries. Wait a while and try again.");

  if (action === "signup") {
    const { username, password } = body as Record<string, unknown>;
    if (typeof username !== "string" || typeof password !== "string") {
      return fail(400, "username and password must be strings");
    }
    const name = username.trim();
    const problem = usernameProblem(name) ?? passwordProblem(password);
    if (problem) return fail(400, problem);
    if (await store.hasAccount(userId)) return fail(409, "You already have an account. Log out first to make another.");
    if (!(await store.claim(userId, name))) return fail(409, "That username is taken.");
    const error = await store.setLogin(userId, accountEmail(name), password);
    if (error) {
      await store.release(userId);
      // An email that's already registered means the username was taken
      // (by an account whose row went missing); anything else is Supabase
      // refusing the password, e.g. a stricter policy set in the dashboard.
      return /already|registered|exists/i.test(error) ? fail(409, "That username is taken.") : fail(400, error);
    }
    return { status: 200, body: { username: name } };
  }

  if (action === "delete") {
    await store.deleteUser(userId);
    return { status: 200, body: { deleted: true } };
  }

  return fail(400, 'action must be "signup" or "delete"');
}
