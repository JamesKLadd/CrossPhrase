import type { Tier } from '../core/types';
import { supabase } from '../lib/supabase';

// The admin's tools on the backend (see the admin migration): every call is
// refused by the server unless the signed-in account is an admin.

export type StatsView = 'overview' | 'level_stats' | 'level_funnel' | 'daily_stats' | 'active_players' | 'economy_stats' | 'feedback';

export interface Overview {
  players: number;
  accounts: number;
  active_today: number;
  active_week: number;
  games_week: number;
  labels_pending: number;
  feedback_week: number;
}

export interface LevelStatsRow {
  number: number;
  level: string;
  players: number;
  starts: number;
  wins: number;
  losses: number;
  quits: number;
  fail_rate: number | null;
  submits_to_win: number | null;
  avg_stars: number | null;
  boosted: number;
  rated_easy: number;
  rated_right: number;
  rated_hard: number;
}

export interface DailyStatsRow {
  day: string;
  players: number;
  wins: number;
  losses: number;
  avg_winning_score: number | null;
  shares: number;
  rated_easy: number;
  rated_right: number;
  rated_hard: number;
}

export interface ActivePlayersRow {
  day: string;
  players: number;
  sessions: number;
  games: number;
}

export interface EconomyStatsRow {
  name: string;
  kind: string;
  times: number;
  players: number;
  feathers: number;
}

export interface FeedbackRow {
  created_at: string;
  text: string;
  version: string | null;
  platform: string | null;
  username: string | null;
}

export interface FunnelRow {
  number: number;
  players: number;
}

export interface ReviewItem {
  phrase: string;
  judged: Tier | null;
  /** How many players suggested each tier. */
  votes: Partial<Record<Tier, number>>;
  players: number;
  last: string;
}

function client() {
  if (!supabase) throw new Error('The online backend isn’t configured.');
  return supabase;
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const adminStats = <T>(view: StatsView) => call<T>('admin_stats', { p_view: view });
export const reviewQueue = () => call<ReviewItem[]>('admin_review_queue');
/** Approves every pending correction of a phrase as `tier`, or rejects them all (null). */
export const review = (phrase: string, tier: Tier | null) => call<number>('admin_review', { p_phrase: phrase, p_tier: tier });
/** The remote config as stored, by key. */
export const getConfig = () => call<Record<string, unknown>>('admin_get_config');
export const setConfig = (key: 'economy' | 'tuning', value: Record<string, unknown>) =>
  call<void>('admin_set_config', { p_key: key, p_value: value });
