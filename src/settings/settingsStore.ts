import type { KeyValueStorage } from '../judge/verdictStore';

// The player's preferences, kept on the device.

export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  /** Fewer, shorter animations. The phone's own "reduce motion" setting also applies. */
  reduceMotion: boolean;
  /** Verdict colours that stay distinct with common colour blindness. */
  colorBlind: boolean;
  /** Send anonymous play stats (levels won and lost, boosters used) to help tune the game. */
  analytics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  haptics: true,
  reduceMotion: false,
  colorBlind: false,
  analytics: true,
};

export interface SettingsStore {
  snapshot(): Settings;
  set(changes: Partial<Settings>): void;
  subscribe(listener: () => void): () => void;
}

const KEY = 'crossphrase:v1:settings';

function read(storage: KeyValueStorage): Settings {
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? '{}');
    const settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (typeof saved?.[key] === 'boolean') settings[key] = saved[key];
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function createSettingsStore(storage: KeyValueStorage): SettingsStore {
  let current = read(storage);
  const listeners = new Set<() => void>();
  return {
    snapshot: () => current,
    set(changes) {
      current = { ...current, ...changes };
      storage.setItem(KEY, JSON.stringify(current));
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
