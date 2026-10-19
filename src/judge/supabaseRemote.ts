import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

import type { Tier, Verdict } from '../core/types';
import type { Label } from './labelStore';
import { JudgeRequestError, type RemoteJudge } from './service';

const TIMEOUT_MS = 15_000;
const TIERS: readonly Tier[] = ['invalid', 'ok', 'great', 'poetic'];
/** Postgres unique_violation: this player already appealed this phrase. */
const ALREADY_APPEALED = '23505';

function parseVerdict(value: unknown): Verdict | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.entryId !== 'string' || !TIERS.includes(v.tier as Tier)) return null;
  const text = (field: unknown) => (typeof field === 'string' ? field : '');
  return {
    entryId: v.entryId,
    tier: v.tier as Tier,
    valid: v.tier !== 'invalid',
    reading: text(v.reading),
    reason: text(v.reason),
    quip: text(v.quip),
  };
}

/**
 * The AI judge behind the `judge` Edge Function. Players are signed in
 * anonymously on first use, so each device gets a user id for rate limits
 * and appeals without an account screen.
 */
export function createSupabaseRemote(supabase: SupabaseClient): RemoteJudge {
  let signingIn: ReturnType<SupabaseClient['auth']['signInAnonymously']> | null = null;

  async function ensureSignedIn() {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    signingIn ??= supabase.auth.signInAnonymously().finally(() => (signingIn = null));
    const { error } = await signingIn;
    if (error) throw new JudgeRequestError(`Anonymous sign-in failed: ${error.message}`, true);
  }

  return {
    kind: 'cloud',

    async judge(entries) {
      if (entries.length === 0) return [];
      await ensureSignedIn();
      const { data, error } = await supabase.functions.invoke('judge', {
        body: { entries },
        timeout: TIMEOUT_MS,
      });
      if (error) {
        const status =
          error instanceof FunctionsHttpError ? (error.context as Response).status : undefined;
        // Network errors, timeouts, rate limits and server errors may pass on retry.
        const retryable = status === undefined || status === 429 || status >= 500;
        throw new JudgeRequestError(`Judge request failed (${status ?? 'network'})`, retryable);
      }
      const verdicts = ((data as { verdicts?: unknown[] })?.verdicts ?? []).map(parseVerdict);
      if (verdicts.some((v) => v === null)) {
        throw new JudgeRequestError('Judge sent a malformed verdict', true);
      }
      return verdicts as Verdict[];
    },

    /** The cloud judge has no label store: a "Wrong?" on a rejected phrase becomes an appeal. */
    async submitLabels(labels: Label[]) {
      const appeals = labels.filter((l) => l.source === 'play' && l.judged === 'invalid' && l.tier !== 'invalid');
      if (appeals.length === 0) return;
      await ensureSignedIn();
      for (const { phrase } of appeals) {
        const { error } = await supabase.from('appeals').insert({ phrase });
        if (error && error.code !== ALREADY_APPEALED) {
          throw new JudgeRequestError(`Appeal failed: ${error.message}`, true);
        }
      }
    },

    async isReachable() {
      try {
        await ensureSignedIn();
        return true;
      } catch {
        return false;
      }
    },
  };
}
