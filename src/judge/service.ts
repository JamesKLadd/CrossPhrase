import { phraseKey, type CachedVerdict } from '../core/game';
import { localVerdict } from '../core/localJudge';
import type { JudgeEntry, PhraseVerdict, Verdict } from '../core/types';
import { isWord } from '../core/words';
import type { VerdictStore } from './verdictStore';

/** The AI judge, reached over the network. */
export interface RemoteJudge {
  /** Throws JudgeRequestError when the judge can't be reached or refuses. */
  judge(entries: JudgeEntry[]): Promise<Verdict[]>;
  appeal(phrase: string): Promise<void>;
}

export class JudgeRequestError extends Error {
  constructor(
    message: string,
    /** False when retrying the same request can't succeed (e.g. a 400). */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * online:  the AI judge (or this device's cache of its verdicts) graded everything.
 * offline: the AI judge was unreachable; unknown phrases got provisional local verdicts.
 * local:   no AI judge is configured (development); the local rules are the judge.
 */
export type JudgeMode = 'online' | 'offline' | 'local';

export interface JudgeService {
  readonly hasRemote: boolean;
  judge(entries: JudgeEntry[]): Promise<{ verdicts: Verdict[]; mode: JudgeMode }>;
  /** Phrases graded offline that are still waiting for the AI judge. */
  pendingCount(): number;
  /**
   * Sends queued offline phrases to the AI judge. Returns the verdicts it got,
   * or an empty list if there was nothing to do or the judge is still unreachable.
   */
  reconcile(): Promise<PhraseVerdict[]>;
  appeal(phrase: string): Promise<void>;
}

/** The judge endpoint takes at most this many entries per request. */
const MAX_BATCH = 40;

function stripEntryId({ entryId: _, ...verdict }: Verdict): CachedVerdict {
  return verdict;
}

export function createJudgeService(remote: RemoteJudge | null, store: VerdictStore): JudgeService {
  return {
    hasRemote: remote !== null,

    async judge(entries) {
      const known: Verdict[] = [];
      const unknown: JudgeEntry[] = [];
      for (const entry of entries) {
        const cached = store.get(phraseKey(entry.words));
        if (cached) known.push({ entryId: entry.id, ...cached });
        else unknown.push(entry);
      }

      if (!remote) {
        return { verdicts: [...known, ...unknown.map(localVerdict)], mode: 'local' };
      }
      if (unknown.length === 0) return { verdicts: known, mode: 'online' };

      try {
        const fresh = await remote.judge(unknown);
        const words = new Map(unknown.map((e) => [e.id, e.words]));
        for (const verdict of fresh) {
          const entryWords = words.get(verdict.entryId);
          if (entryWords) store.put(phraseKey(entryWords), stripEntryId(verdict));
        }
        return { verdicts: [...known, ...fresh], mode: 'online' };
      } catch (error) {
        console.warn('Judge unavailable, grading offline:', error);
        store.addPending(unknown.map((e) => phraseKey(e.words)));
        const offline = unknown.map((e) => ({ ...localVerdict(e), provisional: true }));
        return { verdicts: [...known, ...offline], mode: 'offline' };
      }
    },

    pendingCount: () => store.pending().length,

    async reconcile() {
      if (!remote) return [];
      const queue = store.pending();
      // Drop phrases this app version can no longer send (e.g. a word was retired).
      const stale = queue.filter((p) => !p.split(' ').every(isWord));
      if (stale.length) store.removePending(stale);
      const phrases = queue.filter((p) => !stale.includes(p)).slice(0, MAX_BATCH);
      if (phrases.length === 0) return [];

      let verdicts: Verdict[];
      try {
        verdicts = await remote.judge(
          phrases.map((phrase, i) => ({ id: `${i + 1}A`, words: phrase.split(' ') })),
        );
      } catch (error) {
        // Still offline: try again later. A request the judge refuses would
        // fail forever, so drop it rather than retrying.
        if (error instanceof JudgeRequestError && !error.retryable) store.removePending(phrases);
        return [];
      }

      const resolved: PhraseVerdict[] = [];
      for (const verdict of verdicts) {
        const phrase = phrases[Number.parseInt(verdict.entryId, 10) - 1];
        if (!phrase) continue;
        const cached = stripEntryId(verdict);
        store.put(phrase, cached);
        resolved.push({ phrase, verdict: cached });
      }
      store.removePending(resolved.map((r) => r.phrase));
      return resolved;
    },

    async appeal(phrase) {
      if (!remote) throw new Error('Appeals need the AI judge');
      await remote.appeal(phrase);
    },
  };
}
