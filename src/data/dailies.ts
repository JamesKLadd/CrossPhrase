import type { LevelDef } from '../core/types';
import generated from './dailies.generated.json';

// The daily puzzles, one per calendar day, made ahead of time by
// `npm run generate:dailies`. Days are the player's local dates.

export const DAILY_ID_PREFIX = 'daily-';

const START: string = generated.start;
const DAILIES = generated.levels as unknown as LevelDef[];

const toUtc = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** "YYYY-MM-DD" plus a number of days. */
export function addDays(day: string, days: number): string {
  return new Date(toUtc(day) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Today (or `now`) as the player's local "YYYY-MM-DD". */
export function dayKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The puzzle for a day, or null outside the generated range. */
export function dailyLevel(day: string): LevelDef | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const index = Math.round((toUtc(day) - toUtc(START)) / 86_400_000);
  return DAILIES[index] ?? null;
}

/** "Mon 20 Oct": a day for people. */
export function dayLabel(day: string): string {
  return new Date(toUtc(day)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
