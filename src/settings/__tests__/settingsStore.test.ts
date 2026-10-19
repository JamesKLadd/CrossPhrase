import type { KeyValueStorage } from '../../judge/verdictStore';
import { createSettingsStore, DEFAULT_SETTINGS } from '../settingsStore';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('settings', () => {
  it('start from the defaults and remember changes', () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    expect(store.snapshot()).toEqual(DEFAULT_SETTINGS);
    store.set({ music: false, colorBlind: true });
    expect(createSettingsStore(storage).snapshot()).toEqual({
      ...DEFAULT_SETTINGS,
      music: false,
      colorBlind: true,
    });
  });

  it('ignore unknown or broken saved values', () => {
    const storage = memoryStorage();
    storage.setItem('crossphrase:v1:settings', JSON.stringify({ sound: 'loud', haptics: false, extra: 1 }));
    expect(createSettingsStore(storage).snapshot()).toEqual({ ...DEFAULT_SETTINGS, haptics: false });
    storage.setItem('crossphrase:v1:settings', '{nope');
    expect(createSettingsStore(storage).snapshot()).toEqual(DEFAULT_SETTINGS);
  });

  it('tell listeners about changes', () => {
    const store = createSettingsStore(memoryStorage());
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    store.set({ sound: false });
    unsubscribe();
    store.set({ sound: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
