import type { RunAction } from '../core/run';
import type { KeyValueStorage } from '../judge/verdictStore';

// The player's progress on this device: the best stars and score per level,
// which decides what's unlocked on the level map. (Cloud save is for later,
// with the Supabase backend.)

export interface LevelProgress {
  stars: 0 | 1 | 2 | 3;
  best: number;
}

/** A day's daily puzzle: one attempt, saved move by move so it can be resumed. */
export interface DailyRecord {
  /** The moves so far: replayed to resume, and sent to the leaderboard. */
  log: RunAction[];
  finished: boolean;
  won: boolean;
  stars: 0 | 1 | 2 | 3;
  total: number;
  /** The leaderboard has accepted this result. */
  submitted: boolean;
}

export interface ZenStats {
  boards: number;
  points: number;
  best: number;
}

export interface ProgressSnapshot {
  levels: Readonly<Record<string, LevelProgress>>;
  /** Developer switch: every level playable regardless of progress. */
  unlockAll: boolean;
  /** Daily puzzles by day ("YYYY-MM-DD"). */
  daily: Readonly<Record<string, DailyRecord>>;
  zen: ZenStats;
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
  saveDaily(day: string, record: DailyRecord): void;
  markDailySubmitted(day: string): void;
  recordZenBoard(total: number): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

const KEY = 'crossphrase:v1:progress';

const EMPTY_ZEN: ZenStats = { boards: 0, points: 0, best: 0 };

function read(storage: KeyValueStorage): ProgressSnapshot {
  try {
    const value = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (value && typeof value === 'object' && value.levels && typeof value.levels === 'object') {
      return {
        levels: value.levels,
        unlockAll: value.unlockAll === true,
        daily: value.daily && typeof value.daily === 'object' ? value.daily : {},
        zen: { ...EMPTY_ZEN, ...(value.zen ?? {}) },
      };
    }
  } catch {
    // Unreadable progress starts over rather than crashing the map.
  }
  return { levels: {}, unlockAll: false, daily: {}, zen: EMPTY_ZEN };
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
    saveDaily(day, record) {
      update({ ...current, daily: { ...current.daily, [day]: record } });
    },
    markDailySubmitted(day) {
      const record = current.daily[day];
      if (record) update({ ...current, daily: { ...current.daily, [day]: { ...record, submitted: true } } });
    },
    recordZenBoard(total) {
      const zen = current.zen;
      update({
        ...current,
        zen: { boards: zen.boards + 1, points: zen.points + total, best: Math.max(zen.best, total) },
      });
    },
    reset() {
      update({ levels: {}, unlockAll: current.unlockAll, daily: {}, zen: EMPTY_ZEN });
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

/** Daily puzzles won on consecutive days, up to today (or yesterday, if today's isn't won yet). */
export function dailyStreak(progress: ProgressSnapshot, today: string, previousDay: (day: string) => string): number {
  let day = progress.daily[today]?.won ? today : previousDay(today);
  let streak = 0;
  while (progress.daily[day]?.won) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}
