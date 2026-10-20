import { DEFAULT_ECONOMY, parseEconomy } from '../../core/economy';
import type { KeyValueStorage } from '../../judge/verdictStore';
import { createWalletStore } from '../walletStore';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('the wallet', () => {
  it('starts with the starting feathers and full hearts, and remembers changes', () => {
    const storage = memoryStorage();
    let time = 1_000_000;
    const store = createWalletStore(storage, () => DEFAULT_ECONOMY, () => time);
    expect(store.snapshot().feathers).toBe(30);
    store.earn(15);
    expect(store.spend(40)).toBe(true);
    expect(store.spend(40)).toBe(false);
    store.loseLife();
    store.loseLife();
    time += 30 * 60_000;
    const again = createWalletStore(storage, () => DEFAULT_ECONOMY, () => time);
    expect(again.snapshot().feathers).toBe(5);
    expect(again.lives()).toMatchObject({ lives: 4 });
  });

  it('follows the remote config as it changes', () => {
    let config = DEFAULT_ECONOMY;
    const store = createWalletStore(memoryStorage(), () => config, () => 0);
    store.loseLife();
    expect(store.lives().lives).toBe(4);
    config = parseEconomy({ lives: { enabled: false } });
    expect(store.lives()).toMatchObject({ lives: 5, unlimited: true });
  });

  it('refills hearts for feathers and resets', () => {
    const store = createWalletStore(memoryStorage(), () => DEFAULT_ECONOMY, () => 0);
    store.loseLife();
    expect(store.refill()).toBe(true);
    expect(store.snapshot()).toMatchObject({ lives: 5, feathers: 0 });
    store.reset();
    expect(store.snapshot().feathers).toBe(30);
  });

  it('starts over from unreadable saved data', () => {
    const storage = memoryStorage();
    storage.setItem('crossphrase:v1:wallet', '{"feathers": "lots"}');
    expect(createWalletStore(storage, () => DEFAULT_ECONOMY, () => 0).snapshot().feathers).toBe(30);
  });
});
