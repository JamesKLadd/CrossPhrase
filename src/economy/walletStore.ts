import {
  gainLife,
  livesStatus,
  loseLife,
  refillLives,
  settleLives,
  type EconomyConfig,
  type LivesStatus,
  type Wallet,
} from '../core/economy';
import type { KeyValueStorage } from '../judge/verdictStore';

// The player's hearts and feathers on this device (the rules are in
// src/core/economy.ts), saved so an account can carry them between devices.
//
// Feathers are kept as a ledger rather than a balance: each wallet (a device,
// from its last reset) counts what it has earned and spent, and the balance is
// the starting feathers plus every wallet's earnings minus its spending. Two
// devices' ledgers merge by taking the larger count for each wallet, so
// feathers spent on one phone stay spent and none earned on another are lost,
// however the syncs interleave. Hearts refill on their own, so the most
// recently changed hearts win instead.

export interface LedgerEntry {
  earned: number;
  spent: number;
}

/** The wallet as it's saved, on the device and in an account's cloud save. */
export interface WalletSave {
  /** Feathers the player started with. */
  base: number;
  ledger: Record<string, LedgerEntry>;
  lives: number;
  livesAt: number;
  /** When hearts last changed (ms); 0 if never. */
  livesChangedAt: number;
}

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
  /** Starts over as a new player (a new wallet in the ledger). */
  reset(): void;
  exportSave(): WalletSave;
  /** Adopts a merged save (see mergeWallets), keeping this device's own ledger entry. */
  importSave(save: WalletSave): void;
  subscribe(listener: () => void): () => void;
}

interface Stored extends WalletSave {
  /** This wallet's entry in the ledger. */
  key: string;
}

const KEY = 'crossphrase:v1:wallet';

export function feathersOf(save: Pick<WalletSave, 'base' | 'ledger'>): number {
  return Object.values(save.ledger).reduce((sum, e) => sum + e.earned - e.spent, save.base);
}

/** Two saves of one player's wallet, combined (`a` wins ties and keeps its starting feathers). */
export function mergeWallets(a: WalletSave, b: WalletSave): WalletSave {
  const ledger: Record<string, LedgerEntry> = { ...a.ledger };
  for (const [key, entry] of Object.entries(b.ledger)) {
    const mine = ledger[key];
    ledger[key] = mine
      ? { earned: Math.max(mine.earned, entry.earned), spent: Math.max(mine.spent, entry.spent) }
      : entry;
  }
  const hearts = b.livesChangedAt > a.livesChangedAt ? b : a;
  return {
    base: a.base,
    ledger,
    lives: hearts.lives,
    livesAt: hearts.livesAt,
    livesChangedAt: hearts.livesChangedAt,
  };
}

const count = (value: unknown) => (Number.isFinite(value) && (value as number) >= 0 ? (value as number) : 0);

/** A wallet save read from untrusted JSON (storage or the cloud). Null if it isn't one. */
export function parseWalletSave(value: unknown): WalletSave | null {
  const w = value as Partial<WalletSave> | null;
  if (typeof w !== 'object' || w === null || !Number.isFinite(w.base) || !Number.isFinite(w.lives)) return null;
  const ledger: Record<string, LedgerEntry> = {};
  for (const [key, entry] of Object.entries(typeof w.ledger === 'object' && w.ledger ? w.ledger : {})) {
    ledger[key] = { earned: count((entry as LedgerEntry)?.earned), spent: count((entry as LedgerEntry)?.spent) };
  }
  return {
    base: w.base as number,
    ledger,
    lives: count(w.lives),
    livesAt: count(w.livesAt),
    livesChangedAt: count(w.livesChangedAt),
  };
}

const newKey = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function fresh(config: EconomyConfig, now: number): Stored {
  return { key: newKey(), base: config.startingFeathers, ledger: {}, lives: config.lives.max, livesAt: now, livesChangedAt: 0 };
}

function read(storage: KeyValueStorage, config: EconomyConfig, now: number): Stored {
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (saved && typeof saved.key === 'string') {
      const parsed = parseWalletSave(saved);
      if (parsed) return { ...parsed, key: saved.key };
    }
    // A wallet from before the ledger: its balance becomes the starting feathers.
    if (saved && Number.isFinite(saved.feathers) && Number.isFinite(saved.lives) && Number.isFinite(saved.livesAt)) {
      return { key: newKey(), base: saved.feathers, ledger: {}, lives: saved.lives, livesAt: saved.livesAt, livesChangedAt: 0 };
    }
  } catch {
    // Unreadable: start over.
  }
  return fresh(config, now);
}

const toWallet = (s: Stored): Wallet => ({ feathers: feathersOf(s), lives: s.lives, livesAt: s.livesAt });

export function createWalletStore(
  storage: KeyValueStorage,
  config: () => EconomyConfig,
  now: () => number = Date.now,
): WalletStore {
  let stored = read(storage, config(), now());
  let wallet = toWallet(stored);
  const listeners = new Set<() => void>();
  const update = (next: Stored) => {
    stored = next;
    wallet = toWallet(next);
    storage.setItem(KEY, JSON.stringify(next));
    for (const listener of listeners) listener();
  };
  const entry = (): LedgerEntry => stored.ledger[stored.key] ?? { earned: 0, spent: 0 };
  const withEntry = (changes: Partial<LedgerEntry>): Stored => ({
    ...stored,
    ledger: { ...stored.ledger, [stored.key]: { ...entry(), ...changes } },
  });
  const withHearts = (next: Wallet): Stored => ({
    ...stored,
    lives: next.lives,
    livesAt: next.livesAt,
    livesChangedAt: now(),
  });

  return {
    snapshot: () => wallet,
    lives: () => livesStatus(wallet, config(), now()),
    loseLife: () => {
      if (config().lives.enabled) update(withHearts(loseLife(wallet, config(), now())));
    },
    gainLife: () => update(withHearts(gainLife(wallet, config(), now()))),
    earn: (feathers) => {
      if (feathers > 0) update(withEntry({ earned: entry().earned + feathers }));
    },
    spend(feathers) {
      if (wallet.feathers < feathers) return false;
      const hearts = settleLives(wallet, config(), now());
      update({ ...withEntry({ spent: entry().spent + feathers }), lives: hearts.lives, livesAt: hearts.livesAt });
      return true;
    },
    refill() {
      const refilled = refillLives(wallet, config(), now());
      if (!refilled) return false;
      const cost = wallet.feathers - refilled.feathers;
      update({ ...withEntry({ spent: entry().spent + cost }), lives: refilled.lives, livesAt: refilled.livesAt, livesChangedAt: now() });
      return true;
    },
    reset: () => update(fresh(config(), now())),
    exportSave: () => {
      const { key: _, ...save } = stored;
      return save;
    },
    importSave: (save) => update({ ...save, key: stored.key }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
