import {
  earn,
  gainLife,
  livesStatus,
  loseLife,
  newWallet,
  refillLives,
  settleLives,
  spend,
  type EconomyConfig,
  type LivesStatus,
  type Wallet,
} from '../core/economy';
import type { KeyValueStorage } from '../judge/verdictStore';

// The player's hearts and feathers on this device (the rules are in
// src/core/economy.ts). Feathers only come from play for now; when they can
// be bought, the wallet moves to the server so purchases can be checked.

export interface WalletStore {
  snapshot(): Wallet;
  lives(): LivesStatus;
  loseLife(): void;
  gainLife(): void;
  earn(feathers: number): void;
  /** False if the player can't afford it. */
  spend(feathers: number): boolean;
  /** Fills every heart for feathers. False if already full or unaffordable. */
  refill(): boolean;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

const KEY = 'crossphrase:v1:wallet';

function isWallet(value: unknown): value is Wallet {
  const w = value as Wallet;
  return (
    typeof w === 'object' && w !== null &&
    Number.isFinite(w.feathers) && Number.isFinite(w.lives) && Number.isFinite(w.livesAt)
  );
}

export function createWalletStore(
  storage: KeyValueStorage,
  config: () => EconomyConfig,
  now: () => number = Date.now,
): WalletStore {
  let current: Wallet;
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? 'null');
    current = isWallet(saved) ? saved : newWallet(config(), now());
  } catch {
    current = newWallet(config(), now());
  }
  const listeners = new Set<() => void>();
  const update = (next: Wallet) => {
    current = next;
    storage.setItem(KEY, JSON.stringify(next));
    for (const listener of listeners) listener();
  };

  return {
    snapshot: () => current,
    lives: () => livesStatus(current, config(), now()),
    loseLife: () => update(loseLife(current, config(), now())),
    gainLife: () => update(gainLife(current, config(), now())),
    earn: (feathers) => {
      if (feathers > 0) update(earn(current, feathers));
    },
    spend(feathers) {
      const paid = spend(settleLives(current, config(), now()), feathers);
      if (paid) update(paid);
      return paid !== null;
    },
    refill() {
      const refilled = refillLives(current, config(), now());
      if (refilled) update(refilled);
      return refilled !== null;
    },
    reset: () => update(newWallet(config(), now())),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
