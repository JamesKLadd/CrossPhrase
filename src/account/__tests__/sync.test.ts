import { DEFAULT_ECONOMY } from '../../core/economy';
import { createWalletStore } from '../../economy/walletStore';
import type { KeyValueStorage } from '../../judge/verdictStore';
import { createProgressStore } from '../../progress/progressStore';
import type { SaveData } from '../merge';
import { createAccountSync, type SaveBackend } from '../sync';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** A cloud with one save, shared by every "device" made from it. */
function fakeCloud() {
  let save: { data: unknown; updatedAt: string } | null = null;
  let version = 0;
  const cloud = {
    signedIn: 'user-1' as string | null,
    puts: 0,
    offline: false,
    /** Lets a test sneak in another device's write between a read and a write. */
    beforePut: null as null | (() => void),
    current: () => save?.data as SaveData | undefined,
    write(data: unknown) {
      save = { data: JSON.parse(JSON.stringify(data)), updatedAt: `v${++version}` };
    },
  };
  const backend: SaveBackend = {
    userId: async () => {
      if (cloud.offline) throw new Error('offline');
      return cloud.signedIn;
    },
    get: async () => save && { ...save },
    put: async (data, expected) => {
      cloud.beforePut?.();
      cloud.beforePut = null;
      if ((save?.updatedAt ?? null) !== expected) return null;
      cloud.puts++;
      cloud.write(data);
      return save!.updatedAt;
    },
  };
  return { cloud, backend };
}

function device(backend: SaveBackend) {
  const storage = memoryStorage();
  const progress = createProgressStore(storage);
  const wallet = createWalletStore(storage, () => DEFAULT_ECONOMY, () => 1_000);
  const sync = createAccountSync({ storage, backend, progress, wallet, today: () => '2026-10-20' });
  return { storage, progress, wallet, sync };
}

describe('account sync', () => {
  it('does nothing for a guest', async () => {
    const { backend, cloud } = fakeCloud();
    const phone = device(backend);
    expect(await phone.sync.sync()).toBe('guest');
    expect(cloud.puts).toBe(0);
  });

  it('carries progress and feathers to a second device, adding what was played there', async () => {
    const { backend, cloud } = fakeCloud();
    const phone = device(backend);
    phone.sync.signIn('user-1', 'Hoot');
    phone.progress.record('first-light', { stars: 3, total: 50 });
    phone.wallet.earn(15);
    expect(await phone.sync.sync()).toBe('saved');

    // A laptop where a guest already cleared another level and earned 5 feathers.
    const laptop = device(backend);
    laptop.progress.record('second-helping', { stars: 2, total: 30 });
    laptop.wallet.earn(5);
    laptop.sync.signIn('user-1', 'Hoot');
    expect(await laptop.sync.sync()).toBe('saved');
    expect(Object.keys(laptop.progress.snapshot().levels).sort()).toEqual(['first-light', 'second-helping']);
    // 30 to start (the account's, once), +15 on the phone, +5 on the laptop.
    expect(laptop.wallet.snapshot().feathers).toBe(50);

    // The phone catches up; it has nothing the cloud lacks, so nothing to write.
    expect(await phone.sync.sync()).toBe('up-to-date');
    expect(phone.wallet.snapshot().feathers).toBe(50);
    expect(Object.keys(phone.progress.snapshot().levels)).toHaveLength(2);
    expect(cloud.current()!.progress.levels['second-helping'].stars).toBe(2);
  });

  it('keeps spending on one device and earning on another', async () => {
    const { backend } = fakeCloud();
    const phone = device(backend);
    phone.sync.signIn('user-1', 'Hoot');
    await phone.sync.sync();
    const laptop = device(backend);
    laptop.sync.signIn('user-1', 'Hoot');
    await laptop.sync.sync();
    expect(phone.wallet.spend(20)).toBe(true);
    laptop.wallet.earn(10);
    await phone.sync.sync();
    await laptop.sync.sync();
    await phone.sync.sync();
    expect(phone.wallet.snapshot().feathers).toBe(20);
    expect(laptop.wallet.snapshot().feathers).toBe(20);
  });

  it('merges again when another device saved in between', async () => {
    const { backend, cloud } = fakeCloud();
    const phone = device(backend);
    phone.sync.signIn('user-1', 'Hoot');
    await phone.sync.sync();
    phone.progress.record('first-light', { stars: 1, total: 20 });
    cloud.beforePut = () => {
      const save = cloud.current()!;
      cloud.write({ ...save, progress: { ...save.progress, levels: { 'night-owl': { stars: 3, best: 70 } } } });
    };
    expect(await phone.sync.sync()).toBe('saved');
    expect(Object.keys(cloud.current()!.progress.levels).sort()).toEqual(['first-light', 'night-owl']);
    expect(phone.progress.snapshot().levels['night-owl'].best).toBe(70);
  });

  it('notices when the login has ended, keeping the progress', async () => {
    const { backend, cloud } = fakeCloud();
    const phone = device(backend);
    phone.sync.signIn('user-1', 'Hoot');
    phone.progress.record('first-light', { stars: 1, total: 20 });
    cloud.signedIn = 'someone-else';
    expect(await phone.sync.sync()).toBe('signed-out');
    expect(phone.sync.state()).toMatchObject({ userId: null, username: 'Hoot', status: 'signed-out' });
    expect(phone.progress.snapshot().levels['first-light']).toBeDefined();
  });

  it('says when it is offline, and remembers the account across restarts', async () => {
    const { backend, cloud } = fakeCloud();
    const phone = device(backend);
    phone.sync.signIn('user-1', 'Hoot');
    cloud.offline = true;
    expect(await phone.sync.sync()).toBe('offline');
    const restarted = createAccountSync({
      storage: phone.storage,
      backend,
      progress: phone.progress,
      wallet: phone.wallet,
      today: () => '2026-10-20',
    });
    expect(restarted.state()).toMatchObject({ userId: 'user-1', username: 'Hoot' });
  });

  it('runs one sync at a time, then once more for calls made meanwhile', async () => {
    const { backend, cloud } = fakeCloud();
    const phone = device(backend);
    phone.sync.signIn('user-1', 'Hoot');
    const first = phone.sync.sync();
    phone.progress.record('first-light', { stars: 1, total: 20 });
    const second = phone.sync.sync();
    await Promise.all([first, second]);
    expect(cloud.current()!.progress.levels['first-light']).toBeDefined();
  });
});
