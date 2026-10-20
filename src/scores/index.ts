import 'expo-sqlite/localStorage/install';

import { FunctionsHttpError } from '@supabase/supabase-js';

import type { RunAction } from '../core/run';
import { signedIn } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { progress } from '../progress';

// Leaderboards, through the Supabase backend (switched off unless .env.local
// has the Supabase settings; see README). Runs go to the `scores` function,
// which replays and re-judges them before saving. Runs that can't be sent
// (offline, server down) wait in an outbox and are retried later.

export const scoresEnabled = supabase !== null;

export interface BoardRow {
  rank: number;
  name: string;
  score: number;
  stars: number;
  submits?: number;
  me: boolean;
}

export interface ScoreReply {
  won: boolean;
  score: number;
  stars: number;
  submits: number;
  /** False when the server already had this daily result (only the first counts). */
  saved: boolean;
}

type Pending =
  | { kind: 'daily'; day: string; actions: RunAction[] }
  | { kind: 'level'; levelId: string; actions: RunAction[] };

const OUTBOX = 'crossphrase:v1:score-outbox';
const MAX_OUTBOX = 50;

function readOutbox(): Pending[] {
  try {
    const value = JSON.parse(localStorage.getItem(OUTBOX) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: Pending[]) {
  localStorage.setItem(OUTBOX, JSON.stringify(items.slice(-MAX_OUTBOX)));
}

/** Sends a run. 'rejected' means the server checked it and said no; 'failed' is worth retrying. */
async function send(item: Pending): Promise<ScoreReply | 'rejected' | 'failed'> {
  if (!supabase || !(await signedIn())) return 'failed';
  const { data, error } = await supabase.functions.invoke('scores', { body: item });
  if (!error) return data as ScoreReply;
  const status = error instanceof FunctionsHttpError ? (error.context as Response).status : 0;
  if (status === 400 || status === 422) {
    console.warn('The leaderboard turned a run away:', await (error.context as Response).text?.());
    return 'rejected';
  }
  return 'failed';
}

function delivered(item: Pending) {
  if (item.kind === 'daily') progress.markDailySubmitted(item.day);
}

async function submit(item: Pending): Promise<ScoreReply | null> {
  if (!scoresEnabled) return null;
  const reply = await send(item).catch(() => 'failed' as const);
  if (reply === 'failed') {
    writeOutbox([...readOutbox(), item]);
    return null;
  }
  if (reply !== 'rejected') delivered(item);
  return reply === 'rejected' ? null : reply;
}

/** Sends a finished daily puzzle to the leaderboard. Null if it couldn't go now (it's queued). */
export function submitDailyScore(day: string, actions: readonly RunAction[]): Promise<ScoreReply | null> {
  return submit({ kind: 'daily', day, actions: [...actions] });
}

/** Sends a level clear (a new best) to the leaderboard, in the background. */
export function submitLevelScore(levelId: string, actions: readonly RunAction[]): void {
  void submit({ kind: 'level', levelId, actions: [...actions] });
}

/** Drops runs waiting to be sent (when a player logs out, so they aren't sent as the next player). */
export function clearScoreOutbox(): void {
  writeOutbox([]);
}

/** Retries queued runs. */
export async function flushScores(): Promise<void> {
  if (!scoresEnabled) return;
  const queued = readOutbox();
  if (queued.length === 0) return;
  writeOutbox([]);
  const failed: Pending[] = [];
  for (const item of queued) {
    const reply = await send(item).catch(() => 'failed' as const);
    if (reply === 'failed') failed.push(item);
    else if (reply !== 'rejected') delivered(item);
  }
  if (failed.length) writeOutbox([...failed, ...readOutbox()]);
}

interface RawRow {
  rank: number | string;
  name: string;
  score: number;
  stars: number;
  submits?: number;
  is_me: boolean;
}

const toRow = (r: RawRow): BoardRow => ({
  rank: Number(r.rank),
  name: r.name,
  score: r.score,
  stars: r.stars,
  submits: r.submits,
  me: r.is_me,
});

/** A day's daily leaderboard (top 50, plus you). Null when unavailable. */
export async function dailyBoard(day: string): Promise<BoardRow[] | null> {
  if (!supabase || !(await signedIn())) return null;
  const { data, error } = await supabase.rpc('daily_leaderboard', { p_day: day });
  return error ? null : (data as RawRow[]).map(toRow);
}

/** A level's leaderboard of best clears. Null when unavailable. */
export async function levelBoard(levelId: string): Promise<BoardRow[] | null> {
  if (!supabase || !(await signedIn())) return null;
  const { data, error } = await supabase.rpc('level_leaderboard', { p_level: levelId });
  return error ? null : (data as RawRow[]).map(toRow);
}
