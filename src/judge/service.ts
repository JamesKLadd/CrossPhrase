import { phraseKey, type CachedVerdict } from '../core/game';
import { localVerdict } from '../core/localJudge';
import type { JudgeEntry, PhraseVerdict, Verdict } from '../core/types';
import { isWord } from '../core/words';
import type { Label, LabelStore } from './labelStore';
import type { VerdictStore } from './verdictStore';

/** A bigger judge reached over the network: the PC judge, or the Claude judge on Supabase. */
export interface RemoteJudge {
  readonly kind: 'pc' | 'cloud';
  /** Throws JudgeRequestError when the judge can't be reached or refuses. */
  judge(entries: JudgeEntry[]): Promise<Verdict[]>;
  /** Delivers labels (the PC judge saves them for training; the cloud judge files appeals). */
  submitLabels(labels: Label[]): Promise<void>;
  /** Whether the judge answers right now. */
  isReachable(): Promise<boolean>;
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
 * online:  the bigger judge (or this device's cache of its verdicts) graded everything.
 * offline: the bigger judge was unreachable; unknown phrases got provisional built-in verdicts.
 * local:   no bigger judge is configured; the built-in judge is the judge.
 */
export type JudgeMode = 'online' | 'offline' | 'local';

export interface JudgeService {
  readonly hasRemote: boolean;
  readonly remoteKind: RemoteJudge['kind'] | null;
  judge(entries: JudgeEntry[]): Promise<{ verdicts: Verdict[]; mode: JudgeMode }>;
  /** Phrases graded offline that are still waiting for the AI judge. */
  pendingCount(): number;
  /**
   * Sends queued offline phrases to the AI judge. Returns the verdicts it got,
   * or an empty list if there was nothing to do or the judge is still unreachable.
   */
  reconcile(): Promise<PhraseVerdict[]>;
  /** Records a human's verdict on a phrase and queues it for the remote judge. */
  label(label: Omit<Label, 'at'>): void;
  labels(): Label[];
  /** Labels waiting to reach a judge that collects them. */
  unsentLabelCount(): number;
  /** Sends queued labels. Returns how many were delivered (0 if unreachable). */
  syncLabels(): Promise<number>;
  isRemoteReachable(): Promise<boolean>;
}

/** The judge endpoint takes at most this many entries per request. */
const MAX_BATCH = 40;

function stripEntryId({ entryId: _, ...verdict }: Verdict): CachedVerdict {
  return verdict;
}

/** Labels sent per request. */
const LABEL_BATCH = 200;

export function createJudgeService(
  remote: RemoteJudge | null,
  store: VerdictStore,
  labelStore: LabelStore,
): JudgeService {
  return {
    hasRemote: remote !== null,
    remoteKind: remote?.kind ?? null,

    async judge(entries) {
      const known: Verdict[] = [];
      const unknown: JudgeEntry[] = [];
      for (const entry of entries) {
        const cached = store.get(phraseKey(entry.words));
        if (cached) known.push({ entryId: entry.id, ...cached });
        else unknown.push(entry);
      }

      if (!remote) {
        return { verdicts: [...known, ...unknown.map((e) => localVerdict(e))], mode: 'local' };
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

    label(label) {
      labelStore.add({ ...label, at: new Date().toISOString() });
    },

    labels: () => labelStore.all(),

    unsentLabelCount: () => (remote ? labelStore.outbox().length : 0),

    async syncLabels() {
      if (!remote) return 0;
      const batch = labelStore.outbox().slice(0, LABEL_BATCH);
      if (batch.length === 0) return 0;
      try {
        await remote.submitLabels(batch);
      } catch (error) {
        // A request the judge refuses would fail forever; drop it rather than retrying.
        if (error instanceof JudgeRequestError && !error.retryable) labelStore.markSent(batch.length);
        return 0;
      }
      labelStore.markSent(batch.length);
      return batch.length;
    },

    isRemoteReachable: () => (remote ? remote.isReachable() : Promise.resolve(false)),
  };
}
