import type { KeyValueStorage } from '../../judge/verdictStore';
import {
  createProgressStore,
  currentLevelIndex,
  dailyStreak,
  isUnlocked,
  totalStars,
  type DailyRecord,
} from '../progressStore';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const IDS = ['a', 'b', 'c'];

describe('progress', () => {
  it('keeps the best stars and the best score separately', () => {
    const store = createProgressStore(memoryStorage());
    expect(store.record('a', { stars: 2, total: 40 })).toEqual({ newBest: true, moreStars: true });
    expect(store.record('a', { stars: 1, total: 30 })).toEqual({ newBest: false, moreStars: false });
    expect(store.record('a', { stars: 3, total: 35 })).toEqual({ newBest: false, moreStars: true });
    expect(store.snapshot().levels.a).toEqual({ stars: 3, best: 40 });
  });

  it('survives a restart, and resets', () => {
    const storage = memoryStorage();
    createProgressStore(storage).record('a', { stars: 1, total: 10 });
    const reopened = createProgressStore(storage);
    expect(reopened.snapshot().levels.a).toEqual({ stars: 1, best: 10 });
    reopened.reset();
    expect(createProgressStore(storage).snapshot().levels).toEqual({});
  });

  it('starts over when the saved data is unreadable', () => {
    const storage = memoryStorage();
    storage.setItem('crossphrase:v1:progress', '{oops');
    expect(createProgressStore(storage).snapshot()).toEqual({
      levels: {},
      unlockAll: false,
      daily: {},
      zen: { boards: 0, points: 0, best: 0 },
    });
  });

  it('unlocks a level once the one before it is cleared', () => {
    const store = createProgressStore(memoryStorage());
    expect([0, 1, 2].map((i) => isUnlocked(store.snapshot(), IDS, i))).toEqual([true, false, false]);
    store.record('a', { stars: 1, total: 10 });
    expect([0, 1, 2].map((i) => isUnlocked(store.snapshot(), IDS, i))).toEqual([true, true, false]);
    expect(currentLevelIndex(store.snapshot(), IDS)).toBe(1);
    store.setUnlockAll(true);
    expect(isUnlocked(store.snapshot(), IDS, 2)).toBe(true);
  });

  it('counts stars and notifies listeners', () => {
    const store = createProgressStore(memoryStorage());
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    store.record('a', { stars: 2, total: 10 });
    store.record('b', { stars: 3, total: 10 });
    expect(totalStars(store.snapshot())).toBe(5);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.reset();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('daily puzzles and zen', () => {
  const won: DailyRecord = { log: [{ type: 'submit' }], finished: true, won: true, stars: 2, total: 40, submitted: false };
  const previous = (day: string) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  it('save daily attempts, and know when the leaderboard has them', () => {
    const store = createProgressStore(memoryStorage());
    store.saveDaily('2026-10-20', won);
    store.markDailySubmitted('2026-10-20');
    expect(store.snapshot().daily['2026-10-20']).toEqual({ ...won, submitted: true });
  });

  it('count a streak of daily wins up to today or yesterday', () => {
    const store = createProgressStore(memoryStorage());
    for (const day of ['2026-10-17', '2026-10-18', '2026-10-19']) store.saveDaily(day, won);
    store.saveDaily('2026-10-16', { ...won, won: false });
    expect(dailyStreak(store.snapshot(), '2026-10-20', previous)).toBe(3);
    expect(dailyStreak(store.snapshot(), '2026-10-19', previous)).toBe(3);
    expect(dailyStreak(store.snapshot(), '2026-10-22', previous)).toBe(0);
  });

  it('add up zen boards', () => {
    const store = createProgressStore(memoryStorage());
    store.recordZenBoard(30);
    store.recordZenBoard(50);
    expect(store.snapshot().zen).toEqual({ boards: 2, points: 80, best: 50 });
  });

  it('keep progress saved before dailies existed', () => {
    const storage = memoryStorage();
    storage.setItem('crossphrase:v1:progress', JSON.stringify({ levels: { a: { stars: 1, best: 9 } }, unlockAll: false }));
    const snapshot = createProgressStore(storage).snapshot();
    expect(snapshot.levels.a).toEqual({ stars: 1, best: 9 });
    expect(snapshot.daily).toEqual({});
  });
});
