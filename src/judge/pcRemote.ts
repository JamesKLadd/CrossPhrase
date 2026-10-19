import type { Tier, Verdict } from '../core/types';
import type { Label } from './labelStore';
import { JudgeRequestError, type RemoteJudge } from './service';

/** The PC judge's small model can take a while on a laptop graphics chip. */
const JUDGE_TIMEOUT_MS = 90_000;
const HEALTH_TIMEOUT_MS = 3_000;
const TIERS: readonly Tier[] = ['invalid', 'ok', 'great', 'poetic'];

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

async function post(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new JudgeRequestError(`Couldn't reach the PC judge: ${String(error)}`, true);
  }
  if (!response.ok) {
    // A 400 means this request will never work; anything else may pass later.
    throw new JudgeRequestError(`PC judge returned ${response.status}`, response.status !== 400);
  }
  return response.json();
}

/** The free judge running on your computer (pc-judge/), reached over Wi-Fi. */
export function createPcRemote(baseUrl: string): RemoteJudge {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    kind: 'pc',

    async judge(entries) {
      if (entries.length === 0) return [];
      const data = (await post(`${base}/judge`, { entries }, JUDGE_TIMEOUT_MS)) as { verdicts?: unknown[] };
      const verdicts = (data?.verdicts ?? []).map(parseVerdict);
      if (verdicts.some((v) => v === null)) throw new JudgeRequestError('PC judge sent a malformed verdict', true);
      return verdicts as Verdict[];
    },

    async submitLabels(labels: Label[]) {
      await post(`${base}/labels`, { labels }, JUDGE_TIMEOUT_MS);
    },

    async isReachable() {
      try {
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
