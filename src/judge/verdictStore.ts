import type { CachedVerdict } from '../core/game';

/** The subset of the localStorage API the store needs. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The on-device verdict cache. It keeps every verdict the AI judge has given
 * this player (so known phrases are judged instantly, even offline) and the
 * queue of phrases graded offline that still need the AI judge. Only real
 * AI verdicts are stored; provisional ones live in the queue as phrases.
 */
export interface VerdictStore {
  get(phrase: string): CachedVerdict | null;
  put(phrase: string, verdict: CachedVerdict): void;
  pending(): string[];
  addPending(phrases: string[]): void;
  removePending(phrases: string[]): void;
}

const PREFIX = 'crossphrase:v1:verdict:';
const PENDING_KEY = 'crossphrase:v1:pending';
/** Oldest queued phrases are dropped past this, so the queue can't grow forever. */
const MAX_PENDING = 200;

export function createVerdictStore(
  storage: KeyValueStorage,
  seed: Readonly<Record<string, CachedVerdict>> = {},
): VerdictStore {
  const readPending = (): string[] => {
    try {
      const value = JSON.parse(storage.getItem(PENDING_KEY) ?? '[]');
      return Array.isArray(value) ? value.filter((p) => typeof p === 'string') : [];
    } catch {
      return [];
    }
  };
  const writePending = (phrases: string[]) =>
    storage.setItem(PENDING_KEY, JSON.stringify(phrases.slice(-MAX_PENDING)));

  return {
    get(phrase) {
      const raw = storage.getItem(PREFIX + phrase);
      if (raw) {
        try {
          return JSON.parse(raw) as CachedVerdict;
        } catch {
          storage.removeItem(PREFIX + phrase);
        }
      }
      return seed[phrase] ?? null;
    },
    put(phrase, verdict) {
      const { provisional: _, ...stored } = verdict;
      storage.setItem(PREFIX + phrase, JSON.stringify(stored));
    },
    pending: readPending,
    addPending(phrases) {
      const queue = readPending();
      const known = new Set(queue);
      writePending([...queue, ...phrases.filter((p) => !known.has(p))]);
    },
    removePending(phrases) {
      const done = new Set(phrases);
      writePending(readPending().filter((p) => !done.has(p)));
    },
  };
}
