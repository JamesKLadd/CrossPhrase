/**
 * Seeded PRNG (mulberry32) as a pure function, so game state stays
 * serialisable and replays are deterministic.
 * Returns [value in [0, 1), next state].
 */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}
