import { addDays } from '../data/dailies';
import { mergeWallets, parseWalletSave, type WalletSave } from '../economy/walletStore';
import { parseProgress, type DailyRecord, type LevelProgress, type ProgressSnapshot } from '../progress/progressStore';

// A cloud save, and how two of them combine. Merging never loses progress:
// the best stars and score per level, daily puzzles in their furthest state,
// the higher zen totals, and the feather ledger (see src/economy/walletStore.ts).
// That's what lets a player log in on a second device and have its guest
// progress added to their account, and lets two devices sync in any order.

export interface SaveData {
  v: 1;
  progress: ProgressSnapshot;
  wallet: WalletSave;
}

/** Days of daily-puzzle moves kept in a cloud save; older finished days keep only their result. */
const DAILY_LOG_DAYS = 7;

function mergeLevel(a: LevelProgress | undefined, b: LevelProgress | undefined): LevelProgress {
  if (!a) return b!;
  if (!b) return a;
  return {
    stars: Math.max(a.stars, b.stars) as LevelProgress['stars'],
    best: Math.max(a.best, b.best),
  };
}

/**
 * One day's daily puzzle from two saves. A finished attempt beats an
 * unfinished one; if both finished (played on two devices before they
 * synced), `a`'s stands, since it reached the cloud first; if neither has,
 * the one further along.
 */
function mergeDaily(a: DailyRecord | undefined, b: DailyRecord | undefined): DailyRecord {
  if (!a) return b!;
  if (!b) return a;
  const pick = a.finished !== b.finished ? (a.finished ? a : b) : a.finished ? a : b.log.length > a.log.length ? b : a;
  const other = pick === a ? b : a;
  // A cloud save drops the moves of older days; the device may still have them.
  const sameResult = other.finished === pick.finished && other.total === pick.total && other.won === pick.won;
  const log = pick.log.length === 0 && sameResult ? other.log : pick.log;
  return { ...pick, log, submitted: a.submitted || b.submitted };
}

function mergeRecords<T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>, merge: (x?: T, y?: T) => T) {
  const out: Record<string, T> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = merge(a[key], b[key]);
  return out;
}

export function mergeProgress(a: ProgressSnapshot, b: ProgressSnapshot): ProgressSnapshot {
  return {
    levels: mergeRecords(a.levels, b.levels, mergeLevel),
    unlockAll: a.unlockAll || b.unlockAll,
    daily: mergeRecords(a.daily, b.daily, mergeDaily),
    zen: {
      boards: Math.max(a.zen.boards, b.zen.boards),
      points: Math.max(a.zen.points, b.zen.points),
      best: Math.max(a.zen.best, b.zen.best),
    },
  };
}

/** The cloud save merged with this device's: the cloud's wins ties and keeps its starting feathers. */
export function mergeSaves(cloud: SaveData, device: SaveData): SaveData {
  return { v: 1, progress: mergeProgress(cloud.progress, device.progress), wallet: mergeWallets(cloud.wallet, device.wallet) };
}

/** A save read from the cloud. Null if it isn't one (the device's own save is used instead). */
export function parseSave(value: unknown): SaveData | null {
  const v = value as Partial<SaveData> | null;
  if (!v || typeof v !== 'object' || v.v !== 1) return null;
  const progress = parseProgress(v.progress);
  const wallet = parseWalletSave(v.wallet);
  return progress && wallet ? { v: 1, progress, wallet } : null;
}

/** A save trimmed for the cloud: finished daily puzzles more than a week old keep their result, not their moves. */
export function forCloud(save: SaveData, today: string): SaveData {
  const cutoff = addDays(today, -DAILY_LOG_DAYS);
  const daily: Record<string, DailyRecord> = {};
  for (const [day, record] of Object.entries(save.progress.daily)) {
    daily[day] = record.finished && day < cutoff ? { ...record, log: [] } : record;
  }
  return { ...save, progress: { ...save.progress, daily } };
}

/** JSON with object keys sorted, so two equal saves compare equal however they were built. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}
