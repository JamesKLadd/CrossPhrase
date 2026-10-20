import { DEFAULT_ECONOMY, parseEconomy, type EconomyConfig } from '../core/economy';
import { parseTuning, type Tuning } from '../core/tuning';
import type { KeyValueStorage } from '../judge/verdictStore';

// Remote config: settings read from the backend's `remote_config` table when
// the game starts (see supabase/migrations/20261021120000_live_ops.sql), so
// the economy and level difficulty can change without a new build. The last
// values are kept on the device for the next start, and anything malformed
// falls back to the defaults in code.

export interface RemoteConfig {
  economy: EconomyConfig;
  tuning: Tuning;
}

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = { economy: DEFAULT_ECONOMY, tuning: {} };

/** Reads every row of `remote_config` as { key: value }. */
export type RemoteFetcher = () => Promise<Record<string, unknown>>;

export interface RemoteConfigStore {
  snapshot(): RemoteConfig;
  /** Fetches the latest values. Keeps the current ones if that fails. */
  refresh(): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

const KEY = 'crossphrase:v1:remote-config';

function parse(raw: Record<string, unknown>): RemoteConfig {
  return { economy: parseEconomy(raw.economy), tuning: parseTuning(raw.tuning) };
}

export function createRemoteConfigStore(storage: KeyValueStorage, fetcher: RemoteFetcher | null): RemoteConfigStore {
  let raw: Record<string, unknown> = {};
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? '{}');
    if (saved && typeof saved === 'object') raw = saved;
  } catch {
    // A corrupt cache just means defaults until the next fetch.
  }
  let current = parse(raw);
  const listeners = new Set<() => void>();

  return {
    snapshot: () => current,
    async refresh() {
      if (!fetcher) return false;
      try {
        raw = await fetcher();
      } catch (e) {
        console.warn("Couldn't read the remote config:", e);
        return false;
      }
      storage.setItem(KEY, JSON.stringify(raw));
      current = parse(raw);
      for (const listener of listeners) listener();
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
