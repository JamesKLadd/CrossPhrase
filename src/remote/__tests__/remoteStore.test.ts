import type { KeyValueStorage } from '../../judge/verdictStore';
import { createRemoteConfigStore, DEFAULT_REMOTE_CONFIG } from '../remoteStore';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('remote config', () => {
  it('uses the defaults until it has been fetched, then keeps the values for next time', async () => {
    const storage = memoryStorage();
    const fetcher = async () => ({ economy: { lives: { max: 7 } }, tuning: { bands: { mid: { swaps: 1 } } } });
    const store = createRemoteConfigStore(storage, fetcher);
    expect(store.snapshot()).toEqual(DEFAULT_REMOTE_CONFIG);
    const changed = jest.fn();
    store.subscribe(changed);
    expect(await store.refresh()).toBe(true);
    expect(changed).toHaveBeenCalled();
    expect(store.snapshot().economy.lives.max).toBe(7);
    const offline = createRemoteConfigStore(storage, async () => Promise.reject(new Error('offline')));
    expect(offline.snapshot().tuning).toEqual({ bands: { mid: { swaps: 1 } } });
    expect(await offline.refresh()).toBe(false);
    expect(offline.snapshot().economy.lives.max).toBe(7);
  });

  it('ignores values it does not understand', async () => {
    const store = createRemoteConfigStore(memoryStorage(), async () => ({ economy: 'oops', tuning: [1, 2] }));
    await store.refresh();
    expect(store.snapshot()).toEqual(DEFAULT_REMOTE_CONFIG);
  });

  it('does nothing without a backend', async () => {
    const store = createRemoteConfigStore(memoryStorage(), null);
    expect(await store.refresh()).toBe(false);
  });
});
