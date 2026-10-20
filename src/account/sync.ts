import type { KeyValueStorage } from '../judge/verdictStore';
import type { ProgressStore } from '../progress/progressStore';
import type { WalletStore } from '../economy/walletStore';
import { forCloud, mergeSaves, parseSave, stableJson, type SaveData } from './merge';

// The account on this device and its cloud save. Syncing reads the cloud save,
// merges it with this device's progress and wallet (src/account/merge.ts),
// keeps the result here, and writes it back unless nothing changed. The write
// only succeeds over the version that was read, so two devices syncing at once
// just merge again (see put_save in the accounts migration).

export interface AccountState {
  /** The Supabase user the account is, or null for a guest. */
  userId: string | null;
  username: string | null;
  /** When this device last saved to (or caught up with) the cloud, ISO time. */
  syncedAt: string | null;
  /** What happened on the last try, for the account screen. */
  status: 'idle' | 'syncing' | 'offline' | 'signed-out';
}

export interface SaveBackend {
  /** The signed-in user's id, or null if nobody is. */
  userId(): Promise<string | null>;
  /** The cloud save and its version, or null if there isn't one yet. */
  get(): Promise<{ data: unknown; updatedAt: string } | null>;
  /** Writes over version `expected`; returns the new version, or null if the save changed since. */
  put(data: SaveData, expected: string | null): Promise<string | null>;
}

export type SyncResult = 'saved' | 'up-to-date' | 'guest' | 'signed-out' | 'offline';

const KEY = 'crossphrase:v1:account';
const GUEST: AccountState = { userId: null, username: null, syncedAt: null, status: 'idle' };
/** Writes lost to another device saving at the same moment are retried this many times. */
const ATTEMPTS = 3;

export function createAccountSync({
  storage,
  backend,
  progress,
  wallet,
  today,
  now = () => new Date(),
}: {
  storage: KeyValueStorage;
  backend: SaveBackend;
  progress: ProgressStore;
  wallet: WalletStore;
  today: () => string;
  now?: () => Date;
}) {
  let state: AccountState = GUEST;
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (saved && typeof saved.userId === 'string' && typeof saved.username === 'string') {
      state = { ...GUEST, userId: saved.userId, username: saved.username, syncedAt: saved.syncedAt ?? null };
    }
  } catch {
    // A guest, then.
  }
  const listeners = new Set<() => void>();
  const set = (changes: Partial<AccountState>) => {
    state = { ...state, ...changes };
    const { userId, username, syncedAt } = state;
    storage.setItem(KEY, JSON.stringify({ userId, username, syncedAt }));
    for (const listener of listeners) listener();
  };

  /** True while a merged save is being written back to the stores (their change events aren't new play). */
  let applying = false;
  let running: Promise<SyncResult> | null = null;
  let again = false;

  const deviceSave = (): SaveData => ({ v: 1, progress: progress.snapshot(), wallet: wallet.exportSave() });

  function apply(merged: SaveData, device: SaveData) {
    applying = true;
    try {
      if (stableJson(merged.progress) !== stableJson(device.progress)) progress.replace(merged.progress);
      if (stableJson(merged.wallet) !== stableJson(device.wallet)) wallet.importSave(merged.wallet);
    } finally {
      applying = false;
    }
  }

  async function syncOnce(): Promise<SyncResult> {
    if (!state.userId) return 'guest';
    const userId = state.userId;
    try {
      if ((await backend.userId()) !== userId) {
        // The login ended (deleted on another device, or signed out): keep the
        // progress here and ask to log in again, which merges it back.
        set({ userId: null, status: 'signed-out' });
        return 'signed-out';
      }
      set({ status: 'syncing' });
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const remote = await backend.get();
        const cloud = remote ? parseSave(remote.data) : null;
        const device = deviceSave();
        const merged = cloud ? mergeSaves(cloud, device) : device;
        apply(merged, device);
        const upload = forCloud(merged, today());
        if (cloud && stableJson(upload) === stableJson(forCloud(cloud, today()))) {
          set({ status: 'idle', syncedAt: now().toISOString() });
          return 'up-to-date';
        }
        if (await backend.put(upload, remote?.updatedAt ?? null)) {
          set({ status: 'idle', syncedAt: now().toISOString() });
          return 'saved';
        }
      }
      throw new Error('the save kept changing');
    } catch (e) {
      console.warn("Couldn't sync the account:", e);
      set({ status: 'offline' });
      return 'offline';
    }
  }

  return {
    state: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Saves to the cloud now. Calls made while one runs are combined into one more run after it. */
    sync(): Promise<SyncResult> {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        let result: SyncResult;
        do {
          again = false;
          result = await syncOnce();
        } while (again);
        running = null;
        return result;
      })();
      return running;
    },
    /** True while sync is writing a merged save into the stores. */
    applying: () => applying,
    signIn(userId: string, username: string) {
      set({ userId, username, syncedAt: null, status: 'idle' });
    },
    /** Forgets the account on this device (logging out). */
    forget() {
      set({ ...GUEST });
    },
  };
}

export type AccountSync = ReturnType<typeof createAccountSync>;
