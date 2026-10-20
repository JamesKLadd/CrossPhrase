import 'expo-sqlite/localStorage/install';

import type { Tier } from '../core/types';
import { signedIn } from '../lib/auth';
import { supabase } from '../lib/supabase';

// Training labels sent to the backend's review queue (the `labels` table):
// players' "Wrong?" corrections, which the admin reviews, and the admin's own
// labels, which count straight away. They're training data the player chose
// to give, so they're sent whether or not play stats are on. Labels made
// offline wait here and go with the next one.

export interface CloudLabel {
  phrase: string;
  tier: Tier;
  judged?: Tier;
}

const OUTBOX = 'crossphrase:v1:label-outbox';
const MAX_WAITING = 100;

function waiting(): CloudLabel[] {
  try {
    const value = JSON.parse(localStorage.getItem(OUTBOX) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

let sending: Promise<void> | null = null;

async function flush(): Promise<void> {
  const client = supabase;
  if (!client || !(await signedIn())) return;
  let queue = waiting();
  while (queue.length > 0) {
    const [label] = queue;
    const { error } = await client.rpc('submit_label', {
      p_phrase: label.phrase,
      p_tier: label.tier,
      p_judged: label.judged ?? null,
    });
    // A label the server refuses (malformed) would block the queue forever, so it's dropped.
    if (error && !/check|violates/i.test(error.message)) return;
    queue = waiting().slice(1);
    localStorage.setItem(OUTBOX, JSON.stringify(queue));
  }
}

/** Sends a label to the review queue now, or as soon as the game is back online. */
export function sendLabel(label: CloudLabel): void {
  if (!supabase) return;
  localStorage.setItem(OUTBOX, JSON.stringify([...waiting(), label].slice(-MAX_WAITING)));
  sending ??= flush()
    .catch((e) => console.warn("Couldn't send a label:", e))
    .finally(() => (sending = null));
}
