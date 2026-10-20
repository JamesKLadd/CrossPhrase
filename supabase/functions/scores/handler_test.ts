import { assertEquals } from "jsr:@std/assert@1";
import { dailyLevel, levelById, sampleRun } from "../_shared/scores.bundle.js";
import { handleScore, type ScoreStore } from "./handler.ts";

const NOW = new Date("2026-10-20T12:00:00Z");

function fakeStore(tuning: unknown = {}) {
  const daily = new Map<string, number>();
  const levels = new Map<string, number>();
  const store: ScoreStore = {
    tuning: () => Promise.resolve(tuning),
    saveDaily(row) {
      const key = `${row.userId}:${row.day}`;
      if (daily.has(key)) return Promise.resolve(false);
      daily.set(key, row.score);
      return Promise.resolve(true);
    },
    saveLevel(row) {
      const key = `${row.userId}:${row.levelId}`;
      if ((levels.get(key) ?? -1) >= row.score) return Promise.resolve(false);
      levels.set(key, row.score);
      return Promise.resolve(true);
    },
  };
  return { store, daily, levels };
}

Deno.test("a real daily run is scored and saved once", async () => {
  const { store, daily } = fakeStore();
  // The 21st: the first daily with balanced hands, which the bot (playing only plain English) can clear.
  const actions = sampleRun(dailyLevel("2026-10-21"));
  const first = await handleScore({ kind: "daily", day: "2026-10-21", actions }, "alice", store, NOW);
  assertEquals(first.status, 200);
  assertEquals(first.body.won, true);
  assertEquals(first.body.saved, true);
  const again = await handleScore({ kind: "daily", day: "2026-10-21", actions }, "alice", store, NOW);
  assertEquals(again.body.saved, false);
  assertEquals(daily.size, 1);
});

Deno.test("a forged run is turned away", async () => {
  const { store, daily } = fakeStore();
  const actions = [{ type: "place", tileId: 99, cell: "0,0" }, { type: "submit" }];
  const outcome = await handleScore({ kind: "daily", day: "2026-10-20", actions }, "mallory", store, NOW);
  assertEquals(outcome.status, 422);
  assertEquals(outcome.body.error, "move 1 isn't allowed");
  assertEquals(daily.size, 0);
});

Deno.test("level clears keep each player's best", async () => {
  const { store, levels } = fakeStore();
  const actions = sampleRun(levelById("first-light"));
  const outcome = await handleScore({ kind: "level", levelId: "first-light", actions }, "alice", store, NOW);
  assertEquals(outcome.status, 200);
  assertEquals(outcome.body.saved, true);
  assertEquals(levels.size, 1);
});

Deno.test("level clears are scored with the remote tuning", async () => {
  const actions = sampleRun(levelById("level-41"));
  const plain = await handleScore({ kind: "level", levelId: "level-41", actions }, "alice", fakeStore().store, NOW);
  const eased = await handleScore(
    { kind: "level", levelId: "level-41", actions },
    "alice",
    fakeStore({ bands: { mid: { stars: 0.5 } } }).store,
    NOW,
  );
  assertEquals(plain.status, 200);
  assertEquals(eased.body.stars, 3);
  assertEquals(eased.body.score, plain.body.score);
});

Deno.test("boosted runs are turned away", async () => {
  const outcome = await handleScore(
    { kind: "level", levelId: "level-41", actions: [{ type: "addSwaps", count: 2 }] },
    "alice",
    fakeStore().store,
    NOW,
  );
  assertEquals(outcome.status, 422);
  assertEquals(outcome.body.error, "boosted games don't count on leaderboards");
});

Deno.test("malformed requests", async () => {
  const { store } = fakeStore();
  assertEquals((await handleScore("x", "a", store, NOW)).status, 400);
  assertEquals((await handleScore({ kind: "weekly" }, "a", store, NOW)).status, 400);
  assertEquals((await handleScore({ kind: "daily", day: 5 }, "a", store, NOW)).status, 400);
  assertEquals((await handleScore({ kind: "daily", day: "1999-01-01", actions: [] }, "a", store, NOW)).status, 422);
});
