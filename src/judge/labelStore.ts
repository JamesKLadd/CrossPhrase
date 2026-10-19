import type { Tier } from '../core/types';
import type { KeyValueStorage } from './verdictStore';

/** A human's verdict on a phrase: training data for the judges. */
export interface Label {
  phrase: string;
  tier: Tier;
  /** 'labeler': the PIN-locked labelling screen. 'play': a "Wrong?" tap during a level. */
  source: 'labeler' | 'play';
  /** What the judge had said, for labels from play. */
  judged?: Tier;
  at: string;
}

/**
 * Labels are kept on the device and queued in an outbox until a judge that
 * collects them (the PC judge) has received them.
 */
export interface LabelStore {
  all(): Label[];
  add(label: Label): void;
  outbox(): Label[];
  /** Removes the first `count` labels from the outbox once they've been delivered. */
  markSent(count: number): void;
}

const ALL_KEY = 'crossphrase:v1:labels';
const OUTBOX_KEY = 'crossphrase:v1:labels-outbox';
/** Plenty for a few weeks of labelling; the oldest drop off after that. */
const MAX_KEPT = 5000;

export function createLabelStore(storage: KeyValueStorage): LabelStore {
  const read = (key: string): Label[] => {
    try {
      const value = JSON.parse(storage.getItem(key) ?? '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const write = (key: string, labels: Label[]) =>
    storage.setItem(key, JSON.stringify(labels.slice(-MAX_KEPT)));

  return {
    all: () => read(ALL_KEY),
    add(label) {
      write(ALL_KEY, [...read(ALL_KEY), label]);
      write(OUTBOX_KEY, [...read(OUTBOX_KEY), label]);
    },
    outbox: () => read(OUTBOX_KEY),
    markSent(count) {
      write(OUTBOX_KEY, read(OUTBOX_KEY).slice(count));
    },
  };
}
