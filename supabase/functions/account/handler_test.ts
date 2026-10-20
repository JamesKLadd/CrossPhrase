import { assertEquals } from "jsr:@std/assert@1";
import { accountEmail } from "../_shared/accountRules.ts";
import { type AccountStore, handleAccount } from "./handler.ts";

function fakeStore({ loginError = null as string | null, allowed = true } = {}) {
  const accounts = new Map<string, string>();
  const logins = new Map<string, { email: string; password: string }>();
  const deleted: string[] = [];
  const store: AccountStore = {
    allowed: () => Promise.resolve(allowed),
    hasAccount: (id) => Promise.resolve(accounts.has(id)),
    claim(id, username) {
      if ([...accounts.values()].some((u) => u.toLowerCase() === username.toLowerCase())) return Promise.resolve(false);
      accounts.set(id, username);
      return Promise.resolve(true);
    },
    release(id) {
      accounts.delete(id);
      return Promise.resolve();
    },
    setLogin(id, email, password) {
      if (loginError) return Promise.resolve(loginError);
      logins.set(id, { email, password });
      return Promise.resolve(null);
    },
    deleteUser(id) {
      deleted.push(id);
      accounts.delete(id);
      return Promise.resolve();
    },
  };
  return { store, accounts, logins, deleted };
}

const signup = (username: string, password = "owls read at night") => ({ action: "signup", username, password });

Deno.test("signing up turns the player's own user into an account", async () => {
  const { store, accounts, logins } = fakeStore();
  const outcome = await handleAccount(signup("  Hoot_42 "), "alice", store);
  assertEquals(outcome, { status: 200, body: { username: "Hoot_42" } });
  assertEquals(accounts.get("alice"), "Hoot_42");
  assertEquals(logins.get("alice"), { email: accountEmail("Hoot_42"), password: "owls read at night" });
  assertEquals(accountEmail("Hoot_42"), "hoot_42@players.crossphrase.invalid");
});

Deno.test("usernames are unique whatever their case, and one account each", async () => {
  const { store } = fakeStore();
  await handleAccount(signup("Hoot"), "alice", store);
  assertEquals((await handleAccount(signup("hoot"), "bob", store)).body.error, "That username is taken.");
  assertEquals((await handleAccount(signup("Other"), "alice", store)).status, 409);
});

Deno.test("bad usernames and passwords are refused before anything is saved", async () => {
  const { store, accounts } = fakeStore();
  for (const body of [signup("no"), signup("bad name"), signup("admin"), signup("Hoot", "short"), signup("Hoot", "password1!")]) {
    assertEquals((await handleAccount(body, "alice", store)).status, 400);
  }
  assertEquals(accounts.size, 0);
  assertEquals((await handleAccount({ action: "signup", username: 5 }, "alice", store)).status, 400);
});

Deno.test("a sign-up Supabase refuses gives the username back", async () => {
  const { store, accounts } = fakeStore({ loginError: "A user with this email address has already been registered" });
  assertEquals((await handleAccount(signup("Hoot"), "alice", store)).body.error, "That username is taken.");
  assertEquals(accounts.size, 0);
  const weak = fakeStore({ loginError: "Password should contain at least one symbol" });
  const outcome = await handleAccount(signup("Hoot"), "alice", weak.store);
  assertEquals(outcome, { status: 400, body: { error: "Password should contain at least one symbol" } });
});

Deno.test("deleting removes the player's user", async () => {
  const { store, deleted } = fakeStore();
  assertEquals((await handleAccount({ action: "delete" }, "alice", store)).status, 200);
  assertEquals(deleted, ["alice"]);
});

Deno.test("rate limits and malformed requests", async () => {
  assertEquals((await handleAccount(signup("Hoot"), "alice", fakeStore({ allowed: false }).store)).status, 429);
  const { store } = fakeStore();
  assertEquals((await handleAccount("x", "alice", store)).status, 400);
  assertEquals((await handleAccount({ action: "steal" }, "alice", store)).status, 400);
});
