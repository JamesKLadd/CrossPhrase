import type { KeyValueStorage } from '../judge/verdictStore';

// The player's progress on this device: the best stars and score per level,
// which decides what's unlocked on the level map. (Cloud save is for later,
// with the Supabase backend.)

export interface LevelProgress {
  stars: 0 | 1 | 2 | 3;
  best: number;
}

export interface ProgressSnapshot {
  levels: Readonly<Record<string, LevelProgress>>;
  /** Developer switch: every level playable regardless of progress. */
  unlockAll: boolean;
}

export interface RecordOutcome {
  /** The score beat this level's previous best (true the first time it's cleared). */
  newBest: boolean;
  /** More stars than ever before on this level. */
  moreStars: boolean;
}

export interface ProgressStore {
  snapshot(): ProgressSnapshot;
  /** Saves a cleared level's result, keeping the best stars and score separately. */
  record(levelId: string, result: { stars: 0 | 1 | 2 | 3; total: number }): RecordOutcome;
  setUnlockAll(on: boolean): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

const KEY = 'crossphrase:v1:progress';

function read(storage: KeyValueStorage): ProgressSnapshot {
  try {
    const value = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (value && typeof value === 'object' && value.levels && typeof value.levels === 'object') {
      return { levels: value.levels, unlockAll: value.unlockAll === true };
    }
  } catch {
    // Unreadable progress starts over rather than crashing the map.
  }
  return { levels: {}, unlockAll: false };
}

export function createProgressStore(storage: KeyValueStorage): ProgressStore {
  let current = read(storage);
  const listeners = new Set<() => void>();
  const update = (next: ProgressSnapshot) => {
    current = next;
    storage.setItem(KEY, JSON.stringify(next));
    for (const listener of listeners) listener();
  };

  return {
    snapshot: () => current,
    record(levelId, { stars, total }) {
      const previous = current.levels[levelId];
      const outcome = {
        newBest: !previous || total > previous.best,
        moreStars: stars > (previous?.stars ?? 0),
      };
      if (outcome.newBest || outcome.moreStars) {
        const saved: LevelProgress = {
          stars: Math.max(stars, previous?.stars ?? 0) as LevelProgress['stars'],
          best: Math.max(total, previous?.best ?? 0),
        };
        update({ ...current, levels: { ...current.levels, [levelId]: saved } });
      }
      return outcome;
    },
    setUnlockAll(on) {
      update({ ...current, unlockAll: on });
    },
    reset() {
      update({ levels: {}, unlockAll: current.unlockAll });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** A level is playable once the one before it has been cleared. */
export function isUnlocked(progress: ProgressSnapshot, levelIds: readonly string[], index: number): boolean {
  if (index <= 0 || progress.unlockAll) return true;
  return (progress.levels[levelIds[index - 1]]?.stars ?? 0) > 0;
}

/** The first level not yet cleared: where the map scrolls to. */
export function currentLevelIndex(progress: ProgressSnapshot, levelIds: readonly string[]): number {
  const index = levelIds.findIndex((id) => (progress.levels[id]?.stars ?? 0) === 0);
  return index === -1 ? levelIds.length - 1 : index;
}

export function totalStars(progress: ProgressSnapshot): number {
  return Object.values(progress.levels).reduce((sum, l) => sum + l.stars, 0);
}
