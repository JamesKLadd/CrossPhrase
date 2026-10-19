import { localVerdict } from '../core/localJudge';
import type { JudgeEntry, Tier, Verdict } from '../core/types';

export interface Judge {
  /** True when verdicts come from the AI judge rather than the local rules. */
  readonly remote: boolean;
  judge(entries: JudgeEntry[]): Promise<Verdict[]>;
}

const TIMEOUT_MS = 15_000;
const TIERS: readonly Tier[] = ['invalid', 'ok', 'great', 'poetic'];

export class JudgeError extends Error {}

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

function remoteJudge(url: string, anonKey: string): Judge {
  return {
    remote: true,
    async judge(entries) {
      if (entries.length === 0) return [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ entries }),
          signal: controller.signal,
        });
      } catch (error) {
        throw new JudgeError(`Could not reach the judge: ${String(error)}`);
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        throw new JudgeError(`Judge returned ${response.status}: ${await response.text()}`);
      }
      const body = (await response.json()) as { verdicts?: unknown[] };
      const verdicts = (body.verdicts ?? []).map(parseVerdict);
      if (verdicts.some((v) => v === null)) throw new JudgeError('Judge sent a malformed verdict');
      return verdicts as Verdict[];
    },
  };
}

const localJudge: Judge = {
  remote: false,
  async judge(entries) {
    return entries.map(localVerdict);
  },
};

const url = process.env.EXPO_PUBLIC_JUDGE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** The AI judge when configured (see .env.example), otherwise the local rules. */
export const judge: Judge = url && anonKey ? remoteJudge(url, anonKey) : localJudge;
