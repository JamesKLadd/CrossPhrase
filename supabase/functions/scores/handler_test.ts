import { assertEquals } from "jsr:@std/assert@1";
import { dailyLevel, levelById, sampleRun } from "../_shared/scores.bundle.js";
import { handleScore, type ScoreStore } from "./handler.ts";

const NOW = new Date("2026-10-20T12:00:00Z");

function fakeStore() {
  const daily = new Map<string, number>();
  const levels = new Map<string, number>();
  const store: ScoreStore = {
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
  const actions = sampleRun(dailyLevel("2026-10-20"));
  const first = await handleScore({ kind: "daily", day: "2026-10-20", actions }, "alice", store, NOW);
  assertEquals(first.status, 200);
  assertEquals(first.body.won, true);
  assertEquals(first.body.saved, true);
  const again = await handleScore({ kind: "daily", day: "2026-10-20", actions }, "alice", store, NOW);
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

Deno.test("malformed requests", async () => {
  const { store } = fakeStore();
  assertEquals((await handleScore("x", "a", store, NOW)).status, 400);
  assertEquals((await handleScore({ kind: "weekly" }, "a", store, NOW)).status, 400);
  assertEquals((await handleScore({ kind: "daily", day: 5 }, "a", store, NOW)).status, 400);
  assertEquals((await handleScore({ kind: "daily", day: "1999-01-01", actions: [] }, "a", store, NOW)).status, 422);
});
