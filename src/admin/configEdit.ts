import { DEFAULT_ECONOMY, type EconomyConfig } from '../core/economy';
import type { LevelTweak } from '../core/tuning';

// Editing the remote config's raw JSON from the admin dashboard. Each edit
// changes one thing and keeps everything else in the value as it was,
// including keys this version of the game doesn't know about.

type Json = Record<string, unknown>;

const object = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};

/** A tweak with its no-op parts dropped, or null if nothing is left. */
function tidy(tweak: LevelTweak): LevelTweak | null {
  const out: LevelTweak = {};
  if (tweak.swaps) out.swaps = tweak.swaps;
  if (tweak.stars !== undefined && Math.abs(tweak.stars - 1) > 1e-9) out.stars = Math.round(tweak.stars * 100) / 100;
  return Object.keys(out).length ? out : null;
}

/** The raw `tuning` value with one level's (`levels`) or band's (`bands`) tweak replaced; a no-op tweak removes it. */
export function withTweak(raw: unknown, group: 'levels' | 'bands', id: string, tweak: LevelTweak): Json {
  const tuning = { ...object(raw) };
  const entries = { ...object(tuning[group]) };
  const tidied = tidy(tweak);
  if (tidied) entries[id] = tidied;
  else delete entries[id];
  if (Object.keys(entries).length) tuning[group] = entries;
  else delete tuning[group];
  return tuning;
}

/** One level's or band's tweak as stored (empty if none). */
export function tweakOf(raw: unknown, group: 'levels' | 'bands', id: string): LevelTweak {
  const t = object(object(object(raw)[group])[id]);
  return {
    ...(Number.isInteger(t.swaps) ? { swaps: t.swaps as number } : {}),
    ...(typeof t.stars === 'number' ? { stars: t.stars } : {}),
  };
}

/** Only the economy settings that differ from the defaults in code, so later changes to the defaults still reach players. */
export function economyOverrides(config: EconomyConfig, base: EconomyConfig = DEFAULT_ECONOMY): Json {
  const diff = (a: unknown, b: unknown): unknown => {
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      const out: Json = {};
      for (const key of Object.keys(a)) {
        const d = diff((a as Json)[key], (b as Json)[key]);
        if (d !== undefined) out[key] = d;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return a === b ? undefined : a;
  };
  const { startingFeathers: _, ...rest } = config;
  const { startingFeathers: __, ...defaults } = base;
  return (diff(rest, defaults) as Json | undefined) ?? {};
}
